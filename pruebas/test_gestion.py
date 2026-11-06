"""Finanzas, cumplimiento, equipo, abastecimiento y plantas con QR."""
from datetime import date, timedelta

from herramientas import _db
from pruebas.test_seguridad import COMISION
from pruebas.test_sistema import Base, alta, crear_admin, pedir, sesion_de

HOY = date.today().isoformat()
AYER = (date.today() - timedelta(days=1)).isoformat()
MANANA = (date.today() + timedelta(days=1)).isoformat()


_documento = [50000000]


def socio_alta(correo):
    _documento[0] += 1
    alta(correo, documento=str(_documento[0]))
    with _db.transaccion() as cursor:
        cursor.execute("SELECT id FROM socios WHERE email = %s", (correo,))
        return cursor.fetchone()["id"]


def socio_activo(correo, hasta=None):
    id_socio = socio_alta(correo)
    _, verificador = crear_admin("secretaria", f"verifica{id_socio}@ejemplo.test")
    with _db.transaccion() as cursor:
        cursor.execute(
            """UPDATE socios SET estado = 'activo', numero_socio = %s, alta_en = now(), cuota_vigente_hasta = %s,
            identidad_verificada_en = now(), identidad_verificada_por = %s WHERE id = %s""",
            (id_socio + 100, hasta, verificador, id_socio))
    return id_socio


class Gestion(Base):
    def cuenta(self, rol):
        return sesion_de(crear_admin(rol)[0])

    def configurar(self, clave, valor):
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE configuracion SET valor = %s WHERE clave = %s", (valor, clave))
        self.addCleanup(self._restaurar, clave)

    def _restaurar(self, clave):
        with _db.transaccion() as cursor:
            cursor.execute("UPDATE configuracion SET valor = '0' WHERE clave = %s", (clave,))


