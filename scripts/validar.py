"""Revisa pantallas, palabras prohibidas y secretos. Sale con error si encuentra algo."""
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
WEB = RAIZ / "web"
PROHIBIDAS = re.compile(r"\b(clientes?|compras?|ventas?|tiendas?|carritos?)\b", re.IGNORECASE)
RASTREO = re.compile(r"adsbygoogle|googletagmanager|google-analytics|facebook\.net|fbq\(|gtag\(", re.IGNORECASE)
CORREO_PROHIBIDAS = re.compile(r"cannabis|gramos?\b|variedad|cogollo|flores", re.IGNORECASE)
SECRETO = re.compile(r"postgresql://[^:\s]+:[^@\s<{]+@|BEGIN (RSA |EC )?PRIVATE KEY")
DIRECTORIOS_TEXTO = ("api", "web", "scripts", "migraciones", "pruebas")
ESTE_ARCHIVO = Path(__file__).resolve()


class Pantalla(HTMLParser):
    def __init__(self):
        super().__init__()
        self.lang = self.title = self.viewport = self.noindex = False
        self.ids = set()
        self.para = set()
        self.problemas = []

    def handle_starttag(self, etiqueta, atributos):
        datos = dict(atributos)
        if etiqueta == "html":
            self.lang = bool(datos.get("lang"))
        if etiqueta == "title":
            self.title = True
        if etiqueta == "meta" and datos.get("name") == "viewport":
            self.viewport = True
        if etiqueta == "meta" and datos.get("name") == "robots" and "noindex" in datos.get("content", ""):
            self.noindex = True
        if etiqueta in ("input", "select", "textarea"):
            self.ids.add(datos.get("id"))
        if etiqueta == "label":
            self.para.add(datos.get("for"))
        if etiqueta == "script" and not str(datos.get("src", "")).startswith("/"):
            self.problemas.append("script incrustado o externo")
        for nombre, valor in atributos:
            if nombre.startswith("on"):
                self.problemas.append(f"evento en linea {nombre}")
            if nombre == "style":
                self.problemas.append("estilo en linea")
            if nombre in ("src", "href") and str(valor).startswith(("http://", "https://", "//")):
                self.problemas.append(f"recurso externo {valor}")


def revisar_pantallas():
    fallos = []
    for ruta in sorted(WEB.glob("*.html")):
        pantalla = Pantalla()
        pantalla.feed(ruta.read_text(encoding="utf-8"))
        for correcto, texto in (
            (pantalla.lang, "falta lang"), (pantalla.title, "falta title"),
            (pantalla.viewport, "falta viewport"), (pantalla.noindex, "falta noindex"),
        ):
            if not correcto:
                fallos.append(f"{ruta.name}: {texto}")
        for campo in pantalla.ids - pantalla.para:
            fallos.append(f"{ruta.name}: el campo {campo} no tiene label")
        fallos.extend(f"{ruta.name}: {problema}" for problema in pantalla.problemas)
    return fallos


def revisar_palabras():
    fallos = []
    for ruta in sorted(WEB.iterdir()):
        if ruta.suffix not in (".html", ".js", ".json"):
            continue
        texto = ruta.read_text(encoding="utf-8")
        for patron, motivo in ((PROHIBIDAS, "palabra prohibida"), (RASTREO, "rastreo")):
            for coincidencia in patron.finditer(texto):
                fallos.append(f"{ruta.name}: {motivo}: {coincidencia.group()}")
    correo = (RAIZ / "api" / "_email.py").read_text(encoding="utf-8")
    plantillas = correo.split("PLANTILLAS = {", 1)[1].split("\n}\n", 1)[0]
    for coincidencia in CORREO_PROHIBIDAS.finditer(plantillas):
        fallos.append(f"_email.py: palabra prohibida en correos: {coincidencia.group()}")
    return fallos


def revisar_secretos():
    fallos = []
    seguidos = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=RAIZ, capture_output=True, text=True, check=True,
    ).stdout.split("\n")
    for nombre in seguidos:
        if nombre == ".env" or nombre.endswith(".pdf"):
            fallos.append(f"{nombre}: no debe ir a Git")
    for directorio in DIRECTORIOS_TEXTO:
        for ruta in (RAIZ / directorio).rglob("*"):
            if ruta.suffix not in (".py", ".mjs", ".js", ".html", ".sql", ".json") or ruta == ESTE_ARCHIVO:
                continue
            texto = ruta.read_text(encoding="utf-8")
            if SECRETO.search(texto):
                fallos.append(f"{ruta.name}: parece contener un secreto")
            if "Access-Control-Allow-Origin" in texto and ruta.suffix != ".py":
                fallos.append(f"{ruta.name}: cabecera de origen abierto")
    for ruta in (RAIZ / "api").glob("*.py"):
        if "Access-Control-Allow-Origin" in ruta.read_text(encoding="utf-8"):
            fallos.append(f"{ruta.name}: cabecera de origen abierto")
    return fallos


def main():
    fallos = revisar_pantallas() + revisar_palabras() + revisar_secretos()
    for fallo in fallos:
        print("FALLO:", fallo)
    print(f"{len(fallos)} fallos en el validador")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
