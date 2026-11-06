"""Pruebas de punta a punta contra el servidor y una base de datos real de pruebas."""
import atexit
import datetime as dt
import http.client
import json
import os
import re
import subprocess
import threading
import unittest

from herramientas import _auth, _config, _db

os.environ["DATABASE_URL_ACTIVA"] = _config.req("DATABASE_URL_PRUEBAS")
os.environ["CORREO_MODO"] = "archivo"

import psycopg2  # noqa: E402

from herramientas import migrate  # noqa: E402
from scripts import purgar_bajas  # noqa: E402

PUERTO = 8091
ORIGEN = f"http://127.0.0.1:{PUERTO}"
CLAVE = "clave-de-prueba-1"
HASH_CLAVE = None
_servidor = None


def arrancar_servidor():
    """Arranca una vez el servidor real, el mismo codigo que corre en Netlify."""
    global _servidor
    if _servidor is not None:
        return
    entorno = {**os.environ, "PUERTO": str(PUERTO), "CORREO_MODO": "archivo"}
    _servidor = subprocess.Popen(
        ["node", "scripts/servidor_local.mjs"], cwd=_config.RAIZ, env=entorno,
        stdout=subprocess.PIPE, text=True, encoding="utf-8")
    atexit.register(_servidor.terminate)
    linea = _servidor.stdout.readline()
    if "SISTEMA LISTO" not in linea:
        raise RuntimeError("El servidor no arranco")


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
        arrancar_servidor()

    @classmethod
    def tearDownClass(cls):
        _db.cerrar_pool()

    def setUp(self):
        with _db.transaccion() as cursor:
            cursor.execute("TRUNCATE recuperaciones, actas, asambleas, documentos, comunicados, cuotas, contactos, intentos_login, auditoria, socios, admins RESTART IDENTITY CASCADE")
            cursor.execute("UPDATE configuracion SET valor = '18' WHERE clave = 'edad_minima'")
            cursor.execute("UPDATE configuracion SET valor = 'false' WHERE clave = 'dosfa_obligatorio'")
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

    def test_una_ip_inventada_no_salta_el_limite(self):
        for numero in range(20):
            pedir("POST", "/api/login", {"email": f"n{numero}@ejemplo.test", "clave": "contrasena-mala"},
                  cabeceras={"X-Forwarded-For": f"10.0.0.{numero}"})
        self.assertEqual(ingresar("otro@ejemplo.test", "contrasena-mala")[0], 429)

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


def contacto(**extra):
    datos = {"nombre": "Prueba", "email": "Consulta@Ejemplo.test", "mensaje": "Hola", "consentimiento": True}
    datos.update(extra)
    return pedir("POST", "/api/contacto", datos)


def total_contactos():
    with _db.transaccion() as cursor:
        cursor.execute("SELECT count(*) AS total FROM contactos")
        return cursor.fetchone()["total"]


