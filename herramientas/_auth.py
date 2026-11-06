"""Contrasenas, sesiones firmadas y limite de intentos."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from . import _config, _db

SCRYPT = {"n": 2**15, "r": 8, "p": 1, "maxmem": 128 * 1024 * 1024, "dklen": 32}
LONGITUD_MINIMA_CLAVE = 10
DURACION = {"socio": 7 * 24 * 3600, "admin": 12 * 3600, "pre": 300}
COOKIE = {"socio": "sesion_socio", "admin": "sesion_admin", "pre": "sesion_pre"}
SECRETO = {"socio": "SESION_SECRETO_SOCIOS", "admin": "SESION_SECRETO_ADMINS", "pre": "SESION_SECRETO_ADMINS"}

# Se usa cuando el correo no existe, para que la respuesta tarde lo mismo
# y no revele si la cuenta existe.
_SAL_FALSA = b"\x00" * 16


def hashear_clave(clave):
    sal = os.urandom(16)
    derivada = hashlib.scrypt(clave.encode("utf-8"), salt=sal, **SCRYPT)
    return f"scrypt${SCRYPT['n']}${SCRYPT['r']}${SCRYPT['p']}${sal.hex()}${derivada.hex()}"


def verificar_clave(clave, guardada):
    if guardada is None:
        hashlib.scrypt(clave.encode("utf-8"), salt=_SAL_FALSA, **SCRYPT)
        return False
    try:
        _, n, r, p, sal, derivada = guardada.split("$")
        calculada = hashlib.scrypt(
            clave.encode("utf-8"), salt=bytes.fromhex(sal), n=int(n), r=int(r), p=int(p),
            maxmem=SCRYPT["maxmem"], dklen=len(derivada) // 2,
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(calculada.hex(), derivada)


def _b64(datos):
    return base64.urlsafe_b64encode(datos).rstrip(b"=").decode("ascii")


def _desde_b64(texto):
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def _firma(tipo, cuerpo):
    return hmac.new(_config.req(SECRETO[tipo]).encode(), cuerpo.encode(), hashlib.sha256).digest()


def crear_token(tipo, usuario_id, version):
    datos = {
        "t": tipo, "id": usuario_id, "v": version,
        "exp": int(time.time()) + DURACION[tipo], "c": secrets.token_urlsafe(16),
    }
    cuerpo = _b64(json.dumps(datos, separators=(",", ":")).encode())
    return f"{cuerpo}.{_b64(_firma(tipo, cuerpo))}"


def leer_token(tipo, token):
    """Devuelve los datos si la firma y la caducidad son validas; si no, None."""
    try:
        cuerpo, firma = token.split(".")
        if not hmac.compare_digest(_desde_b64(firma), _firma(tipo, cuerpo)):
            return None
        datos = json.loads(_desde_b64(cuerpo))
    except (ValueError, AttributeError):
        return None
    if datos.get("t") != tipo or datos.get("exp", 0) < time.time():
        return None
    return datos


def huella(valor):
    return hmac.new(_config.req("HUELLAS_SECRETO").encode(), valor.encode(), hashlib.sha256).hexdigest()


def intentos_superados(cursor, email, ip):
    ventana = int(_db.configuracion(cursor, "login_ventana_minutos"))
    max_email = int(_db.configuracion(cursor, "login_max_por_email"))
    max_ip = int(_db.configuracion(cursor, "login_max_por_ip"))
    cursor.execute(
        "SELECT"
        " count(*) FILTER (WHERE huella_email = %s) AS por_email,"
        " count(*) FILTER (WHERE huella_ip = %s) AS por_ip"
        " FROM intentos_login WHERE creado_en > now() - make_interval(mins => %s)",
        (huella(email), huella(ip), ventana),
    )
    fila = cursor.fetchone()
    return fila["por_email"] >= max_email or fila["por_ip"] >= max_ip


def registrar_fallo(cursor, email, ip):
    cursor.execute(
        "INSERT INTO intentos_login (huella_email, huella_ip) VALUES (%s, %s)",
        (huella(email), huella(ip)),
    )


def limpiar_fallos(cursor, email):
    cursor.execute("DELETE FROM intentos_login WHERE huella_email = %s", (huella(email),))