class Finanzas(Gestion):
    def setUp(self):
        super().setUp()
        self.galleta, self.csrf = self.cuenta("tesoreria")

    def post(self, datos):
        return pedir("POST", "/api/finanzas", datos, galleta=self.galleta, csrf=self.csrf)

    def movimiento(self, **extra):
        return self.post({
            "accion": "movimiento", "fecha": HOY, "tipo": "ingreso", "categoria": "Aportes", "concepto": "Prueba",
            "importe": "100.50", "metodo": "efectivo", **extra})

    def test_la_caja_suma_efectivo_y_no_cuenta_transferencias(self):
        self.movimiento()
        self.movimiento(tipo="gasto", importe="30")
        self.movimiento(metodo="transferencia", importe="999")
        caja = pedir("GET", "/api/finanzas", galleta=self.galleta)[1]["caja"]
        self.assertEqual(float(caja["efectivo"]), 70.5)
        self.assertEqual(float(caja["ingresos"]), 1099.5)
        self.assertEqual(float(caja["gastos"]), 30)

    def test_una_cuota_entra_sola_en_la_caja_y_no_se_anula_desde_alli(self):
        id_socio = socio_activo("cuota@ejemplo.test")
        cuota = {"socio_id": id_socio, "periodo": HOY[:7], "metodo": "efectivo", "importe": "1500", "pagado_en": HOY}
        self.assertEqual(pedir("POST", "/api/admin_cuotas", cuota, galleta=self.galleta, csrf=self.csrf)[0], 200)
        datos = pedir("GET", "/api/finanzas", galleta=self.galleta)[1]
        asiento = datos["movimientos"][0]
        self.assertEqual((asiento["categoria"], asiento["concepto"]), ("Cuotas", f"Cuota {HOY[:7]}"))
        self.assertEqual(self.post({"accion": "anular", "id": asiento["id"], "motivo": "x"})[0], 409)

    def test_anular_exige_motivo_y_saca_el_importe(self):
        id_mov = self.movimiento()[1]["id"]
        self.assertEqual(self.post({"accion": "anular", "id": id_mov})[0], 422)
        self.assertEqual(self.post({"accion": "anular", "id": id_mov, "motivo": "Error"})[0], 200)
        self.assertEqual(self.post({"accion": "anular", "id": id_mov, "motivo": "Error"})[0], 409)
        self.assertEqual(float(pedir("GET", "/api/finanzas", galleta=self.galleta)[1]["caja"]["efectivo"]), 0)

    def test_un_dia_cerrado_no_admite_cambios(self):
        id_mov = self.movimiento(fecha=AYER)[1]["id"]
        estado, cuerpo, _ = self.post({"accion": "cerrar", "fecha": AYER, "contado": "90"})
        self.assertEqual(estado, 200)
        self.assertEqual(cuerpo["diferencia"], "-10.50")
        self.assertEqual(self.movimiento(fecha=AYER)[0], 409)
        self.assertEqual(self.post({"accion": "anular", "id": id_mov, "motivo": "x"})[0], 409)
        self.assertEqual(self.post({"accion": "cerrar", "fecha": AYER, "contado": "90"})[0], 409)
        self.assertEqual(self.post({"accion": "cerrar", "fecha": MANANA, "contado": "90"})[0], 409)

    def test_el_presupuesto_compara_con_lo_real(self):
        self.movimiento(tipo="gasto", categoria="Luz", importe="40")
        self.post({"accion": "presupuesto", "anio": date.today().year, "tipo": "gasto", "categoria": "Luz", "importe": "100"})
        self.post({"accion": "presupuesto", "anio": date.today().year, "tipo": "gasto", "categoria": "Luz", "importe": "120"})
        lineas = pedir("GET", "/api/finanzas", galleta=self.galleta)[1]["presupuesto"]
        luz = next(linea for linea in lineas if linea["categoria"] == "Luz")
        self.assertEqual((float(luz["previsto"]), float(luz["real"])), (120, 40))

    def test_el_csv_neutraliza_formulas(self):
        self.movimiento(concepto="=HIPERVINCULO(1)")
        crudo = pedir("GET", "/api/finanzas_csv", galleta=self.galleta)[1]
        self.assertIn("'=HIPERVINCULO", crudo)

    def test_datos_invalidos_se_rechazan(self):
        self.assertEqual(self.movimiento(importe="-1")[0], 422)
        self.assertEqual(self.movimiento(importe="0")[0], 422)
        self.assertEqual(self.movimiento(tipo="regalo")[0], 422)
        self.assertEqual(self.movimiento(fecha="2026-13-40")[0], 422)
        self.assertEqual(self.post({"accion": "constructor"})[0], 422)


class Mora(Gestion):
    def test_solo_la_comision_suspende_y_solo_a_quien_supera_el_limite(self):
        atrasado = socio_activo("atrasado@ejemplo.test", date.today() - timedelta(days=100))
        reciente = socio_activo("reciente@ejemplo.test", date.today() - timedelta(days=5))
        galleta, csrf = self.cuenta(COMISION)
        self.assertEqual(pedir("POST", "/api/mora", {"accion": "suspender"}, galleta=galleta, csrf=csrf)[0], 409)
        self.configurar("mora_suspension_meses", "2")
        self.assertEqual(pedir("GET", "/api/admin_resumen", galleta=galleta)[1]["en_mora"], 1)
        estado, cuerpo, _ = pedir("POST", "/api/mora", {"accion": "suspender"}, galleta=galleta, csrf=csrf)
        self.assertEqual((estado, cuerpo["suspendidos"]), (200, 1))
        with _db.transaccion() as cursor:
            cursor.execute("SELECT id, estado FROM socios WHERE id IN (%s, %s) ORDER BY id", (atrasado, reciente))
            self.assertEqual([f["estado"] for f in cursor.fetchall()], ["suspendido", "activo"])

    def test_cada_comunicado_llega_a_su_segmento(self):
        socio_activo("moroso@ejemplo.test", date.today() - timedelta(days=5))
        socio_activo("aldia@ejemplo.test", date.today() + timedelta(days=5))
        galleta, csrf = self.cuenta("secretaria")
        for segmento in ("todos", "al_dia", "morosos"):
            datos = {"tipo": "comunicado", "titulo": segmento, "cuerpo": "Texto", "segmento": segmento}
            self.assertEqual(pedir("POST", "/api/admin_publicaciones", datos, galleta=galleta, csrf=csrf)[0], 200)
        datos = {"tipo": "comunicado", "titulo": "x", "cuerpo": "Texto", "segmento": "vip"}
        self.assertEqual(pedir("POST", "/api/admin_publicaciones", datos, galleta=galleta, csrf=csrf)[0], 422)
        titulos = lambda correo: {  # noqa: E731
            c["titulo"] for c in pedir("GET", "/api/socio_portal", galleta=sesion_de(correo)[0])[1]["comunicados"]}
        self.assertEqual(titulos("moroso@ejemplo.test"), {"todos", "morosos"})
        self.assertEqual(titulos("aldia@ejemplo.test"), {"todos", "al_dia"})


