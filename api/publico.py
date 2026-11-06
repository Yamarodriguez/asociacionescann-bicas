"""Datos configurables que necesita la web publica. Sin datos personales."""
from . import _db, _http


def get(manejador):
    with _db.transaccion() as cursor:
        edad = int(_db.configuracion(cursor, "edad_minima"))
    _http.json_respuesta(manejador, 200, {"edad_minima": edad})
