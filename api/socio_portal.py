"""Portal del socio. Cada consulta usa el id de la sesion, nunca uno recibido."""
import secrets

import segno

from . import _db, _http


def exigir_activo(manejador, csrf=False):
    socio = _http.exigir_sesion(manejador, "socio", csrf=csrf)
    if socio["estado"] != "activo":
        raise _http.ErrorHttp(403, "Tu cuenta todavía no tiene acceso a esta sección.")
    return socio


def _qr(cursor, socio_id):
    """El QR lleva un codigo al azar, sin ningun dato personal."""
    cursor.execute("SELECT carne_token FROM socios WHERE id = %s", (socio_id,))
    token = cursor.fetchone()["carne_token"]
    if token is None:
        token = secrets.token_urlsafe(24)
        cursor.execute("UPDATE socios SET carne_token = %s WHERE id = %s", (token, socio_id))
    return segno.make(token, error="m").svg_data_uri(scale=6, border=2)


def get(manejador):
    socio = exigir_activo(manejador)
    with _db.transaccion() as cursor:
        cursor.execute(
            "SELECT numero_socio, nombre, apellido, email, telefono, alta_en,"
            " cuota_vigente_hasta, baja_solicitada_en, carne_token IS NOT NULL AS tiene_carne"
            " FROM socios WHERE id = %s", (socio["id"],))
        perfil = dict(cursor.fetchone())
        perfil.pop("tiene_carne")
        cursor.execute(
            "SELECT to_char(periodo, 'YYYY-MM') AS periodo, importe, pagado_en, metodo FROM cuotas"
            " WHERE socio_id = %s ORDER BY periodo DESC", (socio["id"],))
        cuotas = cursor.fetchall()
        cursor.execute(
            "SELECT id, titulo, cuerpo, publicado_en FROM comunicados ORDER BY publicado_en DESC LIMIT 50")
        comunicados = cursor.fetchall()
        cursor.execute(
            "SELECT id, titulo, contenido, publicado_en FROM documentos ORDER BY publicado_en DESC LIMIT 50")
        documentos = cursor.fetchall()
        cursor.execute(
            "SELECT id, titulo, fecha, lugar, orden_dia FROM asambleas ORDER BY fecha DESC LIMIT 50")
        asambleas = cursor.fetchall()
        cursor.execute(
            "SELECT id, titulo, contenido, publicado_en FROM actas ORDER BY publicado_en DESC LIMIT 50")
        actas = cursor.fetchall()
        qr = None
        if _db.configuracion(cursor, "carne_qr_activo") == "true":
            qr = _qr(cursor, socio["id"])
    _http.json_respuesta(manejador, 200, {
        "perfil": perfil, "cuotas": cuotas, "comunicados": comunicados, "documentos": documentos,
        "asambleas": asambleas, "actas": actas, "qr": qr,
    })


def actualizar(manejador):
    """El socio solo puede cambiar su telefono: el resto se verifica en persona."""
    socio = exigir_activo(manejador, csrf=True)
    datos = _http.leer_json(manejador)
    telefono = datos.get("telefono") or None
    if telefono is not None and (not isinstance(telefono, str) or len(telefono) > 30):
        raise _http.ErrorHttp(422, "Revisá el teléfono.")
    with _db.transaccion() as cursor:
        cursor.execute("UPDATE socios SET telefono = %s WHERE id = %s", (telefono, socio["id"]))
        _db.auditar(cursor, "telefono_actualizado", "socio", socio["id"], socio_id=socio["id"])
    _http.json_respuesta(manejador, 200, {"mensaje": "Guardamos tu teléfono."})
