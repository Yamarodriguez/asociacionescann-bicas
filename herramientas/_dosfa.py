"""Codigos temporales de doble factor (TOTP, RFC 6238) y codigos de recuperacion."""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

DIGITOS = 6
PERIODO = 30
TOLERANCIA = 1  # Admite un paso de diferencia por el reloj del telefono.
EMISOR = "Portal"


def generar_secreto():
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii")


def codigo(secreto, paso, digitos=DIGITOS):
    clave = base64.b32decode(secreto)
    resumen = hmac.new(clave, struct.pack(">Q", paso), hashlib.sha1).digest()
    desplazamiento = resumen[-1] & 0x0F
    valor = struct.unpack(">I", resumen[desplazamiento:desplazamiento + 4])[0] & 0x7FFFFFFF
    return str(valor % 10**digitos).zfill(digitos)


def paso_actual(ahora=None):
    return int((time.time() if ahora is None else ahora) // PERIODO)


def verificar(secreto, recibido, ultimo_paso=None, ahora=None):
    """Devuelve el paso valido, o None. Un paso ya usado no vale: evita repetir un codigo."""
    if not isinstance(recibido, str) or len(recibido) != DIGITOS or not recibido.isdigit():
        return None
    actual = paso_actual(ahora)
    for paso in range(actual - TOLERANCIA, actual + TOLERANCIA + 1):
        if ultimo_paso is not None and paso <= ultimo_paso:
            continue
        if hmac.compare_digest(codigo(secreto, paso), recibido):
            return paso
    return None


def uri_aplicacion(secreto, cuenta):
    """El nombre visible en el telefono no describe la actividad."""
    return (
        f"otpauth://totp/{quote(EMISOR)}:{quote(cuenta)}"
        f"?secret={secreto}&issuer={quote(EMISOR)}&digits={DIGITOS}&period={PERIODO}"
    )


def generar_codigos_recuperacion(cantidad=8):
    return [f"{secrets.token_hex(4)}-{secrets.token_hex(4)}" for _ in range(cantidad)]


def hash_codigo(valor):
    return hashlib.sha256(valor.strip().lower().encode()).hexdigest()
