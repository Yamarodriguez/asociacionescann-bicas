"""Quita el doble factor de una persona que perdio su telefono y sus codigos.

Uso: python -m scripts.reiniciar_2fa correo [--seco]
Requiere acceso al servidor y deja rastro en la auditoria.
"""
import sys

from herramientas import _db


def main():
    argumentos = [a for a in sys.argv[1:] if a != "--seco"]
    seco = "--seco" in sys.argv
    if len(argumentos) != 1:
        print("Uso: python -m scripts.reiniciar_2fa correo [--seco]")
        return 2
    with _db.transaccion() as cursor:
        cursor.execute("SELECT id FROM admins WHERE email = %s", (argumentos[0].strip().lower(),))
        fila = cursor.fetchone()
        if fila is None:
            print("No existe esa cuenta.")
            return 1
        if seco:
            print("Se quitaría el doble factor de esa cuenta.")
            return 0
        cursor.execute("DELETE FROM codigos_recuperacion WHERE admin_id = %s", (fila["id"],))
        cursor.execute(
            "UPDATE admins SET totp_cifrado = NULL, totp_activado_en = NULL, totp_ultimo_paso = NULL,"
            " sesion_version = sesion_version + 1 WHERE id = %s", (fila["id"],))
        _db.auditar(cursor, "dosfa_reiniciado", "admin", fila["id"])
    print("Doble factor quitado. La persona debe activarlo otra vez.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
