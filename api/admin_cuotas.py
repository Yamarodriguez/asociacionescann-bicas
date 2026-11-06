"""Registro manual de cuotas. No hay pago en linea."""
import datetime as dt
import re
from decimal import Decimal, InvalidOperation

import psycopg2

from . import _db, _http

ROLES = {"comision_directiva", "tesoreria"}
METODOS = {"efectivo", "transferencia"}
PERIODO = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def get(manejador):
    _http.exigir_sesion(manejador, "admin", ROLES)
    with _db.transaccion() as cursor:
        cursor.execute(
            "SELECT id, numero_socio, nombre, apellido, cuota_vigente_hasta,"
            " (cuota_vigente_hasta IS NULL OR cuota_vigente_hasta < current_date) AS vencida"
            " FROM socios WHERE estado = 'activo'"
            " ORDER BY vencida DESC, cuota_vigente_hasta NULLS FIRST, numero_socio LIMIT 1000"
        )
        socios = cursor.fetchall()
        cursor.execute(
            "SELECT c.id, s.numero_socio, s.nombre, s.apellido, to_char(c.periodo, 'YYYY-MM') AS periodo,"
            " c.importe, c.pagado_en, c.metodo FROM cuotas c LEFT JOIN socios s ON s.id = c.socio_id"
            " ORDER BY c.creado_en DESC LIMIT 100"
        )
        pagos = cursor.fetchall()
    _http.json_respuesta(manejador, 200, {"socios": socios, "pagos": pagos})


def post(manejador):
    admin = _http.exigir_sesion(manejador, "admin", ROLES, csrf=True)
    datos = _http.leer_json(manejador)
    socio_id = datos.get("socio_id")
    periodo = datos.get("periodo")
    metodo = datos.get("metodo")
    if not isinstance(socio_id, int) or isinstance(socio_id, bool):
        raise _http.ErrorHttp(422, "Elegí un socio.")
    if not isinstance(periodo, str) or not PERIODO.match(periodo):
        raise _http.ErrorHttp(422, "Revisá el período.")
    if metodo not in METODOS:
        raise _http.ErrorHttp(422, "Revisá el método de pago.")
    try:
        importe = Decimal(str(datos.get("importe")))
    except InvalidOperation:
        raise _http.ErrorHttp(422, "Revisá el importe.")
    if not importe.is_finite() or importe <= 0 or importe != importe.quantize(Decimal("0.01")):
        raise _http.ErrorHttp(422, "Revisá el importe.")
    try:
        pagado_en = dt.date.fromisoformat(str(datos.get("pagado_en")))
    except ValueError:
        raise _http.ErrorHttp(422, "Revisá la fecha de pago.")
    inicio = dt.date.fromisoformat(f"{periodo}-01")

    with _db.transaccion() as cursor:
        cursor.execute("SELECT estado FROM socios WHERE id = %s FOR UPDATE", (socio_id,))
        socio = cursor.fetchone()
        if socio is None or socio["estado"] != "activo":
            raise _http.ErrorHttp(409, "Solo se registran cuotas de socios activos.")
        try:
            cursor.execute("SAVEPOINT cuota")
            cursor.execute(
                "INSERT INTO cuotas (socio_id, periodo, importe, pagado_en, metodo, registrado_por)"
                " VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
                (socio_id, inicio, importe, pagado_en, metodo, admin["id"]))
        except psycopg2.errors.UniqueViolation:
            cursor.execute("ROLLBACK TO SAVEPOINT cuota")
            raise _http.ErrorHttp(409, "Ese período ya está registrado.")
        cuota_id = cursor.fetchone()["id"]
        cursor.execute(
            "UPDATE socios SET cuota_vigente_hasta = ("
            " SELECT (max(periodo) + interval '1 month' - interval '1 day')::date"
            " FROM cuotas WHERE socio_id = %s) WHERE id = %s RETURNING cuota_vigente_hasta",
            (socio_id, socio_id))
        vigente = cursor.fetchone()["cuota_vigente_hasta"]
        _db.auditar(cursor, "cuota_registrada", "cuota", cuota_id, admin_id=admin["id"])
    _http.json_respuesta(manejador, 200, {"cuota_vigente_hasta": vigente})
