"""Entrega al socio una copia de sus propios datos."""
import json

from . import _db, _http


def get(manejador):
    socio = _http.exigir_sesion(manejador, "socio")
    with _db.transaccion() as cursor:
        cursor.execute(
            "SELECT numero_socio, email, nombre, apellido, fecha_nacimiento, tipo_documento,"
            " numero_documento, telefono, estado, avalista_numero_socio, identidad_verificada_en,"
            " alta_en, baja_en, baja_solicitada_en, cuota_vigente_hasta, consentimiento_en,"
            " estatutos_aceptados_en, creado_en FROM socios WHERE id = %s", (socio["id"],))
        datos = dict(cursor.fetchone())
        cursor.execute(
            "SELECT to_char(periodo, 'YYYY-MM') AS periodo, importe, pagado_en, metodo FROM cuotas"
            " WHERE socio_id = %s ORDER BY periodo", (socio["id"],))
        datos["cuotas"] = cursor.fetchall()
        _db.auditar(cursor, "datos_exportados", "socio", socio["id"], socio_id=socio["id"])
    contenido = json.dumps(datos, ensure_ascii=False, indent=2, default=str).encode("utf-8")
    _http.archivo_respuesta(manejador, contenido, "application/json; charset=utf-8", "mis-datos.json")
