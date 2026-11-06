"""Respuestas JSON, lectura del cuerpo, cookies, permisos y errores."""
import hmac
import json
import logging
import os
from http import cookies

from . import _auth, _config, _db

TAMANO_MAXIMO = 64 * 1024
log = logging.getLogger("asociacion")


class ErrorHttp(Exception):
    def __init__(self, estado, mensaje):
        super().__init__(mensaje)
        self.estado = estado
        self.mensaje = mensaje


def cabeceras_seguridad(manejador):
    manejador.send_header("X-Robots-Tag", "noindex, nofollow")
    manejador.send_header("X-Content-Type-Options", "nosniff")
    manejador.send_header("X-Frame-Options", "DENY")
    manejador.send_header("Referrer-Policy", "no-referrer")
    manejador.send_header(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data:; object-src 'none'; "
        "base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    )
    if _config.es_produccion():
        manejador.send_header("Strict-Transport-Security", "max-age=31536000")


def json_respuesta(manejador, estado, datos, galletas=()):
    cuerpo = json.dumps(datos, ensure_ascii=False, default=str).encode("utf-8")
    manejador.send_response(estado)
    manejador.send_header("Content-Type", "application/json; charset=utf-8")
    manejador.send_header("Content-Length", str(len(cuerpo)))
    manejador.send_header("Cache-Control", "no-store")
    if manejador.close_connection:
        manejador.send_header("Connection", "close")
    cabeceras_seguridad(manejador)
    for galleta in galletas:
        manejador.send_header("Set-Cookie", galleta)
    manejador.end_headers()
    manejador.wfile.write(cuerpo)


def consumir_cuerpo(manejador):
    """Lee el cuerpo antes de atender la ruta.

    Si quedara sin leer, sus bytes se mezclarian con el siguiente pedido de la
    misma conexion. Lo que no se puede leer con seguridad cierra la conexion.
    """
    manejador.cuerpo = b""
    if manejador.headers.get("Transfer-Encoding"):
        manejador.close_connection = True
        raise ErrorHttp(400, "Pedido inválido.")
    try:
        longitud = int(manejador.headers.get("Content-Length", "0"))
    except ValueError:
        manejador.close_connection = True
        raise ErrorHttp(400, "Pedido inválido.")
    if longitud < 0 or longitud > TAMANO_MAXIMO:
        manejador.close_connection = True
        # Se descarta una parte para que el navegador pueda leer la respuesta.
        manejador.rfile.read(min(max(longitud, 0), 1024 * 1024))
        raise ErrorHttp(413, "Pedido inválido.")
    try:
        manejador.cuerpo = manejador.rfile.read(longitud)
    except TimeoutError:
        manejador.close_connection = True
        raise ErrorHttp(408, "Pedido inválido.")
    if len(manejador.cuerpo) != longitud:
        manejador.close_connection = True
        raise ErrorHttp(400, "Pedido inválido.")


def leer_json(manejador):
    if not manejador.cuerpo:
        raise ErrorHttp(400, "Pedido inválido.")
    if "application/json" not in manejador.headers.get("Content-Type", ""):
        raise ErrorHttp(415, "Pedido inválido.")
    try:
        datos = json.loads(manejador.cuerpo.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise ErrorHttp(400, "Pedido inválido.")
    if not isinstance(datos, dict):
        raise ErrorHttp(400, "Pedido inválido.")
    return datos


def comprobar_origen(manejador):
    """Toda escritura debe venir de este mismo sitio."""
    origen = manejador.headers.get("Origin")
    anfitrion = manejador.headers.get("Host", "")
    if origen is None or origen.split("://", 1)[-1] != anfitrion:
        raise ErrorHttp(403, "Pedido no permitido.")


def galleta_sesion(tipo, token):
    return (
        f"{_auth.COOKIE[tipo]}={token}; Path=/; HttpOnly; Secure; SameSite=Strict; "
        f"Max-Age={_auth.DURACION[tipo]}"
    )


def galleta_borrada(tipo):
    return f"{_auth.COOKIE[tipo]}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"


def _leer_galleta(manejador, tipo):
    crudo = manejador.headers.get("Cookie")
    if not crudo:
        return None
    try:
        tarro = cookies.SimpleCookie(crudo)
    except cookies.CookieError:
        return None
    galleta = tarro.get(_auth.COOKIE[tipo])
    return galleta.value if galleta else None


def sesion(manejador, tipo):
    """Devuelve la persona de la sesion, comprobada en la base en cada pedido."""
    datos = _auth.leer_token(tipo, _leer_galleta(manejador, tipo))
    if datos is None:
        return None
    with _db.transaccion() as cursor:
        if tipo == "socio":
            cursor.execute(
                "SELECT id, numero_socio, nombre, estado, sesion_version"
                " FROM socios WHERE id = %s", (datos["id"],))
        else:
            cursor.execute(
                "SELECT id, email, rol, activo, sesion_version FROM admins WHERE id = %s",
                (datos["id"],))
        persona = cursor.fetchone()
    if persona is None or persona["sesion_version"] != datos["v"]:
        return None
    if tipo == "admin" and not persona["activo"]:
        return None
    if tipo == "socio" and persona["estado"] == "baja":
        return None
    persona = dict(persona)
    persona["csrf"] = datos["c"]
    return persona


def exigir_sesion(manejador, tipo, roles=None, csrf=False):
    persona = sesion(manejador, tipo)
    if persona is None:
        raise ErrorHttp(401, "Tenés que iniciar sesión.")
    if roles is not None and persona["rol"] not in roles:
        raise ErrorHttp(403, "No tenés permiso para esta acción.")
    if csrf:
        comprobar_origen(manejador)
        recibido = manejador.headers.get("X-CSRF-Token", "")
        if not recibido or not hmac.compare_digest(recibido, persona["csrf"]):
            raise ErrorHttp(403, "Pedido no permitido.")
    return persona


def ip_cliente(manejador):
    """IP real de quien pide. Detras del intermediario, cuenta solo el ultimo valor,

    que es el que escribe el propio intermediario y el visitante no puede falsear.
    """
    if os.environ.get("PROXY_CONFIABLE") == "1":
        reenviada = manejador.headers.get("X-Forwarded-For", "").split(",")[-1].strip()
        if reenviada:
            return reenviada
    return manejador.client_address[0]


def ejecutar(manejador, funcion):
    """Convierte cualquier fallo en un error generico; el detalle va solo al registro."""
    try:
        consumir_cuerpo(manejador)
        funcion(manejador)
    except ErrorHttp as error:
        json_respuesta(manejador, error.estado, {"error": error.mensaje})
    except Exception:
        log.exception("Error interno")
        json_respuesta(manejador, 500, {"error": "Algo salió mal. Probá de nuevo más tarde."})
