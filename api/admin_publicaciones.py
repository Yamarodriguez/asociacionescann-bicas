"""Comunicados, documentos, asambleas y actas."""
import datetime as dt

from . import _db, _http

ROLES = {"comision_directiva", "secretaria"}


def _texto(datos, clave, maximo):
    valor = datos.get(clave)
    if not isinstance(valor, str) or not valor.strip() or len(valor) > maximo:
        raise _http.ErrorHttp(422, "Revisá los datos del formulario.")
    return valor.strip()


def get(manejador):
    _http.exigir_sesion(manejador, "admin", ROLES)
    with _db.transaccion() as cursor:
        cursor.execute("SELECT id, titulo, publicado_en FROM comunicados ORDER BY publicado_en DESC LIMIT 100")
        comunicados = cursor.fetchall()
        cursor.execute("SELECT id, titulo, publicado_en FROM documentos ORDER BY publicado_en DESC LIMIT 100")
        documentos = cursor.fetchall()
        cursor.execute("SELECT id, titulo, fecha, lugar FROM asambleas ORDER BY fecha DESC LIMIT 100")
        asambleas = cursor.fetchall()
        cursor.execute("SELECT id, titulo, publicado_en FROM actas ORDER BY publicado_en DESC LIMIT 100")
        actas = cursor.fetchall()
    _http.json_respuesta(manejador, 200, {
        "comunicados": comunicados, "documentos": documentos, "asambleas": asambleas, "actas": actas,
    })


def post(manejador):
    admin = _http.exigir_sesion(manejador, "admin", ROLES, csrf=True)
    datos = _http.leer_json(manejador)
    tipo = datos.get("tipo")
    titulo = _texto(datos, "titulo", 200)
    with _db.transaccion() as cursor:
        if tipo == "comunicado":
            cursor.execute(
                "INSERT INTO comunicados (titulo, cuerpo, autor_id) VALUES (%s, %s, %s) RETURNING id",
                (titulo, _texto(datos, "cuerpo", 20000), admin["id"]))
        elif tipo == "documento":
            cursor.execute(
                "INSERT INTO documentos (titulo, contenido, autor_id) VALUES (%s, %s, %s) RETURNING id",
                (titulo, _texto(datos, "cuerpo", 40000), admin["id"]))
        elif tipo == "acta":
            cursor.execute(
                "INSERT INTO actas (titulo, contenido, autor_id) VALUES (%s, %s, %s) RETURNING id",
                (titulo, _texto(datos, "cuerpo", 40000), admin["id"]))
        elif tipo == "asamblea":
            try:
                fecha = dt.datetime.fromisoformat(_texto(datos, "fecha", 30))
            except ValueError:
                raise _http.ErrorHttp(422, "Revisá la fecha.")
            cursor.execute(
                "INSERT INTO asambleas (titulo, fecha, lugar, orden_dia, autor_id)"
                " VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (titulo, fecha, _texto(datos, "lugar", 200), _texto(datos, "cuerpo", 20000), admin["id"]))
        else:
            raise _http.ErrorHttp(422, "Revisá el tipo de publicación.")
        nuevo = cursor.fetchone()["id"]
        _db.auditar(cursor, "publicacion_creada", tipo, nuevo, admin_id=admin["id"])
    _http.json_respuesta(manejador, 200, {"id": nuevo})
