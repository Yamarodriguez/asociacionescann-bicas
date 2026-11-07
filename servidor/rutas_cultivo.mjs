// Cultivo, tareas e inventario. Con el modulo apagado no existen las rutas de cultivo;
// las tareas siguen, sin las de lotes, porque tambien las usa la administracion.
import { auditar, configuracion, transaccion } from './db.mjs';
import { ErrorHttp, exigirSesion, json, leerJson } from './http.mjs';
import { dataUriQr } from './rutas_socio.mjs';
import { entero, esId, fecha, fechaOpcional, numero, positivo, texto } from './validar.mjs';

const COORDINA = ['coordinador_cultivo'];
const REGISTRA = ['coordinador_cultivo', 'cultivador'];
const VE_CULTIVO = ['comision_directiva', 'coordinador_cultivo', 'cultivador', 'director_medico'];
const GESTIONA_TAREAS = ['comision_directiva', 'coordinador_cultivo'];
const VE_INVENTARIO = ['comision_directiva', 'coordinador_cultivo'];
const ETAPAS = ['origen', 'vegetativo', 'floracion', 'cosecha', 'secado', 'curado', 'envasado'];
const TIPOS_REGISTRO = ['riego', 'nutrientes', 'poda', 'aplicacion', 'incidencia', 'medicion', 'baja', 'destruccion'];
const TIPOS_SALA = ['cultivo', 'secado', 'curado'];
const ORIGENES = ['semilla', 'esqueje'];
const MOVIMIENTOS = ['ingreso', 'consumo', 'ajuste'];
const MAXIMO_PLANTAS = 500;
// Lo que ya dice el propio recuadro: un riego no obliga a escribir nada.
const DETALLE_POR_DEFECTO = { riego: 'Riego', nutrientes: 'Nutrientes', poda: 'Poda', medicion: 'Medición' };
const gramos = (valor) => String(Number(valor)).replace('.', ',');
const textoEtapa = (etapa) => `Pasó a ${etapa === 'floracion' ? 'floración' : etapa}`;

export async function moduloActivo() {
  return transaccion(async (q) => (await configuracion(q, 'modulo_cultivo_activo')) === 'true');
}

export async function exigirModulo() {
  if (!(await moduloActivo())) throw new ErrorHttp(404, 'No encontrado.');
}

async function resumenPlantas(q) {
  const autorizadas = Number(await configuracion(q, 'plantas_autorizadas'));
  const [{ florecidas }] = await q(
    `SELECT coalesce(sum(cantidad_plantas), 0)::int AS florecidas FROM lotes
     WHERE etapa = 'floracion' AND estado = 'activo'`,
  );
  return { autorizadas, florecidas, excede: autorizadas > 0 && florecidas > autorizadas };
}

// Código propuesto para el lote siguiente, por año. Quien coordina puede poner otro.
async function siguienteCodigo(q) {
  const [{ codigo }] = await q(
    `WITH anio AS (SELECT to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY') AS valor)
     SELECT 'L-' || a.valor || '-' || lpad(
       (coalesce(max(substring(l.codigo FROM '^L-[0-9]{4}-([0-9]{1,6})$')::int), 0) + 1)::text, 3, '0') AS codigo
     FROM anio a LEFT JOIN lotes l ON l.codigo LIKE 'L-' || a.valor || '-%' GROUP BY a.valor`,
  );
  return codigo;
}

// Sin tareas programadas en el servidor: lo que toca se crea al consultar.
async function generarTareasDebidas(q) {
  await q(
    `WITH debidas AS (
       SELECT id, titulo, proxima_en, asignada_a FROM tareas_recurrentes WHERE proxima_en <= current_date FOR UPDATE),
     movidas AS (
       UPDATE tareas_recurrentes r SET proxima_en = current_date + r.cada_dias FROM debidas d WHERE r.id = d.id)
     INSERT INTO tareas (titulo, vence_en, asignada_a, recurrente_id)
     SELECT titulo, proxima_en, asignada_a, id FROM debidas`,
  );
  await q(
    `INSERT INTO tareas (titulo, vence_en, equipo_id)
     SELECT 'Mantenimiento: ' || nombre, proximo_mantenimiento, id FROM equipos
     WHERE proximo_mantenimiento <= current_date
     ON CONFLICT (equipo_id) WHERE completada_en IS NULL DO NOTHING`,
  );
}

export async function contadorTareas(q, rol, adminId) {
  await generarTareasDebidas(q);
  const [{ total }] = await q(
    `SELECT count(*) AS total FROM tareas WHERE completada_en IS NULL AND vence_en <= current_date
     AND ($1::boolean OR asignada_a = $2 OR ($3::boolean AND asignada_a IS NULL))`,
    [GESTIONA_TAREAS.includes(rol), adminId, rol === 'cultivador'],
  );
  return total;
}

export async function contadoresCultivo(q, rol) {
  const salida = {};
  if (VE_CULTIVO.includes(rol)) {
    const [{ lotes }] = await q("SELECT count(*) AS lotes FROM lotes WHERE estado = 'activo'");
    salida.lotes_activos = lotes;
  }
  if (VE_INVENTARIO.includes(rol)) {
    const [{ total }] = await q('SELECT count(*) AS total FROM insumos WHERE stock <= stock_minimo');
    salida.stock_bajo = total;
  }
  return salida;
}

