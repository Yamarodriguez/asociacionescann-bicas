// Cultivo, tareas e inventario. Si el modulo esta apagado, estas rutas no existen.
import { auditar, configuracion, transaccion } from './db.mjs';
import { ErrorHttp, exigirSesion, json, leerJson } from './http.mjs';
import { fechaValida } from './rutas_acceso.mjs';
import { dataUriQr } from './rutas_socio.mjs';

const COORDINA = ['coordinador_cultivo'];
const REGISTRA = ['coordinador_cultivo', 'cultivador'];
const VE_CULTIVO = ['comision_directiva', 'coordinador_cultivo', 'cultivador', 'director_medico'];
const VE_TAREAS = ['comision_directiva', 'coordinador_cultivo', 'cultivador'];
const VE_INVENTARIO = ['comision_directiva', 'coordinador_cultivo'];
const ETAPAS = ['origen', 'vegetativo', 'floracion', 'cosecha', 'secado', 'curado', 'envasado'];
const TIPOS_REGISTRO = ['riego', 'nutrientes', 'poda', 'aplicacion', 'incidencia', 'medicion', 'baja', 'destruccion'];
const TIPOS_SALA = ['cultivo', 'secado', 'curado'];
const ORIGENES = ['semilla', 'esqueje'];
const MOVIMIENTOS = ['ingreso', 'consumo', 'ajuste'];

const esId = (valor) => Number.isInteger(valor);
const decimal = /^\d{1,10}(\.\d{1,2})?$/;

function texto(datos, clave, maximo = 200, obligatorio = true) {
  const valor = datos[clave];
  if (!obligatorio && (valor === undefined || valor === null || valor === '')) return null;
  if (typeof valor !== 'string' || !valor.trim() || valor.length > maximo) {
    throw new ErrorHttp(422, 'Revisá los datos del formulario.');
  }
  return valor.trim();
}

function numero(datos, clave, { obligatorio = false, maximo = 1e9 } = {}) {
  const valor = datos[clave];
  if (valor === undefined || valor === null || valor === '') {
    if (obligatorio) throw new ErrorHttp(422, 'Revisá los valores numéricos.');
    return null;
  }
  const crudo = String(valor);
  if (!decimal.test(crudo) || Number(crudo) > maximo) throw new ErrorHttp(422, 'Revisá los valores numéricos.');
  return crudo;
}

function entero(datos, clave, minimo = 1) {
  const valor = datos[clave];
  if (!Number.isInteger(valor) || valor < minimo || valor > 100000) {
    throw new ErrorHttp(422, 'Revisá la cantidad.');
  }
  return valor;
}

function fecha(datos, clave) {
  if (!fechaValida(datos[clave])) throw new ErrorHttp(422, 'Revisá la fecha.');
  return datos[clave];
}

export async function moduloActivo() {
  return transaccion(async (q) => (await configuracion(q, 'modulo_cultivo_activo')) === 'true');
}

async function exigirModulo() {
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

export async function contadoresCultivo(q, rol, adminId) {
  const salida = {};
  if (VE_CULTIVO.includes(rol)) {
    const [{ lotes }] = await q("SELECT count(*) AS lotes FROM lotes WHERE estado = 'activo'");
    salida.lotes_activos = lotes;
  }
  if (VE_TAREAS.includes(rol)) {
    const [{ total }] = await q(
      `SELECT count(*) AS total FROM tareas WHERE completada_en IS NULL AND vence_en <= current_date
       AND ($1::boolean OR asignada_a = $2 OR asignada_a IS NULL)`, [rol !== 'cultivador', adminId],
    );
    salida.tareas_hoy = total;
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
    salas: await q('SELECT id, nombre, tipo FROM salas ORDER BY nombre'),
    geneticas: await q('SELECT id, nombre, notas FROM geneticas ORDER BY nombre'),
    lotes: await q(
      `SELECT l.id, l.codigo, l.etapa, l.estado, l.cantidad_plantas, l.origen, l.creado_en,
       g.nombre AS genetica, s.nombre AS sala FROM lotes l
       JOIN geneticas g ON g.id = l.genetica_id JOIN salas s ON s.id = l.sala_id
       ORDER BY l.estado = 'activo' DESC, l.creado_en DESC LIMIT 300`,
    ),
  }));
  return json(200, datos);
}

