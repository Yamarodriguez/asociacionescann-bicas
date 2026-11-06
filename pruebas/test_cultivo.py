"""Cultivo, tareas e inventario: reglas, permisos e interruptor del modulo."""
import os
import re
import subprocess
import unittest

from herramientas import _config, _db
from pruebas.test_sistema import Base, crear_admin, ingresar, pedir, sesion_de

COORDINADOR = "coordinador_cultivo"


class Cultivo(Base):
    def setUp(self):
        super().setUp()
        self.correo, self.coordinador_id = crear_admin(COORDINADOR)
        self.galleta, self.csrf = sesion_de(self.correo)

    def post(self, ruta, datos, galleta=None, csrf=None):
        return pedir("POST", ruta, datos, galleta=galleta or self.galleta, csrf=csrf or self.csrf)

    def lote(self, codigo="L-1", plantas=10):
        sala = self.post("/api/cultivo", {"accion": "crear_sala", "nombre": f"Sala {codigo}", "tipo": "cultivo"})[1]["id"]
        genetica = self.post("/api/cultivo", {"accion": "crear_genetica", "nombre": f"Gen {codigo}"})[1]["id"]
        estado, cuerpo, _ = self.post("/api/cultivo", {
            "accion": "crear_lote", "codigo": codigo, "genetica_id": genetica, "sala_id": sala,
            "origen": "esqueje", "cantidad_plantas": plantas})
        self.assertEqual(estado, 200)
        return cuerpo["id"]

    def avanzar(self, lote, peso=None):
        return self.post("/api/cultivo", {"accion": "avanzar", "lote_id": lote, "peso_g": peso})

    def analisis(self, lote):
        return self.post("/api/cultivo", {
            "accion": "analisis", "lote_id": lote, "laboratorio": "Lab inventado", "fecha": "2026-11-01",
            "thc": "18.50", "cbd": "1.20"})

    def hasta(self, lote, etapa):
        pesos = {"cosecha": "1000", "curado": "250"}
        orden = ["vegetativo", "floracion", "cosecha", "secado", "curado", "envasado"]
        for paso in orden[:orden.index(etapa) + 1]:
            self.assertEqual(self.avanzar(lote, pesos.get(paso))[0], 200, paso)

    def test_con_el_modulo_apagado_nada_responde(self):
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE configuracion SET valor = 'false' WHERE clave = 'modulo_cultivo_activo'")
        for ruta in ("/api/cultivo", "/api/cultivo_lote?id=1", "/api/tareas", "/api/inventario"):
            self.assertEqual(pedir("GET", ruta, galleta=self.galleta)[0], 404, ruta)
        self.assertEqual(pedir("GET", "/api/cultivo")[0], 404)
        self.assertEqual(self.post("/api/cultivo", {"accion": "crear_sala"})[0], 404)
        self.assertNotIn("lotes_activos", pedir("GET", "/api/admin_resumen", galleta=self.galleta)[1])

    def test_el_lote_avanza_en_orden_y_calcula_la_merma(self):
        lote = self.lote()
        self.assertEqual(self.avanzar(lote)[1]["etapa"], "vegetativo")
        self.assertEqual(self.avanzar(lote)[1]["etapa"], "floracion")
        self.assertEqual(self.avanzar(lote)[0], 422)
        self.assertEqual(self.avanzar(lote, "1000")[1]["etapa"], "cosecha")
        self.assertEqual(self.avanzar(lote)[1]["etapa"], "secado")
        self.assertEqual(self.avanzar(lote, "2000")[0], 422)
        self.assertEqual(self.avanzar(lote, "250")[1]["etapa"], "curado")
        detalle = pedir("GET", f"/api/cultivo_lote?id={lote}", galleta=self.galleta)[1]
        self.assertEqual(detalle["merma"], 75)
        self.assertTrue(detalle["qr"].startswith("data:image/svg+xml"))
        etapas = [r["detalle"] for r in detalle["registros"] if r["tipo"] == "etapa"]
        self.assertEqual(len(etapas), 5)
        self.assertIn("Pasó a floración", etapas)

    def test_sin_analisis_el_lote_sigue_en_cuarentena(self):
        lote = self.lote()
        self.hasta(lote, "curado")
        self.assertEqual(self.avanzar(lote)[0], 409)
        self.assertEqual(self.analisis(lote)[0], 200)
        self.assertEqual(self.avanzar(lote)[1]["etapa"], "envasado")
        self.assertEqual(self.avanzar(lote)[0], 409)

    def test_avisa_si_se_superan_las_plantas_autorizadas(self):
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE configuracion SET valor = '5' WHERE clave = 'plantas_autorizadas'")
        self.addCleanup(self._limite_cero)
        lote = self.lote(plantas=8)
        self.avanzar(lote)
        respuesta = self.avanzar(lote)[1]
        self.assertTrue(respuesta["plantas"]["excede"])
        self.assertEqual(respuesta["plantas"]["florecidas"], 8)

    def _limite_cero(self):
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE configuracion SET valor = '0' WHERE clave = 'plantas_autorizadas'")

    def test_la_baja_descuenta_plantas_y_no_deja_negativos(self):
        lote = self.lote(plantas=5)
        datos = {"lote_id": lote, "tipo": "baja", "detalle": "Plaga inventada", "plantas": 2}
        self.assertEqual(self.post("/api/cultivo_registro", datos)[0], 200)
        self.assertEqual(self.post("/api/cultivo_registro", {**datos, "plantas": 9})[0], 409)
        self.assertEqual(self.post("/api/cultivo_registro", {**datos, "plantas": 0})[0], 422)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT cantidad_plantas FROM lotes WHERE id = %s", (lote,))
            self.assertEqual(cursor.fetchone()["cantidad_plantas"], 3)

    def test_la_destruccion_exige_testigos(self):
        lote = self.lote()
        datos = {"lote_id": lote, "tipo": "destruccion", "detalle": "Residuos"}
        self.assertEqual(self.post("/api/cultivo_registro", datos)[0], 422)
        self.assertEqual(self.post("/api/cultivo_registro", {**datos, "testigos": "Persona inventada"})[0], 200)

    def test_datos_invalidos_se_rechazan(self):
        lote = self.lote()
        base = {"lote_id": lote, "tipo": "medicion", "detalle": "Medición"}
        self.assertEqual(self.post("/api/cultivo_registro", {**base, "ph": "15"})[0], 422)
        self.assertEqual(self.post("/api/cultivo_registro", {**base, "tipo": "otro"})[0], 422)
        self.assertEqual(self.post("/api/cultivo", {"accion": "borrar_todo"})[0], 422)
        self.assertEqual(self.post("/api/cultivo", {"accion": "constructor"})[0], 422)
        analisis = {"accion": "analisis", "lote_id": lote, "laboratorio": "Lab", "fecha": "2026-13-40", "thc": "1", "cbd": "1"}
        self.assertEqual(self.post("/api/cultivo", analisis)[0], 422)

    def test_un_lote_cerrado_no_admite_registros(self):
        lote = self.lote()
        self.assertEqual(self.post("/api/cultivo", {"accion": "finalizar", "lote_id": lote})[0], 409)
        cierre = {"accion": "finalizar", "lote_id": lote, "estado": "descartado", "motivo": "Plaga inventada"}
        self.assertEqual(self.post("/api/cultivo", cierre)[0], 200)
        datos = {"lote_id": lote, "tipo": "riego", "detalle": "Riego"}
        self.assertEqual(self.post("/api/cultivo_registro", datos)[0], 409)
        self.assertEqual(self.avanzar(lote)[0], 409)

    def test_el_cultivador_registra_pero_no_gestiona(self):
        lote = self.lote()
        correo, _ = crear_admin("cultivador")
        galleta, csrf = sesion_de(correo)
        datos = {"lote_id": lote, "tipo": "riego", "detalle": "Riego", "ph": "6.2"}
        self.assertEqual(self.post("/api/cultivo_registro", datos, galleta, csrf)[0], 200)
        self.assertEqual(self.post("/api/cultivo", {"accion": "avanzar", "lote_id": lote}, galleta, csrf)[0], 403)
        self.assertEqual(pedir("GET", "/api/inventario", galleta=galleta)[0], 403)

    def test_cambiar_de_etapa_crea_las_tareas_de_plantilla(self):
        with _db.transaccion() as cursor:
            cursor.execute("INSERT INTO plantillas_tarea (etapa, titulo, dias) VALUES ('vegetativo', 'Revisar', 2)")
        self.addCleanup(self._sin_plantillas)
        lote = self.lote()
        self.avanzar(lote)
        tareas = pedir("GET", "/api/tareas", galleta=self.galleta)[1]["tareas"]
        self.assertEqual([t["titulo"] for t in tareas], ["Revisar"])

    def _sin_plantillas(self):
        with _db.transaccion() as cursor:
            cursor.execute("DELETE FROM plantillas_tarea")

    def test_cada_cultivador_ve_y_completa_solo_lo_suyo(self):
        uno, uno_id = crear_admin("cultivador", "uno@ejemplo.test")
        dos, _ = crear_admin("cultivador", "dos@ejemplo.test")
        tarea = self.post("/api/tareas", {
            "accion": "crear", "titulo": "Regar", "vence_en": "2026-11-10", "asignada_a": uno_id})[1]["id"]
        galleta, csrf = sesion_de(dos)
        self.assertEqual(pedir("GET", "/api/tareas", galleta=galleta)[1]["tareas"], [])
        self.assertEqual(self.post("/api/tareas", {"accion": "completar", "tarea_id": tarea}, galleta, csrf)[0], 403)
        self.assertEqual(self.post("/api/tareas", {"accion": "crear", "titulo": "x", "vence_en": "2026-11-10"}, galleta, csrf)[0], 403)
        galleta, csrf = sesion_de(uno)
        self.assertEqual(self.post("/api/tareas", {"accion": "completar", "tarea_id": tarea}, galleta, csrf)[0], 200)
        self.assertEqual(self.post("/api/tareas", {"accion": "completar", "tarea_id": tarea}, galleta, csrf)[0], 409)

    def test_el_stock_no_baja_de_cero_y_deja_movimiento(self):
        insumo = self.post("/api/inventario", {
            "accion": "crear_insumo", "nombre": "Sustrato", "categoria": "Sustratos", "unidad": "litros",
            "stock_minimo": "5"})[1]["id"]
        mover = lambda **extra: self.post("/api/inventario", {  # noqa: E731
            "accion": "movimiento", "insumo_id": insumo, "motivo": "Prueba", **extra})
        self.assertEqual(mover(tipo="ingreso", cantidad="10")[1]["stock"], "10.00")
        self.assertEqual(mover(tipo="consumo", cantidad="20")[0], 409)
        self.assertEqual(mover(tipo="consumo", cantidad="7.5")[1]["stock"], "2.50")
        self.assertEqual(mover(tipo="ingreso", cantidad="-1")[0], 422)
        self.assertEqual(self.post("/api/inventario", {
            "accion": "movimiento", "insumo_id": insumo, "tipo": "consumo", "cantidad": "1"})[0], 422)
        datos = pedir("GET", "/api/inventario", galleta=self.galleta)[1]
        self.assertTrue(datos["insumos"][0]["bajo"])
        self.assertEqual(datos["movimientos"][0]["cantidad"], "-7.50")
        self.assertEqual(pedir("GET", "/api/admin_resumen", galleta=self.galleta)[1]["stock_bajo"], 1)

    def test_el_interruptor_y_el_limite_se_cambian_desde_la_comision(self):
        correo, _ = crear_admin("comision_directiva")
        galleta, csrf = sesion_de(correo)
        datos = {"clave": "plantas_autorizadas", "valor": "30"}
        self.assertEqual(pedir("POST", "/api/admin_configuracion", datos, galleta=galleta, csrf=csrf)[0], 200)
        self.addCleanup(self._limite_cero)
        self.assertEqual(pedir("GET", "/api/cultivo", galleta=galleta)[1]["plantas"]["autorizadas"], 30)


