"""Aplica las migraciones en la base local. En Netlify se aplican solas al publicar."""
import sys

from . import _config, _db


def aplicar():
    aplicadas = []
    with _db.transaccion() as cursor:
        # Evita que dos ejecuciones simultaneas apliquen lo mismo.
        cursor.execute("SELECT pg_advisory_xact_lock(735201)")
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS migraciones_aplicadas ("
            " nombre text PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())"
        )
        cursor.execute("SELECT nombre FROM migraciones_aplicadas")
        hechas = {fila["nombre"] for fila in cursor.fetchall()}
        for ruta in sorted((_config.RAIZ / "netlify" / "database" / "migrations").glob("*.sql")):
            if ruta.name not in hechas:
                cursor.execute(ruta.read_text(encoding="utf-8"))
                cursor.execute("INSERT INTO migraciones_aplicadas (nombre) VALUES (%s)", (ruta.name,))
                aplicadas.append(ruta.name)
    return aplicadas


if __name__ == "__main__":
    print("Aplicadas:", aplicar() or "ninguna")
    sys.exit(0)
