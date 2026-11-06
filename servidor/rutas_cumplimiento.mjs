// Vencimientos, procedimientos con lectura confirmada, capacitaciones e informe de inspeccion.
import { auditar, configuracion, transaccion } from './db.mjs';
import { ErrorHttp, exigirSesion, json, leerJson } from './http.mjs';
import { esId, fecha, opcion, texto } from './validar.mjs';

const GESTIONA = ['comision_directiva', 'secretaria'];
const TIPOS = ['habilitacion', 'seguro', 'contrato', 'otro'];
const AVISO_DIAS = 60;

export async function contadoresCumplimiento(q, rol, adminId) {
  const [{ total: sinLeer }] = await q(
    `SELECT count(*) AS total FROM procedimiento_versiones v
     WHERE v.version = (SELECT max(version) FROM procedimiento_versiones WHERE procedimiento_id = v.procedimiento_id)
     AND NOT EXISTS (SELECT 1 FROM lecturas_procedimiento l WHERE l.version_id = v.id AND l.admin_id = $1)`, [adminId],
  );
  const salida = { procedimientos_sin_leer: sinLeer };
  if (GESTIONA.includes(rol)) {
    const [{ total }] = await q(
      `SELECT count(*) AS total FROM vencimientos WHERE resuelto_en IS NULL AND vence_en <= current_date + $1::int`,
      [AVISO_DIAS],
    );
    salida.vencimientos_proximos = total;
  }
  return salida;
}

export async function ver(c) {
  const admin = await exigirSesion(c, 'admin');
  const gestiona = GESTIONA.includes(admin.rol);
  const datos = await transaccion(async (q) => ({
    vencimientos: gestiona ? await q(
      `SELECT id, tipo, titulo, vence_en, notas, vence_en - current_date AS dias FROM vencimientos
       WHERE resuelto_en IS NULL ORDER BY vence_en LIMIT 300`,
    ) : [],
    procedimientos: await q(
      `SELECT p.id, p.titulo, v.id AS version_id, v.version, v.contenido, v.publicado_en,
       EXISTS (SELECT 1 FROM lecturas_procedimiento l WHERE l.version_id = v.id AND l.admin_id = $1) AS leido,
       (SELECT count(*) FROM lecturas_procedimiento l WHERE l.version_id = v.id) AS lecturas
       FROM procedimientos p JOIN procedimiento_versiones v ON v.procedimiento_id = p.id
       WHERE v.version = (SELECT max(version) FROM procedimiento_versiones WHERE procedimiento_id = p.id)
       ORDER BY p.titulo`, [admin.id],
    ),
    capacitaciones: await q(
      `SELECT c.id, c.titulo, c.fecha, c.dictada_por,
       (SELECT count(*) FROM capacitacion_asistentes a WHERE a.capacitacion_id = c.id) AS asistentes,
       EXISTS (SELECT 1 FROM capacitacion_asistentes a WHERE a.capacitacion_id = c.id AND a.admin_id = $1) AS asistio
       FROM capacitaciones c ORDER BY c.fecha DESC LIMIT 100`, [admin.id],
    ),
    equipo_total: (await q('SELECT count(*) AS total FROM admins WHERE activo'))[0].total,
  }));
  return json(200, { ...datos, gestiona });
}

