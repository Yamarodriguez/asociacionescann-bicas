"""Cambio de contrasena con un enlace de un solo uso que caduca."""
import hashlib
import os
import secrets

from . import _auth, _db, _email, _http

RESPUESTA = {"mensaje": "Si el correo está registrado, vas a recibir un enlace para cambiar tu contraseña."}


def _hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def _buscar(cursor, email):
    cursor.execute("SELECT id FROM admins WHERE email = %s AND activo", (email,))
    fila = cursor.fetchone()
    if fila:
        return "admin", fila["id"]
    cursor.execute("SELECT id FROM socios WHERE email = %s AND estado <> 'baja'", (email,))
    fila = cursor.fetchone()
    return ("socio", fila["id"]) if fila else (None, None)


def pedir(manejador):
    _http.comprobar_origen(manejador)
    email = _http.leer_json(manejador).get("email")
    if not isinstance(email, str) or len(email) > 254:
        _http.json_respuesta(manejador, 202, RESPUESTA)
        return
    email = email.strip().lower()
    token = None
    with _db.transaccion() as cursor:
        tipo, usuario_id = _buscar(cursor, email)
        if tipo is not None:
            maximo = int(_db.configuracion(cursor, "recuperacion_max_por_hora"))
            vigencia = int(_db.configuracion(cursor, "recuperacion_vigencia_minutos"))
            cursor.execute(
                "SELECT count(*) AS total FROM recuperaciones WHERE tipo = %s AND usuario_id = %s"
                " AND creado_en > now() - interval '1 hour'", (tipo, usuario_id))
            if cursor.fetchone()["total"] < maximo:
                token = secrets.token_urlsafe(32)
                cursor.execute(
                    "INSERT INTO recuperaciones (tipo, usuario_id, token_hash, expira_en)"
                    " VALUES (%s, %s, %s, now() + make_interval(mins => %s))",
                    (tipo, usuario_id, _hash_token(token), vigencia))
    if token:
        # El codigo va tras la almohadilla: no llega a ningun registro de servidor.
        base = os.environ.get("SITIO_URL", "http://localhost:8080")
        _email.enviar(email, "recuperar_clave", f"{base}/recuperar.html#t={token}")
    _http.json_respuesta(manejador, 202, RESPUESTA)


def cambiar(manejador):
    _http.comprobar_origen(manejador)
    datos = _http.leer_json(manejador)
    token, clave = datos.get("token"), datos.get("clave")
    if not isinstance(clave, str) or not _auth.LONGITUD_MINIMA_CLAVE <= len(clave) <= 200:
        raise _http.ErrorHttp(422, "La contraseña debe tener al menos 10 caracteres.")
    if not isinstance(token, str) or len(token) > 100:
        raise _http.ErrorHttp(400, "El enlace no es válido o ya venció.")
    nuevo_hash = _auth.hashear_clave(clave)
    with _db.transaccion() as cursor:
        cursor.execute(
            "SELECT id, tipo, usuario_id FROM recuperaciones WHERE token_hash = %s"
            " AND usado_en IS NULL AND expira_en > now() FOR UPDATE", (_hash_token(token),))
        fila = cursor.fetchone()
        if fila is None:
            raise _http.ErrorHttp(400, "El enlace no es válido o ya venció.")
        consulta = (
            "UPDATE socios SET clave_hash = %s, sesion_version = sesion_version + 1 WHERE id = %s"
            if fila["tipo"] == "socio" else
            "UPDATE admins SET clave_hash = %s, sesion_version = sesion_version + 1 WHERE id = %s"
        )
        cursor.execute(consulta, (nuevo_hash, fila["usuario_id"]))
        cursor.execute(
            "UPDATE recuperaciones SET usado_en = now() WHERE tipo = %s AND usuario_id = %s"
            " AND usado_en IS NULL", (fila["tipo"], fila["usuario_id"]))
        _db.auditar(cursor, "contrasena_cambiada", fila["tipo"], fila["usuario_id"])
    _http.json_respuesta(manejador, 200, {"mensaje": "Cambiamos tu contraseña. Ya podés ingresar."})
