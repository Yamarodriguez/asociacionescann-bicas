"""Crea datos inventados para el prototipo. Con --seco solo muestra lo que haria.

Las contrasenas se guardan en .dev/credenciales_prueba.txt, fuera de Git.
Se niega a ejecutarse en produccion.
"""
import secrets
import sys

from api import _auth, _config, _db

ARCHIVO = _config.RAIZ / ".dev" / "credenciales_prueba.txt"
EQUIPO = (
    ("comision.prueba@ejemplo.test", "comision_directiva"),
    ("secretaria.prueba@ejemplo.test", "secretaria"),
    ("dispensador.prueba@ejemplo.test", "dispensador"),
)
SOLICITUDES = (
    ("ana.prueba@ejemplo.test", "Ana", "Prueba", "1990-05-10", "99000001"),
    ("bruno.prueba@ejemplo.test", "Bruno", "Prueba", "1985-11-23", "99000002"),
)


def main():
    seco = "--seco" in sys.argv
    if _config.es_produccion():
        print("Los datos de prueba no se pueden crear en produccion.")
        return 1
    cuentas = [correo for correo, _ in EQUIPO] + [fila[0] for fila in SOLICITUDES]
    if seco:
        print("Se crearian estas cuentas inventadas:", ", ".join(cuentas))
        return 0
    if ARCHIVO.exists():
        print("Los datos de prueba ya existen.")
        return 0

    clave = secrets.token_urlsafe(12)
    clave_hash = _auth.hashear_clave(clave)
    with _db.transaccion() as cursor:
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
    ARCHIVO.parent.mkdir(parents=True, exist_ok=True)
    lineas = ["Cuentas inventadas del prototipo. Todas usan la misma contraseña:", clave, ""]
    ARCHIVO.write_text("\n".join(lineas + cuentas) + "\n", encoding="utf-8")
    print("Datos de prueba creados. Las cuentas están en .dev/credenciales_prueba.txt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