class Cumplimiento(Gestion):
    def test_vencimientos_cuentan_y_se_renuevan(self):
        galleta, csrf = self.cuenta("secretaria")
        post = lambda d: pedir("POST", "/api/cumplimiento", d, galleta=galleta, csrf=csrf)  # noqa: E731
        cercano = (date.today() + timedelta(days=30)).isoformat()
        lejano = (date.today() + timedelta(days=300)).isoformat()
        id_v = post({"accion": "crear_vencimiento", "tipo": "seguro", "titulo": "Seguro", "vence_en": cercano})[1]["id"]
        self.assertEqual(pedir("GET", "/api/admin_resumen", galleta=galleta)[1]["vencimientos_proximos"], 1)
        self.assertEqual(post({"accion": "renovar", "id": id_v, "vence_en": lejano})[0], 200)
        self.assertEqual(pedir("GET", "/api/admin_resumen", galleta=galleta)[1]["vencimientos_proximos"], 0)
        self.assertEqual(post({"accion": "resolver", "id": id_v})[0], 200)
        self.assertEqual(pedir("GET", "/api/cumplimiento", galleta=galleta)[1]["vencimientos"], [])

    def test_una_version_nueva_pide_leer_otra_vez(self):
        galleta, csrf = self.cuenta("secretaria")
        lector, csrf_lector = self.cuenta("cultivador")
        publicar = {"accion": "publicar_procedimiento", "titulo": "Limpieza", "contenido": "Uno"}
        self.assertEqual(pedir("POST", "/api/cumplimiento", publicar, galleta=lector, csrf=csrf_lector)[0], 403)
        pedir("POST", "/api/cumplimiento", publicar, galleta=galleta, csrf=csrf)
        version = pedir("GET", "/api/cumplimiento", galleta=lector)[1]["procedimientos"][0]
        self.assertEqual(pedir("GET", "/api/admin_resumen", galleta=lector)[1]["procedimientos_sin_leer"], 1)
        confirmar = {"accion": "confirmar_lectura", "version_id": version["version_id"]}
        self.assertEqual(pedir("POST", "/api/cumplimiento", confirmar, galleta=lector, csrf=csrf_lector)[0], 200)
        self.assertEqual(pedir("GET", "/api/admin_resumen", galleta=lector)[1]["procedimientos_sin_leer"], 0)
        estado, cuerpo, _ = pedir("POST", "/api/cumplimiento", {**publicar, "contenido": "Dos"}, galleta=galleta, csrf=csrf)
        self.assertEqual((estado, cuerpo["version"]), (200, 2))
        self.assertEqual(pedir("GET", "/api/admin_resumen", galleta=lector)[1]["procedimientos_sin_leer"], 1)
        self.assertEqual(pedir("POST", "/api/cumplimiento", confirmar, galleta=lector, csrf=csrf_lector)[0], 409)

    def test_las_capacitaciones_cuentan_asistentes_una_vez(self):
        galleta, csrf = self.cuenta("secretaria")
        datos = {"accion": "crear_capacitacion", "titulo": "Higiene", "fecha": HOY, "dictada_por": "Persona"}
        id_c = pedir("POST", "/api/cumplimiento", datos, galleta=galleta, csrf=csrf)[1]["id"]
        confirmar = {"accion": "confirmar_asistencia", "capacitacion_id": id_c}
        pedir("POST", "/api/cumplimiento", confirmar, galleta=galleta, csrf=csrf)
        pedir("POST", "/api/cumplimiento", confirmar, galleta=galleta, csrf=csrf)
        lista = pedir("GET", "/api/cumplimiento", galleta=galleta)[1]["capacitaciones"]
        self.assertEqual(lista[0]["asistentes"], 1)
        self.assertTrue(lista[0]["asistio"])

    def test_el_informe_no_lleva_datos_personales_y_queda_registrado(self):
        socio_alta("privado@ejemplo.test")
        galleta, _ = self.cuenta("secretaria")
        estado, cuerpo, _ = pedir("GET", "/api/informe_inspeccion", galleta=galleta)
        self.assertEqual(estado, 200)
        self.assertEqual(cuerpo["socios"]["pendientes"], 1)
        self.assertNotIn("privado@ejemplo.test", str(cuerpo))
        with _db.transaccion() as cursor:
            cursor.execute("SELECT count(*) AS total FROM auditoria WHERE accion = 'informe_inspeccion'")
            self.assertEqual(cursor.fetchone()["total"], 1)


