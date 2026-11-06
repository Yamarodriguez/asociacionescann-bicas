"""Valores editables desde el panel. El modulo de reservas no se activa desde aqui."""
from . import _db, _http

ROLES = {"comision_directiva"}
# Clave: tipo de valor y limites. Lo que no este aqui no se puede cambiar.
EDITABLES = {
    "edad_minima": ("entero", 18, 99),
    "aval_activo": ("interruptor", None, None),
    "carne_qr_activo": ("interruptor", None, None),
    "retencion_baja_dias": ("entero", 0, 3650),
    "contacto_retencion_dias": ("entero", 1, 365),
    "login_max_por_email": ("entero", 3, 20),
    "login_max_por_ip": ("entero", 5, 200),
    "login_ventana_minutos": ("entero", 5, 240),
}


def get(manejador):
    _http.exigir_sesion(manejador, "admin", ROLES)
    with _db.transaccion() as cursor:
        cursor.execute("SELECT clave, valor, descripcion FROM configuracion ORDER BY clave")
        filas = [dict(fila) for fila in cursor.fetchall()]
    for fila in filas:
        regla = EDITABLES.get(fila["clave"])
        fila["editable"] = regla is not None
        fila["tipo"] = regla[0] if regla else "solo_lectura"
    _http.json_respuesta(manejador, 200, {"configuracion": filas})


def _validar(clave, valor):
    regla = EDITABLES.get(clave)
    if regla is None:
        raise _http.ErrorHttp(403, "Este valor no se puede cambiar desde el panel.")
    tipo, minimo, maximo = regla
    if tipo == "interruptor":
        if valor not in ("true", "false"):
            raise _http.ErrorHttp(422, "Revisá el valor.")
        return valor
    if not isinstance(valor, str) or not valor.isdigit() or not minimo <= int(valor) <= maximo:
        raise _http.ErrorHttp(422, f"El valor debe estar entre {minimo} y {maximo}.")
    return str(int(valor))


def post(manejador):
    admin = _http.exigir_sesion(manejador, "admin", ROLES, csrf=True)
    datos = _http.leer_json(manejador)
    clave = datos.get("clave")
    valor = _validar(clave, datos.get("valor"))
    with _db.transaccion() as cursor:
        cursor.execute("UPDATE configuracion SET valor = %s WHERE clave = %s", (valor, clave))
        _db.auditar(cursor, "configuracion_cambiada", "configuracion", admin_id=admin["id"], detalle=clave)
    _http.json_respuesta(manejador, 200, {"mensaje": "Guardamos el cambio."})
