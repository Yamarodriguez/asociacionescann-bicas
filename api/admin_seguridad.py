"""Activacion del doble factor de cada persona del equipo."""
import segno

from . import _cifrado, _db, _dosfa, _http


def get(manejador):
    admin = _http.exigir_sesion(manejador, "admin", permitir_sin_2fa=True)
    with _db.transaccion() as cursor:
        cursor.execute(
            "SELECT count(*) AS total FROM codigos_recuperacion WHERE admin_id = %s AND usado_en IS NULL",
            (admin["id"],))
        restantes = cursor.fetchone()["total"]
    _http.json_respuesta(manejador, 200, {
        "activo": admin["totp_activado_en"] is not None,
        "obligatorio": admin["dosfa_obligatorio"],
        "codigos_restantes": restantes,
    })


def _iniciar(cursor, admin):
    secreto = _dosfa.generar_secreto()
    cursor.execute(
        "UPDATE admins SET totp_cifrado = %s WHERE id = %s",
        (_cifrado.cifrar_texto(secreto, "TOTP_CLAVE"), admin["id"]))
    uri = _dosfa.uri_aplicacion(secreto, admin["email"])
    return {"secreto": secreto, "qr": segno.make(uri, error="m").svg_data_uri(scale=5, border=2)}


def _confirmar(cursor, admin, datos):
    cursor.execute("SELECT totp_cifrado FROM admins WHERE id = %s FOR UPDATE", (admin["id"],))
    cifrado = cursor.fetchone()["totp_cifrado"]
    if cifrado is None:
        raise _http.ErrorHttp(409, "Primero generá el código QR.")
    secreto = _cifrado.descifrar_texto(cifrado, "TOTP_CLAVE")
    paso = _dosfa.verificar(secreto, datos.get("codigo"))
    if paso is None:
        raise _http.ErrorHttp(422, "El código no es correcto.")
    codigos = _dosfa.generar_codigos_recuperacion()
    cursor.execute("DELETE FROM codigos_recuperacion WHERE admin_id = %s", (admin["id"],))
    for valor in codigos:
        cursor.execute(
            "INSERT INTO codigos_recuperacion (admin_id, codigo_hash) VALUES (%s, %s)",
            (admin["id"], _dosfa.hash_codigo(valor)))
    cursor.execute(
        "UPDATE admins SET totp_activado_en = now(), totp_ultimo_paso = %s WHERE id = %s",
        (paso, admin["id"]))
    _db.auditar(cursor, "dosfa_activado", "admin", admin["id"], admin_id=admin["id"])
    return {"codigos": codigos}


def post(manejador):
    admin = _http.exigir_sesion(manejador, "admin", csrf=True, permitir_sin_2fa=True)
    if admin["totp_activado_en"] is not None:
        raise _http.ErrorHttp(409, "El doble factor ya está activado.")
    datos = _http.leer_json(manejador)
    with _db.transaccion() as cursor:
        if datos.get("accion") == "iniciar":
            respuesta = _iniciar(cursor, admin)
        elif datos.get("accion") == "confirmar":
            respuesta = _confirmar(cursor, admin, datos)
        else:
            raise _http.ErrorHttp(422, "Pedido inválido.")
    _http.json_respuesta(manejador, 200, respuesta)
