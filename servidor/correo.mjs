// Envio de correo detras de un solo modulo. Los textos no describen la actividad.
import { appendFile, mkdir } from 'node:fs/promises';

export const PLANTILLAS = {
  solicitud_recibida: [
    'Recibimos tu solicitud',
    'Recibimos tu solicitud. Te vamos a avisar por este medio cuando esté revisada.',
  ],
  solicitud_aprobada: [
    'Tu solicitud fue aprobada',
    'Tu solicitud fue aprobada. Ya podés ingresar al portal.',
  ],
  recuperar_clave: [
    'Cambiá tu contraseña',
    'Pediste cambiar tu contraseña. Usá este enlace, que vence pronto y sirve una sola vez:',
  ],
};

// Solo en desarrollo se guarda en un archivo local. El prototipo publicado no envia correos.
export async function enviar(destinatario, plantilla, enlace = null) {
  if (process.env.CORREO_MODO !== 'archivo') return;
  const [asunto, base] = PLANTILLAS[plantilla];
  const texto = enlace ? `${base}\n\n${enlace}` : base;
  await mkdir('.dev/correos', { recursive: true });
  const linea = JSON.stringify({ fecha: Date.now() / 1000, para: destinatario, asunto, texto });
  await appendFile('.dev/correos/enviados.jsonl', `${linea}\n`);
}
