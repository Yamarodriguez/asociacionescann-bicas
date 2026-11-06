"""Un solo acceso: detecta si la cuenta es de socio o del equipo."""
from . import _auth, _db, _http

GENERICO = "Correo o contraseña incorrectos."


def post(manejador):
    _http.comprobar_origen(manejador)
    datos = _http.leer_json(manejador)
    email = datos.get("email")
    clave = datos.get("clave")
    if not isinstance(email, str) or not isinstance(clave, str) or len(clave) > 200:
        raise _http.ErrorHttp(401, GENERICO)
    email = email.strip().lower()
    ip = _http.ip_cliente(manejador)

    with _db.transaccion() as cursor:
        bloqueado = _auth.intentos_superados(cursor, email, ip)
        cursor.execute(
            "SELECT id, clave_hash, sesion_version, totp_activado_en FROM admins"
            " WHERE email = %s AND activo", (email,))
        admin = cursor.fetchone()
        socio = None
        if admin is None:
            cursor.execute(
                "SELECT id, clave_hash, sesion_version FROM socios"
                " WHERE email = %s AND estado <> 'baja'", (email,))
            socio = cursor.fetchone()

    if bloqueado:
        _auth.verificar_clave(clave, None)
        raise _http.ErrorHttp(429, "Demasiados intentos. Probá de nuevo más tarde.")

    cuenta = admin or socio
    if not _auth.verificar_clave(clave, cuenta["clave_hash"] if cuenta else None):
        with _db.transaccion() as cursor:
            _auth.registrar_fallo(cursor, email, ip)
        raise _http.ErrorHttp(401, GENERICO)

    if admin and admin["totp_activado_en"] is not None:
        # La contrasena era correcta, pero la sesion solo se abre con el segundo factor.
        with _db.transaccion() as cursor:
            _auth.limpiar_fallos(cursor, email)
        previo = _auth.crear_token("pre", admin["id"], admin["sesion_version"])
        _http.json_respuesta(
            manejador, 200, {"tipo": "admin", "requiere_2fa": True},
            [_http.galleta_sesion("pre", previo)])
        return

    tipo = "admin" if admin else "socio"
    token = _auth.crear_token(tipo, cuenta["id"], cuenta["sesion_version"])
    with _db.transaccion() as cursor:
        _auth.limpiar_fallos(cursor, email)
        if admin:
            _db.auditar(cursor, "login", "admin", admin["id"], admin_id=admin["id"])
    _http.json_respuesta(manejador, 200, {"tipo": tipo}, [_http.galleta_sesion(tipo, token)])