class Textos(unittest.TestCase):
    """Fallos vistos a ojo: palabras sin tilde, fechas crudas y "1 plantas"."""

    @staticmethod
    def leer(ruta):
        return (_config.RAIZ / ruta).read_text(encoding="utf-8")

    def test_las_claves_sin_tilde_tienen_su_nombre_en_pantalla(self):
        servidor = self.leer("servidor/rutas_cultivo.mjs")
        lista = re.search(r"const ETAPAS = \[(.*?)\]", servidor).group(1)
        lista += re.search(r"const TIPOS_REGISTRO = \[(.*?)\]", servidor).group(1)
        comun = self.leer("web/app.js")
        for clave in re.findall(r"'(\w+)'", lista):
            if clave.endswith("ion"):
                self.assertIn(f"{clave}: '{clave[:-3]}ión'", comun)

    def test_las_pantallas_no_muestran_claves_ni_fechas_crudas(self):
        crudos = {
            "web/admin_cultivo.js": ["'Etapa', lote.etapa"],
            "web/admin_lote.js": ["${lote.etapa}", "${siguiente}", "${registro.tipo}", "${a.fecha}",
                                  "${registro.plantas} plantas", "${lote.cantidad_plantas} plantas"],
            "web/admin_tareas.js": ["${tarea.vence_en}"],
            "web/admin_inventario.js": ["${e.proximo_mantenimiento}"],
        }
        for ruta, patrones in crudos.items():
            texto = self.leer(ruta)
            for patron in patrones:
                self.assertNotIn(patron, texto, ruta)


