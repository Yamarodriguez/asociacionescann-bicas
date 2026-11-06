"""Copias de seguridad cifradas de la base de datos, con restauracion comprobada.

  python -m scripts.copia crear CARPETA
  python -m scripts.copia restaurar ARCHIVO --destino URL [--seco] [--reemplazar]
  python -m scripts.copia probar

La clave esta en COPIA_CLAVE. Sin esa clave, una copia no se puede recuperar.
"""
import datetime as dt
import gzip
import io
import json
import os
import sys
import tarfile
import tempfile
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from psycopg2 import sql

from herramientas import _cifrado, _config, _db, migrate

CLAVE = "COPIA_CLAVE"
BASE_RESTAURACION = "asociacion_restauracion"


def _tablas(cursor):
    """Devuelve las tablas en un orden que respeta sus claves foraneas."""
    cursor.execute(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
    pendientes = {fila[0] for fila in cursor.fetchall()}
    cursor.execute(
        "SELECT c.conrelid::regclass::text, c.confrelid::regclass::text FROM pg_constraint c"
        " WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace")
    dependencias = {tabla: set() for tabla in pendientes}
    for tabla, referida in cursor.fetchall():
        if tabla != referida:
            dependencias[tabla].add(referida)
    orden = []
    while pendientes:
        listas = sorted(t for t in pendientes if not dependencias[t] & pendientes)
        if not listas:
            raise RuntimeError("Hay dependencias circulares entre tablas")
        orden.extend(listas)
        pendientes -= set(listas)
    return orden


def _secuencias(cursor):
    cursor.execute(
        "SELECT sequencename, last_value FROM pg_sequences WHERE schemaname = 'public'"
        " ORDER BY sequencename")
    return {nombre: valor for nombre, valor in cursor.fetchall()}


def _huellas(cursor):
    """Numero de filas y resumen del contenido de cada tabla."""
    resultado = {}
    for tabla in _tablas(cursor):
        identificador = sql.Identifier(tabla)
        cursor.execute(sql.SQL(
            "SELECT count(*), md5(coalesce(string_agg(t::text, E'\\n' ORDER BY t::text), ''))"
            " FROM {} t").format(identificador))
        total, resumen = cursor.fetchone()
        resultado[tabla] = {"filas": total, "resumen": resumen}
    return resultado


def crear_bytes(url):
    """Lee una foto coherente de toda la base y la devuelve cifrada."""
    conexion = psycopg2.connect(url, connect_timeout=5)
    conexion.set_session(isolation_level="REPEATABLE READ", readonly=True)
    memoria = io.BytesIO()
    try:
        with conexion.cursor() as cursor, tarfile.open(fileobj=memoria, mode="w") as archivo:
            tablas = _tablas(cursor)
            manifiesto = {
                "creada_en": dt.datetime.now(dt.timezone.utc).isoformat(),
                "tablas": tablas,
                "secuencias": _secuencias(cursor),
                "huellas": _huellas(cursor),
            }
            for tabla in tablas:
                salida = io.BytesIO()
                consulta = sql.SQL("COPY {} TO STDOUT WITH (FORMAT csv, HEADER true)").format(
                    sql.Identifier(tabla))
                cursor.copy_expert(consulta.as_string(cursor), salida)
                _agregar(archivo, f"{tabla}.csv", salida.getvalue())
            _agregar(archivo, "manifiesto.json", json.dumps(manifiesto, indent=1).encode())
    finally:
        conexion.rollback()
        conexion.close()
    return _cifrado.cifrar_bytes(gzip.compress(memoria.getvalue()), CLAVE)


def _agregar(archivo, nombre, datos):
    informacion = tarfile.TarInfo(nombre)
    informacion.size = len(datos)
    archivo.addfile(informacion, io.BytesIO(datos))


def leer(contenido):
    memoria = io.BytesIO(gzip.decompress(_cifrado.descifrar_bytes(contenido, CLAVE)))
    with tarfile.open(fileobj=memoria, mode="r") as archivo:
        partes = {m.name: archivo.extractfile(m).read() for m in archivo.getmembers()}
    return json.loads(partes.pop("manifiesto.json")), partes


def restaurar_bytes(contenido, url, seco=False, reemplazar=False):
    manifiesto, partes = leer(contenido)
    if seco:
        return manifiesto
    # Las migraciones crean la estructura; despues se cargan los datos de la copia.
    previa = os.environ.get("DATABASE_URL_ACTIVA")
    _db.cerrar_pool()
    os.environ["DATABASE_URL_ACTIVA"] = url
    try:
        migrate.aplicar()
    finally:
        _db.cerrar_pool()
        if previa is None:
            os.environ.pop("DATABASE_URL_ACTIVA", None)
        else:
            os.environ["DATABASE_URL_ACTIVA"] = previa
    conexion = psycopg2.connect(url, connect_timeout=5)
    try:
        with conexion.cursor() as cursor:
            cursor.execute("SELECT count(*) FROM socios")
            if cursor.fetchone()[0] and not reemplazar:
                raise RuntimeError("El destino ya tiene socios. Usá --reemplazar si es intencional.")
            for tabla in reversed(manifiesto["tablas"]):
                cursor.execute(sql.SQL("TRUNCATE {} CASCADE").format(sql.Identifier(tabla)))
            for tabla in manifiesto["tablas"]:
                consulta = sql.SQL("COPY {} FROM STDIN WITH (FORMAT csv, HEADER true)").format(
                    sql.Identifier(tabla))
                cursor.copy_expert(consulta.as_string(cursor), io.BytesIO(partes[f"{tabla}.csv"]))
            for nombre, valor in manifiesto["secuencias"].items():
                if valor is not None:
                    cursor.execute("SELECT setval(%s, %s)", (nombre, valor))
            comprobar(cursor, manifiesto)
        conexion.commit()
    finally:
        conexion.close()
    return manifiesto


def comprobar(cursor, manifiesto):
    obtenidas = _huellas(cursor)
    distintas = [
        tabla for tabla, huella in manifiesto["huellas"].items() if obtenidas.get(tabla) != huella
    ]
    if distintas:
        raise RuntimeError(f"La restauracion no coincide en: {', '.join(distintas)}")


def _base_vacia(url):
    partes = urlsplit(url)
    administracion = psycopg2.connect(url, connect_timeout=5)
    administracion.autocommit = True
    with administracion.cursor() as cursor:
        cursor.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
            sql.Identifier(BASE_RESTAURACION)))
        cursor.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(BASE_RESTAURACION)))
    administracion.close()
    return urlunsplit(partes._replace(path=f"/{BASE_RESTAURACION}"))