class WebPublica(Base):
    def test_datos_publicos_salen_de_la_configuracion(self):
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE configuracion SET valor = '21' WHERE clave = 'edad_minima'")
        estado, cuerpo, _ = pedir("GET", "/api/publico")
        self.assertEqual(estado, 200)
        self.assertEqual(cuerpo, {"edad_minima": 21, "aval_activo": False})

    def test_el_contacto_guarda_el_mensaje_sin_la_ip_en_claro(self):
        self.assertEqual(contacto()[0], 202)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT email, huella_ip, consentimiento_en FROM contactos")
            fila = cursor.fetchone()
        self.assertEqual(fila["email"], "consulta@ejemplo.test")
        self.assertNotIn("127.0.0.1", fila["huella_ip"])
        self.assertIsNotNone(fila["consentimiento_en"])

    def test_el_contacto_valida_los_datos(self):
        self.assertEqual(contacto(consentimiento=False)[0], 422)
        self.assertEqual(contacto(email="sin-arroba")[0], 422)
        self.assertEqual(contacto(mensaje="   ")[0], 422)
        self.assertEqual(contacto(mensaje="x" * 2001)[0], 422)
        self.assertEqual(total_contactos(), 0)

    def test_el_campo_trampa_descarta_el_mensaje_sin_avisar(self):
        trampa = contacto(sitio_web="http://malo.test")
        self.assertEqual(trampa[:2], contacto()[:2])
        self.assertEqual(total_contactos(), 1)

    def test_el_contacto_limita_los_mensajes_por_ip(self):
        for _ in range(5):
            self.assertEqual(contacto()[0], 202)
        self.assertEqual(contacto()[0], 429)
        self.assertEqual(total_contactos(), 5)

    def test_el_contacto_exige_origen_propio(self):
        datos = {"nombre": "Prueba", "email": "a@ejemplo.test", "mensaje": "Hola", "consentimiento": True}
        self.assertEqual(pedir("POST", "/api/contacto", datos, origen="http://malo.test")[0], 403)

    def test_los_mensajes_viejos_se_borran_solos(self):
        contacto()
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE contactos SET creado_en = now() - interval '31 days'")
        contacto()
        self.assertEqual(total_contactos(), 1)

    def test_los_mensajes_solo_los_ve_quien_tiene_permiso(self):
        contacto()
        self.assertEqual(pedir("GET", "/api/admin_contactos")[0], 401)
        email, _ = crear_admin("dispensador")
        galleta, _ = sesion_de(email)
        self.assertEqual(pedir("GET", "/api/admin_contactos", galleta=galleta)[0], 403)
        alta()
        socio, _ = sesion_de("persona@ejemplo.test")
        self.assertEqual(pedir("GET", "/api/admin_contactos", galleta=socio)[0], 401)
        email, admin_id = crear_admin("secretaria")
        galleta, _ = sesion_de(email)
        estado, cuerpo, _ = pedir("GET", "/api/admin_contactos", galleta=galleta)
        self.assertEqual(estado, 200)
        self.assertEqual(len(cuerpo["contactos"]), 1)
        self.assertNotIn("huella_ip", cuerpo["contactos"][0])
        with _db.transaccion() as cursor:
            cursor.execute("SELECT admin_id FROM auditoria WHERE accion = 'contactos_consultados'")
            self.assertEqual(cursor.fetchone()["admin_id"], admin_id)

    def test_los_legales_son_borradores_y_los_buscadores_no_entran(self):
        _, legal, _ = pedir("GET", "/legal.html")
        for ancla in ('id="privacidad"', 'id="condiciones"', 'id="estatutos"'):
            self.assertIn(ancla, legal)
        self.assertGreaterEqual(legal.count("BORRADOR: revisar con asesoría legal"), 4)
        _, robots, _ = pedir("GET", "/robots.txt")
        self.assertIn("Disallow: /", robots)

    def test_la_portada_no_muestra_nada_de_las_reservas(self):
        _, portada, _ = pedir("GET", "/")
        for palabra in ("$", "precio", "gramo", "variedad", "stock", "reserva"):
            self.assertNotIn(palabra, portada.lower())

    def test_las_letras_se_guardan_en_el_navegador(self):
        conexion = http.client.HTTPConnection("127.0.0.1", PUERTO, timeout=10)
        conexion.request("GET", "/fuentes/dm-sans.woff2")
        respuesta = conexion.getresponse()
        respuesta.read()
        conexion.close()
        self.assertIn("immutable", respuesta.headers["Cache-Control"])

    def test_la_carga_de_datos_inventados_exige_el_secreto(self):
        self.assertEqual(pedir("POST", "/api/preparar_demo", {})[0], 403)
        estado = pedir("POST", "/api/preparar_demo", {}, cabeceras={"X-Demo-Secreto": "falso"})[0]
        self.assertEqual(estado, 403)


