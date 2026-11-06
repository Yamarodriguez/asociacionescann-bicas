"""Pruebas de punta a punta contra el servidor y una base de datos real de pruebas."""
import datetime as dt
import http.client
import json
import os
import re
import threading
import unittest

from api import _auth, _config, _db, _email

os.environ["DATABASE_URL_ACTIVA"] = _config.req("DATABASE_URL_PRUEBAS")
os.environ["CORREO_MODO"] = "archivo"

import psycopg2  # noqa: E402

import servidor  # noqa: E402
from api import migrate  # noqa: E402

PUERTO = 8091
ORIGEN = f"http://127.0.0.1:{PUERTO}"
CLAVE = "clave-de-prueba-1"
HASH_CLAVE = None


def pedir(metodo, ruta, datos=None, galleta=None, csrf=None, origen=ORIGEN, cabeceras=None):
    conexion = http.client.HTTPConnection("127.0.0.1", PUERTO, timeout=10)
    enviar = dict(cabeceras or {})
    cuerpo = None
    if datos is not None:
        cuerpo = json.dumps(datos)
        enviar["Content-Type"] = "application/json"
    if origen:
        enviar["Origin"] = origen
    if galleta:
        enviar["Cookie"] = galleta
    if csrf:
        enviar["X-CSRF-Token"] = csrf
    conexion.request(metodo, ruta, cuerpo, enviar)
    respuesta = conexion.getresponse()
    crudo = respuesta.read().decode("utf-8", "replace")
    conexion.close()
    try:
        contenido = json.loads(crudo)
    except ValueError:
        contenido = crudo
    return respuesta.status, contenido, respuesta.headers


def alta(email="persona@ejemplo.test", documento="11111111", nacimiento="1990-01-01", **extra):
    datos = {
        "email": email, "clave": CLAVE, "nombre": "Prueba", "apellido": "Inventada",
        "fecha_nacimiento": nacimiento, "tipo_documento": "DNI",
        "numero_documento": documento, "consentimiento": True, "estatutos": True,
    }
    datos.update(extra)
    return pedir("POST", "/api/solicitud", datos)


def crear_admin(rol, email=None):
    email = email or f"{rol}@ejemplo.test"
    with _db.transaccion() as cursor:
        cursor.execute(
            "INSERT INTO admins (email, clave_hash, rol) VALUES (%s, %s, %s) RETURNING id",
            (email, HASH_CLAVE, rol))
        return email, cursor.fetchone()["id"]


def ingresar(email, clave=CLAVE):
    estado, cuerpo, cabeceras = pedir("POST", "/api/login", {"email": email, "clave": clave})
    galleta = cabeceras.get("Set-Cookie", "")
    return estado, cuerpo, galleta.split(";", 1)[0], galleta


def sesion_de(email):
    _, _, galleta, _ = ingresar(email)
    _, datos, _ = pedir("GET", "/api/sesion", galleta=galleta)
    return galleta, datos.get("csrf")


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        global HASH_CLAVE
        conexion = psycopg2.connect(os.environ["DATABASE_URL_ACTIVA"], connect_timeout=5)
        conexion.autocommit = True
        with conexion.cursor() as cursor:
            cursor.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        conexion.close()
        _db.cerrar_pool()
        migrate.aplicar()
        HASH_CLAVE = HASH_CLAVE or _auth.hashear_clave(CLAVE)
        cls.http = servidor.crear(PUERTO)
        cls.hilo = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.hilo.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        _db.cerrar_pool()

    def setUp(self):
        with _db.transaccion() as cursor:
            cursor.execute("TRUNCATE intentos_login, auditoria, socios, admins RESTART IDENTITY CASCADE")
            cursor.execute("UPDATE configuracion SET valor = '18' WHERE clave = 'edad_minima'")
        ruta = _config.RAIZ / ".dev" / "correos" / "enviados.jsonl"
        ruta.unlink(missing_ok=True)


