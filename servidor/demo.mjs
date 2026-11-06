// Crea datos inventados para el prototipo. Se puede repetir sin duplicar nada.
import { compararSeguro, hashearClave, req } from './seguridad.mjs';
import { ErrorHttp, json } from './http.mjs';
import { transaccion } from './db.mjs';

export const EQUIPO = [
  ['comision.prueba@ejemplo.test', 'comision_directiva'],
  ['secretaria.prueba@ejemplo.test', 'secretaria'],
  ['tesoreria.prueba@ejemplo.test', 'tesoreria'],
  ['dispensador.prueba@ejemplo.test', 'dispensador'],
];
const SOLICITUDES = [
  ['ana.prueba@ejemplo.test', 'Ana', 'Prueba', '1990-05-10', '99000001'],
  ['bruno.prueba@ejemplo.test', 'Bruno', 'Prueba', '1985-11-23', '99000002'],
];
const ACTIVO = ['diego.prueba@ejemplo.test', 'Diego', 'Prueba', '1988-07-02', '99000004'];
const TEXTO = 'Texto inventado para probar el portal.';

export const CUENTAS = [...EQUIPO.map(([correo]) => correo), ...SOLICITUDES.map(([correo]) => correo), ACTIVO[0]];

export async function prepararDemo(clave) {
  const hash = await hashearClave(clave);
  await transaccion(async (q) => {
    for (const [correo, rol] of EQUIPO) {
      await q('INSERT INTO admins (email, clave_hash, rol) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING', [correo, hash, rol]);
    }
    for (const [correo, nombre, apellido, nacimiento, documento] of SOLICITUDES) {
      await q(
        `INSERT INTO socios (email, clave_hash, nombre, apellido, fecha_nacimiento, tipo_documento, numero_documento,
         consentimiento_en, estatutos_aceptados_en) VALUES ($1, $2, $3, $4, $5, 'DNI', $6, now(), now())
         ON CONFLICT (email) DO NOTHING`, [correo, hash, nombre, apellido, nacimiento, documento],
      );
    }
    const [{ id: secretaria }] = await q('SELECT id FROM admins WHERE email = $1', [EQUIPO[1][0]]);
    const [correo, nombre, apellido, nacimiento, documento] = ACTIVO;
    const nuevos = await q(
      `INSERT INTO socios (email, clave_hash, nombre, apellido, fecha_nacimiento, tipo_documento, numero_documento,
       consentimiento_en, estatutos_aceptados_en, estado, numero_socio, alta_en, identidad_verificada_en,
       identidad_verificada_por) VALUES ($1, $2, $3, $4, $5, 'DNI', $6, now(), now(), 'activo',
       nextval('numero_socio_seq'), now(), now(), $7) ON CONFLICT (email) DO NOTHING RETURNING id`,
      [correo, hash, nombre, apellido, nacimiento, documento, secretaria],
    );
    if (nuevos.length) {
      await q(
        `INSERT INTO cuotas (socio_id, periodo, importe, pagado_en, metodo, registrado_por)
         VALUES ($1, date_trunc('month', current_date)::date, '1000.00', current_date, 'transferencia', $2)`,
        [nuevos[0].id, secretaria],
      );
      await q(
        `UPDATE socios SET cuota_vigente_hasta = (date_trunc('month', current_date)
         + interval '1 month' - interval '1 day')::date WHERE id = $1`, [nuevos[0].id],
      );
    }
    const [{ total }] = await q('SELECT count(*) AS total FROM comunicados');
    if (!total) {
      await q("INSERT INTO comunicados (titulo, cuerpo, autor_id) VALUES ('Comunicado de prueba', $1, $2)", [TEXTO, secretaria]);
      await q("INSERT INTO documentos (titulo, contenido, autor_id) VALUES ('Documento de prueba', $1, $2)", [TEXTO, secretaria]);
      await q(
        `INSERT INTO asambleas (titulo, fecha, lugar, orden_dia, autor_id)
         VALUES ('Asamblea de prueba', now() + interval '30 days', 'Lugar inventado', $1, $2)`, [TEXTO, secretaria],
      );
      await q("INSERT INTO actas (titulo, contenido, autor_id) VALUES ('Acta de prueba', $1, $2)", [TEXTO, secretaria]);
    }
    // Solo en el prototipo: asi se puede recorrer sin un telefono.
    await q("UPDATE configuracion SET valor = 'false' WHERE clave = 'dosfa_obligatorio'");
  });
}

// Ruta protegida para cargar los datos inventados en la version publicada.
export async function rutaDemo(c) {
  const recibido = c.request.headers.get('x-demo-secreto') ?? '';
  const secreto = process.env.DEMO_SECRETO;
  if (process.env.ENTORNO === 'produccion' || !secreto || !recibido || !compararSeguro(recibido, secreto)) {
    throw new ErrorHttp(403, 'No permitido.');
  }
  await prepararDemo(req('DEMO_CLAVE'));
  return json(200, { cuentas: CUENTAS });
}
