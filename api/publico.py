"""Datos configurables que necesita la web publica. Sin datos personales."""
from . import _db, _http


def get(manejador):
    with _db.transaccion() as cursor:
        edad = int(_db.configuracion(cursor, "edad_minima"))
        aval = _db.configuracion(cursor, "aval_activo") == "true"
    _http.json_respuesta(manejador, 200, {"edad_minima": edad, "aval_activo": aval})
