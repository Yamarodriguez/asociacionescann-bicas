"""Cierra la sesion e invalida el token aunque alguien lo hubiera copiado."""
from . import _db, _http


def post(manejador):
    _http.comprobar_origen(manejador)
    socio = _http.sesion(manejador, "socio")
    admin = _http.sesion(manejador, "admin")
    with _db.transaccion() as cursor:
        if socio is not None:
            cursor.execute(
                "UPDATE socios SET sesion_version = sesion_version + 1 WHERE id = %s", (socio["id"],))
        if admin is not None:
            cursor.execute(
                "UPDATE admins SET sesion_version = sesion_version + 1 WHERE id = %s", (admin["id"],))
    _http.json_respuesta(
        manejador, 200, {"ok": True},
        [_http.galleta_borrada("socio"), _http.galleta_borrada("admin"), _http.galleta_borrada("pre")])
