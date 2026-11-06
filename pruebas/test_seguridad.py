"""Permisos de todas las rutas, doble factor, auditoria y copias."""
import http.client
import json
import os
import subprocess
from unittest import mock

import psycopg2

from herramientas import _auth, _cifrado, _config, _db, _dosfa
from pruebas.test_sistema import (
    CLAVE, ORIGEN, PUERTO, Base, alta, crear_admin, ingresar, pedir, sesion_de,
)
from scripts import copia

COMISION = "comision_directiva"
SECRETARIA = "secretaria"
TESORERIA = "tesoreria"
ROLES = (
    COMISION, SECRETARIA, TESORERIA, "director_medico", "coordinador_cultivo", "cultivador", "dispensador",
)
PUBLICAS = {
    ("GET", "/api/sesion"), ("GET", "/api/publico"), ("POST", "/api/contacto"), ("POST", "/api/login"),
    ("POST", "/api/login_2fa"), ("POST", "/api/logout"), ("POST", "/api/solicitud"),
    ("POST", "/api/recuperar"), ("POST", "/api/recuperar_cambiar"),
}
DE_SOCIO = {
    ("GET", "/api/socio_portal"), ("POST", "/api/socio_portal"),
    ("GET", "/api/socio_exportar"), ("POST", "/api/socio_baja"),
}
DE_EQUIPO = {
    ("GET", "/api/admin_socios"): {COMISION, SECRETARIA},
    ("POST", "/api/admin_socios"): {COMISION, SECRETARIA},
    ("GET", "/api/admin_socios_csv"): {COMISION, SECRETARIA},
    ("GET", "/api/admin_contactos"): {COMISION, SECRETARIA},
    ("GET", "/api/admin_resumen"): set(ROLES),
    ("GET", "/api/admin_cuotas"): {COMISION, TESORERIA},
    ("POST", "/api/admin_cuotas"): {COMISION, TESORERIA},
    ("GET", "/api/admin_publicaciones"): {COMISION, SECRETARIA},
    ("POST", "/api/admin_publicaciones"): {COMISION, SECRETARIA},
    ("GET", "/api/admin_configuracion"): {COMISION},
    ("POST", "/api/admin_configuracion"): {COMISION},
    ("GET", "/api/admin_auditoria"): {COMISION},
    ("GET", "/api/admin_seguridad"): set(ROLES),
    ("GET", "/api/cultivo"): {COMISION, "coordinador_cultivo", "cultivador", "director_medico"},
    ("POST", "/api/cultivo"): {"coordinador_cultivo"},
    ("GET", "/api/cultivo_lote"): {COMISION, "coordinador_cultivo", "cultivador", "director_medico"},
    ("POST", "/api/cultivo_registro"): {"coordinador_cultivo", "cultivador"},
    ("GET", "/api/tareas"): set(ROLES),
    ("POST", "/api/tareas"): set(ROLES),
    ("GET", "/api/lote_etiquetas"): {COMISION, "coordinador_cultivo", "cultivador", "director_medico"},
    ("GET", "/api/abastecimiento"): {COMISION, "coordinador_cultivo"},
    ("POST", "/api/abastecimiento"): {COMISION, "coordinador_cultivo"},
    ("GET", "/api/finanzas"): {COMISION, TESORERIA},
    ("POST", "/api/finanzas"): {COMISION, TESORERIA},
    ("GET", "/api/finanzas_csv"): {COMISION, TESORERIA},
    ("GET", "/api/mora"): {COMISION, TESORERIA},
    ("POST", "/api/mora"): {COMISION},
    ("GET", "/api/cumplimiento"): set(ROLES),
    ("POST", "/api/cumplimiento"): set(ROLES),
    ("GET", "/api/informe_inspeccion"): {COMISION, SECRETARIA},
    ("GET", "/api/equipo"): set(ROLES),
    ("POST", "/api/equipo"): set(ROLES),
    ("GET", "/api/calendario"): set(ROLES),
    ("GET", "/api/inventario"): {COMISION, "coordinador_cultivo"},
    ("POST", "/api/inventario"): {"coordinador_cultivo"},
    ("POST", "/api/admin_seguridad"): set(ROLES),
}