class Acceso(Base):
    def test_sin_sesion_las_rutas_privadas_responden_401(self):
        for ruta in ("/api/sesion", "/api/admin_socios"):
            self.assertEqual(pedir("GET", ruta)[0], 401, ruta)
        self.assertEqual(pedir("POST", "/api/admin_socios", {"socio_id": 1})[0], 401)

    def test_cookies_seguras_y_de_duracion_correcta(self):
        alta()
        _, _, _, socio = ingresar("persona@ejemplo.test")
        for atributo in ("HttpOnly", "Secure", "SameSite=Strict", f"Max-Age={7 * 24 * 3600}"):
            self.assertIn(atributo, socio)
        email, _ = crear_admin("secretaria")
        _, _, _, admin = ingresar(email)
        self.assertIn(f"Max-Age={12 * 3600}", admin)

    def test_el_acceso_no_revela_si_el_correo_existe(self):
        alta()
        existente = ingresar("persona@ejemplo.test", "contrasena-mala")
        inexistente = ingresar("nadie@ejemplo.test", "contrasena-mala")
        self.assertEqual(existente[:2], inexistente[:2])
        self.assertEqual(existente[0], 401)

    def test_limite_de_intentos_por_correo(self):
        alta()
        for _ in range(5):
            self.assertEqual(ingresar("persona@ejemplo.test", "contrasena-mala")[0], 401)
        self.assertEqual(ingresar("persona@ejemplo.test", CLAVE)[0], 429)

    def test_limite_de_intentos_por_ip(self):
        for numero in range(20):
            self.assertEqual(ingresar(f"n{numero}@ejemplo.test", "contrasena-mala")[0], 401)
        self.assertEqual(ingresar("otro@ejemplo.test", "contrasena-mala")[0], 429)

    def _fallos_con_ip_reenviada(self, cadena):
        for numero in range(20):
            pedir("POST", "/api/login", {"email": f"n{numero}@ejemplo.test", "clave": "contrasena-mala"},
                  cabeceras={"X-Forwarded-For": cadena.format(numero=numero)})

    def test_sin_intermediario_se_ignora_la_ip_reenviada(self):
        self._fallos_con_ip_reenviada("10.0.0.{numero}")
        self.assertEqual(ingresar("otro@ejemplo.test", "contrasena-mala")[0], 429)

    def test_con_intermediario_el_limite_es_por_ip_real_y_no_se_falsea(self):
        os.environ["PROXY_CONFIABLE"] = "1"
        self.addCleanup(os.environ.pop, "PROXY_CONFIABLE")
        # Inventar valores a la izquierda no cambia la IP que escribe el intermediario.
        self._fallos_con_ip_reenviada("10.0.0.{numero}, 203.0.113.7")
        estado = pedir("POST", "/api/login", {"email": "otro@ejemplo.test", "clave": "contrasena-mala"},
                       cabeceras={"X-Forwarded-For": "203.0.113.7"})[0]
        self.assertEqual(estado, 429)
        # Otra persona, con otra IP, no queda bloqueada.
        estado = pedir("POST", "/api/login", {"email": "otro@ejemplo.test", "clave": "contrasena-mala"},
                       cabeceras={"X-Forwarded-For": "203.0.113.8"})[0]
        self.assertEqual(estado, 401)

    def test_los_intentos_no_guardan_correo_ni_ip_en_claro(self):
        ingresar("persona@ejemplo.test", "contrasena-mala")
        with _db.transaccion() as cursor:
            cursor.execute("SELECT huella_email, huella_ip FROM intentos_login")
            fila = cursor.fetchone()
        self.assertNotIn("persona", fila["huella_email"])
        self.assertNotIn("127.0.0.1", fila["huella_ip"])

    def test_cerrar_sesion_invalida_el_token_copiado(self):
        alta()
        galleta, _ = sesion_de("persona@ejemplo.test")
        self.assertEqual(pedir("GET", "/api/sesion", galleta=galleta)[0], 200)
        self.assertEqual(pedir("POST", "/api/logout", {}, galleta=galleta)[0], 200)
        self.assertEqual(pedir("GET", "/api/sesion", galleta=galleta)[0], 401)

    def test_token_manipulado_o_firmado_con_otro_secreto_no_sirve(self):
        email, admin_id = crear_admin("comision_directiva")
        galleta, _ = sesion_de(email)
        manipulada = galleta[:-3] + ("aaa" if not galleta.endswith("aaa") else "bbb")
        self.assertEqual(pedir("GET", "/api/admin_socios", galleta=manipulada)[0], 401)
        cruzado = _auth.crear_token("socio", admin_id, 1)
        self.assertEqual(pedir("GET", "/api/admin_socios", galleta=f"sesion_admin={cruzado}")[0], 401)

    def test_secretos_de_socios_y_equipo_son_distintos(self):
        self.assertNotEqual(_config.req("SESION_SECRETO_SOCIOS"), _config.req("SESION_SECRETO_ADMINS"))

    def test_contrasena_se_guarda_con_scrypt(self):
        alta()
        with _db.transaccion() as cursor:
            cursor.execute("SELECT clave_hash FROM socios")
            guardada = cursor.fetchone()["clave_hash"]
        self.assertTrue(guardada.startswith("scrypt$"))
        self.assertNotIn(CLAVE, guardada)


