"""Aplica las migraciones pendientes. Por red exige MIGRATE_SECRET."""
import hmac
import sys

from . import _config, _db, _http


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
        for ruta in sorted((_config.RAIZ / "migraciones").glob("*.sql")):
            if ruta.name not in hechas:
                cursor.execute(ruta.read_text(encoding="utf-8"))
                cursor.execute("INSERT INTO migraciones_aplicadas (nombre) VALUES (%s)", (ruta.name,))
                aplicadas.append(ruta.name)
    return aplicadas


def post(manejador):
    _http.comprobar_origen(manejador)
    recibido = manejador.headers.get("X-Migrate-Secret", "")
    if not hmac.compare_digest(recibido, _config.req("MIGRATE_SECRET")):
        raise _http.ErrorHttp(403, "No permitido.")
    _http.json_respuesta(manejador, 200, {"aplicadas": aplicar()})


if __name__ == "__main__":
    print("Aplicadas:", aplicar() or "ninguna")
    sys.exit(0)
