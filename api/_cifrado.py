"""Cifrado autenticado para secretos y copias de seguridad."""
import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from . import _config


def _clave(nombre):
    clave = bytes.fromhex(_config.req(nombre))
    if len(clave) != 32:
        raise RuntimeError(f"{nombre} debe tener 32 bytes")
    return clave


def cifrar_bytes(datos, nombre_clave):
    nonce = os.urandom(12)
    return nonce + AESGCM(_clave(nombre_clave)).encrypt(nonce, datos, None)


def descifrar_bytes(datos, nombre_clave):
    return AESGCM(_clave(nombre_clave)).decrypt(datos[:12], datos[12:], None)


def cifrar_texto(texto, nombre_clave):
    return base64.b64encode(cifrar_bytes(texto.encode(), nombre_clave)).decode("ascii")


def descifrar_texto(texto, nombre_clave):
    return descifrar_bytes(base64.b64decode(texto), nombre_clave).decode()
