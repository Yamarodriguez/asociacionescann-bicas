"""Cola de solicitudes y aprobacion, solo para comision directiva y secretaria."""
from . import _db, _email, _http

ROLES = {"comision_directiva", "secretaria"}


def get(manejador):
    _http.exigir_sesion(manejador, "admin", ROLES)
    with _db.transaccion() as cursor:
        cursor.execute(
            "SELECT id, numero_socio, nombre, apellido, tipo_documento, numero_documento,"
            " estado, creado_en FROM socios"
            " ORDER BY estado <> 'pendiente', creado_en DESC LIMIT 200"
        )
        filas = cursor.fetchall()
    _http.json_respuesta(manejador, 200, {"socios": filas})


def post(manejador):
    admin = _http.exigir_sesion(manejador, "admin", ROLES, csrf=True)
    datos = _http.leer_json(manejador)
    socio_id = datos.get("socio_id")
    if not isinstance(socio_id, int) or isinstance(socio_id, bool):
        raise _http.ErrorHttp(422, "Pedido inválido.")
    if datos.get("identidad_verificada") is not True:
        raise _http.ErrorHttp(422, "Primero hay que verificar la identidad en persona.")
    with _db.transaccion() as cursor:
        cursor.execute("SELECT estado, email FROM socios WHERE id = %s FOR UPDATE", (socio_id,))
        socio = cursor.fetchone()
        if socio is None or socio["estado"] != "pendiente":
            raise _http.ErrorHttp(409, "Esta solicitud ya no está pendiente.")
        cursor.execute(
            "UPDATE socios SET estado = 'activo', numero_socio = nextval('numero_socio_seq'),"
            " alta_en = now(), identidad_verificada_en = now(), identidad_verificada_por = %s"
            " WHERE id = %s RETURNING numero_socio",
            (admin["id"], socio_id),
        )
        numero = cursor.fetchone()["numero_socio"]
        _db.auditar(cursor, "solicitud_aprobada", "socio", socio_id, admin_id=admin["id"])
    _email.enviar(socio["email"], "solicitud_aprobada")
    _http.json_respuesta(manejador, 200, {"numero_socio": numero})