const DE_GESTION = {
  async crear_vencimiento(q, admin, datos) {
    const [{ id }] = await q(
      'INSERT INTO vencimientos (tipo, titulo, vence_en, notas, creado_por) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [opcion(datos, 'tipo', TIPOS), texto(datos, 'titulo', 200), fecha(datos, 'vence_en'), texto(datos, 'notas', 500, false), admin.id],
    );
    await auditar(q, 'vencimiento_creado', 'vencimiento', { entidadId: id, adminId: admin.id });
    return { id };
  },
  async renovar(q, admin, datos) {
    if (!esId(datos.id)) throw new ErrorHttp(422, 'Pedido inválido.');
    const nueva = fecha(datos, 'vence_en');
    const [fila] = await q('SELECT vence_en::text AS anterior FROM vencimientos WHERE id = $1 FOR UPDATE', [datos.id]);
    if (!fila) throw new ErrorHttp(404, 'No encontrado.');
    await q('UPDATE vencimientos SET vence_en = $1 WHERE id = $2', [nueva, datos.id]);
    await auditar(q, 'vencimiento_renovado', 'vencimiento', { entidadId: datos.id, adminId: admin.id, detalle: fila.anterior });
    return { ok: true };
  },
  async resolver(q, admin, datos) {
    if (!esId(datos.id)) throw new ErrorHttp(422, 'Pedido inválido.');
    const filas = await q('UPDATE vencimientos SET resuelto_en = now() WHERE id = $1 AND resuelto_en IS NULL RETURNING id', [datos.id]);
    if (!filas.length) throw new ErrorHttp(404, 'No encontrado.');
    await auditar(q, 'vencimiento_resuelto', 'vencimiento', { entidadId: datos.id, adminId: admin.id });
    return { ok: true };
  },
  async publicar_procedimiento(q, admin, datos) {
    const titulo = texto(datos, 'titulo', 200);
    const contenido = texto(datos, 'contenido', 40000);
    await q(
      'INSERT INTO procedimientos (titulo, creado_por) VALUES ($1, $2) ON CONFLICT (titulo) DO NOTHING', [titulo, admin.id],
    );
    const [{ id }] = await q('SELECT id FROM procedimientos WHERE titulo = $1 FOR UPDATE', [titulo]);
    const [{ siguiente }] = await q(
      'SELECT coalesce(max(version), 0) + 1 AS siguiente FROM procedimiento_versiones WHERE procedimiento_id = $1', [id],
    );
    await q(
      'INSERT INTO procedimiento_versiones (procedimiento_id, version, contenido, publicado_por) VALUES ($1, $2, $3, $4)',
      [id, siguiente, contenido, admin.id],
    );
    await auditar(q, 'procedimiento_publicado', 'procedimiento', { entidadId: id, adminId: admin.id, detalle: `v${siguiente}` });
    return { id, version: siguiente };
  },
  async crear_capacitacion(q, admin, datos) {
    const [{ id }] = await q(
      'INSERT INTO capacitaciones (titulo, fecha, dictada_por, creado_por) VALUES ($1, $2, $3, $4) RETURNING id',
      [texto(datos, 'titulo', 200), fecha(datos, 'fecha'), texto(datos, 'dictada_por', 120), admin.id],
    );
    await auditar(q, 'capacitacion_creada', 'capacitacion', { entidadId: id, adminId: admin.id });
    return { id };
  },
};

const DE_CADA_UNO = {
  async confirmar_lectura(q, admin, datos) {
    if (!esId(datos.version_id)) throw new ErrorHttp(422, 'Pedido inválido.');
    const [version] = await q(
      `SELECT v.id FROM procedimiento_versiones v WHERE v.id = $1 AND v.version =
       (SELECT max(version) FROM procedimiento_versiones WHERE procedimiento_id = v.procedimiento_id)`, [datos.version_id],
    );
    if (!version) throw new ErrorHttp(409, 'Ya hay una versión más nueva de este procedimiento.');
    await q(
      'INSERT INTO lecturas_procedimiento (version_id, admin_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [datos.version_id, admin.id],
    );
    await auditar(q, 'procedimiento_leido', 'procedimiento', { entidadId: datos.version_id, adminId: admin.id });
    return { ok: true };
  },
  async confirmar_asistencia(q, admin, datos) {
    if (!esId(datos.capacitacion_id)) throw new ErrorHttp(422, 'Pedido inválido.');
    const [existe] = await q('SELECT id FROM capacitaciones WHERE id = $1', [datos.capacitacion_id]);
    if (!existe) throw new ErrorHttp(404, 'No encontrado.');
    await q(
      'INSERT INTO capacitacion_asistentes (capacitacion_id, admin_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [datos.capacitacion_id, admin.id],
    );
    await auditar(q, 'capacitacion_asistida', 'capacitacion', { entidadId: datos.capacitacion_id, adminId: admin.id });
    return { ok: true };
  },
};

