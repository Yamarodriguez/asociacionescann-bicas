"""Formulario de contacto de la web publica."""
import re

from . import _auth, _db, _http

CORREO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
RESPUESTA = {"mensaje": "Recibimos tu mensaje. Te vamos a responder por correo electrónico."}


def _texto(datos, clave, maximo):
    valor = datos.get(clave)
    if not isinstance(valor, str) or not valor.strip() or len(valor) > maximo:
        raise _http.ErrorHttp(422, "Revisá los datos del formulario.")
    return valor.strip()


def post(manejador):
    _http.comprobar_origen(manejador)
    datos = _http.leer_json(manejador)
    # Campo oculto: una persona no lo ve; un programa automatico suele rellenarlo.
    if datos.get("sitio_web"):
        _http.json_respuesta(manejador, 202, RESPUESTA)
        return
    nombre = _texto(datos, "nombre", 120)
    email = _texto(datos, "email", 254).lower()
    mensaje = _texto(datos, "mensaje", 2000)
    if not CORREO.match(email):
        raise _http.ErrorHttp(422, "Revisá el correo electrónico.")
    if datos.get("consentimiento") is not True:
        raise _http.ErrorHttp(422, "Tenés que aceptar la política de privacidad.")
    huella = _auth.huella(_http.ip_cliente(manejador))

    with _db.transaccion() as cursor:
        maximo = int(_db.configuracion(cursor, "contacto_max_por_ip"))
        ventana = int(_db.configuracion(cursor, "contacto_ventana_minutos"))
        retencion = int(_db.configuracion(cursor, "contacto_retencion_dias"))
        cursor.execute(
            "DELETE FROM contactos WHERE creado_en < now() - make_interval(days => %s)", (retencion,))
        cursor.execute(
            "SELECT count(*) AS total FROM contactos"
            " WHERE huella_ip = %s AND creado_en > now() - make_interval(mins => %s)",
            (huella, ventana),
        )
        if cursor.fetchone()["total"] >= maximo:
            raise _http.ErrorHttp(429, "Enviaste demasiados mensajes. Probá de nuevo más tarde.")
        cursor.execute(
            "INSERT INTO contactos (nombre, email, mensaje, huella_ip, consentimiento_en)"
            " VALUES (%s, %s, %s, %s, now())",
            (nombre, email, mensaje, huella),
        )
    _http.json_respuesta(manejador, 202, RESPUESTA)