class Solicitud(Base):
    def test_una_solicitud_crea_un_registro_pendiente(self):
        self.assertEqual(alta()[0], 202)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT estado, numero_socio, consentimiento_en FROM socios")
            fila = cursor.fetchone()
        self.assertEqual(fila["estado"], "pendiente")
        self.assertIsNone(fila["numero_socio"])
        self.assertIsNotNone(fila["consentimiento_en"])

    def test_el_estado_no_se_puede_forzar_desde_la_peticion(self):
        alta(estado="activo", numero_socio=1)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT estado FROM socios")
            self.assertEqual(cursor.fetchone()["estado"], "pendiente")

    def test_menor_de_la_edad_configurada_es_rechazado(self):
        hoy = dt.date.today()
        menor = hoy.replace(year=hoy.year - 18) + dt.timedelta(days=1)
        estado, cuerpo, _ = alta(nacimiento=menor.isoformat())
        self.assertEqual(estado, 422)
        self.assertIn("18", cuerpo["error"])
        with _db.transaccion() as cursor:
            cursor.execute("SELECT count(*) AS total FROM socios")
            self.assertEqual(cursor.fetchone()["total"], 0)

    def test_quien_cumple_la_edad_hoy_es_aceptado(self):
        hoy = dt.date.today()
        self.assertEqual(alta(nacimiento=hoy.replace(year=hoy.year - 18).isoformat())[0], 202)

    def test_la_edad_minima_sale_de_la_configuracion(self):
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE configuracion SET valor = '30' WHERE clave = 'edad_minima'")
        hoy = dt.date.today()
        self.assertEqual(alta(nacimiento=hoy.replace(year=hoy.year - 29).isoformat())[0], 422)

    def test_contrasena_corta_y_falta_de_consentimiento_se_rechazan(self):
        self.assertEqual(alta(clave="corta")[0], 422)
        self.assertEqual(alta(consentimiento=False)[0], 422)
        self.assertEqual(alta(estatutos=False)[0], 422)

    def test_una_solicitud_repetida_no_revela_que_la_cuenta_existe(self):
        primera = alta()
        segunda = alta()
        self.assertEqual(primera[:2], segunda[:2])
        with _db.transaccion() as cursor:
            cursor.execute("SELECT count(*) AS total FROM socios")
            self.assertEqual(cursor.fetchone()["total"], 1)

    def test_datos_maliciosos_no_rompen_la_consulta(self):
        self.assertEqual(alta(nombre="Robert'); DROP TABLE socios;--")[0], 202)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT nombre FROM socios")
            self.assertIn("DROP TABLE", cursor.fetchone()["nombre"])