class Portal(Base):
    def socio_activo(self, email="activa@ejemplo.test", documento="22222222"):
        alta(email=email, documento=documento)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT id FROM socios WHERE email = %s", (email,))
            socio_id = cursor.fetchone()["id"]
        admin, _ = crear_admin("secretaria", f"sec-{documento}@ejemplo.test")
        galleta, csrf = sesion_de(admin)
        pedir("POST", "/api/admin_socios", {"socio_id": socio_id, "identidad_verificada": True},
              galleta=galleta, csrf=csrf)
        return socio_id

    def test_un_socio_nunca_ve_datos_de_otro(self):
        uno = self.socio_activo()
        self.socio_activo("otra@ejemplo.test", "33333333")
        galleta, _ = sesion_de("otra@ejemplo.test")
        for ruta in (f"/api/socio_portal?socio_id={uno}", f"/api/socio_exportar?socio_id={uno}&id={uno}"):
            estado, cuerpo, _ = pedir("GET", ruta, galleta=galleta)
            self.assertEqual(estado, 200)
            self.assertIn("otra@ejemplo.test", str(cuerpo))
            self.assertNotIn("activa@ejemplo.test", str(cuerpo))
            self.assertNotIn("22222222", str(cuerpo))

    def test_cuentas_sin_acceso_no_ven_el_portal(self):
        self.assertEqual(pedir("GET", "/api/socio_portal")[0], 401)
        alta()
        pendiente, _ = sesion_de("persona@ejemplo.test")
        self.assertEqual(pedir("GET", "/api/socio_portal", galleta=pendiente)[0], 403)
        self.socio_activo()
        activo, _ = sesion_de("activa@ejemplo.test")
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE socios SET estado = 'suspendido' WHERE email = 'activa@ejemplo.test'")
        self.assertEqual(pedir("GET", "/api/socio_portal", galleta=activo)[0], 403)

    def test_el_qr_no_lleva_datos_personales(self):
        self.socio_activo()
        galleta, _ = sesion_de("activa@ejemplo.test")
        primero = pedir("GET", "/api/socio_portal", galleta=galleta)[1]
        segundo = pedir("GET", "/api/socio_portal", galleta=galleta)[1]
        self.assertTrue(primero["qr"].startswith("data:image/svg+xml"))
        self.assertEqual(primero["qr"], segundo["qr"])
        with _db.transaccion() as cursor:
            cursor.execute("SELECT carne_token FROM socios WHERE email = 'activa@ejemplo.test'")
            token = cursor.fetchone()["carne_token"]
        for dato in ("Prueba", "Inventada", "22222222", "activa"):
            self.assertNotIn(dato, token)
        self.assertNotIn("carne_token", primero["perfil"])

    def test_el_qr_se_puede_apagar(self):
        self.socio_activo()
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE configuracion SET valor = 'false' WHERE clave = 'carne_qr_activo'")
        self.addCleanup(self._encender_qr)
        galleta, _ = sesion_de("activa@ejemplo.test")
        self.assertIsNone(pedir("GET", "/api/socio_portal", galleta=galleta)[1]["qr"])

    def _encender_qr(self):
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE configuracion SET valor = 'true' WHERE clave = 'carne_qr_activo'")

    def test_el_socio_solo_cambia_su_telefono(self):
        self.socio_activo()
        galleta, csrf = sesion_de("activa@ejemplo.test")
        estado = pedir("POST", "/api/socio_portal", {"telefono": "123", "nombre": "Otro", "estado": "baja"},
                       galleta=galleta, csrf=csrf)[0]
        self.assertEqual(estado, 200)
        self.assertEqual(pedir("POST", "/api/socio_portal", {"telefono": "1"}, galleta=galleta)[0], 403)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT telefono, nombre, estado FROM socios WHERE email = 'activa@ejemplo.test'")
            fila = cursor.fetchone()
        self.assertEqual((fila["telefono"], fila["nombre"], fila["estado"]), ("123", "Prueba", "activo"))

    def test_exportar_entrega_los_datos_propios_sin_secretos_y_deja_rastro(self):
        self.socio_activo()
        galleta, _ = sesion_de("activa@ejemplo.test")
        estado, cuerpo, cabeceras = pedir("GET", "/api/socio_exportar", galleta=galleta)
        self.assertEqual(estado, 200)
        self.assertIn("attachment", cabeceras["Content-Disposition"])
        self.assertEqual(cabeceras["Cache-Control"], "no-store")
        self.assertEqual(cuerpo["numero_documento"], "22222222")
        self.assertIn("cuotas", cuerpo)
        for secreto in ("clave_hash", "sesion_version", "carne_token"):
            self.assertNotIn(secreto, cuerpo)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT count(*) AS total FROM auditoria WHERE accion = 'datos_exportados'")
            self.assertEqual(cursor.fetchone()["total"], 1)

    def test_pedir_la_baja_exige_la_contrasena(self):
        self.socio_activo()
        galleta, csrf = sesion_de("activa@ejemplo.test")
        mala = pedir("POST", "/api/socio_baja", {"clave": "mala-clave-123"}, galleta=galleta, csrf=csrf)
        self.assertEqual(mala[0], 403)
        buena = pedir("POST", "/api/socio_baja", {"clave": CLAVE}, galleta=galleta, csrf=csrf)
        self.assertEqual(buena[0], 200)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT estado, baja_solicitada_en FROM socios WHERE email = 'activa@ejemplo.test'")
            fila = cursor.fetchone()
        self.assertEqual(fila["estado"], "activo")
        self.assertIsNotNone(fila["baja_solicitada_en"])

    def test_el_aval_solo_se_exige_si_esta_activado(self):
        self.assertEqual(alta()[0], 202)
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE configuracion SET valor = 'true' WHERE clave = 'aval_activo'")
        self.addCleanup(self._apagar_aval)
        self.assertEqual(alta(email="b@ejemplo.test", documento="2")[0], 422)
        self.assertEqual(alta(email="c@ejemplo.test", documento="3", avalista_numero_socio="x")[0], 422)
        self.assertEqual(alta(email="d@ejemplo.test", documento="4", avalista_numero_socio="7")[0], 202)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT avalista_numero_socio FROM socios WHERE email = 'd@ejemplo.test'")
            self.assertEqual(cursor.fetchone()["avalista_numero_socio"], 7)

    def _apagar_aval(self):
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE configuracion SET valor = 'false' WHERE clave = 'aval_activo'")