export async function verCultivo(c) {
  await exigirModulo();
  await exigirSesion(c, 'admin', { roles: VE_CULTIVO });
  const datos = await transaccion(async (q) => ({
    plantas: await resumenPlantas(q),
    siguiente_codigo: await siguienteCodigo(q),
    salas: await q('SELECT id, nombre, tipo FROM salas ORDER BY nombre'),
    geneticas: await q('SELECT id, nombre, notas FROM geneticas ORDER BY nombre'),
    lotes: await q(
      `SELECT l.id, l.codigo, l.etapa, l.estado, l.cantidad_plantas, l.origen, l.creado_en, l.cosecha_prevista, l.sala_id,
       g.nombre AS genetica, s.nombre AS sala,
       (SELECT max(r.creado_en) FROM registros_lote r WHERE r.lote_id = l.id) AS ultimo_registro,
       (SELECT count(*)::int FROM tareas t WHERE t.lote_id = l.id AND t.completada_en IS NULL) AS tareas_pendientes
       FROM lotes l JOIN geneticas g ON g.id = l.genetica_id JOIN salas s ON s.id = l.sala_id
       ORDER BY l.estado = 'activo' DESC, l.creado_en DESC LIMIT 300`,
    ),
    por_genetica: await q(
      `SELECT g.nombre, count(*) AS lotes, round(avg(l.peso_seco_g / p.total), 2) AS gramos_por_planta,
       round(avg(100 * (1 - l.peso_seco_g / l.peso_humedo_g)), 2) AS merma
       FROM lotes l JOIN geneticas g ON g.id = l.genetica_id
       JOIN (SELECT lote_id, count(*) AS total FROM plantas GROUP BY lote_id) p ON p.lote_id = l.id
       WHERE l.peso_seco_g IS NOT NULL GROUP BY g.nombre ORDER BY gramos_por_planta DESC`,
    ),
    por_sala: await q(
      `SELECT s.nombre, count(*) AS lotes, round(avg(l.peso_seco_g / p.total), 2) AS gramos_por_planta,
       round(avg(100 * (1 - l.peso_seco_g / l.peso_humedo_g)), 2) AS merma
       FROM lotes l JOIN salas s ON s.id = l.sala_inicial_id
       JOIN (SELECT lote_id, count(*) AS total FROM plantas GROUP BY lote_id) p ON p.lote_id = l.id
       WHERE l.peso_seco_g IS NOT NULL GROUP BY s.nombre ORDER BY gramos_por_planta DESC`,
    ),
  }));
  return json(200, datos);
}

export async function verLote(c) {
  await exigirModulo();
  const admin = await exigirSesion(c, 'admin', { roles: VE_CULTIVO });
  const id = Number(c.url.searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) throw new ErrorHttp(422, 'Pedido inválido.');
  const datos = await transaccion(async (q) => {
    const [lote] = await q(
      `SELECT l.*, g.nombre AS genetica, s.nombre AS sala FROM lotes l
       JOIN geneticas g ON g.id = l.genetica_id JOIN salas s ON s.id = l.sala_id WHERE l.id = $1`, [id],
    );
    if (!lote) throw new ErrorHttp(404, 'No encontrado.');
    return {
      lote,
      registros: await q(
        `SELECT r.id, r.tipo, r.detalle, r.ph, r.ec, r.temperatura, r.humedad, r.litros, r.plantas, r.testigos, r.creado_en,
         a.email AS responsable, p.codigo AS planta FROM registros_lote r JOIN admins a ON a.id = r.creado_por
         LEFT JOIN plantas p ON p.id = r.planta_id
         WHERE r.lote_id = $1 ORDER BY r.creado_en DESC, r.id DESC LIMIT 500`, [id],
      ),
      analisis: await q(
        'SELECT id, laboratorio, fecha, thc, cbd, notas FROM analisis WHERE lote_id = $1 ORDER BY fecha DESC', [id],
      ),
      plantas: (await q(
        "SELECT count(*) FILTER (WHERE estado = 'viva') AS vivas, count(*) AS total FROM plantas WHERE lote_id = $1", [id],
      ))[0],
      insumos: await q('SELECT id, nombre, unidad FROM insumos ORDER BY nombre LIMIT 500'),
      salas: await q('SELECT id, nombre FROM salas ORDER BY nombre'),
      limite: await resumenPlantas(q),
      tareas: await q(
        `SELECT id, titulo, vence_en, vence_en < current_date AS vencida,
         ($2::boolean OR asignada_a = $3 OR ($4::boolean AND asignada_a IS NULL)) AS puede_completar
         FROM tareas WHERE lote_id = $1 AND completada_en IS NULL ORDER BY vence_en, id LIMIT 50`,
        [id, GESTIONA_TAREAS.includes(admin.rol), admin.id, admin.rol === 'cultivador'],
      ),
    };
  });
  const fechasEtapa = Object.fromEntries(ETAPAS.map((etapa) => [
    etapa, datos.registros.find((r) => r.tipo === 'etapa' && r.detalle === textoEtapa(etapa))?.creado_en ?? null,
  ]));
  fechasEtapa.origen = datos.lote.creado_en;
  const { peso_humedo_g: humedo, peso_seco_g: seco } = datos.lote;
  const merma = humedo && seco ? Math.round((1 - Number(seco) / Number(humedo)) * 10000) / 100 : null;
  const qr = await dataUriQr(`${c.url.origin}/admin_lote.html?id=${id}`);
  return json(200, { ...datos, fechas_etapa: fechasEtapa, merma, qr });
}

