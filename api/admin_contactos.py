"""Mensajes de contacto para comision directiva y secretaria."""
from . import _db, _http

ROLES = {"comision_directiva", "secretaria"}


def get(manejador):
    admin = _http.exigir_sesion(manejador, "admin", ROLES)
    with _db.transaccion() as cursor:
        cursor.execute(
            "SELECT id, nombre, email, mensaje, creado_en FROM contactos"
            " ORDER BY creado_en DESC LIMIT 200"
        )
        filas = cursor.fetchall()
        _db.auditar(cursor, "contactos_consultados", "contacto", admin_id=admin["id"])
    _http.json_respuesta(manejador, 200, {"contactos": filas})
