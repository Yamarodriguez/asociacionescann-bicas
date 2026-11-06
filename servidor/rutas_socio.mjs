// Portal del socio. Cada consulta usa el id de la sesion, nunca uno recibido.
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { auditar, configuracion, transaccion } from './db.mjs';
import { ErrorHttp, archivo, exigirSesion, json, leerJson } from './http.mjs';
import { verificarClave } from './seguridad.mjs';

const CUOTAS = `SELECT to_char(periodo, 'YYYY-MM') AS periodo, importe, pagado_en, metodo FROM cuotas WHERE socio_id = $1`;

export const dataUriQr = async (texto) => {
  const svg = await QRCode.toString(texto, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

async function exigirActivo(c, csrf = false) {
  const socio = await exigirSesion(c, 'socio', { csrf });
  if (socio.estado !== 'activo') throw new ErrorHttp(403, 'Tu cuenta todavía no tiene acceso a esta sección.');
  return socio;
}

// El QR lleva un codigo al azar, sin ningun dato personal.
async function tokenCarne(q, socioId) {
  const [{ carne_token: actual }] = await q('SELECT carne_token FROM socios WHERE id = $1', [socioId]);
  if (actual) return actual;
  const token = randomBytes(24).toString('base64url');
  await q('UPDATE socios SET carne_token = $1 WHERE id = $2', [token, socioId]);
  return token;
}

export async function portal(c) {
  const socio = await exigirActivo(c);
  const datos = await transaccion(async (q) => {
    const [perfil] = await q(
      `SELECT numero_socio, nombre, apellido, email, telefono, alta_en, cuota_vigente_hasta, baja_solicitada_en
       FROM socios WHERE id = $1`, [socio.id],
    );
    const qr = (await configuracion(q, 'carne_qr_activo')) === 'true' ? await tokenCarne(q, socio.id) : null;
    return {
      perfil,
      token: qr,
      cuotas: await q(`${CUOTAS} ORDER BY periodo DESC`, [socio.id]),
      comunicados: await q('SELECT id, titulo, cuerpo, publicado_en FROM comunicados ORDER BY publicado_en DESC LIMIT 50'),
      documentos: await q('SELECT id, titulo, contenido, publicado_en FROM documentos ORDER BY publicado_en DESC LIMIT 50'),
      asambleas: await q('SELECT id, titulo, fecha, lugar, orden_dia FROM asambleas ORDER BY fecha DESC LIMIT 50'),
      actas: await q('SELECT id, titulo, contenido, publicado_en FROM actas ORDER BY publicado_en DESC LIMIT 50'),
    };
  });
  const { token, ...resto } = datos;
  return json(200, { ...resto, qr: token ? await dataUriQr(token) : null });
}

// El socio solo puede cambiar su telefono: el resto se verifica en persona.
export async function actualizar(c) {
  const socio = await exigirActivo(c, true);
  const telefono = leerJson(c).telefono || null;
  if (telefono !== null && (typeof telefono !== 'string' || telefono.length > 30)) {
    throw new ErrorHttp(422, 'Revisá el teléfono.');
  }
  await transaccion(async (q) => {
    await q('UPDATE socios SET telefono = $1 WHERE id = $2', [telefono, socio.id]);
    await auditar(q, 'telefono_actualizado', 'socio', { entidadId: socio.id, socioId: socio.id });
  });
  return json(200, { mensaje: 'Guardamos tu teléfono.' });
}

export async function exportar(c) {
  const socio = await exigirSesion(c, 'socio');
  const datos = await transaccion(async (q) => {
    const [fila] = await q(
      `SELECT numero_socio, email, nombre, apellido, fecha_nacimiento, tipo_documento, numero_documento, telefono,
       estado, avalista_numero_socio, identidad_verificada_en, alta_en, baja_en, baja_solicitada_en,
       cuota_vigente_hasta, consentimiento_en, estatutos_aceptados_en, creado_en FROM socios WHERE id = $1`,
      [socio.id],
    );
    fila.cuotas = await q(`${CUOTAS} ORDER BY periodo`, [socio.id]);
    await auditar(q, 'datos_exportados', 'socio', { entidadId: socio.id, socioId: socio.id });
    return fila;
  });
  return archivo(JSON.stringify(datos, null, 2), 'application/json; charset=utf-8', 'mis-datos.json');
}

export async function pedirBaja(c) {
  const socio = await exigirSesion(c, 'socio', { csrf: true });
  const { clave } = leerJson(c);
  if (typeof clave !== 'string') throw new ErrorHttp(422, 'Escribí tu contraseña.');
  const [{ clave_hash: guardada }] = await transaccion((q) => q('SELECT clave_hash FROM socios WHERE id = $1', [socio.id]));
  if (!(await verificarClave(clave, guardada))) throw new ErrorHttp(403, 'La contraseña no es correcta.');
  await transaccion(async (q) => {
    await q('UPDATE socios SET baja_solicitada_en = now() WHERE id = $1 AND baja_solicitada_en IS NULL', [socio.id]);
    await auditar(q, 'baja_solicitada', 'socio', { entidadId: socio.id, socioId: socio.id });
  });
  return json(200, { mensaje: 'Recibimos tu pedido de baja.' });
}