async function crearTareasDeEtapa(q, loteId, etapa, adminId) {
  await q(
    `INSERT INTO tareas (titulo, lote_id, vence_en, creado_por)
     SELECT titulo, $1, current_date + dias, $2 FROM plantillas_tarea WHERE etapa = $3`,
    [loteId, adminId, etapa],
  );
}

async function avanzarEtapa(q, admin, datos) {
  if (!esId(datos.lote_id)) throw new ErrorHttp(422, 'Pedido inválido.');
  const [lote] = await q('SELECT etapa, estado, peso_humedo_g, peso_seco_g FROM lotes WHERE id = $1 FOR UPDATE', [datos.lote_id]);
  if (!lote) throw new ErrorHttp(404, 'No encontrado.');
  if (lote.estado !== 'activo') throw new ErrorHttp(409, 'Este lote ya no está activo.');
  const siguiente = ETAPAS[ETAPAS.indexOf(lote.etapa) + 1];
  if (!siguiente) throw new ErrorHttp(409, 'El lote ya está en la última etapa.');
  const peso = numero(datos, 'peso_g', { maximo: 1e8 });
  if (siguiente === 'cosecha') {
    if (!peso || Number(peso) <= 0) throw new ErrorHttp(422, 'Indicá el peso húmedo en gramos.');
    await q('UPDATE lotes SET peso_humedo_g = $1 WHERE id = $2', [peso, datos.lote_id]);
  }
  if (siguiente === 'curado') {
    if (!peso || Number(peso) <= 0) throw new ErrorHttp(422, 'Indicá el peso seco en gramos.');
    if (Number(peso) > Number(lote.peso_humedo_g)) throw new ErrorHttp(422, 'El peso seco no puede superar al húmedo.');
    await q('UPDATE lotes SET peso_seco_g = $1 WHERE id = $2', [peso, datos.lote_id]);
  }
  if (siguiente === 'envasado') {
    // Cuarentena: sin analisis de laboratorio, el lote no avanza.
    const [{ total }] = await q('SELECT count(*) AS total FROM analisis WHERE lote_id = $1', [datos.lote_id]);
    if (!total) throw new ErrorHttp(409, 'El lote sigue en cuarentena: falta el análisis de laboratorio.');
  }
  await q('UPDATE lotes SET etapa = $1 WHERE id = $2', [siguiente, datos.lote_id]);
  await q(
    "INSERT INTO registros_lote (lote_id, tipo, detalle, creado_por) VALUES ($1, 'etapa', $2, $3)",
    [datos.lote_id, textoEtapa(siguiente), admin.id],
  );
  await crearTareasDeEtapa(q, datos.lote_id, siguiente, admin.id);
  await auditar(q, 'lote_avanzado', 'lote', { entidadId: datos.lote_id, adminId: admin.id, detalle: siguiente });
  return { etapa: siguiente, plantas: await resumenPlantas(q) };
}

export async function etiquetas(c) {
  await exigirModulo();
  await exigirSesion(c, 'admin', { roles: VE_CULTIVO });
  const id = Number(c.url.searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) throw new ErrorHttp(422, 'Pedido inválido.');
  const { lote, plantas } = await transaccion(async (q) => ({
    lote: (await q('SELECT codigo FROM lotes WHERE id = $1', [id]))[0],
    plantas: await q("SELECT codigo FROM plantas WHERE lote_id = $1 AND estado = 'viva' ORDER BY codigo", [id]),
  }));
  if (!lote) throw new ErrorHttp(404, 'No encontrado.');
  const lista = [];
  for (const { codigo } of plantas) {
    const destino = `${c.url.origin}/admin_lote.html?id=${id}&planta=${encodeURIComponent(codigo)}`;
    lista.push({ codigo, qr: await dataUriQr(destino) });
  }
  return json(200, { codigo: lote.codigo, plantas: lista });
}

