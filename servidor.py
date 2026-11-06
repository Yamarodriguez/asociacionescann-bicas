"""Servidor del sistema: entrega las paginas y las rutas de la API."""
import logging
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from api import (
    _config, _http, admin_auditoria, admin_configuracion, admin_contactos, admin_cuotas,
    admin_publicaciones, admin_resumen, admin_seguridad, admin_socios, contacto, login, login_2fa,
    logout, migrate, publico, recuperar, sesion, socio_baja, socio_exportar, socio_portal, solicitud,
)

WEB = _config.RAIZ / "web"
EXTENSIONES = {".html", ".css", ".js", ".json", ".svg", ".ico", ".woff2", ".txt"}
TIPOS_BINARIOS = {".woff2": "font/woff2"}
# Las pantallas y rutas del modulo de reservas no existen mientras este apagado.
RUTAS = {
    ("GET", "/api/sesion"): sesion.get,
    ("GET", "/api/publico"): publico.get,
    ("GET", "/api/admin_socios"): admin_socios.get,
    ("POST", "/api/admin_socios"): admin_socios.post,
    ("GET", "/api/admin_socios_csv"): admin_socios.csv_socios,
    ("GET", "/api/admin_contactos"): admin_contactos.get,
    ("GET", "/api/admin_resumen"): admin_resumen.get,
    ("GET", "/api/admin_auditoria"): admin_auditoria.get,
    ("GET", "/api/admin_seguridad"): admin_seguridad.get,
    ("POST", "/api/admin_seguridad"): admin_seguridad.post,
    ("POST", "/api/login_2fa"): login_2fa.post,
    ("GET", "/api/admin_cuotas"): admin_cuotas.get,
    ("POST", "/api/admin_cuotas"): admin_cuotas.post,
    ("GET", "/api/admin_publicaciones"): admin_publicaciones.get,
    ("POST", "/api/admin_publicaciones"): admin_publicaciones.post,
    ("GET", "/api/admin_configuracion"): admin_configuracion.get,
    ("POST", "/api/admin_configuracion"): admin_configuracion.post,
    ("GET", "/api/socio_portal"): socio_portal.get,
    ("POST", "/api/socio_portal"): socio_portal.actualizar,
    ("GET", "/api/socio_exportar"): socio_exportar.get,
    ("POST", "/api/socio_baja"): socio_baja.post,
    ("POST", "/api/recuperar"): recuperar.pedir,
    ("POST", "/api/recuperar_cambiar"): recuperar.cambiar,
    ("POST", "/api/contacto"): contacto.post,
    ("POST", "/api/login"): login.post,
    ("POST", "/api/logout"): logout.post,
    ("POST", "/api/solicitud"): solicitud.post,
    ("POST", "/api/migrate"): migrate.post,
}


def _no_encontrado(manejador):
    _http.json_respuesta(manejador, 404, {"error": "No encontrado."})


class Manejador(BaseHTTPRequestHandler):
    server_version = "Asociacion"
    sys_version = ""
    protocol_version = "HTTP/1.1"
    # Un cliente que deja de enviar datos no retiene un hilo para siempre.
    timeout = 30

    def log_message(self, *argumentos):
        # Sin URL ni datos personales en los registros.
        return

    def _ruta(self):
        return self.path.split("?", 1)[0]

    def _api(self, metodo):
        funcion = RUTAS.get((metodo, self._ruta()), _no_encontrado)
        _http.ejecutar(self, funcion)

    def do_POST(self):
        self._api("POST")

    def do_GET(self):
        ruta = self._ruta()
        if ruta.startswith("/api/"):
            self._api("GET")
            return
        self._estatico("/index.html" if ruta == "/" else ruta)

    def _estatico(self, ruta):
        destino = (WEB / ruta.lstrip("/")).resolve()
        valido = (
            destino.is_relative_to(WEB)
            and destino.suffix in EXTENSIONES
            and destino.is_file()
        )
        if not valido:
            _http.json_respuesta(self, 404, {"error": "No encontrado."})
            return
        cuerpo = destino.read_bytes()
        tipo = TIPOS_BINARIOS.get(destino.suffix)
        if tipo is None:
            tipo = f"{mimetypes.guess_type(destino.name)[0] or 'text/plain'}; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(cuerpo)))
        # Las letras no cambian; se guardan un ano en el navegador.
        cache = "public, max-age=31536000, immutable" if destino.suffix == ".woff2" else "no-cache"
        self.send_header("Cache-Control", cache)
        _http.cabeceras_seguridad(self)
        self.end_headers()
        self.wfile.write(cuerpo)


def crear(puerto, anfitrion="127.0.0.1"):
    return ThreadingHTTPServer((anfitrion, puerto), Manejador)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    migrate.aplicar()
    puerto = int(os.environ.get("PUERTO", "8080"))
    print(f"SISTEMA LISTO en http://localhost:{puerto}", flush=True)
    crear(puerto).serve_forever()
