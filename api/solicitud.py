"""Solicitud de alta: crea un registro pendiente, nunca un socio activo."""
import datetime as dt
import re

import psycopg2

from . import _auth, _db, _email, _http

CORREO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
DOCUMENTOS = {"DNI", "Pasaporte", "Otro"}
RESPUESTA = {"mensaje": "Recibimos tu solicitud. Vas a ver su estado al ingresar."}


def _texto(datos, clave, maximo=120):
    valor = datos.get(clave)
    if not isinstance(valor, str) or not valor.strip() or len(valor) > maximo:
        raise _http.ErrorHttp(422, "Revisá los datos del formulario.")
    return valor.strip()


def _edad(nacimiento, hoy):
    return hoy.year - nacimiento.year - ((hoy.month, hoy.day) < (nacimiento.month, nacimiento.day))


def post(manejador):
    _http.comprobar_origen(manejador)
    datos = _http.leer_json(manejador)
    email = _texto(datos, "email", 254).lower()
    clave = datos.get("clave")
    if not CORREO.match(email):
        raise _http.ErrorHttp(422, "Revisá el correo electrónico.")
    if not isinstance(clave, str) or not _auth.LONGITUD_MINIMA_CLAVE <= len(clave) <= 200:
        raise _http.ErrorHttp(422, "La contraseña debe tener al menos 10 caracteres.")
    if datos.get("consentimiento") is not True or datos.get("estatutos") is not True:
        raise _http.ErrorHttp(422, "Tenés que aceptar la privacidad y los estatutos.")
    tipo = _texto(datos, "tipo_documento", 20)
    if tipo not in DOCUMENTOS:
        raise _http.ErrorHttp(422, "Revisá el tipo de documento.")
    try:
        nacimiento = dt.date.fromisoformat(_texto(datos, "fecha_nacimiento", 10))
    except ValueError:
        raise _http.ErrorHttp(422, "Revisá la fecha de nacimiento.")
    telefono = datos.get("telefono") or None
    if telefono is not None and (not isinstance(telefono, str) or len(telefono) > 30):
        raise _http.ErrorHttp(422, "Revisá el teléfono.")
    nombre = _texto(datos, "nombre")
    apellido = _texto(datos, "apellido")
    numero = _texto(datos, "numero_documento", 30)
    clave_hash = _auth.hashear_clave(clave)

    creado = False
    with _db.transaccion() as cursor:
        minima = int(_db.configuracion(cursor, "edad_minima"))
        if _edad(nacimiento, dt.date.today()) < minima:
            raise _http.ErrorHttp(422, f"Tenés que tener al menos {minima} años para solicitar el alta.")
        try:
            cursor.execute("SAVEPOINT alta")
            cursor.execute(
                "INSERT INTO socios (email, clave_hash, nombre, apellido, fecha_nacimiento,"
                " tipo_documento, numero_documento, telefono, consentimiento_en,"
                " estatutos_aceptados_en) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,now(),now())"
                " RETURNING id",
                (email, clave_hash, nombre, apellido, nacimiento, tipo, numero, telefono),
            )
            socio_id = cursor.fetchone()["id"]
            _db.auditar(cursor, "solicitud_creada", "socio", socio_id, socio_id=socio_id)
            creado = True
        except psycopg2.errors.UniqueViolation:
            # La respuesta es la misma: no revela si la cuenta ya existe.
            cursor.execute("ROLLBACK TO SAVEPOINT alta")
    if creado:
        _email.enviar(email, "solicitud_recibida")
    _http.json_respuesta(manejador, 202, RESPUESTA)