const ACCIONES_CULTIVO = {
  async crear_sala(q, admin, datos) {
    const tipo = TIPOS_SALA.includes(datos.tipo) ? datos.tipo : null;
    if (!tipo) throw new ErrorHttp(422, 'Revisá el tipo de sala.');
    const filas = await q(
      'INSERT INTO salas (nombre, tipo) VALUES ($1, $2) ON CONFLICT (nombre) DO NOTHING RETURNING id',
      [texto(datos, 'nombre', 100), tipo],
    );
    if (!filas.length) throw new ErrorHttp(409, 'Ya existe una sala con ese nombre.');
    await auditar(q, 'sala_creada', 'sala', { entidadId: filas[0].id, adminId: admin.id });
    return { id: filas[0].id };
  },
  async crear_genetica(q, admin, datos) {
    const filas = await q(
      'INSERT INTO geneticas (nombre, notas) VALUES ($1, $2) ON CONFLICT (nombre) DO NOTHING RETURNING id',
      [texto(datos, 'nombre', 100), texto(datos, 'notas', 1000, false)],
    );
    if (!filas.length) throw new ErrorHttp(409, 'Ya existe una variedad con ese nombre.');
    await auditar(q, 'genetica_creada', 'genetica', { entidadId: filas[0].id, adminId: admin.id });
    return { id: filas[0].id };
  },
  async crear_lote(q, admin, datos) {
    if (!ORIGENES.includes(datos.origen)) throw new ErrorHttp(422, 'Revisá el origen.');
    // Variedad y sala nuevas se crean junto con el lote: si algo falla, no queda nada a medias.
    const geneticaId = datos.genetica_nombre
      ? (await q(
        'INSERT INTO geneticas (nombre) VALUES ($1) ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id',
        [texto(datos, 'genetica_nombre', 100)],
      ))[0].id
      : datos.genetica_id;
    const salaId = datos.sala_nombre
      ? (await q(
        "INSERT INTO salas (nombre, tipo) VALUES ($1, 'cultivo') ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id",
        [texto(datos, 'sala_nombre', 100)],
      ))[0].id
      : datos.sala_id;
    if (!esId(geneticaId) || !esId(salaId)) throw new ErrorHttp(422, 'Elegí variedad y sala.');
    const [{ existe }] = await q(
      `SELECT EXISTS (SELECT 1 FROM geneticas WHERE id = $1) AND EXISTS (SELECT 1 FROM salas WHERE id = $2) AS existe`,
      [geneticaId, salaId],
    );
    if (!existe) throw new ErrorHttp(422, 'Elegí variedad y sala.');
    const cantidad = entero(datos, 'cantidad_plantas', 1, MAXIMO_PLANTAS);
    const codigo = texto(datos, 'codigo', 40, false) ?? await siguienteCodigo(q);
    const filas = await q(
      `INSERT INTO lotes (codigo, genetica_id, sala_id, sala_inicial_id, origen, cantidad_plantas, cosecha_prevista, creado_por)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7) ON CONFLICT (codigo) DO NOTHING RETURNING id`,
      [codigo, geneticaId, salaId, datos.origen, cantidad, fechaOpcional(datos, 'cosecha_prevista'), admin.id],
    );
    if (!filas.length) throw new ErrorHttp(409, 'Ya existe un lote con ese código.');
    await q(
      `INSERT INTO plantas (lote_id, codigo)
       SELECT $1, $2 || '-P' || lpad(n::text, 3, '0') FROM generate_series(1, $3::int) AS n`,
      [filas[0].id, codigo, cantidad],
    );
    await crearTareasDeEtapa(q, filas[0].id, 'origen', admin.id);
    await auditar(q, 'lote_creado', 'lote', { entidadId: filas[0].id, adminId: admin.id });
    return { id: filas[0].id };
  },
  avanzar: avanzarEtapa,
  async actualizar_lote(q, admin, datos) {
    if (!esId(datos.lote_id)) throw new ErrorHttp(422, 'Pedido inválido.');
    const cambios = {
      notas: () => [texto(datos, 'valor', 1000, false), "UPDATE lotes SET notas = $1 WHERE id = $2 AND estado = 'activo' RETURNING id"],
      cosecha_prevista: () => [fechaOpcional(datos, 'valor'), "UPDATE lotes SET cosecha_prevista = $1 WHERE id = $2 AND estado = 'activo' RETURNING id"],
    };
    if (!Object.hasOwn(cambios, datos.campo ?? '')) throw new ErrorHttp(422, 'Pedido inválido.');
    const [valor, sql] = cambios[datos.campo]();
    const filas = await q(sql, [valor, datos.lote_id]);
    if (!filas.length) throw new ErrorHttp(409, 'Este lote ya no está activo.');
    await auditar(q, 'lote_actualizado', 'lote', { entidadId: datos.lote_id, adminId: admin.id, detalle: datos.campo });
    return { ok: true };
  },
  // Un peso mal escrito se corrige con motivo y queda en el historial y en la auditoría.
  async corregir_peso(q, admin, datos) {
    if (!esId(datos.lote_id) || !['humedo', 'seco'].includes(datos.cual)) throw new ErrorHttp(422, 'Pedido inválido.');
    const peso = positivo(datos, 'peso_g', { maximo: 1e8 });
    const motivo = texto(datos, 'motivo', 500);
    const [lote] = await q('SELECT estado, peso_humedo_g, peso_seco_g FROM lotes WHERE id = $1 FOR UPDATE', [datos.lote_id]);
    if (!lote) throw new ErrorHttp(404, 'No encontrado.');
    if (lote.estado !== 'activo') throw new ErrorHttp(409, 'Este lote ya no está activo.');
    const humedo = datos.cual === 'humedo';
    const anterior = humedo ? lote.peso_humedo_g : lote.peso_seco_g;
    if (anterior === null) throw new ErrorHttp(409, 'Ese peso todavía no está cargado.');
    const seco = humedo ? lote.peso_seco_g : peso;
    if (seco !== null && Number(seco) > Number(humedo ? peso : lote.peso_humedo_g)) {
      throw new ErrorHttp(422, 'El peso seco no puede superar al húmedo.');
    }
    await q(
      humedo ? 'UPDATE lotes SET peso_humedo_g = $1 WHERE id = $2' : 'UPDATE lotes SET peso_seco_g = $1 WHERE id = $2',
      [peso, datos.lote_id],
    );
    await q(
      "INSERT INTO registros_lote (lote_id, tipo, detalle, creado_por) VALUES ($1, 'correccion', $2, $3)",
      [datos.lote_id, `Peso ${humedo ? 'húmedo' : 'seco'} de ${gramos(anterior)} a ${gramos(peso)} g. Motivo: ${motivo}`, admin.id],
    );
    await auditar(q, 'peso_corregido', 'lote', { entidadId: datos.lote_id, adminId: admin.id, detalle: datos.cual });
    return { ok: true };
  },
  async mover(q, admin, datos) {
    if (!esId(datos.lote_id) || !esId(datos.sala_id)) throw new ErrorHttp(422, 'Elegí una sala.');
    const [sala] = await q('SELECT nombre FROM salas WHERE id = $1', [datos.sala_id]);
    if (!sala) throw new ErrorHttp(422, 'Elegí una sala.');
    const filas = await q("UPDATE lotes SET sala_id = $1 WHERE id = $2 AND estado = 'activo' RETURNING id", [datos.sala_id, datos.lote_id]);
    if (!filas.length) throw new ErrorHttp(409, 'Este lote ya no está activo.');
    await q(
      "INSERT INTO registros_lote (lote_id, tipo, detalle, creado_por) VALUES ($1, 'etapa', $2, $3)",
      [datos.lote_id, `Pasó a la sala ${sala.nombre}`, admin.id],
    );
    await auditar(q, 'lote_movido', 'lote', { entidadId: datos.lote_id, adminId: admin.id });
    return { ok: true };
  },
  async analisis(q, admin, datos) {
    if (!esId(datos.lote_id)) throw new ErrorHttp(422, 'Pedido inválido.');
    const [lote] = await q('SELECT id FROM lotes WHERE id = $1', [datos.lote_id]);
    if (!lote) throw new ErrorHttp(404, 'No encontrado.');
    const filas = await q(
      `INSERT INTO analisis (lote_id, laboratorio, fecha, thc, cbd, notas, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        datos.lote_id, texto(datos, 'laboratorio', 120), fecha(datos, 'fecha'),
        numero(datos, 'thc', { obligatorio: true, maximo: 100 }),
        numero(datos, 'cbd', { obligatorio: true, maximo: 100 }),
        texto(datos, 'notas', 1000, false), admin.id,
      ],
    );
    await auditar(q, 'analisis_registrado', 'lote', { entidadId: datos.lote_id, adminId: admin.id });
    return { id: filas[0].id };
  },
  async finalizar(q, admin, datos) {
    if (!esId(datos.lote_id)) throw new ErrorHttp(422, 'Pedido inválido.');
    const estado = datos.estado === 'descartado' ? 'descartado' : 'finalizado';
    const [lote] = await q('SELECT estado, etapa FROM lotes WHERE id = $1 FOR UPDATE', [datos.lote_id]);
    if (!lote) throw new ErrorHttp(404, 'No encontrado.');
    if (lote.estado !== 'activo') throw new ErrorHttp(409, 'Este lote ya no está activo.');
    if (estado === 'finalizado' && lote.etapa !== 'envasado') {
      throw new ErrorHttp(409, 'Solo se finaliza un lote envasado.');
    }
    const motivo = estado === 'descartado' ? texto(datos, 'motivo', 500) : 'Lote finalizado';
    await q('UPDATE lotes SET estado = $1 WHERE id = $2', [estado, datos.lote_id]);
    // Un lote cerrado ya no tiene trabajo pendiente.
    await q(
      'UPDATE tareas SET completada_en = now(), completada_por = $1 WHERE lote_id = $2 AND completada_en IS NULL',
      [admin.id, datos.lote_id],
    );
    await q(
      "INSERT INTO registros_lote (lote_id, tipo, detalle, creado_por) VALUES ($1, 'etapa', $2, $3)",
      [datos.lote_id, motivo, admin.id],
    );
    await auditar(q, 'lote_cerrado', 'lote', { entidadId: datos.lote_id, adminId: admin.id, detalle: estado });
    return { estado };
  },
};

export async function accionCultivo(c) {
  await exigirModulo();
  const admin = await exigirSesion(c, 'admin', { roles: COORDINA, csrf: true });
  const datos = leerJson(c);
  if (!Object.hasOwn(ACCIONES_CULTIVO, datos.accion ?? '')) throw new ErrorHttp(422, 'Pedido inválido.');
  return json(200, await transaccion((q) => ACCIONES_CULTIVO[datos.accion](q, admin, datos)));
}

export async function registrar(c) {
  await exigirModulo();
  const admin = await exigirSesion(c, 'admin', { roles: REGISTRA, csrf: true });
  const datos = leerJson(c);
  if (!esId(datos.lote_id) || !TIPOS_REGISTRO.includes(datos.tipo)) throw new ErrorHttp(422, 'Pedido inválido.');
  const detalle = texto(datos, 'detalle', 1000, false) ?? DETALLE_POR_DEFECTO[datos.tipo];
  if (!detalle) throw new ErrorHttp(422, 'Contá brevemente qué pasó.');
  const litros = datos.tipo === 'riego' ? numero(datos, 'litros', { maximo: 100000 }) : null;
  const medidas = [
    numero(datos, 'ph', { maximo: 14 }), numero(datos, 'ec', { maximo: 100 }),
    numero(datos, 'temperatura', { maximo: 100 }), numero(datos, 'humedad', { maximo: 100 }),
  ];
  if (datos.tipo === 'medicion' && medidas.every((medida) => medida === null)) {
    throw new ErrorHttp(422, 'Anotá al menos una medida.');
  }
  const codigoPlanta = texto(datos, 'planta_codigo', 60, false);
  const plantas = datos.tipo === 'baja' ? (codigoPlanta ? 1 : entero(datos, 'plantas')) : null;
  const testigos = datos.tipo === 'destruccion' ? texto(datos, 'testigos', 300) : null;
  const gasto = datos.insumo_id ? { insumoId: datos.insumo_id, cantidad: numero(datos, 'cantidad_insumo', { obligatorio: true, maximo: 1e8 }) } : null;
  if (gasto && (!esId(gasto.insumoId) || Number(gasto.cantidad) <= 0)) throw new ErrorHttp(422, 'Revisá los valores numéricos.');
  const id = await transaccion(async (q) => {
    const [lote] = await q('SELECT estado, cantidad_plantas FROM lotes WHERE id = $1 FOR UPDATE', [datos.lote_id]);
    if (!lote) throw new ErrorHttp(404, 'No encontrado.');
    if (lote.estado !== 'activo') throw new ErrorHttp(409, 'Este lote ya no está activo.');
    let plantaId = null;
    if (codigoPlanta) {
      const [planta] = await q('SELECT id, estado FROM plantas WHERE codigo = $1 AND lote_id = $2 FOR UPDATE', [codigoPlanta, datos.lote_id]);
      if (!planta) throw new ErrorHttp(422, 'Esa planta no es de este lote.');
      if (planta.estado !== 'viva') throw new ErrorHttp(409, 'Esa planta ya está dada de baja.');
      plantaId = planta.id;
    }
    if (plantas !== null) {
      if (plantas > lote.cantidad_plantas) throw new ErrorHttp(409, 'El lote no tiene tantas plantas.');
      await q('UPDATE lotes SET cantidad_plantas = cantidad_plantas - $1 WHERE id = $2', [plantas, datos.lote_id]);
      await q(
        `UPDATE plantas SET estado = 'baja', baja_en = now() WHERE id IN (
           SELECT id FROM plantas WHERE lote_id = $1 AND estado = 'viva' AND ($2::bigint IS NULL OR id = $2)
           ORDER BY id DESC LIMIT $3)`, [datos.lote_id, plantaId, plantas],
      );
    }
    const filas = await q(
      `INSERT INTO registros_lote (lote_id, tipo, detalle, ph, ec, temperatura, humedad, litros, plantas, testigos, planta_id, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [datos.lote_id, datos.tipo, detalle, ...medidas, litros, plantas, testigos, plantaId, admin.id],
    );
    if (gasto) {
      await moverStock(q, admin.id, {
        insumoId: gasto.insumoId, tipo: 'consumo', cantidad: gasto.cantidad, baja: true, motivo: datos.tipo, loteId: datos.lote_id,
      });
    }
    await auditar(q, 'registro_cultivo', 'lote', { entidadId: datos.lote_id, adminId: admin.id, detalle: datos.tipo });
    return filas[0].id;
  });
  return json(200, { id });
}