def probar():
    """Copia la base, la restaura en otra vacia y compara el contenido tabla por tabla."""
    origen = _db.url_bd()
    migrate.aplicar()
    _db.cerrar_pool()
    with tempfile.TemporaryDirectory() as carpeta:
        ruta = Path(carpeta) / "copia.bin"
        ruta.write_bytes(crear_bytes(origen))
        contenido = ruta.read_bytes()
    assert b"ejemplo.test" not in contenido, "La copia no esta cifrada"
    destino = _base_vacia(origen)
    manifiesto = restaurar_bytes(contenido, destino)
    conexion = psycopg2.connect(destino, connect_timeout=5)
    try:
        with conexion.cursor() as cursor:
            comprobar(cursor, manifiesto)
            secuencias = _secuencias(cursor)
    finally:
        conexion.close()
    if secuencias != manifiesto["secuencias"]:
        raise RuntimeError("Las secuencias no coinciden")
    filas = sum(h["filas"] for h in manifiesto["huellas"].values())
    print(f"Restauración correcta: {len(manifiesto['tablas'])} tablas y {filas} filas idénticas.")
    return manifiesto


def main():
    argumentos = sys.argv[1:]
    orden = argumentos[0] if argumentos else ""
    if orden == "crear" and len(argumentos) == 2:
        carpeta = Path(argumentos[1])
        carpeta.mkdir(parents=True, exist_ok=True)
        ruta = carpeta / f"copia-{dt.datetime.now():%Y%m%d-%H%M%S}.bin"
        ruta.write_bytes(crear_bytes(_db.url_bd()))
        ruta.chmod(0o600)
        print(f"Copia creada: {ruta.name}")
        return 0
    if orden == "restaurar" and len(argumentos) >= 2 and "--destino" in argumentos:
        destino = argumentos[argumentos.index("--destino") + 1]
        contenido = Path(argumentos[1]).read_bytes()
        seco = "--seco" in argumentos
        manifiesto = restaurar_bytes(contenido, destino, seco, "--reemplazar" in argumentos)
        filas = sum(h["filas"] for h in manifiesto["huellas"].values())
        print(f"{'Se restaurarían' if seco else 'Restauradas'} {filas} filas de {manifiesto['creada_en']}.")
        return 0
    if orden == "probar":
        probar()
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
