"""Consulta del registro de auditoria, solo para la comision directiva."""
from . import _db, _http

ROLES = {"comision_directiva"}


def get(manejador):
    admin = _http.exigir_sesion(manejador, "admin", ROLES)
    with _db.transaccion() as cursor:
        cursor.execute(
            "SELECT a.creado_en, a.accion, a.entidad, a.entidad_id, a.detalle, e.email AS responsable"
            " FROM auditoria a LEFT JOIN admins e ON e.id = a.admin_id"
            " ORDER BY a.creado_en DESC, a.id DESC LIMIT 300"
        )
        filas = cursor.fetchall()
        _db.auditar(cursor, "auditoria_consultada", "auditoria", admin_id=admin["id"])
    _http.json_respuesta(manejador, 200, {"auditoria": filas})