class Matriz(Base):
    def equipo(self):
        cuentas = {}
        for rol in ROLES:
            email, _ = crear_admin(rol)
            cuentas[rol] = sesion_de(email)
        return cuentas

    def test_todas_las_rutas_estan_clasificadas(self):
        clasificadas = PUBLICAS | DE_SOCIO | set(DE_EQUIPO)
        orden = "import('./servidor/app.mjs').then((m) => console.log(JSON.stringify(Object.keys(m.RUTAS))))"
        salida = subprocess.run(
            ["node", "-e", orden], cwd=_config.RAIZ, capture_output=True, text=True, check=True).stdout
        self.assertEqual({tuple(r.split(" ")) for r in json.loads(salida)}, clasificadas)

    def test_sin_sesion_toda_ruta_privada_responde_401(self):
        for metodo, ruta in DE_SOCIO | set(DE_EQUIPO):
            datos = {} if metodo == "POST" else None
            self.assertEqual(pedir(metodo, ruta, datos)[0], 401, ruta)

    def test_cada_rol_solo_entra_donde_debe(self):
        cuentas = self.equipo()
        for (metodo, ruta), permitidos in DE_EQUIPO.items():
            for rol, (galleta, csrf) in cuentas.items():
                datos = {"x": 1} if metodo == "POST" else None
                if ruta == "/api/admin_configuracion" and metodo == "POST":
                    # Una clave desconocida responde 403 aunque el rol tenga permiso.
                    datos = {"clave": "edad_minima", "valor": "18"}
                estado = pedir(metodo, ruta, datos, galleta=galleta, csrf=csrf)[0]
                if rol in permitidos:
                    self.assertNotIn(estado, (401, 403), f"{rol} {metodo} {ruta}")
                else:
                    self.assertEqual(estado, 403, f"{rol} {metodo} {ruta}")

    def test_toda_escritura_privada_exige_csrf(self):
        cuentas = self.equipo()
        for (metodo, ruta), permitidos in DE_EQUIPO.items():
            if metodo == "POST":
                galleta, _ = cuentas[sorted(permitidos)[0]]
                self.assertEqual(pedir(metodo, ruta, {"x": 1}, galleta=galleta)[0], 403, ruta)

    def test_un_socio_no_entra_en_ninguna_ruta_del_equipo(self):
        alta()
        galleta, csrf = sesion_de("persona@ejemplo.test")
        for metodo, ruta in DE_EQUIPO:
            datos = {} if metodo == "POST" else None
            self.assertEqual(pedir(metodo, ruta, datos, galleta=galleta, csrf=csrf)[0], 401, ruta)

    def test_el_equipo_no_entra_en_las_rutas_del_socio(self):
        email, _ = crear_admin(COMISION)
        galleta, csrf = sesion_de(email)
        for metodo, ruta in DE_SOCIO:
            datos = {} if metodo == "POST" else None
            self.assertEqual(pedir(metodo, ruta, datos, galleta=galleta, csrf=csrf)[0], 401, ruta)