class Permisos(Base):
    def preparar(self):
        alta()
        with _db.transaccion() as cursor:
            cursor.execute("SELECT id FROM socios")
            return cursor.fetchone()["id"]

    def test_una_cuenta_pendiente_no_entra_al_panel(self):
        self.preparar()
        galleta, _ = sesion_de("persona@ejemplo.test")
        self.assertEqual(pedir("GET", "/api/admin_socios", galleta=galleta)[0], 401)

    def test_un_dispensador_no_entra_en_socios(self):
        email, _ = crear_admin("dispensador")
        galleta, csrf = sesion_de(email)
        self.assertEqual(pedir("GET", "/api/admin_socios", galleta=galleta)[0], 403)
        estado = pedir("POST", "/api/admin_socios", {"socio_id": 1, "identidad_verificada": True},
                       galleta=galleta, csrf=csrf)[0]
        self.assertEqual(estado, 403)

    def test_cada_rol_sin_permiso_recibe_403(self):
        for rol in ("tesoreria", "director_medico", "coordinador_cultivo", "cultivador"):
            email, _ = crear_admin(rol)
            galleta, _ = sesion_de(email)
            self.assertEqual(pedir("GET", "/api/admin_socios", galleta=galleta)[0], 403, rol)

    def test_escribir_sin_token_csrf_u_origen_propio_se_rechaza(self):
        socio_id = self.preparar()
        email, _ = crear_admin("secretaria")
        galleta, csrf = sesion_de(email)
        datos = {"socio_id": socio_id, "identidad_verificada": True}
        self.assertEqual(pedir("POST", "/api/admin_socios", datos, galleta=galleta)[0], 403)
        self.assertEqual(pedir("POST", "/api/admin_socios", datos, galleta=galleta, csrf="malo")[0], 403)
        ajeno = pedir("POST", "/api/admin_socios", datos, galleta=galleta, csrf=csrf, origen="http://malo.test")
        self.assertEqual(ajeno[0], 403)
        self.assertEqual(pedir("POST", "/api/login", {"email": "a", "clave": "b"}, origen=None)[0], 403)

    def test_aprobar_exige_verificacion_presencial(self):
        socio_id = self.preparar()
        email, _ = crear_admin("secretaria")
        galleta, csrf = sesion_de(email)
        estado = pedir("POST", "/api/admin_socios", {"socio_id": socio_id}, galleta=galleta, csrf=csrf)[0]
        self.assertEqual(estado, 422)

    def test_aprobar_activa_registra_quien_y_deja_auditoria(self):
        socio_id = self.preparar()
        email, admin_id = crear_admin("secretaria")
        galleta, csrf = sesion_de(email)
        datos = {"socio_id": socio_id, "identidad_verificada": True}
        estado, cuerpo, _ = pedir("POST", "/api/admin_socios", datos, galleta=galleta, csrf=csrf)
        self.assertEqual(estado, 200)
        self.assertEqual(cuerpo["numero_socio"], 1)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT estado, identidad_verificada_por, identidad_verificada_en FROM socios")
            socio = cursor.fetchone()
            cursor.execute("SELECT admin_id FROM auditoria WHERE accion = 'solicitud_aprobada'")
            auditoria = cursor.fetchone()
        self.assertEqual(socio["estado"], "activo")
        self.assertEqual(socio["identidad_verificada_por"], admin_id)
        self.assertIsNotNone(socio["identidad_verificada_en"])
        self.assertEqual(auditoria["admin_id"], admin_id)

    def test_la_base_impide_un_activo_sin_verificar(self):
        self.preparar()
        with self.assertRaises(psycopg2.errors.CheckViolation):
            with _db.transaccion() as cursor:
                cursor.execute("UPDATE socios SET estado = 'activo'")

    def test_dos_aprobaciones_a_la_vez_solo_cuentan_una(self):
        socio_id = self.preparar()
        email, _ = crear_admin("secretaria")
        galleta, csrf = sesion_de(email)
        resultados = []
        datos = {"socio_id": socio_id, "identidad_verificada": True}

        def aprobar():
            resultados.append(pedir("POST", "/api/admin_socios", datos, galleta=galleta, csrf=csrf)[0])

        hilos = [threading.Thread(target=aprobar) for _ in range(4)]
        for hilo in hilos:
            hilo.start()
        for hilo in hilos:
            hilo.join()
        self.assertEqual(sorted(resultados), [200, 409, 409, 409])

    def test_una_baja_no_puede_ingresar_y_pierde_la_sesion(self):
        self.preparar()
        galleta, _ = sesion_de("persona@ejemplo.test")
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE socios SET estado = 'baja'")
        self.assertEqual(pedir("GET", "/api/sesion", galleta=galleta)[0], 401)
        self.assertEqual(ingresar("persona@ejemplo.test")[0], 401)


class Correos(Base):
    def test_las_plantillas_no_mencionan_la_actividad(self):
        for asunto, texto in _email.PLANTILLAS.values():
            contenido = f"{asunto} {texto}".lower()
            for palabra in ("cannabis", "gramo", "variedad", "reprocann"):
                self.assertNotIn(palabra, contenido)

    def test_la_solicitud_envia_un_correo_neutro(self):
        alta()
        ruta = _config.RAIZ / ".dev" / "correos" / "enviados.jsonl"
        registro = json.loads(ruta.read_text(encoding="utf-8").splitlines()[0])
        self.assertEqual(registro["asunto"], "Recibimos tu solicitud")