export async function verTareas(c) {
  const admin = await exigirSesion(c, 'admin');
  const gestiona = GESTIONA_TAREAS.includes(admin.rol);
  const activo = await moduloActivo();
  const datos = await transaccion(async (q) => {
    await generarTareasDebidas(q);
    return {
      hoy: (await q('SELECT current_date::text AS hoy'))[0].hoy,
      tareas: await q(
        `SELECT t.id, t.titulo, t.detalle, t.vence_en, t.completada_en, t.asignada_a, t.lote_id, l.codigo AS lote,
         s.nombre AS sala, a.email AS responsable, h.email AS hecha_por,
         t.vence_en < current_date AND t.completada_en IS NULL AS vencida
         FROM tareas t LEFT JOIN lotes l ON l.id = t.lote_id LEFT JOIN salas s ON s.id = l.sala_id
         LEFT JOIN admins a ON a.id = t.asignada_a LEFT JOIN admins h ON h.id = t.completada_por
         WHERE ($1::boolean OR t.asignada_a = $2 OR ($3::boolean AND t.asignada_a IS NULL))
         AND ($4::boolean OR t.lote_id IS NULL)
         ORDER BY t.completada_en IS NOT NULL, t.vence_en, t.id LIMIT 300`,
        [gestiona, admin.id, admin.rol === 'cultivador', activo],
      ),
      equipo: gestiona ? await q('SELECT id, email FROM admins WHERE activo ORDER BY email') : [],
    };
  });
  return json(200, { ...datos, yo: admin.id, rol: admin.rol, puede_crear: gestiona });
}