class DobleFactor(Base):
    def activar(self, rol=SECRETARIA):
        email, admin_id = crear_admin(rol)
        galleta, csrf = sesion_de(email)
        inicio = pedir("POST", "/api/admin_seguridad", {"accion": "iniciar"}, galleta=galleta, csrf=csrf)[1]
        secreto = inicio["secreto"]
        codigo = _dosfa.codigo(secreto, _dosfa.paso_actual() - 1)
        estado, cuerpo, _ = pedir(
            "POST", "/api/admin_seguridad", {"accion": "confirmar", "codigo": codigo},
            galleta=galleta, csrf=csrf)
        self.assertEqual(estado, 200)
        return email, admin_id, secreto, cuerpo["codigos"]

    def segundo_paso(self, previa, codigo):
        estado, cuerpo, cabeceras = pedir("POST", "/api/login_2fa", {"codigo": codigo}, galleta=previa)
        return estado, cuerpo, cabeceras.get("Set-Cookie", "")

    def test_con_doble_factor_la_contrasena_no_basta(self):
        email, *_ = self.activar()
        estado, cuerpo, previa, cruda = ingresar(email)
        self.assertEqual(estado, 200)
        self.assertTrue(cuerpo["requiere_2fa"])
        self.assertIn("sesion_pre=", cruda)
        self.assertNotIn("sesion_admin=", cruda)
        self.assertEqual(pedir("GET", "/api/admin_socios", galleta=previa)[0], 401)
        self.assertEqual(pedir("GET", "/api/sesion", galleta=previa)[0], 401)

    def test_el_codigo_correcto_abre_la_sesion_una_sola_vez(self):
        email, _, secreto, _ = self.activar()
        _, _, previa, _ = ingresar(email)
        codigo = _dosfa.codigo(secreto, _dosfa.paso_actual())
        estado, _, galleta = self.segundo_paso(previa, codigo)
        self.assertEqual(estado, 200)
        self.assertIn("sesion_admin=", galleta)
        _, _, previa, _ = ingresar(email)
        self.assertEqual(self.segundo_paso(previa, codigo)[0], 401)

    def test_un_codigo_de_recuperacion_sirve_una_vez(self):
        email, _, _, codigos = self.activar()
        _, _, previa, _ = ingresar(email)
        self.assertEqual(self.segundo_paso(previa, codigos[0])[0], 200)
        _, _, previa, _ = ingresar(email)
        self.assertEqual(self.segundo_paso(previa, codigos[0])[0], 401)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT count(*) AS total FROM auditoria WHERE accion = 'codigo_recuperacion_usado'")
            self.assertEqual(cursor.fetchone()["total"], 1)

    def test_el_segundo_paso_limita_los_intentos(self):
        email, _, secreto, _ = self.activar()
        _, _, previa, _ = ingresar(email)
        for _ in range(5):
            self.assertEqual(self.segundo_paso(previa, "000000")[0], 401)
        codigo = _dosfa.codigo(secreto, _dosfa.paso_actual() + 1)
        self.assertEqual(self.segundo_paso(previa, codigo)[0], 429)

    def test_el_token_previo_no_sirve_como_sesion_ni_sin_contrasena(self):
        email, admin_id, *_ = self.activar()
        token = _auth.crear_token("pre", admin_id, 1)
        self.assertEqual(pedir("GET", "/api/admin_socios", galleta=f"sesion_admin={token}")[0], 401)
        self.assertEqual(pedir("POST", "/api/login_2fa", {"codigo": "000000"})[0], 401)
        self.assertTrue(email)

    def test_el_secreto_y_los_codigos_no_se_guardan_en_claro(self):
        _, admin_id, secreto, codigos = self.activar()
        with _db.transaccion() as cursor:
            cursor.execute("SELECT totp_cifrado FROM admins WHERE id = %s", (admin_id,))
            guardado = cursor.fetchone()["totp_cifrado"]
            cursor.execute("SELECT codigo_hash FROM codigos_recuperacion WHERE admin_id = %s", (admin_id,))
            hashes = [fila["codigo_hash"] for fila in cursor.fetchall()]
        self.assertNotIn(secreto, guardado)
        self.assertEqual(_cifrado.descifrar_texto(guardado, "TOTP_CLAVE"), secreto)
        self.assertEqual(len(hashes), 8)
        self.assertFalse(set(hashes) & set(codigos))

    def test_si_es_obligatorio_quien_no_lo_activo_solo_puede_activarlo(self):
        email, _ = crear_admin(COMISION)
        galleta, csrf = sesion_de(email)
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE configuracion SET valor = 'true' WHERE clave = 'dosfa_obligatorio'")
        self.assertEqual(pedir("GET", "/api/admin_socios", galleta=galleta)[0], 403)
        self.assertTrue(pedir("GET", "/api/sesion", galleta=galleta)[1]["falta_2fa"])
        self.assertEqual(pedir("GET", "/api/admin_seguridad", galleta=galleta)[0], 200)
        inicio = pedir("POST", "/api/admin_seguridad", {"accion": "iniciar"}, galleta=galleta, csrf=csrf)
        self.assertEqual(inicio[0], 200)

    def test_el_doble_factor_no_se_apaga_desde_el_panel(self):
        email, _ = crear_admin(COMISION)
        galleta, csrf = sesion_de(email)
        estado = pedir("POST", "/api/admin_configuracion", {"clave": "dosfa_obligatorio", "valor": "false"},
                       galleta=galleta, csrf=csrf)[0]
        self.assertEqual(estado, 403)



