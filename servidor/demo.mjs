// Crea datos inventados para el prototipo. Se puede repetir sin duplicar nada.
import { hashearClave } from './seguridad.mjs';
import { transaccion } from './db.mjs';

export const EQUIPO = [
  ['comision.prueba@ejemplo.test', 'comision_directiva'],
  ['secretaria.prueba@ejemplo.test', 'secretaria'],
  ['tesoreria.prueba@ejemplo.test', 'tesoreria'],
  ['coordinador.prueba@ejemplo.test', 'coordinador_cultivo'],
  ['cultivador.prueba@ejemplo.test', 'cultivador'],
  ['dispensador.prueba@ejemplo.test', 'dispensador'],
];
const SOLICITUDES = [
  ['ana.prueba@ejemplo.test', 'Ana', 'Prueba', '1990-05-10', '99000001'],
  ['bruno.prueba@ejemplo.test', 'Bruno', 'Prueba', '1985-11-23', '99000002'],
];
const ACTIVO = ['diego.prueba@ejemplo.test', 'Diego', 'Prueba', '1988-07-02', '99000004'];
const TEXTO = 'Texto inventado para probar el portal.';

export const CUENTAS = [...EQUIPO.map(([correo]) => correo), ...SOLICITUDES.map(([correo]) => correo), ACTIVO[0]];

async function cultivoDemo(q) {
  const [{ total }] = await q('SELECT count(*) AS total FROM salas');
  if (total) return;
  const [{ id: coordinador }] = await q('SELECT id FROM admins WHERE email = $1', [EQUIPO[3][0]]);
  const [{ id: cultivador }] = await q('SELECT id FROM admins WHERE email = $1', [EQUIPO[4][0]]);
  const [{ id: sala }] = await q("INSERT INTO salas (nombre, tipo) VALUES ('Sala de prueba 1', 'cultivo') RETURNING id");
  await q("INSERT INTO salas (nombre, tipo) VALUES ('Secado de prueba', 'secado')");
  const [{ id: genetica }] = await q("INSERT INTO geneticas (nombre) VALUES ('Genética de prueba') RETURNING id");
  const [{ id: lote }] = await q(
    `INSERT INTO lotes (codigo, genetica_id, sala_id, origen, cantidad_plantas, etapa, creado_por)
     VALUES ('L-PRUEBA-001', $1, $2, 'esqueje', 12, 'vegetativo', $3) RETURNING id`, [genetica, sala, coordinador],
  );
  await q(
    `INSERT INTO registros_lote (lote_id, tipo, detalle, ph, ec, creado_por)
     VALUES ($1, 'riego', 'Riego de prueba', '6.20', '1.40', $2)`, [lote, cultivador],
  );
  await q(
    `INSERT INTO plantillas_tarea (etapa, titulo, dias) VALUES ('vegetativo', 'Revisar riego', 2),
     ('floracion', 'Cambiar fotoperiodo', 0), ('cosecha', 'Registrar peso húmedo', 0), ('secado', 'Controlar humedad', 3)`,
  );
  await q(
    "INSERT INTO tareas (titulo, lote_id, asignada_a, vence_en, creado_por) VALUES ('Revisar riego', $1, $2, current_date, $3)",
    [lote, cultivador, coordinador],
  );
  await q(
    "INSERT INTO insumos (nombre, categoria, unidad, stock, stock_minimo) VALUES ('Sustrato de prueba', 'Sustratos', 'litros', '40.00', '50.00')",
  );
  await q("INSERT INTO equipos (nombre, tipo, sala_id) VALUES ('Extractor de prueba', 'Ventilación', $1)", [sala]);
}

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
    await cultivoDemo(q);
    // Solo en el prototipo: asi se puede recorrer sin un telefono.
    await q("UPDATE configuracion SET valor = 'false' WHERE clave = 'dosfa_obligatorio'");
    await q("UPDATE configuracion SET valor = 'true' WHERE clave = 'modulo_cultivo_activo'");
    await q("UPDATE configuracion SET valor = '30' WHERE clave = 'plantas_autorizadas'");
  });
}

let revisada = false;

// En la version publicada de prueba, los datos inventados se cargan solos una vez.
export async function cargarDemoSiFalta() {
  if (revisada || process.env.ENTORNO !== 'pruebas' || !process.env.DEMO_CLAVE) return;
  const [{ falta }] = await transaccion((q) => q(
    'SELECT NOT EXISTS (SELECT 1 FROM admins) OR NOT EXISTS (SELECT 1 FROM salas) AS falta',
  ));
  if (falta) await prepararDemo(process.env.DEMO_CLAVE);
  revisada = true;
}