export async function accionTarea(c) {
  const admin = await exigirSesion(c, 'admin', { csrf: true });
  const datos = leerJson(c);
  const coordina = GESTIONA_TAREAS.includes(admin.rol);
  const respuesta = await transaccion(async (q) => {
    if (datos.accion === 'crear') {
      if (!coordina) throw new ErrorHttp(403, 'No tenés permiso para esta acción.');
      const asignada = esId(datos.asignada_a) ? datos.asignada_a : null;
      const filas = await q(
        'INSERT INTO tareas (titulo, detalle, vence_en, asignada_a, creado_por) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [texto(datos, 'titulo'), texto(datos, 'detalle', 1000, false), fecha(datos, 'vence_en'), asignada, admin.id],
      );
      await auditar(q, 'tarea_creada', 'tarea', { entidadId: filas[0].id, adminId: admin.id });
      return { id: filas[0].id };
    }
    if (!esId(datos.tarea_id)) throw new ErrorHttp(422, 'Pedido inválido.');
    const [tarea] = await q('SELECT asignada_a, completada_en, equipo_id FROM tareas WHERE id = $1 FOR UPDATE', [datos.tarea_id]);
    if (!tarea) throw new ErrorHttp(404, 'No encontrado.');
    if (tarea.completada_en) throw new ErrorHttp(409, 'Esta tarea ya está hecha.');
    if (datos.accion === 'completar') {
      const libre = tarea.asignada_a === null && admin.rol === 'cultivador';
      if (!coordina && !libre && tarea.asignada_a !== admin.id) {
        throw new ErrorHttp(403, 'Esta tarea es de otra persona.');
      }
      await q('UPDATE tareas SET completada_en = now(), completada_por = $1 WHERE id = $2', [admin.id, datos.tarea_id]);
      if (tarea.equipo_id) {
        await q(
          `UPDATE equipos SET proximo_mantenimiento = current_date + frecuencia_dias WHERE id = $1`, [tarea.equipo_id],
        );
      }
      await auditar(q, 'tarea_completada', 'tarea', { entidadId: datos.tarea_id, adminId: admin.id });
      return { ok: true };
    }
    if (datos.accion === 'asignar') {
      if (!coordina) throw new ErrorHttp(403, 'No tenés permiso para esta acción.');
      const asignada = esId(datos.asignada_a) ? datos.asignada_a : null;
      await q('UPDATE tareas SET asignada_a = $1 WHERE id = $2', [asignada, datos.tarea_id]);
      await auditar(q, 'tarea_asignada', 'tarea', { entidadId: datos.tarea_id, adminId: admin.id });
      return { ok: true };
    }
    throw new ErrorHttp(422, 'Pedido inválido.');
  });
  return json(200, respuesta);
}

