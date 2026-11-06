"""Crea datos inventados para el prototipo. Con --seco solo muestra lo que haria.

Las contrasenas se guardan en .dev/credenciales_prueba.txt, fuera de Git.
Se niega a ejecutarse en produccion. Se puede repetir sin duplicar nada.
"""
import datetime as dt
import secrets
import sys

from api import _auth, _config, _db

ARCHIVO = _config.RAIZ / ".dev" / "credenciales_prueba.txt"
EQUIPO = (
    ("comision.prueba@ejemplo.test", "comision_directiva"),
    ("secretaria.prueba@ejemplo.test", "secretaria"),
    ("tesoreria.prueba@ejemplo.test", "tesoreria"),
    ("dispensador.prueba@ejemplo.test", "dispensador"),
)
SOLICITUDES = (
    ("ana.prueba@ejemplo.test", "Ana", "Prueba", "1990-05-10", "99000001"),
    ("bruno.prueba@ejemplo.test", "Bruno", "Prueba", "1985-11-23", "99000002"),
)
SOCIO_ACTIVO = ("diego.prueba@ejemplo.test", "Diego", "Prueba", "1988-07-02", "99000004")


def _clave_comun(cursor):
    cursor.execute("SELECT clave_hash FROM admins WHERE email = %s", (EQUIPO[0][0],))
    fila = cursor.fetchone()
    return fila["clave_hash"] if fila else None


def _equipo_y_solicitudes(cursor, clave_hash):
    for correo, rol in EQUIPO:
        cursor.execute(
            "INSERT INTO admins (email, clave_hash, rol) VALUES (%s, %s, %s)"
            " ON CONFLICT (email) DO NOTHING", (correo, clave_hash, rol))
    for correo, nombre, apellido, nacimiento, documento in SOLICITUDES:
        cursor.execute(
            "INSERT INTO socios (email, clave_hash, nombre, apellido, fecha_nacimiento,"
            " tipo_documento, numero_documento, consentimiento_en, estatutos_aceptados_en)"
            " VALUES (%s, %s, %s, %s, %s, 'DNI', %s, now(), now())"
            " ON CONFLICT (email) DO NOTHING",
            (correo, clave_hash, nombre, apellido, nacimiento, documento))


def _socio_activo(cursor, clave_hash, secretaria):
    correo, nombre, apellido, nacimiento, documento = SOCIO_ACTIVO
    cursor.execute(
        "INSERT INTO socios (email, clave_hash, nombre, apellido, fecha_nacimiento, tipo_documento,"
        " numero_documento, consentimiento_en, estatutos_aceptados_en, estado, numero_socio, alta_en,"
        " identidad_verificada_en, identidad_verificada_por)"
        " VALUES (%s, %s, %s, %s, %s, 'DNI', %s, now(), now(), 'activo',"
        " nextval('numero_socio_seq'), now(), now(), %s)"
        " ON CONFLICT (email) DO NOTHING RETURNING id",
        (correo, clave_hash, nombre, apellido, nacimiento, documento, secretaria))
    fila = cursor.fetchone()
    if fila:
        hoy = dt.date.today()
        cursor.execute(
            "INSERT INTO cuotas (socio_id, periodo, importe, pagado_en, metodo, registrado_por)"
            " VALUES (%s, %s, '1000.00', %s, 'transferencia', %s)",
            (fila["id"], hoy.replace(day=1), hoy, secretaria))
        cursor.execute(
            "UPDATE socios SET cuota_vigente_hasta = (date_trunc('month', current_date)"
            " + interval '1 month' - interval '1 day')::date WHERE id = %s", (fila["id"],))


def _publicaciones(cursor, autor):
    cursor.execute("SELECT count(*) AS total FROM comunicados")
    if cursor.fetchone()["total"]:
        return
    texto = "Texto inventado para probar el portal."
    cursor.execute(
        "INSERT INTO comunicados (titulo, cuerpo, autor_id) VALUES ('Comunicado de prueba', %s, %s)",
        (texto, autor))
    cursor.execute(
        "INSERT INTO documentos (titulo, contenido, autor_id) VALUES ('Documento de prueba', %s, %s)",
        (texto, autor))
    cursor.execute(
        "INSERT INTO asambleas (titulo, fecha, lugar, orden_dia, autor_id) VALUES"
        " ('Asamblea de prueba', now() + interval '30 days', 'Lugar inventado', %s, %s)",
        (texto, autor))
    cursor.execute(
        "INSERT INTO actas (titulo, contenido, autor_id) VALUES ('Acta de prueba', %s, %s)",
        (texto, autor))


def main():
    seco = "--seco" in sys.argv
    if _config.es_produccion():
        print("Los datos de prueba no se pueden crear en produccion.")
        return 1
    cuentas = [c for c, _ in EQUIPO] + [f[0] for f in SOLICITUDES] + [SOCIO_ACTIVO[0]]
    if seco:
        print("Se crearian estas cuentas inventadas:", ", ".join(cuentas))
        return 0
    with _db.transaccion() as cursor:
        clave_hash = _clave_comun(cursor)
        clave = None
        if clave_hash is None:
            clave = secrets.token_urlsafe(12)
            clave_hash = _auth.hashear_clave(clave)
        _equipo_y_solicitudes(cursor, clave_hash)
        cursor.execute("SELECT id FROM admins WHERE email = %s", (EQUIPO[1][0],))
        secretaria = cursor.fetchone()["id"]
        _socio_activo(cursor, clave_hash, secretaria)
        _publicaciones(cursor, secretaria)
        # Solo fuera de produccion: asi el prototipo se puede recorrer sin un telefono.
        cursor.execute("UPDATE configuracion SET valor = 'false' WHERE clave = 'dosfa_obligatorio'")
    ARCHIVO.parent.mkdir(parents=True, exist_ok=True)
    if clave is not None:
        lineas = ["Cuentas inventadas del prototipo. Todas usan la misma contraseña:", clave, ""]
        ARCHIVO.write_text("\n".join(lineas + cuentas) + "\n", encoding="utf-8")
    elif ARCHIVO.exists():
        existente = ARCHIVO.read_text(encoding="utf-8").splitlines()
        ARCHIVO.write_text("\n".join(existente[:3] + cuentas) + "\n", encoding="utf-8")
    print("Datos de prueba listos. Las cuentas están en .dev/credenciales_prueba.txt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
