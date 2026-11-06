// Contrasenas, sesiones firmadas, cifrado y doble factor.
import {
  createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const derivar = promisify(scrypt);
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const SAL_FALSA = Buffer.alloc(16);

export const LONGITUD_MINIMA_CLAVE = 10;
export const DURACION = { socio: 7 * 24 * 3600, admin: 12 * 3600, pre: 300 };
export const COOKIE = { socio: 'sesion_socio', admin: 'sesion_admin', pre: 'sesion_pre' };
const SECRETO = { socio: 'SESION_SECRETO_SOCIOS', admin: 'SESION_SECRETO_ADMINS', pre: 'SESION_SECRETO_ADMINS' };

export function req(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta una variable de entorno: ${nombre}`);
  return valor;
}

function iguales(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export { iguales as compararSeguro };

export async function hashearClave(clave) {
  const sal = randomBytes(16);
  const derivada = await derivar(clave, sal, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${sal.toString('hex')}$${derivada.toString('hex')}`;
}

// Sin hash guardado se calcula igual, para no revelar si la cuenta existe.
export async function verificarClave(clave, guardada) {
  if (guardada === null || guardada === undefined) {
    await derivar(clave, SAL_FALSA, 32, SCRYPT);
    return false;
  }
  const partes = guardada.split('$');
  if (partes.length !== 6) return false;
  const [, n, r, p, sal, derivada] = partes;
  const calculada = await derivar(clave, Buffer.from(sal, 'hex'), derivada.length / 2, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
  });
  return iguales(calculada.toString('hex'), derivada);
}

const b64 = (datos) => Buffer.from(datos).toString('base64url');
const firma = (tipo, cuerpo) => createHmac('sha256', req(SECRETO[tipo])).update(cuerpo).digest();

export function crearToken(tipo, usuarioId, version) {
  const datos = {
    t: tipo, id: usuarioId, v: version,
    exp: Math.floor(Date.now() / 1000) + DURACION[tipo],
    c: randomBytes(16).toString('base64url'),
  };
  const cuerpo = b64(JSON.stringify(datos));
  return `${cuerpo}.${b64(firma(tipo, cuerpo))}`;
}

// Devuelve los datos si la firma y la caducidad son validas; si no, null.
export function leerToken(tipo, token) {
  if (typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [cuerpo, recibida] = partes;
  if (!iguales(Buffer.from(recibida, 'base64url'), firma(tipo, cuerpo))) return null;
  let datos;
  try {
    datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (datos.t !== tipo || !(datos.exp >= Date.now() / 1000)) return null;
  return datos;
}

export const huella = (valor) => createHmac('sha256', req('HUELLAS_SECRETO')).update(valor).digest('hex');

export const hashToken = (valor) => createHash('sha256').update(valor).digest('hex');

function claveCifrado(nombre) {
  const clave = Buffer.from(req(nombre), 'hex');
  if (clave.length !== 32) throw new Error('Clave de cifrado invalida');
  return clave;
}

export function cifrarTexto(texto, nombreClave) {
  const nonce = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', claveCifrado(nombreClave), nonce);
  const datos = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  return Buffer.concat([nonce, datos, cifrador.getAuthTag()]).toString('base64');
}

export function descifrarTexto(texto, nombreClave) {
  const datos = Buffer.from(texto, 'base64');
  const descifrador = createDecipheriv('aes-256-gcm', claveCifrado(nombreClave), datos.subarray(0, 12));
  descifrador.setAuthTag(datos.subarray(-16));
  return Buffer.concat([descifrador.update(datos.subarray(12, -16)), descifrador.final()]).toString('utf8');
}

// Doble factor TOTP (RFC 6238).
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIODO = 30;
const TOLERANCIA = 1;
const EMISOR = 'Portal';

export function generarSecretoTotp() {
  let bits = '';
  for (const byte of randomBytes(20)) bits += byte.toString(2).padStart(8, '0');
  return bits.match(/.{5}/g).map((grupo) => BASE32[parseInt(grupo, 2)]).join('');
}

function base32(secreto) {
  let bits = '';
  for (const letra of secreto) bits += BASE32.indexOf(letra).toString(2).padStart(5, '0');
  const bytes = bits.match(/.{8}/g).map((grupo) => parseInt(grupo, 2));
  return Buffer.from(bytes);
}

export function codigoTotp(secreto, paso) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const resumen = createHmac('sha1', base32(secreto)).update(contador).digest();
  const desplazamiento = resumen[resumen.length - 1] & 0x0f;
  const valor = resumen.readUInt32BE(desplazamiento) & 0x7fffffff;
  return String(valor % 1000000).padStart(6, '0');
}

// Devuelve el paso valido, o null. Un paso ya usado no vale: evita repetir un codigo.
export function verificarTotp(secreto, recibido, ultimoPaso = null) {
  if (typeof recibido !== 'string' || !/^\d{6}$/.test(recibido)) return null;
  const actual = Math.floor(Date.now() / 1000 / PERIODO);
  for (let paso = actual - TOLERANCIA; paso <= actual + TOLERANCIA; paso += 1) {
    if (ultimoPaso !== null && paso <= ultimoPaso) continue;
    if (iguales(codigoTotp(secreto, paso), recibido)) return paso;
  }
  return null;
}

export const uriTotp = (secreto, cuenta) => (
  `otpauth://totp/${EMISOR}:${encodeURIComponent(cuenta)}?secret=${secreto}&issuer=${EMISOR}&digits=6&period=${PERIODO}`
);

export const generarCodigosRecuperacion = () => Array.from(
  { length: 8 },
  () => `${randomBytes(4).toString('hex')}-${randomBytes(4).toString('hex')}`,
);

export const hashCodigo = (valor) => hashToken(valor.trim().toLowerCase());
