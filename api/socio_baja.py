"""El socio pide la baja. Confirma con su contrasena y luego la tramita el equipo."""
from . import _auth, _db, _http


def post(manejador):
    socio = _http.exigir_sesion(manejador, "socio", csrf=True)
    datos = _http.leer_json(manejador)
    clave = datos.get("clave")
    if not isinstance(clave, str):
        raise _http.ErrorHttp(422, "Escribí tu contraseña.")
    with _db.transaccion() as cursor:
        cursor.execute("SELECT clave_hash FROM socios WHERE id = %s", (socio["id"],))
        guardada = cursor.fetchone()["clave_hash"]
    if not _auth.verificar_clave(clave, guardada):
        raise _http.ErrorHttp(403, "La contraseña no es correcta.")
    with _db.transaccion() as cursor:
        cursor.execute(
            "UPDATE socios SET baja_solicitada_en = now() WHERE id = %s AND baja_solicitada_en IS NULL",
            (socio["id"],))
        _db.auditar(cursor, "baja_solicitada", "socio", socio["id"], socio_id=socio["id"])
    _http.json_respuesta(manejador, 200, {"mensaje": "Recibimos tu pedido de baja."})