class DemoAutomatica(Base):
    def test_en_pruebas_los_datos_inventados_se_cargan_solos_una_vez(self):
        puerto = 8092
        entorno = {
            **os.environ, "PUERTO": str(puerto), "ENTORNO": "pruebas", "DEMO_CLAVE": "clave-demo-2026",
            "CORREO_MODO": "ninguno",
        }
        proceso = subprocess.Popen(
            ["node", "scripts/servidor_local.mjs"], cwd=_config.RAIZ, env=entorno,
            stdout=subprocess.PIPE, text=True, encoding="utf-8")
        self.addCleanup(proceso.wait)
        self.addCleanup(proceso.terminate)
        self.addCleanup(proceso.stdout.close)
        proceso.stdout.readline()
        import http.client
        import json
        conexion = http.client.HTTPConnection("127.0.0.1", puerto, timeout=20)
        conexion.request("GET", "/api/publico")
        self.assertEqual(conexion.getresponse().read() != b"", True)
        origen = f"http://127.0.0.1:{puerto}"
        cuerpo = json.dumps({"email": "coordinador.prueba@ejemplo.test", "clave": "clave-demo-2026"})
        conexion.request("POST", "/api/login", cuerpo, {"Origin": origen, "Content-Type": "application/json"})
        respuesta = conexion.getresponse()
        respuesta.read()
        conexion.close()
        self.assertEqual(respuesta.status, 200)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT count(*) AS total FROM lotes")
            self.assertEqual(cursor.fetchone()["total"], 1)
            cursor.execute("SELECT valor FROM configuracion WHERE clave = 'modulo_cultivo_activo'")
            self.assertEqual(cursor.fetchone()["valor"], "true")

    def test_fuera_de_pruebas_no_se_carga_nada(self):
        pedir("GET", "/api/publico")
        self.assertEqual(ingresar("coordinador.prueba@ejemplo.test", "clave-demo-2026")[0], 401)