class Cuotas(Portal):
    def registrar(self, galleta, csrf, socio_id, **extra):
        datos = {
            "socio_id": socio_id, "periodo": "2026-02", "importe": "1500.50",
            "pagado_en": "2026-02-03", "metodo": "efectivo",
        }
        datos.update(extra)
        return pedir("POST", "/api/admin_cuotas", datos, galleta=galleta, csrf=csrf)

    def test_tesoreria_registra_y_actualiza_la_vigencia(self):
        socio_id = self.socio_activo()
        email, admin_id = crear_admin("tesoreria")
        galleta, csrf = sesion_de(email)
        estado, cuerpo, _ = self.registrar(galleta, csrf, socio_id)
        self.assertEqual(estado, 200)
        self.assertEqual(cuerpo["cuota_vigente_hasta"], "2026-02-28")
        with _db.transaccion() as cursor:
            cursor.execute("SELECT importe, registrado_por FROM cuotas")
            fila = cursor.fetchone()
        self.assertEqual(str(fila["importe"]), "1500.50")
        self.assertEqual(fila["registrado_por"], admin_id)

    def test_un_periodo_no_se_registra_dos_veces(self):
        socio_id = self.socio_activo()
        email, _ = crear_admin("tesoreria")
        galleta, csrf = sesion_de(email)
        self.assertEqual(self.registrar(galleta, csrf, socio_id)[0], 200)
        self.assertEqual(self.registrar(galleta, csrf, socio_id)[0], 409)

    def test_datos_de_cuota_invalidos_se_rechazan(self):
        socio_id = self.socio_activo()
        email, _ = crear_admin("tesoreria")
        galleta, csrf = sesion_de(email)
        for extra in ({"importe": "-1"}, {"importe": "0"}, {"importe": "abc"}, {"importe": "1.999"},
                      {"importe": "NaN"}, {"periodo": "2026-13"}, {"metodo": "tarjeta"},
                      {"pagado_en": "ayer"}):
            self.assertEqual(self.registrar(galleta, csrf, socio_id, **extra)[0], 422, extra)

    def test_quien_no_es_de_tesoreria_no_registra(self):
        socio_id = self.socio_activo()
        for rol in ("secretaria", "dispensador", "cultivador"):
            email, _ = crear_admin(rol, f"{rol}-c@ejemplo.test")
            galleta, csrf = sesion_de(email)
            self.assertEqual(self.registrar(galleta, csrf, socio_id)[0], 403, rol)
            self.assertEqual(pedir("GET", "/api/admin_cuotas", galleta=galleta)[0], 403, rol)
        socio, csrf = sesion_de("activa@ejemplo.test")
        self.assertEqual(self.registrar(socio, csrf, socio_id)[0], 401)

    def test_las_vencidas_se_marcan(self):
        self.socio_activo()
        email, _ = crear_admin("tesoreria")
        galleta, _ = sesion_de(email)
        self.assertTrue(pedir("GET", "/api/admin_cuotas", galleta=galleta)[1]["socios"][0]["vencida"])
        self.assertEqual(pedir("GET", "/api/admin_resumen", galleta=galleta)[1]["vencidas"], 1)