class Servidor(Base):
    def test_el_modulo_de_reservas_apagado_no_responde(self):
        for ruta in ("/reservas.html", "/admin_reservas.html", "/api/reservas", "/admin_stock.html"):
            self.assertEqual(pedir("GET", ruta)[0], 404, ruta)
        with _db.transaccion() as cursor:
            self.assertEqual(_db.configuracion(cursor, "modulo_reservas_activo"), "false")

    def test_no_se_pueden_leer_archivos_fuera_de_la_web(self):
        for ruta in ("/.env", "/../.env", "/..%2f.env", "/../servidor.py", "/../api/_auth.py"):
            estado, cuerpo, _ = pedir("GET", ruta)
            self.assertEqual(estado, 404, ruta)
            self.assertNotIn("SECRETO", str(cuerpo))

    def test_todas_las_respuestas_llevan_noindex_y_ninguna_abre_origenes(self):
        for ruta in ("/", "/login.html", "/api/sesion"):
            _, _, cabeceras = pedir("GET", ruta)
            self.assertIn("noindex", cabeceras["X-Robots-Tag"])
            self.assertIsNone(cabeceras["Access-Control-Allow-Origin"])
            self.assertIn("default-src 'self'", cabeceras["Content-Security-Policy"])

    def test_los_errores_no_muestran_detalles_internos(self):
        conexion = http.client.HTTPConnection("127.0.0.1", PUERTO, timeout=10)
        conexion.request(
            "POST", "/api/solicitud", "{no es json",
            {"Origin": ORIGEN, "Content-Type": "application/json"})
        respuesta = conexion.getresponse()
        cuerpo = respuesta.read().decode("utf-8")
        conexion.close()
        self.assertEqual(respuesta.status, 400)
        self.assertNotRegex(cuerpo, re.compile("Traceback|psycopg2"))

    def test_un_cuerpo_sin_usar_no_contamina_el_siguiente_pedido(self):
        # Fallo real visto en el navegador: tras cerrar sesion, la pagina daba 501.
        casos = (
            ("/api/logout", {"Origin": ORIGEN}),
            ("/api/logout", {"Origin": "http://malo.test"}),
            ("/api/no-existe", {"Origin": ORIGEN}),
        )
        for ruta, cabeceras in casos:
            conexion = http.client.HTTPConnection("127.0.0.1", PUERTO, timeout=10)
            conexion.request("POST", ruta, "{}", {**cabeceras, "Content-Type": "application/json"})
            conexion.getresponse().read()
            conexion.request("GET", "/login.html")
            respuesta = conexion.getresponse()
            respuesta.read()
            conexion.close()
            self.assertEqual(respuesta.status, 200, f"{ruta} {cabeceras}")

    def test_un_cuerpo_demasiado_grande_se_rechaza_y_cierra_la_conexion(self):
        estado, _, cabeceras = pedir("POST", "/api/login", {"relleno": "x" * 70000})
        self.assertEqual(estado, 413)
        self.assertEqual(cabeceras["Connection"], "close")

    def test_migrar_exige_el_secreto(self):
        self.assertEqual(pedir("POST", "/api/migrate", {})[0], 403)
        estado, cuerpo, _ = pedir(
            "POST", "/api/migrate", {},
            cabeceras={"X-Migrate-Secret": _config.req("MIGRATE_SECRET")})
        self.assertEqual(estado, 200)
        self.assertEqual(cuerpo["aplicadas"], [])

    def test_las_letras_salen_del_propio_sistema(self):
        conexion = http.client.HTTPConnection("127.0.0.1", PUERTO, timeout=10)
        conexion.request("GET", "/fuentes/fraunces.woff2")
        respuesta = conexion.getresponse()
        cuerpo = respuesta.read()
        conexion.close()
        self.assertEqual(respuesta.status, 200)
        self.assertEqual(respuesta.headers["Content-Type"], "font/woff2")
        self.assertTrue(cuerpo.startswith(b"wOF2"))
        _, hoja, _ = pedir("GET", "/estilos.css")
        self.assertNotIn("http", hoja)

    def test_el_selector_temporal_de_diseno_ya_no_existe(self):
        self.assertEqual(pedir("GET", "/tema.js")[0], 404)
        self.assertEqual(pedir("GET", "/fuentes/ibm-plex-sans-400.woff2")[0], 404)
        _, codigo, _ = pedir("GET", "/app.js")
        self.assertNotIn("selector-tema", codigo)

    def test_las_paginas_del_prototipo_cargan(self):
        for ruta in ("/", "/login.html", "/estado.html", "/perfil.html", "/admin.html", "/admin_socios.html"):
            self.assertEqual(pedir("GET", ruta)[0], 200, ruta)


if __name__ == "__main__":
    unittest.main()
