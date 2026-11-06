"""Envio de correo detras de un solo modulo. Los textos no describen la actividad."""
import json
import os
import logging
import smtplib
import ssl
import threading
import time
from email.message import EmailMessage
from html import escape

from . import _config

PLANTILLAS = {
    "solicitud_recibida": (
        "Recibimos tu solicitud",
        "Recibimos tu solicitud. Te vamos a avisar por este medio cuando esté revisada.",
    ),
    "solicitud_aprobada": (
        "Tu solicitud fue aprobada",
        "Tu solicitud fue aprobada. Ya podés ingresar al portal.",
    ),
    "recuperar_clave": (
        "Cambiá tu contraseña",
        "Pediste cambiar tu contraseña. Usá este enlace, que vence pronto y sirve una sola vez:",
    ),
}


def enviar(destinatario, plantilla, enlace=None):
    asunto, texto = PLANTILLAS[plantilla]
    if enlace:
        texto = f"{texto}\n\n{enlace}"
    if os.environ.get("CORREO_MODO", "archivo") == "archivo":
        _guardar_en_archivo(destinatario, asunto, texto)
        return
    # En segundo plano: el tiempo de respuesta no revela si la cuenta existe.
    threading.Thread(
        target=_enviar_seguro, args=(destinatario, asunto, texto), name="correo", daemon=True,
    ).start()


def _enviar_seguro(destinatario, asunto, texto):
    try:
        _enviar_smtp(destinatario, asunto, texto)
    except Exception as error:
        logging.getLogger("asociacion").error("Fallo de correo %s", type(error).__name__)


def _enviar_smtp(destinatario, asunto, texto):
    mensaje = EmailMessage()
    mensaje["Subject"] = asunto
    mensaje["From"] = _config.req("SMTP_REMITENTE")
    mensaje["To"] = destinatario
    mensaje.set_content(texto)
    mensaje.add_alternative(f"<p>{escape(texto)}</p>", subtype="html")
    with smtplib.SMTP(_config.req("SMTP_HOST"), int(_config.req("SMTP_PUERTO")), timeout=15) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        smtp.login(_config.req("SMTP_USUARIO"), _config.req("SMTP_CLAVE"))
        smtp.send_message(mensaje)


def _guardar_en_archivo(destinatario, asunto, texto):
    carpeta = _config.RAIZ / ".dev" / "correos"
    carpeta.mkdir(parents=True, exist_ok=True)
    with (carpeta / "enviados.jsonl").open("a", encoding="utf-8") as archivo:
        archivo.write(json.dumps(
            {"fecha": time.time(), "para": destinatario, "asunto": asunto, "texto": texto},
            ensure_ascii=False) + "\n")