// Unico punto que cambia el stock: deja movimiento y avisa si queda por debajo del minimo.
export async function moverStock(q, adminId, { insumoId, tipo, cantidad, baja, motivo, loteId = null }) {
  const firmado = baja ? `-${cantidad}` : cantidad;
  const [insumo] = await q('SELECT nombre, stock FROM insumos WHERE id = $1 FOR UPDATE', [insumoId]);
  if (!insumo) throw new ErrorHttp(404, 'No encontrado.');
  if (baja && Number(cantidad) > Number(insumo.stock)) throw new ErrorHttp(409, 'No hay stock suficiente.');
  const [fila] = await q(
    'UPDATE insumos SET stock = stock + $1::numeric WHERE id = $2 RETURNING stock, stock_minimo', [firmado, insumoId],
  );
  await q(
    'INSERT INTO movimientos_insumo (insumo_id, tipo, cantidad, motivo, lote_id, creado_por) VALUES ($1, $2, $3, $4, $5, $6)',
    [insumoId, tipo, firmado, motivo, loteId, adminId],
  );
  if (baja && Number(fila.stock) <= Number(fila.stock_minimo)) {
    await q(
      `INSERT INTO tareas (titulo, vence_en, insumo_id) VALUES ($1, current_date, $2)
       ON CONFLICT (insumo_id) WHERE completada_en IS NULL DO NOTHING`, [`Reponer: ${insumo.nombre}`, insumoId],
    );
  }
  await auditar(q, 'stock_movido', 'insumo', { entidadId: insumoId, adminId, detalle: tipo });
  return fila.stock;
}