export async function verLote(c) {
  await exigirModulo();
  await exigirSesion(c, 'admin', { roles: VE_CULTIVO });
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
        `SELECT r.id, r.tipo, r.detalle, r.ph, r.ec, r.temperatura, r.humedad, r.plantas, r.testigos, r.creado_en,
         a.email AS responsable FROM registros_lote r JOIN admins a ON a.id = r.creado_por
         WHERE r.lote_id = $1 ORDER BY r.creado_en DESC, r.id DESC LIMIT 500`, [id],
      ),
      analisis: await q(
        'SELECT id, laboratorio, fecha, thc, cbd, notas FROM analisis WHERE lote_id = $1 ORDER BY fecha DESC', [id],
      ),
    };
  });
  const { peso_humedo_g: humedo, peso_seco_g: seco } = datos.lote;
  const merma = humedo && seco ? Math.round((1 - Number(seco) / Number(humedo)) * 10000) / 100 : null;
  const qr = await dataUriQr(`${c.url.origin}/admin_lote.html?id=${id}`);
  return json(200, { ...datos, merma, qr });
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
    [datos.lote_id, `Pasó a ${siguiente === 'floracion' ? 'floración' : siguiente}`, admin.id],
  );
  await crearTareasDeEtapa(q, datos.lote_id, siguiente, admin.id);
  await auditar(q, 'lote_avanzado', 'lote', { entidadId: datos.lote_id, adminId: admin.id, detalle: siguiente });
  return { etapa: siguiente, plantas: await resumenPlantas(q) };
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
    if (!filas.length) throw new ErrorHttp(409, 'Ya existe una genética con ese nombre.');
    await auditar(q, 'genetica_creada', 'genetica', { entidadId: filas[0].id, adminId: admin.id });
    return { id: filas[0].id };
  },
  async crear_lote(q, admin, datos) {
    if (!esId(datos.genetica_id) || !esId(datos.sala_id)) throw new ErrorHttp(422, 'Elegí genética y sala.');
    if (!ORIGENES.includes(datos.origen)) throw new ErrorHttp(422, 'Revisá el origen.');
    const [{ existe }] = await q(
      `SELECT EXISTS (SELECT 1 FROM geneticas WHERE id = $1) AND EXISTS (SELECT 1 FROM salas WHERE id = $2) AS existe`,
      [datos.genetica_id, datos.sala_id],
    );
    if (!existe) throw new ErrorHttp(422, 'Elegí genética y sala.');
    const filas = await q(
      `INSERT INTO lotes (codigo, genetica_id, sala_id, origen, cantidad_plantas, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (codigo) DO NOTHING RETURNING id`,
      [texto(datos, 'codigo', 40), datos.genetica_id, datos.sala_id, datos.origen, entero(datos, 'cantidad_plantas'), admin.id],
    );
    if (!filas.length) throw new ErrorHttp(409, 'Ya existe un lote con ese código.');
    await crearTareasDeEtapa(q, filas[0].id, 'origen', admin.id);
    await auditar(q, 'lote_creado', 'lote', { entidadId: filas[0].id, adminId: admin.id });
    return { id: filas[0].id };
  },
  avanzar: avanzarEtapa,
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
  const detalle = texto(datos, 'detalle', 1000);
  const medidas = [
    numero(datos, 'ph', { maximo: 14 }), numero(datos, 'ec', { maximo: 100 }),
    numero(datos, 'temperatura', { maximo: 100 }), numero(datos, 'humedad', { maximo: 100 }),
  ];
  const plantas = datos.tipo === 'baja' ? entero(datos, 'plantas') : null;
  const testigos = datos.tipo === 'destruccion' ? texto(datos, 'testigos', 300) : null;
  const id = await transaccion(async (q) => {
    const [lote] = await q('SELECT estado, cantidad_plantas FROM lotes WHERE id = $1 FOR UPDATE', [datos.lote_id]);
    if (!lote) throw new ErrorHttp(404, 'No encontrado.');
    if (lote.estado !== 'activo') throw new ErrorHttp(409, 'Este lote ya no está activo.');
    if (plantas !== null) {
      if (plantas > lote.cantidad_plantas) throw new ErrorHttp(409, 'El lote no tiene tantas plantas.');
      await q('UPDATE lotes SET cantidad_plantas = cantidad_plantas - $1 WHERE id = $2', [plantas, datos.lote_id]);
    }
    const filas = await q(
      `INSERT INTO registros_lote (lote_id, tipo, detalle, ph, ec, temperatura, humedad, plantas, testigos, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [datos.lote_id, datos.tipo, detalle, ...medidas, plantas, testigos, admin.id],
    );
    await auditar(q, 'registro_cultivo', 'lote', { entidadId: datos.lote_id, adminId: admin.id, detalle: datos.tipo });
    return filas[0].id;
  });
  return json(200, { id });
}

export async function verTareas(c) {
  await exigirModulo();
  const admin = await exigirSesion(c, 'admin', { roles: VE_TAREAS });
  const datos = await transaccion(async (q) => ({
    tareas: await q(
      `SELECT t.id, t.titulo, t.detalle, t.vence_en, t.completada_en, t.asignada_a, t.lote_id, l.codigo AS lote,
       a.email AS responsable, t.vence_en < current_date AND t.completada_en IS NULL AS vencida
       FROM tareas t LEFT JOIN lotes l ON l.id = t.lote_id LEFT JOIN admins a ON a.id = t.asignada_a
       WHERE ($1::boolean OR t.asignada_a = $2 OR t.asignada_a IS NULL)
       ORDER BY t.completada_en IS NOT NULL, t.vence_en, t.id LIMIT 300`,
      [admin.rol !== 'cultivador', admin.id],
    ),
    equipo: admin.rol === 'cultivador' ? [] : await q(
      "SELECT id, email FROM admins WHERE activo AND rol IN ('coordinador_cultivo', 'cultivador') ORDER BY email",
    ),
  }));
  return json(200, { ...datos, yo: admin.id, puede_crear: admin.rol === 'coordinador_cultivo' });
}

export async function accionTarea(c) {
  await exigirModulo();
  const admin = await exigirSesion(c, 'admin', { roles: REGISTRA, csrf: true });
  const datos = leerJson(c);
  const coordina = admin.rol === 'coordinador_cultivo';
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
    const [tarea] = await q('SELECT asignada_a, completada_en FROM tareas WHERE id = $1 FOR UPDATE', [datos.tarea_id]);
    if (!tarea) throw new ErrorHttp(404, 'No encontrado.');
    if (tarea.completada_en) throw new ErrorHttp(409, 'Esta tarea ya está hecha.');
    if (datos.accion === 'completar') {
      if (!coordina && tarea.asignada_a !== null && tarea.asignada_a !== admin.id) {
        throw new ErrorHttp(403, 'Esta tarea es de otra persona.');
      }
      await q('UPDATE tareas SET completada_en = now(), completada_por = $1 WHERE id = $2', [admin.id, datos.tarea_id]);
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
      `SELECT e.id, e.nombre, e.tipo, e.proximo_mantenimiento, s.nombre AS sala,
       e.proximo_mantenimiento <= current_date AS vencido
       FROM equipos e LEFT JOIN salas s ON s.id = e.sala_id ORDER BY e.proximo_mantenimiento NULLS LAST, e.nombre LIMIT 200`,
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
      const signo = datos.tipo === 'consumo' || (datos.tipo === 'ajuste' && datos.sentido === 'baja') ? -1 : 1;
      const firmado = signo < 0 ? `-${cantidad}` : cantidad;
      const motivo = texto(datos, 'motivo', 300);
      const [insumo] = await q('SELECT stock FROM insumos WHERE id = $1 FOR UPDATE', [datos.insumo_id]);
      if (!insumo) throw new ErrorHttp(404, 'No encontrado.');
      if (signo < 0 && Number(cantidad) > Number(insumo.stock)) throw new ErrorHttp(409, 'No hay stock suficiente.');
      const [fila] = await q('UPDATE insumos SET stock = stock + $1::numeric WHERE id = $2 RETURNING stock', [firmado, datos.insumo_id]);
      await q(
        'INSERT INTO movimientos_insumo (insumo_id, tipo, cantidad, motivo, creado_por) VALUES ($1, $2, $3, $4, $5)',
        [datos.insumo_id, datos.tipo, firmado, motivo, admin.id],
      );
      await auditar(q, 'stock_movido', 'insumo', { entidadId: datos.insumo_id, adminId: admin.id, detalle: datos.tipo });
      return { stock: fila.stock };
    }
    if (datos.accion === 'crear_equipo') {
      const mantenimiento = datos.proximo_mantenimiento ? fecha(datos, 'proximo_mantenimiento') : null;
      const sala = esId(datos.sala_id) ? datos.sala_id : null;
      const filas = await q(
        'INSERT INTO equipos (nombre, tipo, sala_id, proximo_mantenimiento) VALUES ($1, $2, $3, $4) RETURNING id',
        [texto(datos, 'nombre', 120), texto(datos, 'tipo', 60), sala, mantenimiento],
      );
      await auditar(q, 'equipo_creado', 'equipo', { entidadId: filas[0].id, adminId: admin.id });
      return { id: filas[0].id };
    }
    throw new ErrorHttp(422, 'Pedido inválido.');
  });
  return json(200, respuesta);
}
