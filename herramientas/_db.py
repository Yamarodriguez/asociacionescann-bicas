"""Conexion a PostgreSQL con pool. Todo el SQL va parametrizado."""
import os
import threading
from contextlib import contextmanager

import psycopg2.pool
from psycopg2.extras import RealDictCursor

from . import _config

_pool = None
_candado = threading.Lock()


def url_bd():
    return os.environ.get("DATABASE_URL_ACTIVA") or _config.req("DATABASE_URL")


def _obtener_pool():
    global _pool
    with _candado:
        if _pool is None:
            _pool = psycopg2.pool.ThreadedConnectionPool(1, 10, url_bd(), connect_timeout=5)
    return _pool


def cerrar_pool():
    global _pool
    with _candado:
        if _pool is not None:
            _pool.closeall()
            _pool = None


@contextmanager
def transaccion():
    """Abre una transaccion: confirma al terminar y deshace si hay error."""
    pool = _obtener_pool()
    conexion = pool.getconn()
    try:
        with conexion.cursor(cursor_factory=RealDictCursor) as cursor:
            yield cursor
        conexion.commit()
    except Exception:
        conexion.rollback()
        raise
    finally:
        pool.putconn(conexion)


def configuracion(cursor, clave):
    cursor.execute("SELECT valor FROM configuracion WHERE clave = %s", (clave,))
    fila = cursor.fetchone()
    if fila is None:
        raise RuntimeError(f"Falta la clave de configuracion {clave}")
    return fila["valor"]


def auditar(cursor, accion, entidad, entidad_id=None, admin_id=None, socio_id=None, detalle=None):
    cursor.execute(
        "INSERT INTO auditoria (admin_id, socio_id, accion, entidad, entidad_id, detalle)"
        " VALUES (%s, %s, %s, %s, %s, %s)",
        (admin_id, socio_id, accion, entidad, entidad_id, detalle),
    )
