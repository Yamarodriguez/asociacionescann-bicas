"""Crea la primera cuenta del equipo. Pide la contrasena sin mostrarla.

Uso: python -m scripts.crear_admin correo rol [--seco]
"""
import getpass
import sys

from api import _auth, _db

ROLES = {
    "comision_directiva", "secretaria", "tesoreria", "director_medico",
    "coordinador_cultivo", "cultivador", "dispensador",
}


def main():
    argumentos = [a for a in sys.argv[1:] if a != "--seco"]
    seco = "--seco" in sys.argv
    if len(argumentos) != 2 or argumentos[1] not in ROLES:
        print("Uso: python -m scripts.crear_admin correo rol [--seco]")
        print("Roles:", ", ".join(sorted(ROLES)))
        return 2
    correo, rol = argumentos[0].strip().lower(), argumentos[1]
    if seco:
        print(f"Se crearía una cuenta con el rol {rol}.")
        return 0
    clave = getpass.getpass("Contraseña (mínimo 10 caracteres): ")
    if len(clave) < _auth.LONGITUD_MINIMA_CLAVE:
        print("La contraseña es demasiado corta.")
        return 1
    with _db.transaccion() as cursor:
        cursor.execute(
            "INSERT INTO admins (email, clave_hash, rol) VALUES (%s, %s, %s) RETURNING id",
            (correo, _auth.hashear_clave(clave), rol))
        _db.auditar(cursor, "admin_creado", "admin", cursor.fetchone()["id"])
    print("Cuenta creada.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
