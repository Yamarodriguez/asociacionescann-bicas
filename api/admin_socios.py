"""Solicitudes, socios, suspensiones y bajas, para comision directiva y secretaria."""
import csv
import io

from . import _db, _email, _http

ROLES = {"comision_directiva", "secretaria"}
COLUMNAS_CSV = (
    "numero_socio", "nombre", "apellido", "tipo_documento", "numero_documento", "email", "telefono",
    "estado", "alta_en", "baja_en", "cuota_vigente_hasta",
)


def get(manejador):
    _http.exigir_sesion(manejador, "admin", ROLES)
    with _db.transaccion() as cursor:
        cursor.execute(
            "SELECT id, numero_socio, nombre, apellido, tipo_documento, numero_documento, email,"
            " telefono, estado, avalista_numero_socio, cuota_vigente_hasta, baja_solicitada_en,"
            " creado_en FROM socios"
            " ORDER BY estado <> 'pendiente', baja_solicitada_en IS NULL, creado_en DESC LIMIT 1000"
        )
        filas = cursor.fetchall()
    _http.json_respuesta(manejador, 200, {"socios": filas})


def _celda_segura(valor):
    """Evita que una hoja de calculo ejecute un texto como formula."""
    texto = "" if valor is None else str(valor)
    return f"'{texto}" if texto[:1] in ("=", "+", "-", "@", "\t", "\r") else texto


def csv_socios(manejador):
    admin = _http.exigir_sesion(manejador, "admin", ROLES)
    with _db.transaccion() as cursor:
        cursor.execute(
            "SELECT numero_socio, nombre, apellido, tipo_documento, numero_documento, email, telefono,"
            " estado, alta_en, baja_en, cuota_vigente_hasta FROM socios ORDER BY numero_socio NULLS LAST")
        filas = cursor.fetchall()
        _db.auditar(cursor, "socios_exportados", "socio", admin_id=admin["id"])
    salida = io.StringIO()
    escritor = csv.writer(salida, delimiter=";")
    escritor.writerow(COLUMNAS_CSV)
    for fila in filas:
        escritor.writerow([_celda_segura(fila[columna]) for columna in COLUMNAS_CSV])
    contenido = ("﻿" + salida.getvalue()).encode("utf-8")
    _http.archivo_respuesta(manejador, contenido, "text/csv; charset=utf-8", "socios.csv")


def _aprobar(cursor, admin, socio_id, socio, datos):
    if datos.get("identidad_verificada") is not True:
        raise _http.ErrorHttp(422, "Primero hay que verificar la identidad en persona.")
    if socio["estado"] != "pendiente":
        raise _http.ErrorHttp(409, "Esta solicitud ya no está pendiente.")
    cursor.execute(
        "UPDATE socios SET estado = 'activo', numero_socio = nextval('numero_socio_seq'),"
        " alta_en = now(), identidad_verificada_en = now(), identidad_verificada_por = %s"
        " WHERE id = %s RETURNING numero_socio",
        (admin["id"], socio_id),
    )
    numero = cursor.fetchone()["numero_socio"]
    _db.auditar(cursor, "solicitud_aprobada", "socio", socio_id, admin_id=admin["id"])
    return {"numero_socio": numero}


def _rechazar(cursor, admin, socio_id, socio, _datos):
    if socio["estado"] != "pendiente":
        raise _http.ErrorHttp(409, "Esta solicitud ya no está pendiente.")
    # Una solicitud rechazada no tiene motivo para conservarse.
    cursor.execute("DELETE FROM socios WHERE id = %s", (socio_id,))
    _db.auditar(cursor, "solicitud_rechazada", "socio", socio_id, admin_id=admin["id"])
    return {"mensaje": "Solicitud rechazada y datos eliminados."}


def _suspender(cursor, admin, socio_id, socio, _datos):
    if socio["estado"] != "activo":
        raise _http.ErrorHttp(409, "Solo se puede suspender a un socio activo.")
    cursor.execute("UPDATE socios SET estado = 'suspendido' WHERE id = %s", (socio_id,))
    _db.auditar(cursor, "socio_suspendido", "socio", socio_id, admin_id=admin["id"])
    return {"mensaje": "Socio suspendido."}


def _reactivar(cursor, admin, socio_id, socio, _datos):
    if socio["estado"] != "suspendido":
        raise _http.ErrorHttp(409, "Solo se puede reactivar a un socio suspendido.")
    cursor.execute("UPDATE socios SET estado = 'activo' WHERE id = %s", (socio_id,))
    _db.auditar(cursor, "socio_reactivado", "socio", socio_id, admin_id=admin["id"])
    return {"mensaje": "Socio reactivado."}


def _dar_baja(cursor, admin, socio_id, socio, _datos):
    if socio["estado"] not in ("activo", "suspendido"):
        raise _http.ErrorHttp(409, "Este socio no se puede dar de baja.")
    cursor.execute(
        "UPDATE socios SET estado = 'baja', baja_en = now(), carne_token = NULL,"
        " sesion_version = sesion_version + 1 WHERE id = %s", (socio_id,))
    _db.auditar(cursor, "socio_baja", "socio", socio_id, admin_id=admin["id"])
    return {"mensaje": "Baja registrada."}


ACCIONES = {
    "aprobar": _aprobar, "rechazar": _rechazar, "suspender": _suspender,
    "reactivar": _reactivar, "baja": _dar_baja,
}


def post(manejador):
    admin = _http.exigir_sesion(manejador, "admin", ROLES, csrf=True)
    datos = _http.leer_json(manejador)
    socio_id = datos.get("socio_id")
    accion = ACCIONES.get(datos.get("accion", "aprobar"))
    if accion is None or not isinstance(socio_id, int) or isinstance(socio_id, bool):
        raise _http.ErrorHttp(422, "Pedido inválido.")
    with _db.transaccion() as cursor:
        cursor.execute("SELECT estado, email FROM socios WHERE id = %s FOR UPDATE", (socio_id,))
        socio = cursor.fetchone()
        if socio is None:
            raise _http.ErrorHttp(409, "Esta solicitud ya no está pendiente.")
        respuesta = accion(cursor, admin, socio_id, socio, datos)
    if accion is _aprobar:
        _email.enviar(socio["email"], "solicitud_aprobada")
    _http.json_respuesta(manejador, 200, respuesta)
