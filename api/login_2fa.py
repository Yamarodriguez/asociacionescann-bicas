"""Segundo paso del acceso del equipo."""
from . import _auth, _cifrado, _db, _dosfa, _http

GENERICO = "El código no es correcto."


def _demasiados(cursor, huella):
    maximo = int(_db.configuracion(cursor, "dosfa_max_intentos"))
    ventana = int(_db.configuracion(cursor, "login_ventana_minutos"))
    cursor.execute(
        "SELECT count(*) AS total FROM intentos_login WHERE huella_email = %s"
        " AND creado_en > now() - make_interval(mins => %s)", (huella, ventana))
    return cursor.fetchone()["total"] >= maximo


def _usar_codigo_recuperacion(cursor, admin_id, valor):
    cursor.execute(
        "UPDATE codigos_recuperacion SET usado_en = now() WHERE admin_id = %s AND codigo_hash = %s"
        " AND usado_en IS NULL RETURNING id", (admin_id, _dosfa.hash_codigo(valor)))
    return cursor.fetchone() is not None


def post(manejador):
    _http.comprobar_origen(manejador)
    datos = _http.leer_json(manejador)
    previo = _auth.leer_token("pre", _http.leer_galleta(manejador, "pre"))
    if previo is None:
        raise _http.ErrorHttp(401, "Volvé a ingresar tu correo y contraseña.")
    recibido = datos.get("codigo")
    if not isinstance(recibido, str) or len(recibido) > 40:
        raise _http.ErrorHttp(401, GENERICO)
    recibido = recibido.strip()
    admin_id = previo["id"]
    huella = _auth.huella(f"2fa:{admin_id}")
    ip = _auth.huella(f"2fa:{_http.ip_cliente(manejador)}")

    with _db.transaccion() as cursor:
        if _demasiados(cursor, huella):
            raise _http.ErrorHttp(429, "Demasiados intentos. Probá de nuevo más tarde.")
        cursor.execute(
            "SELECT totp_cifrado, totp_ultimo_paso, sesion_version FROM admins"
            " WHERE id = %s AND activo AND totp_activado_en IS NOT NULL FOR UPDATE", (admin_id,))
        admin = cursor.fetchone()
        if admin is None or admin["sesion_version"] != previo["v"]:
            raise _http.ErrorHttp(401, "Volvé a ingresar tu correo y contraseña.")
        secreto = _cifrado.descifrar_texto(admin["totp_cifrado"], "TOTP_CLAVE")
        paso = _dosfa.verificar(secreto, recibido, admin["totp_ultimo_paso"])
        valido = paso is not None
        if valido:
            cursor.execute("UPDATE admins SET totp_ultimo_paso = %s WHERE id = %s", (paso, admin_id))
        else:
            valido = _usar_codigo_recuperacion(cursor, admin_id, recibido)
            if valido:
                _db.auditar(cursor, "codigo_recuperacion_usado", "admin", admin_id, admin_id=admin_id)
        if valido:
            cursor.execute("DELETE FROM intentos_login WHERE huella_email = %s", (huella,))
            _db.auditar(cursor, "login", "admin", admin_id, admin_id=admin_id)
        else:
            cursor.execute(
                "INSERT INTO intentos_login (huella_email, huella_ip) VALUES (%s, %s)", (huella, ip))
    if not valido:
        raise _http.ErrorHttp(401, GENERICO)
    token = _auth.crear_token("admin", admin_id, admin["sesion_version"])
    _http.json_respuesta(
        manejador, 200, {"tipo": "admin"},
        [_http.galleta_sesion("admin", token), _http.galleta_borrada("pre")])
