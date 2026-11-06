// Respuestas, lectura del cuerpo, cookies, permisos y errores.
import { transaccion } from './db.mjs';
import { COOKIE, DURACION, compararSeguro, leerToken } from './seguridad.mjs';

export const TAMANO_MAXIMO = 64 * 1024;

export const CABECERAS_SEGURIDAD = {
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

export class ErrorHttp extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
    this.mensaje = mensaje;
  }
}

function respuesta(cuerpo, estado, cabeceras, galletas = []) {
  const salida = new Headers({ ...CABECERAS_SEGURIDAD, 'Cache-Control': 'no-store', ...cabeceras });
  for (const galleta of galletas) salida.append('Set-Cookie', galleta);
  return new Response(cuerpo, { status: estado, headers: salida });
}

export const json = (estado, datos, galletas = []) => respuesta(
  JSON.stringify(datos), estado, { 'Content-Type': 'application/json; charset=utf-8' }, galletas,
);

export const archivo = (contenido, tipo, nombre) => respuesta(
  contenido, 200, { 'Content-Type': tipo, 'Content-Disposition': `attachment; filename="${nombre}"` },
);

export const galletaSesion = (tipo, token) => (
  `${COOKIE[tipo]}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DURACION[tipo]}`
);

export const galletaBorrada = (tipo) => `${COOKIE[tipo]}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function leerGalleta(c, tipo) {
  const crudo = c.request.headers.get('cookie');
  if (!crudo) return null;
  for (const parte of crudo.split(';')) {
    const [nombre, ...valor] = parte.trim().split('=');
    if (nombre === COOKIE[tipo]) return valor.join('=');
  }
  return null;
}

export function leerJson(c) {
  if (!c.cuerpo) throw new ErrorHttp(400, 'Pedido inválido.');
  if (!(c.request.headers.get('content-type') ?? '').includes('application/json')) {
    throw new ErrorHttp(415, 'Pedido inválido.');
  }
  let datos;
  try {
    datos = JSON.parse(c.cuerpo);
  } catch {
    throw new ErrorHttp(400, 'Pedido inválido.');
  }
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new ErrorHttp(400, 'Pedido inválido.');
  }
  return datos;
}

// Toda escritura debe venir de este mismo sitio.
export function comprobarOrigen(c) {
  const origen = c.request.headers.get('origin');
  if (!origen || origen.split('://').at(-1) !== c.url.host) {
    throw new ErrorHttp(403, 'Pedido no permitido.');
  }
}

// Devuelve la persona de la sesion, comprobada en la base en cada pedido.
export async function sesion(c, tipo) {
  const datos = leerToken(tipo, leerGalleta(c, tipo));
  if (!datos) return null;
  const persona = await transaccion(async (q) => {
    const filas = tipo === 'socio'
      ? await q('SELECT id, numero_socio, nombre, estado, sesion_version FROM socios WHERE id = $1', [datos.id])
      : await q(
        `SELECT id, email, rol, activo, sesion_version, totp_activado_en,
         (SELECT valor = 'true' FROM configuracion WHERE clave = 'dosfa_obligatorio') AS dosfa_obligatorio
         FROM admins WHERE id = $1`, [datos.id],
      );
    return filas[0];
  });
  if (!persona || persona.sesion_version !== datos.v) return null;
  if (tipo === 'admin' && !persona.activo) return null;
  if (tipo === 'socio' && persona.estado === 'baja') return null;
  return { ...persona, csrf: datos.c };
}

export const faltaDosfa = (persona) => persona.dosfa_obligatorio && persona.totp_activado_en === null;

export async function exigirSesion(c, tipo, { roles = null, csrf = false, permitirSin2fa = false } = {}) {
  const persona = await sesion(c, tipo);
  if (!persona) throw new ErrorHttp(401, 'Tenés que iniciar sesión.');
  if (tipo === 'admin' && !permitirSin2fa && faltaDosfa(persona)) {
    throw new ErrorHttp(403, 'Tenés que activar el doble factor.');
  }
  if (roles && !roles.includes(persona.rol)) throw new ErrorHttp(403, 'No tenés permiso para esta acción.');
  if (csrf) {
    comprobarOrigen(c);
    const recibido = c.request.headers.get('x-csrf-token') ?? '';
    if (!recibido || !compararSeguro(recibido, persona.csrf)) throw new ErrorHttp(403, 'Pedido no permitido.');
  }
  return persona;
}