class Panel(Portal):
    def accion(self, galleta, csrf, socio_id, accion):
        return pedir("POST", "/api/admin_socios", {"socio_id": socio_id, "accion": accion},
                     galleta=galleta, csrf=csrf)

    def test_suspender_reactivar_y_dar_de_baja(self):
        socio_id = self.socio_activo()
        email, _ = crear_admin("comision_directiva")
        galleta, csrf = sesion_de(email)
        socio, _ = sesion_de("activa@ejemplo.test")
        self.assertEqual(self.accion(galleta, csrf, socio_id, "suspender")[0], 200)
        self.assertEqual(pedir("GET", "/api/socio_portal", galleta=socio)[0], 403)
        self.assertEqual(self.accion(galleta, csrf, socio_id, "suspender")[0], 409)
        self.assertEqual(self.accion(galleta, csrf, socio_id, "reactivar")[0], 200)
        self.assertEqual(pedir("GET", "/api/socio_portal", galleta=socio)[0], 200)
        self.assertEqual(self.accion(galleta, csrf, socio_id, "baja")[0], 200)
        self.assertEqual(pedir("GET", "/api/sesion", galleta=socio)[0], 401)
        self.assertEqual(ingresar("activa@ejemplo.test")[0], 401)

    def test_rechazar_borra_los_datos_de_la_solicitud(self):
        alta()
        with _db.transaccion() as cursor:
            cursor.execute("SELECT id FROM socios")
            socio_id = cursor.fetchone()["id"]
        email, _ = crear_admin("secretaria")
        galleta, csrf = sesion_de(email)
        self.assertEqual(self.accion(galleta, csrf, socio_id, "rechazar")[0], 200)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT count(*) AS total FROM socios")
            self.assertEqual(cursor.fetchone()["total"], 0)
            cursor.execute("SELECT count(*) AS total FROM auditoria WHERE accion = 'solicitud_rechazada'")
            self.assertEqual(cursor.fetchone()["total"], 1)

    def test_una_accion_desconocida_se_rechaza(self):
        socio_id = self.socio_activo()
        email, _ = crear_admin("secretaria")
        galleta, csrf = sesion_de(email)
        self.assertEqual(self.accion(galleta, csrf, socio_id, "borrar_todo")[0], 422)

    def test_el_csv_neutraliza_formulas_y_tiene_permisos(self):
        alta(nombre="=HYPERLINK(1)", documento="44444444")
        self.assertEqual(pedir("GET", "/api/admin_socios_csv")[0], 401)
        email, _ = crear_admin("dispensador")
        galleta, _ = sesion_de(email)
        self.assertEqual(pedir("GET", "/api/admin_socios_csv", galleta=galleta)[0], 403)
        email, admin_id = crear_admin("secretaria")
        galleta, _ = sesion_de(email)
        estado, cuerpo, cabeceras = pedir("GET", "/api/admin_socios_csv", galleta=galleta)
        self.assertEqual(estado, 200)
        self.assertIn("'=HYPERLINK(1)", cuerpo)
        self.assertNotIn(";=HYPERLINK", cuerpo)
        self.assertEqual(cabeceras["Cache-Control"], "no-store")
        self.assertNotIn("scrypt", cuerpo)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT admin_id FROM auditoria WHERE accion = 'socios_exportados'")
            self.assertEqual(cursor.fetchone()["admin_id"], admin_id)

    def test_publicar_tiene_permisos_y_llega_a_los_socios_activos(self):
        self.socio_activo()
        datos = {"tipo": "comunicado", "titulo": "Aviso", "cuerpo": "<b>Hola</b>"}
        self.assertEqual(pedir("POST", "/api/admin_publicaciones", datos)[0], 401)
        email, _ = crear_admin("tesoreria")
        galleta, csrf = sesion_de(email)
        self.assertEqual(pedir("POST", "/api/admin_publicaciones", datos, galleta=galleta, csrf=csrf)[0], 403)
        email, _ = crear_admin("comision_directiva")
        galleta, csrf = sesion_de(email)
        self.assertEqual(pedir("POST", "/api/admin_publicaciones", datos, galleta=galleta, csrf=csrf)[0], 200)
        asamblea = {"tipo": "asamblea", "titulo": "Ordinaria", "fecha": "2027-01-10T18:00",
                    "lugar": "Sede", "cuerpo": "Orden"}
        self.assertEqual(pedir("POST", "/api/admin_publicaciones", asamblea, galleta=galleta, csrf=csrf)[0], 200)
        for tipo in ("documento", "acta"):
            pieza = {"tipo": tipo, "titulo": tipo, "cuerpo": "Texto"}
            self.assertEqual(pedir("POST", "/api/admin_publicaciones", pieza, galleta=galleta, csrf=csrf)[0], 200)
        mal = {"tipo": "otro", "titulo": "x", "cuerpo": "y"}
        self.assertEqual(pedir("POST", "/api/admin_publicaciones", mal, galleta=galleta, csrf=csrf)[0], 422)
        socio, _ = sesion_de("activa@ejemplo.test")
        portal = pedir("GET", "/api/socio_portal", galleta=socio)[1]
        self.assertEqual(portal["comunicados"][0]["cuerpo"], "<b>Hola</b>")
        for lista in ("asambleas", "documentos", "actas"):
            self.assertTrue(portal[lista], lista)

    def test_configuracion_solo_para_la_comision_y_con_limites(self):
        email, _ = crear_admin("secretaria")
        galleta, csrf = sesion_de(email)
        self.assertEqual(pedir("GET", "/api/admin_configuracion", galleta=galleta)[0], 403)
        email, _ = crear_admin("comision_directiva")
        galleta, csrf = sesion_de(email)
        cambio = lambda clave, valor: pedir(  # noqa: E731
            "POST", "/api/admin_configuracion", {"clave": clave, "valor": valor}, galleta=galleta, csrf=csrf)[0]
        self.assertEqual(cambio("edad_minima", "21"), 200)
        self.assertEqual(pedir("GET", "/api/publico")[1]["edad_minima"], 21)
        self.assertEqual(cambio("edad_minima", "5"), 422)
        self.assertEqual(cambio("edad_minima", "abc"), 422)
        self.assertEqual(cambio("aval_activo", "quizas"), 422)
        self.assertEqual(cambio("clave_inventada", "1"), 403)

    def test_las_reservas_no_se_activan_desde_el_panel(self):
        email, _ = crear_admin("comision_directiva")
        galleta, csrf = sesion_de(email)
        estado = pedir("POST", "/api/admin_configuracion", {"clave": "modulo_reservas_activo", "valor": "true"},
                       galleta=galleta, csrf=csrf)[0]
        self.assertEqual(estado, 403)
        with _db.transaccion() as cursor:
            self.assertEqual(_db.configuracion(cursor, "modulo_reservas_activo"), "false")

    def test_el_resumen_depende_del_rol(self):
        email, _ = crear_admin("dispensador")
        galleta, _ = sesion_de(email)
        self.assertEqual(pedir("GET", "/api/admin_resumen", galleta=galleta)[1], {"rol": "dispensador"})