export async function verInventario(c) {
  await exigirModulo();
  await exigirSesion(c, 'admin', { roles: VE_INVENTARIO });
  const datos = await transaccion(async (q) => ({
    insumos: await q(
      `SELECT id, nombre, categoria, unidad, stock, stock_minimo, stock <= stock_minimo AS bajo FROM insumos
       ORDER BY stock <= stock_minimo DESC, nombre LIMIT 500`,
    ),
    movimientos: await q(
      `SELECT m.id, i.nombre AS insumo, i.unidad, m.tipo, m.cantidad, m.motivo, m.creado_en FROM movimientos_insumo m
       JOIN insumos i ON i.id = m.insumo_id ORDER BY m.creado_en DESC, m.id DESC LIMIT 50`,
    ),
    equipos: await q(
      `SELECT e.id, e.nombre, e.tipo, e.proximo_mantenimiento, e.frecuencia_dias, s.nombre AS sala,
       e.proximo_mantenimiento <= current_date AS vencido
       FROM equipos e LEFT JOIN salas s ON s.id = e.sala_id ORDER BY e.proximo_mantenimiento NULLS LAST, e.nombre LIMIT 200`,
    ),
    averias: await q(
      `SELECT a.id, e.nombre AS equipo, a.detalle, a.coste, a.creado_en, a.resuelta_en FROM averias a
       JOIN equipos e ON e.id = a.equipo_id ORDER BY a.resuelta_en IS NOT NULL, a.creado_en DESC LIMIT 100`,
    ),
    salas: await q('SELECT id, nombre FROM salas ORDER BY nombre'),
  }));
  return json(200, datos);
}

export async function accionInventario(c) {
  await exigirModulo();
  const admin = await exigirSesion(c, 'admin', { roles: COORDINA, csrf: true });
  const datos = leerJson(c);
  const respuesta = await transaccion(async (q) => {
    if (datos.accion === 'crear_insumo') {
      const filas = await q(
        `INSERT INTO insumos (nombre, categoria, unidad, stock_minimo) VALUES ($1, $2, $3, $4)
         ON CONFLICT (nombre) DO NOTHING RETURNING id`,
        [texto(datos, 'nombre', 120), texto(datos, 'categoria', 60), texto(datos, 'unidad', 20), numero(datos, 'stock_minimo') ?? '0'],
      );
      if (!filas.length) throw new ErrorHttp(409, 'Ya existe un insumo con ese nombre.');
      await auditar(q, 'insumo_creado', 'insumo', { entidadId: filas[0].id, adminId: admin.id });
      return { id: filas[0].id };
    }
    if (datos.accion === 'movimiento') {
      if (!esId(datos.insumo_id) || !MOVIMIENTOS.includes(datos.tipo)) throw new ErrorHttp(422, 'Pedido inválido.');
      const cantidad = numero(datos, 'cantidad', { obligatorio: true, maximo: 1e8 });
      if (Number(cantidad) <= 0) throw new ErrorHttp(422, 'Revisá los valores numéricos.');
      const baja = datos.tipo === 'consumo' || (datos.tipo === 'ajuste' && datos.sentido === 'baja');
      const motivo = texto(datos, 'motivo', 300);
      return { stock: await moverStock(q, admin.id, { insumoId: datos.insumo_id, tipo: datos.tipo, cantidad, baja, motivo }) };
    }
    if (datos.accion === 'crear_equipo') {
      const mantenimiento = datos.proximo_mantenimiento ? fecha(datos, 'proximo_mantenimiento') : null;
      const sala = esId(datos.sala_id) ? datos.sala_id : null;
      const frecuencia = datos.frecuencia_dias ? entero(datos, 'frecuencia_dias', 1, 3660) : null;
      const filas = await q(
        'INSERT INTO equipos (nombre, tipo, sala_id, proximo_mantenimiento, frecuencia_dias) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [texto(datos, 'nombre', 120), texto(datos, 'tipo', 60), sala, mantenimiento, frecuencia],
      );
      await auditar(q, 'equipo_creado', 'equipo', { entidadId: filas[0].id, adminId: admin.id });
      return { id: filas[0].id };
    }
    if (datos.accion === 'crear_averia') {
      if (!esId(datos.equipo_id)) throw new ErrorHttp(422, 'Elegí un equipo.');
      const [equipo] = await q('SELECT id FROM equipos WHERE id = $1', [datos.equipo_id]);
      if (!equipo) throw new ErrorHttp(422, 'Elegí un equipo.');
      const [{ id }] = await q(
        'INSERT INTO averias (equipo_id, detalle, coste, creado_por) VALUES ($1, $2, $3, $4) RETURNING id',
        [datos.equipo_id, texto(datos, 'detalle', 500), numero(datos, 'coste'), admin.id],
      );
      await auditar(q, 'averia_creada', 'averia', { entidadId: id, adminId: admin.id });
      return { id };
    }
    if (datos.accion === 'resolver_averia') {
      if (!esId(datos.id)) throw new ErrorHttp(422, 'Pedido inválido.');
      const filas = await q('UPDATE averias SET resuelta_en = now() WHERE id = $1 AND resuelta_en IS NULL RETURNING id', [datos.id]);
      if (!filas.length) throw new ErrorHttp(409, 'Esa avería ya está resuelta.');
      await auditar(q, 'averia_resuelta', 'averia', { entidadId: datos.id, adminId: admin.id });
      return { ok: true };
    }
    throw new ErrorHttp(422, 'Pedido inválido.');
  });
  return json(200, respuesta);
}