class Equipo(Gestion):
    def test_fichar_alterna_entrada_y_salida(self):
        galleta, csrf = self.cuenta("cultivador")
        post = lambda a: pedir("POST", "/api/equipo", {"accion": a}, galleta=galleta, csrf=csrf)[0]  # noqa: E731
        self.assertEqual(post("salida"), 409)
        self.assertEqual(post("entrada"), 200)
        self.assertEqual(post("entrada"), 409)
        self.assertIsNotNone(pedir("GET", "/api/equipo", galleta=galleta)[1]["fichaje_abierto"])
        self.assertEqual(post("salida"), 200)
        self.assertIsNone(pedir("GET", "/api/equipo", galleta=galleta)[1]["fichaje_abierto"])

    def test_cada_persona_solo_ve_sus_fichajes(self):
        uno, csrf_uno = self.cuenta("cultivador")
        dos, _ = sesion_de(crear_admin("cultivador", "dos@ejemplo.test")[0])
        pedir("POST", "/api/equipo", {"accion": "entrada"}, galleta=uno, csrf=csrf_uno)
        self.assertEqual(pedir("GET", "/api/equipo", galleta=dos)[1]["fichajes"], [])
        coordina, _ = self.cuenta("coordinador_cultivo")
        self.assertEqual(len(pedir("GET", "/api/equipo", galleta=coordina)[1]["fichajes"]), 1)

    def test_turnos_y_proyectos_los_gestiona_la_coordinacion(self):
        correo, id_cultivador = crear_admin("cultivador")
        galleta_c, csrf_c = sesion_de(correo)
        galleta, csrf = self.cuenta("coordinador_cultivo")
        turno = {"accion": "crear_turno", "admin_id": id_cultivador, "fecha": MANANA, "franja": "tarde"}
        self.assertEqual(pedir("POST", "/api/equipo", turno, galleta=galleta_c, csrf=csrf_c)[0], 403)
        id_t = pedir("POST", "/api/equipo", turno, galleta=galleta, csrf=csrf)[1]["id"]
        self.assertEqual(pedir("POST", "/api/equipo", turno, galleta=galleta, csrf=csrf)[0], 409)
        eventos = pedir("GET", "/api/calendario", galleta=galleta_c)[1]["eventos"]
        self.assertIn({"fecha": MANANA, "tipo": "turno", "titulo": "tarde"}, eventos)
        self.assertEqual(pedir("POST", "/api/equipo", {"accion": "quitar_turno", "id": id_t}, galleta=galleta, csrf=csrf)[0], 200)
        id_p = pedir("POST", "/api/equipo", {"accion": "crear_proyecto", "titulo": "Sala nueva"}, galleta=galleta, csrf=csrf)[1]["id"]
        mover = {"accion": "mover_proyecto", "id": id_p, "columna": "en_curso"}
        self.assertEqual(pedir("POST", "/api/equipo", mover, galleta=galleta, csrf=csrf)[0], 200)
        self.assertEqual(pedir("GET", "/api/equipo", galleta=galleta_c)[1]["proyectos"][0]["columna"], "en_curso")

    def test_una_tarea_recurrente_se_crea_sola_una_vez_y_le_llega_a_su_responsable(self):
        correo, id_tesoreria = crear_admin("tesoreria")
        galleta_t, csrf_t = sesion_de(correo)
        galleta, csrf = self.cuenta("coordinador_cultivo")
        datos = {"accion": "crear_recurrente", "titulo": "Cerrar la caja", "cada_dias": 7, "proxima_en": HOY, "asignada_a": id_tesoreria}
        self.assertEqual(pedir("POST", "/api/equipo", datos, galleta=galleta, csrf=csrf)[0], 200)
        tareas = pedir("GET", "/api/tareas", galleta=galleta_t)[1]["tareas"]
        pedir("GET", "/api/tareas", galleta=galleta_t)
        self.assertEqual([t["titulo"] for t in pedir("GET", "/api/tareas", galleta=galleta_t)[1]["tareas"]], ["Cerrar la caja"])
        cierre = {"accion": "completar", "tarea_id": tareas[0]["id"]}
        self.assertEqual(pedir("POST", "/api/tareas", cierre, galleta=galleta_t, csrf=csrf_t)[0], 200)
        self.assertEqual(pedir("GET", "/api/admin_resumen", galleta=galleta_t)[1]["tareas_hoy"], 0)

    def test_quien_no_es_cultivador_no_completa_tareas_sin_responsable(self):
        galleta, csrf = self.cuenta("coordinador_cultivo")
        id_t = pedir("POST", "/api/tareas", {"accion": "crear", "titulo": "Libre", "vence_en": HOY}, galleta=galleta, csrf=csrf)[1]["id"]
        otra, csrf_otra = self.cuenta("tesoreria")
        self.assertEqual(pedir("GET", "/api/tareas", galleta=otra)[1]["tareas"], [])
        self.assertEqual(pedir("POST", "/api/tareas", {"accion": "completar", "tarea_id": id_t}, galleta=otra, csrf=csrf_otra)[0], 403)

    def test_el_mantenimiento_crea_su_tarea_y_se_reprograma(self):
        galleta, csrf = self.cuenta("coordinador_cultivo")
        equipo = {"accion": "crear_equipo", "nombre": "Bomba", "tipo": "Riego", "proximo_mantenimiento": HOY, "frecuencia_dias": 30}
        pedir("POST", "/api/inventario", equipo, galleta=galleta, csrf=csrf)
        pedir("GET", "/api/tareas", galleta=galleta)
        tareas = pedir("GET", "/api/tareas", galleta=galleta)[1]["tareas"]
        self.assertEqual([t["titulo"] for t in tareas], ["Mantenimiento: Bomba"])
        pedir("POST", "/api/tareas", {"accion": "completar", "tarea_id": tareas[0]["id"]}, galleta=galleta, csrf=csrf)
        lista = pedir("GET", "/api/inventario", galleta=galleta)[1]["equipos"]
        self.assertEqual(lista[0]["proximo_mantenimiento"], (date.today() + timedelta(days=30)).isoformat())
        self.assertEqual(len(pedir("GET", "/api/tareas", galleta=galleta)[1]["tareas"]), 1)

    def test_las_averias_se_registran_y_resuelven(self):
        galleta, csrf = self.cuenta("coordinador_cultivo")
        post = lambda d: pedir("POST", "/api/inventario", d, galleta=galleta, csrf=csrf)  # noqa: E731
        id_e = post({"accion": "crear_equipo", "nombre": "Aire", "tipo": "Clima"})[1]["id"]
        id_a = post({"accion": "crear_averia", "equipo_id": id_e, "detalle": "Pierde agua", "coste": "500"})[1]["id"]
        self.assertEqual(post({"accion": "resolver_averia", "id": id_a})[0], 200)
        self.assertEqual(post({"accion": "resolver_averia", "id": id_a})[0], 409)
        self.assertEqual(post({"accion": "crear_averia", "equipo_id": 999, "detalle": "x"})[0], 422)