export async function accion(c) {
  const admin = await exigirSesion(c, 'admin', { csrf: true });
  const datos = leerJson(c);
  const nombre = datos.accion ?? '';
  if (Object.hasOwn(DE_GESTION, nombre)) {
    if (!GESTIONA.includes(admin.rol)) throw new ErrorHttp(403, 'No tenés permiso para esta acción.');
    return json(200, await transaccion((q) => DE_GESTION[nombre](q, admin, datos)));
  }
  if (!Object.hasOwn(DE_CADA_UNO, nombre)) throw new ErrorHttp(422, 'Pedido inválido.');
  return json(200, await transaccion((q) => DE_CADA_UNO[nombre](q, admin, datos)));
}

// Solo cifras y datos de la actividad: ningun dato personal de socios.
export async function informe(c) {
  const admin = await exigirSesion(c, 'admin', { roles: GESTIONA });
  const datos = await transaccion(async (q) => {
    const cultivoActivo = (await configuracion(q, 'modulo_cultivo_activo')) === 'true';
    const salida = {
      generado_en: new Date().toISOString(),
      socios: (await q(
        `SELECT count(*) FILTER (WHERE estado = 'activo') AS activos, count(*) FILTER (WHERE estado = 'suspendido') AS suspendidos,
         count(*) FILTER (WHERE estado = 'pendiente') AS pendientes, count(*) FILTER (WHERE estado = 'baja') AS bajas FROM socios`,
      ))[0],
      vencimientos: await q(
        `SELECT tipo, titulo, vence_en, vence_en < current_date AS vencido FROM vencimientos
         WHERE resuelto_en IS NULL ORDER BY vence_en`,
      ),
      procedimientos: await q(
        `SELECT p.titulo, v.version, v.publicado_en,
         (SELECT count(*) FROM lecturas_procedimiento l WHERE l.version_id = v.id) AS lecturas
         FROM procedimientos p JOIN procedimiento_versiones v ON v.procedimiento_id = p.id
         WHERE v.version = (SELECT max(version) FROM procedimiento_versiones WHERE procedimiento_id = p.id)
         ORDER BY p.titulo`,
      ),
      capacitaciones: await q(
        `SELECT c.titulo, c.fecha, c.dictada_por,
         (SELECT count(*) FROM capacitacion_asistentes a WHERE a.capacitacion_id = c.id) AS asistentes
         FROM capacitaciones c ORDER BY c.fecha DESC LIMIT 100`,
      ),
      equipo_total: (await q('SELECT count(*) AS total FROM admins WHERE activo'))[0].total,
      auditoria: (await q(
        `SELECT count(*) AS total, count(*) FILTER (WHERE creado_en >= now() - interval '30 days') AS ultimos_30 FROM auditoria`,
      ))[0],
      cultivo: null,
    };
    if (cultivoActivo) {
      salida.cultivo = {
        plantas_autorizadas: Number(await configuracion(q, 'plantas_autorizadas')),
        plantas_floracion: (await q(
          "SELECT coalesce(sum(cantidad_plantas), 0)::int AS total FROM lotes WHERE etapa = 'floracion' AND estado = 'activo'",
        ))[0].total,
        lotes: await q(
          `SELECT l.codigo, g.nombre AS genetica, s.nombre AS sala, l.etapa, l.estado, l.cantidad_plantas,
           l.peso_humedo_g, l.peso_seco_g, (SELECT count(*) FROM analisis a WHERE a.lote_id = l.id) AS analisis
           FROM lotes l JOIN geneticas g ON g.id = l.genetica_id JOIN salas s ON s.id = l.sala_id
           ORDER BY l.creado_en DESC LIMIT 300`,
        ),
        destrucciones: await q(
          `SELECT l.codigo, r.detalle, r.testigos, r.creado_en FROM registros_lote r JOIN lotes l ON l.id = r.lote_id
           WHERE r.tipo = 'destruccion' ORDER BY r.creado_en DESC LIMIT 100`,
        ),
      };
    }
    await auditar(q, 'informe_inspeccion', 'informe', { adminId: admin.id });
    return salida;
  });
  return json(200, datos);
}
