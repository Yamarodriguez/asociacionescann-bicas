"""Contadores del menu del panel, segun el rol."""
from . import _db, _http

SOCIOS = {"comision_directiva", "secretaria"}
CUOTAS = {"comision_directiva", "tesoreria"}


def get(manejador):
    admin = _http.exigir_sesion(manejador, "admin")
    rol = admin["rol"]
    resumen = {"rol": rol}
    with _db.transaccion() as cursor:
        if rol in SOCIOS:
            cursor.execute(
                "SELECT count(*) FILTER (WHERE estado = 'pendiente') AS pendientes,"
                " count(*) FILTER (WHERE baja_solicitada_en IS NOT NULL AND estado <> 'baja') AS bajas"
                " FROM socios")
            resumen.update(cursor.fetchone())
            cursor.execute("SELECT count(*) AS mensajes FROM contactos")
            resumen.update(cursor.fetchone())
        if rol in CUOTAS:
            cursor.execute(
                "SELECT count(*) AS vencidas FROM socios WHERE estado = 'activo'"
                " AND (cuota_vigente_hasta IS NULL OR cuota_vigente_hasta < current_date)")
            resumen.update(cursor.fetchone())
    _http.json_respuesta(manejador, 200, resumen)