class Auditoria(Base):
    def test_la_auditoria_no_se_puede_alterar(self):
        alta()
        with self.assertRaises(psycopg2.errors.RaiseException):
            with _db.transaccion() as cursor:
                cursor.execute("UPDATE auditoria SET accion = 'otra'")
        with self.assertRaises(psycopg2.errors.RaiseException):
            with _db.transaccion() as cursor:
                cursor.execute("DELETE FROM auditoria")

    def test_ver_la_lista_de_socios_deja_rastro(self):
        email, admin_id = crear_admin(SECRETARIA)
        galleta, _ = sesion_de(email)
        pedir("GET", "/api/admin_socios", galleta=galleta)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT admin_id FROM auditoria WHERE accion = 'socios_consultados'")
            self.assertEqual(cursor.fetchone()["admin_id"], admin_id)

    def test_la_comision_consulta_la_auditoria_con_responsable(self):
        email, _ = crear_admin(COMISION)
        galleta, _ = sesion_de(email)
        estado, cuerpo, _ = pedir("GET", "/api/admin_auditoria", galleta=galleta)
        self.assertEqual(estado, 200)
        self.assertEqual(cuerpo["auditoria"][0]["responsable"], email)


class Privacidad(Base):
    def test_las_solicitudes_se_limitan_por_ip(self):
        for numero in range(10):
            self.assertEqual(alta(email=f"p{numero}@ejemplo.test", documento=str(numero))[0], 202)
        self.assertEqual(alta(email="otra@ejemplo.test", documento="99")[0], 429)


class Conexion(Base):
    def test_una_cabecera_host_falsa_no_salta_la_comprobacion_de_origen(self):
        conexion = http.client.HTTPConnection("127.0.0.1", PUERTO, timeout=10)
        conexion.request("POST", "/api/login", "{}", {
            "Origin": "http://malo.test", "Host": f"127.0.0.1:{PUERTO}",
            "Content-Type": "application/json"})
        respuesta = conexion.getresponse()
        respuesta.read()
        conexion.close()
        self.assertEqual(respuesta.status, 403)
        self.assertTrue(ORIGEN)

    def test_una_contrasena_larguisima_no_bloquea_el_servidor(self):
        self.assertEqual(ingresar("persona@ejemplo.test", "x" * 5000)[0], 401)
        self.assertTrue(CLAVE)


class Copias(Base):
    def url(self):
        return os.environ["DATABASE_URL_ACTIVA"]

    def test_la_copia_esta_cifrada_y_no_se_lee_sin_la_clave(self):
        alta()
        contenido = copia.crear_bytes(self.url())
        self.assertNotIn(b"persona@ejemplo.test", contenido)
        with mock.patch.dict(os.environ, {"COPIA_CLAVE": "00" * 32}):
            with self.assertRaises(Exception):
                copia.leer(contenido)

    def test_una_copia_alterada_se_rechaza(self):
        alta()
        contenido = bytearray(copia.crear_bytes(self.url()))
        contenido[40] ^= 0xFF
        with self.assertRaises(Exception):
            copia.leer(bytes(contenido))

    def test_restaurar_en_seco_no_escribe_y_no_pisa_una_base_con_socios(self):
        alta()
        contenido = copia.crear_bytes(self.url())
        manifiesto = copia.restaurar_bytes(contenido, self.url(), seco=True)
        self.assertEqual(manifiesto["huellas"]["socios"]["filas"], 1)
        with self.assertRaises(RuntimeError):
            copia.restaurar_bytes(contenido, self.url())
        with _db.transaccion() as cursor:
            cursor.execute("SELECT count(*) AS total FROM socios")
            self.assertEqual(cursor.fetchone()["total"], 1)

    def test_restaurar_devuelve_exactamente_los_mismos_datos(self):
        alta()
        crear_admin(SECRETARIA)
        manifiesto = copia.restaurar_bytes(
            copia.crear_bytes(self.url()), self.url(), reemplazar=True)
        self.assertEqual(manifiesto["huellas"]["socios"]["filas"], 1)
        self.assertEqual(ingresar("persona@ejemplo.test")[0], 200)
        self.assertTrue(_config.req("COPIA_CLAVE"))
