"""Indica quien ha iniciado sesion y entrega el token CSRF."""
from . import _http


def get(manejador):
    admin = _http.sesion(manejador, "admin")
    if admin is not None:
        _http.json_respuesta(manejador, 200, {
            "tipo": "admin", "rol": admin["rol"], "csrf": admin["csrf"],
            "falta_2fa": bool(_http.falta_dosfa(admin)),
        })
        return
    socio = _http.sesion(manejador, "socio")
    if socio is not None:
        _http.json_respuesta(manejador, 200, {
            "tipo": "socio", "estado": socio["estado"], "nombre": socio["nombre"],
            "numero_socio": socio["numero_socio"], "csrf": socio["csrf"]})
        return
    _http.json_respuesta(manejador, 401, {"error": "Tenés que iniciar sesión."})