class Borrado(Portal):
    def test_purgar_en_seco_no_cambia_nada_y_luego_borra_de_verdad(self):
        socio_id = self.socio_activo()
        email, _ = crear_admin("tesoreria")
        galleta, csrf = sesion_de(email)
        pedir("POST", "/api/admin_cuotas", {
            "socio_id": socio_id, "periodo": "2026-02", "importe": "10", "pagado_en": "2026-02-03",
            "metodo": "efectivo"}, galleta=galleta, csrf=csrf)
        with _db.transaccion() as cursor:
            cursor.execute(
                "UPDATE socios SET estado = 'baja', baja_en = now() - interval '2 days' WHERE id = %s",
                (socio_id,))
            cursor.execute("UPDATE configuracion SET valor = '30' WHERE clave = 'retencion_baja_dias'")
        self.addCleanup(self._retencion_cero)
        self.assertEqual(purgar_bajas.purgar(), 0)
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE configuracion SET valor = '1' WHERE clave = 'retencion_baja_dias'")
        self.assertEqual(purgar_bajas.purgar(seco=True), 1)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT count(*) AS total FROM socios WHERE id = %s", (socio_id,))
            self.assertEqual(cursor.fetchone()["total"], 1)
        self.assertEqual(purgar_bajas.purgar(), 1)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT count(*) AS total FROM socios WHERE id = %s", (socio_id,))
            self.assertEqual(cursor.fetchone()["total"], 0)
            cursor.execute("SELECT socio_id, importe FROM cuotas")
            cuota = cursor.fetchone()
            cursor.execute("SELECT count(*) AS total FROM auditoria WHERE socio_id = %s", (socio_id,))
            rastros = cursor.fetchone()["total"]
        self.assertIsNone(cuota["socio_id"])
        self.assertEqual(rastros, 0)

    def _retencion_cero(self):
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE configuracion SET valor = '0' WHERE clave = 'retencion_baja_dias'")


