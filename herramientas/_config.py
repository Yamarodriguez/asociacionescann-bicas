"""Lee la configuracion del entorno. Los secretos nunca se escriben en el codigo."""
import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def cargar_env():
    ruta = RAIZ / ".env"
    if not ruta.exists():
        return
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        if "=" in linea and not linea.lstrip().startswith("#"):
            clave, valor = linea.split("=", 1)
            os.environ.setdefault(clave.strip(), valor.strip())


cargar_env()


def req(nombre):
    valor = os.environ.get(nombre)
    if not valor:
        raise RuntimeError(f"Falta la variable de entorno {nombre}")
    return valor


def es_produccion():
    return os.environ.get("ENTORNO") == "produccion"
