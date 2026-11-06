"""Borra de verdad los datos de quienes se dieron de baja y superaron la retencion.

Uso: python -m scripts.purgar_bajas [--seco]
Con --seco solo informa. Las cuotas quedan sin persona asociada.
"""
import sys

from herramientas import _db


def purgar(seco=False):
    with _db.transaccion() as cursor:
        dias = int(_db.configuracion(cursor, "retencion_baja_dias"))
        cursor.execute(
            "SELECT id FROM socios WHERE estado = 'baja'"
            " AND baja_en <= now() - make_interval(days => %s)", (dias,))
        ids = [fila["id"] for fila in cursor.fetchall()]
        if not seco:
            for socio_id in ids:
                cursor.execute("DELETE FROM socios WHERE id = %s", (socio_id,))
                _db.auditar(cursor, "datos_borrados", "socio", socio_id)
    return len(ids)


def main():
    seco = "--seco" in sys.argv
    total = purgar(seco)
    print(f"{'Se borrarían' if seco else 'Borrados'} los datos de {total} personas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