class Recuperacion(Base):
    def correo(self):
        ruta = _config.RAIZ / ".dev" / "correos" / "enviados.jsonl"
        return [json.loads(linea) for linea in ruta.read_text(encoding="utf-8").splitlines()]

    def pedir_enlace(self, email="persona@ejemplo.test"):
        respuesta = pedir("POST", "/api/recuperar", {"email": email})
        return respuesta, self.correo()[-1]["texto"].rsplit("#t=", 1)[-1]

    def cambiar(self, token, clave="clave-nueva-2026"):
        return pedir("POST", "/api/recuperar_cambiar", {"token": token, "clave": clave})

    def test_no_revela_si_el_correo_existe(self):
        alta()
        conocido = pedir("POST", "/api/recuperar", {"email": "persona@ejemplo.test"})
        desconocido = pedir("POST", "/api/recuperar", {"email": "nadie@ejemplo.test"})
        self.assertEqual(conocido[:2], desconocido[:2])
        self.assertEqual(conocido[0], 202)

    def test_el_enlace_cambia_la_clave_una_vez_y_cierra_sesiones(self):
        alta()
        galleta, _ = sesion_de("persona@ejemplo.test")
        _, token = self.pedir_enlace()
        self.assertEqual(self.cambiar(token)[0], 200)
        self.assertEqual(pedir("GET", "/api/sesion", galleta=galleta)[0], 401)
        self.assertEqual(ingresar("persona@ejemplo.test")[0], 401)
        self.assertEqual(ingresar("persona@ejemplo.test", "clave-nueva-2026")[0], 200)
        self.assertEqual(self.cambiar(token, "otra-clave-2026")[0], 400)

    def test_el_enlace_caduca_y_no_se_guarda_en_claro(self):
        alta()
        _, token = self.pedir_enlace()
        with _db.transaccion() as cursor:
            cursor.execute("SELECT token_hash FROM recuperaciones")
            self.assertNotEqual(cursor.fetchone()["token_hash"], token)
            cursor.execute("UPDATE recuperaciones SET expira_en = now() - interval '1 minute'")
        self.assertEqual(self.cambiar(token)[0], 400)

    def test_contrasena_corta_y_codigo_falso_se_rechazan(self):
        alta()
        _, token = self.pedir_enlace()
        self.assertEqual(self.cambiar(token, "corta")[0], 422)
        self.assertEqual(self.cambiar("codigo-falso")[0], 400)

    def test_limita_los_enlaces_por_hora(self):
        alta()
        for _ in range(5):
            pedir("POST", "/api/recuperar", {"email": "persona@ejemplo.test"})
        with _db.transaccion() as cursor:
            cursor.execute("SELECT count(*) AS total FROM recuperaciones")
            self.assertEqual(cursor.fetchone()["total"], 3)

    def test_el_correo_es_neutro_y_el_codigo_no_llega_al_servidor_en_la_direccion(self):
        alta()
        self.pedir_enlace()
        ultimo = self.correo()[-1]
        self.assertIn("recuperar.html#t=", ultimo["texto"])
        for palabra in ("cannabis", "gramo", "variedad", "reprocann"):
            self.assertNotIn(palabra, ultimo["texto"].lower())


class Correos(Base):
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
        for ruta in (
            "/", "/login.html", "/estado.html", "/perfil.html", "/admin.html", "/admin_socios.html",
            "/admin_contactos.html", "/legal.html", "/portada.js", "/recuperar.html", "/admin_cuotas.html",
            "/admin_comunicados.html", "/admin_configuracion.html", "/admin_seguridad.html",
            "/admin_auditoria.html",
        ):
            self.assertEqual(pedir("GET", ruta)[0], 200, ruta)


if __name__ == "__main__":
    unittest.main()