class Abastecimiento(Gestion):
    def setUp(self):
        super().setUp()
        self.galleta, self.csrf = self.cuenta("coordinador_cultivo")
        self.proveedor = self.post({"accion": "crear_proveedor", "nombre": "Vivero"})[1]["id"]
        self.insumo = pedir("POST", "/api/inventario", {
            "accion": "crear_insumo", "nombre": "Macetas", "categoria": "Varios", "unidad": "unidades", "stock_minimo": "10",
        }, galleta=self.galleta, csrf=self.csrf)[1]["id"]

    def post(self, datos, galleta=None, csrf=None):
        return pedir("POST", "/api/abastecimiento", datos, galleta=galleta or self.galleta, csrf=csrf or self.csrf)

    def pedido(self, cantidad="5", coste="100"):
        return self.post({"accion": "crear_pedido", "proveedor_id": self.proveedor, "lineas": [
            {"insumo_id": self.insumo, "cantidad": cantidad, "coste_unitario": coste}]})[1]["id"]

    def test_recibir_suma_el_stock_una_sola_vez(self):
        self.configurar("pedido_aprobacion_monto", "1000")
        id_p = self.pedido()
        self.assertEqual(self.post({"accion": "recibir", "pedido_id": id_p})[0], 409)
        self.assertEqual(self.post({"accion": "aprobar", "pedido_id": id_p})[0], 200)
        self.assertEqual(self.post({"accion": "recibir", "pedido_id": id_p})[0], 200)
        self.assertEqual(self.post({"accion": "recibir", "pedido_id": id_p})[0], 409)
        self.assertEqual(self.post({"accion": "cancelar", "pedido_id": id_p})[0], 409)
        inventario = pedir("GET", "/api/inventario", galleta=self.galleta)[1]
        self.assertEqual(inventario["insumos"][0]["stock"], "5.00")
        self.assertEqual(inventario["movimientos"][0]["motivo"], f"Pedido {id_p}")

    def test_por_encima_del_monto_aprueba_la_comision(self):
        self.configurar("pedido_aprobacion_monto", "100")
        id_p = self.pedido()
        self.assertEqual(self.post({"accion": "aprobar", "pedido_id": id_p})[0], 403)
        galleta, csrf = self.cuenta(COMISION)
        self.assertEqual(self.post({"accion": "aprobar", "pedido_id": id_p}, galleta, csrf)[0], 200)

    def test_el_borrador_trae_lo_que_falta(self):
        estado, cuerpo, _ = self.post({"accion": "borrador_faltantes", "proveedor_id": self.proveedor})
        self.assertEqual((estado, cuerpo["lineas"]), (200, 1))
        pedidos = pedir("GET", "/api/abastecimiento", galleta=self.galleta)[1]["pedidos"]
        self.assertEqual((pedidos[0]["estado"], pedidos[0]["lineas"]), ("borrador", 1))

    def test_un_pedido_sin_costes_no_se_aprueba_ni_salta_a_la_comision(self):
        self.configurar("pedido_aprobacion_monto", "100")
        id_p = self.post({"accion": "borrador_faltantes", "proveedor_id": self.proveedor})[1]["id"]
        self.assertEqual(self.post({"accion": "aprobar", "pedido_id": id_p})[0], 409)
        costear = {"accion": "costear", "pedido_id": id_p, "insumo_id": self.insumo, "coste_unitario": "500"}
        self.assertEqual(self.post(costear)[0], 200)
        self.assertEqual(self.post({"accion": "aprobar", "pedido_id": id_p})[0], 403)
        galleta, csrf = self.cuenta(COMISION)
        self.assertEqual(self.post({"accion": "aprobar", "pedido_id": id_p}, galleta, csrf)[0], 200)
        self.assertEqual(self.post(costear)[0], 409)

    def test_rechaza_pedidos_mal_formados(self):
        base = {"accion": "crear_pedido", "proveedor_id": self.proveedor}
        linea = {"insumo_id": self.insumo, "cantidad": "1", "coste_unitario": "1"}
        self.assertEqual(self.post({**base, "lineas": []})[0], 422)
        self.assertEqual(self.post({**base, "lineas": [linea, linea]})[0], 422)
        self.assertEqual(self.post({**base, "lineas": [{**linea, "insumo_id": 999}]})[0], 422)
        self.assertEqual(self.post({**base, "lineas": [{**linea, "cantidad": "0"}]})[0], 422)
        self.assertEqual(self.post({**base, "lineas": [None]})[0], 422)
        self.assertEqual(self.post({**base, "proveedor_id": 999, "lineas": [linea]})[0], 422)

    def test_un_consumo_descuenta_del_lote_y_avisa_si_falta(self):
        pedir("POST", "/api/inventario", {
            "accion": "movimiento", "insumo_id": self.insumo, "tipo": "ingreso", "cantidad": "12", "motivo": "Inicial",
        }, galleta=self.galleta, csrf=self.csrf)
        post = lambda d: pedir("POST", "/api/cultivo", d, galleta=self.galleta, csrf=self.csrf)  # noqa: E731
        sala = post({"accion": "crear_sala", "nombre": "S", "tipo": "cultivo"})[1]["id"]
        genetica = post({"accion": "crear_genetica", "nombre": "G"})[1]["id"]
        lote = post({"accion": "crear_lote", "codigo": "L-C", "genetica_id": genetica, "sala_id": sala, "origen": "esqueje", "cantidad_plantas": 3})[1]["id"]
        registro = {"lote_id": lote, "tipo": "riego", "detalle": "Riego", "insumo_id": self.insumo, "cantidad_insumo": "5"}
        self.assertEqual(pedir("POST", "/api/cultivo_registro", registro, galleta=self.galleta, csrf=self.csrf)[0], 200)
        inventario = pedir("GET", "/api/inventario", galleta=self.galleta)[1]
        self.assertEqual(inventario["insumos"][0]["stock"], "7.00")
        self.assertEqual(inventario["movimientos"][0]["motivo"], "riego")
        self.assertIn("Reponer: Macetas", [t["titulo"] for t in pedir("GET", "/api/tareas", galleta=self.galleta)[1]["tareas"]])
        sin = {**registro, "cantidad_insumo": "100"}
        self.assertEqual(pedir("POST", "/api/cultivo_registro", sin, galleta=self.galleta, csrf=self.csrf)[0], 409)
        with _db.transaccion() as cursor:
            cursor.execute("SELECT count(*) AS total FROM registros_lote WHERE lote_id = %s", (lote,))
            self.assertEqual(cursor.fetchone()["total"], 1)


class Plantas(Gestion):
    def setUp(self):
        super().setUp()
        self.galleta, self.csrf = self.cuenta("coordinador_cultivo")
        sala = self.post({"accion": "crear_sala", "nombre": "Sala A", "tipo": "cultivo"})[1]["id"]
        self.sala_b = self.post({"accion": "crear_sala", "nombre": "Sala B", "tipo": "secado"})[1]["id"]
        genetica = self.post({"accion": "crear_genetica", "nombre": "Gen"})[1]["id"]
        self.base = {"accion": "crear_lote", "genetica_id": genetica, "sala_id": sala, "origen": "esqueje"}
        self.lote = self.post({**self.base, "codigo": "L-Q", "cantidad_plantas": 3, "cosecha_prevista": MANANA})[1]["id"]

    def post(self, datos):
        return pedir("POST", "/api/cultivo", datos, galleta=self.galleta, csrf=self.csrf)

    def registro(self, **datos):
        return pedir("POST", "/api/cultivo_registro", {
            "lote_id": self.lote, "tipo": "baja", "detalle": "Plaga", **datos}, galleta=self.galleta, csrf=self.csrf)

    def test_el_lote_crea_una_planta_con_qr_por_unidad(self):
        etiquetas = pedir("GET", f"/api/lote_etiquetas?id={self.lote}", galleta=self.galleta)[1]
        self.assertEqual([p["codigo"] for p in etiquetas["plantas"]], ["L-Q-P001", "L-Q-P002", "L-Q-P003"])
        self.assertTrue(etiquetas["plantas"][0]["qr"].startswith("data:image/svg+xml"))
        self.assertEqual(self.post({**self.base, "codigo": "L-G", "cantidad_plantas": 501})[0], 422)

    def test_la_baja_de_una_planta_concreta_la_saca_de_las_etiquetas(self):
        self.assertEqual(self.registro(planta_codigo="L-Q-P002")[0], 200)
        self.assertEqual(self.registro(planta_codigo="L-Q-P002")[0], 409)
        self.assertEqual(self.registro(planta_codigo="OTRA-P001")[0], 422)
        self.assertEqual(self.registro(plantas=1)[0], 200)
        etiquetas = pedir("GET", f"/api/lote_etiquetas?id={self.lote}", galleta=self.galleta)[1]
        self.assertEqual([p["codigo"] for p in etiquetas["plantas"]], ["L-Q-P001"])
        detalle = pedir("GET", f"/api/cultivo_lote?id={self.lote}", galleta=self.galleta)[1]
        self.assertEqual((detalle["plantas"]["vivas"], detalle["plantas"]["total"]), (1, 3))
        self.assertEqual(detalle["lote"]["cantidad_plantas"], 1)

    def test_mover_cambia_el_mapa_pero_no_la_sala_de_la_comparativa(self):
        self.assertEqual(self.post({"accion": "mover", "lote_id": self.lote, "sala_id": self.sala_b})[0], 200)
        for peso in (None, None, "1000", None, "300"):
            self.assertEqual(self.post({"accion": "avanzar", "lote_id": self.lote, "peso_g": peso})[0], 200)
        datos = pedir("GET", "/api/cultivo", galleta=self.galleta)[1]
        self.assertEqual(datos["lotes"][0]["sala"], "Sala B")
        self.assertEqual(datos["por_sala"][0]["nombre"], "Sala A")
        self.assertEqual(float(datos["por_genetica"][0]["gramos_por_planta"]), 100)
        self.assertEqual(float(datos["por_genetica"][0]["merma"]), 70)

    def test_la_cosecha_prevista_sale_en_el_calendario(self):
        eventos = pedir("GET", "/api/calendario", galleta=self.galleta)[1]["eventos"]
        self.assertIn({"fecha": MANANA, "tipo": "cosecha", "titulo": "L-Q"}, eventos)
        tesoreria, _ = self.cuenta("tesoreria")
        self.assertNotIn("cosecha", [e["tipo"] for e in pedir("GET", "/api/calendario", galleta=tesoreria)[1]["eventos"]])
