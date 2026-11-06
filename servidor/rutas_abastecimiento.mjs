// Proveedores y pedidos de insumos. Recibir un pedido suma el stock y deja su movimiento.
import { auditar, configuracion, transaccion } from './db.mjs';
import { ErrorHttp, exigirSesion, json, leerJson } from './http.mjs';
import { exigirModulo, moverStock } from './rutas_cultivo.mjs';
import { esId, numero, positivo, texto } from './validar.mjs';

const ROLES = ['comision_directiva', 'coordinador_cultivo'];
const MAXIMO_LINEAS = 100;

export async function ver(c) {
  await exigirModulo();
  await exigirSesion(c, 'admin', { roles: ROLES });
  const datos = await transaccion(async (q) => ({
    limite: Number(await configuracion(q, 'pedido_aprobacion_monto')),
    proveedores: await q('SELECT id, nombre, contacto FROM proveedores ORDER BY nombre LIMIT 300'),
    insumos: await q('SELECT id, nombre, unidad, stock <= stock_minimo AS bajo FROM insumos ORDER BY nombre LIMIT 500'),
    pedidos: await q(
      `SELECT p.id, p.estado, p.creado_en, v.nombre AS proveedor,
       coalesce(sum(l.cantidad * l.coste_unitario), 0)::numeric(14, 2) AS total, count(l.id) AS lineas,
       count(l.id) FILTER (WHERE l.coste_unitario = 0) AS sin_coste,
       (SELECT coalesce(json_agg(json_build_object('insumo_id', d.insumo_id, 'insumo', i.nombre, 'coste_unitario', d.coste_unitario)), '[]')
        FROM pedido_lineas d JOIN insumos i ON i.id = d.insumo_id WHERE d.pedido_id = p.id) AS detalle
       FROM pedidos_proveedor p JOIN proveedores v ON v.id = p.proveedor_id
       LEFT JOIN pedido_lineas l ON l.pedido_id = p.id
       GROUP BY p.id, v.nombre ORDER BY p.creado_en DESC, p.id DESC LIMIT 100`,
    ),
    costes: await q(
      `SELECT i.nombre AS insumo, i.unidad, v.nombre AS proveedor, l.coste_unitario, p.creado_en::date AS fecha
       FROM pedido_lineas l JOIN pedidos_proveedor p ON p.id = l.pedido_id JOIN insumos i ON i.id = l.insumo_id
       JOIN proveedores v ON v.id = p.proveedor_id WHERE p.estado <> 'cancelado'
       ORDER BY i.nombre, p.creado_en DESC LIMIT 200`,
    ),
  }));
  return json(200, datos);
}

async function exigirProveedor(q, id) {
  if (!esId(id)) throw new ErrorHttp(422, 'Elegí un proveedor.');
  const [proveedor] = await q('SELECT id FROM proveedores WHERE id = $1', [id]);
  if (!proveedor) throw new ErrorHttp(422, 'Elegí un proveedor.');
}

async function insertarLineas(q, pedido, lineas) {
  for (const linea of lineas) {
    await q(
      'INSERT INTO pedido_lineas (pedido_id, insumo_id, cantidad, coste_unitario) VALUES ($1, $2, $3, $4)',
      [pedido, linea.insumo_id, linea.cantidad, linea.coste_unitario],
    );
  }
}

async function pedidoBloqueado(q, id) {
  if (!esId(id)) throw new ErrorHttp(422, 'Pedido inválido.');
  const [pedido] = await q('SELECT id, estado FROM pedidos_proveedor WHERE id = $1 FOR UPDATE', [id]);
  if (!pedido) throw new ErrorHttp(404, 'No encontrado.');
  return pedido;
}

const ACCIONES = {
  async crear_proveedor(q, admin, datos) {
    const filas = await q(
      'INSERT INTO proveedores (nombre, contacto) VALUES ($1, $2) ON CONFLICT (nombre) DO NOTHING RETURNING id',
      [texto(datos, 'nombre', 120), texto(datos, 'contacto', 200, false)],
    );
    if (!filas.length) throw new ErrorHttp(409, 'Ya existe un proveedor con ese nombre.');
    await auditar(q, 'proveedor_creado', 'proveedor', { entidadId: filas[0].id, adminId: admin.id });
    return { id: filas[0].id };
  },
  async crear_pedido(q, admin, datos) {
    await exigirProveedor(q, datos.proveedor_id);
    if (!Array.isArray(datos.lineas) || !datos.lineas.length || datos.lineas.length > MAXIMO_LINEAS) {
      throw new ErrorHttp(422, 'Agregá al menos un insumo.');
    }
    const lineas = datos.lineas.map((linea) => {
      if (linea === null || typeof linea !== 'object' || !esId(linea.insumo_id)) throw new ErrorHttp(422, 'Elegí un insumo.');
      return {
        insumo_id: linea.insumo_id,
        cantidad: positivo(linea, 'cantidad', { maximo: 1e8 }),
        coste_unitario: numero(linea, 'coste_unitario', { obligatorio: true, maximo: 1e8 }),
      };
    });
    if (new Set(lineas.map((l) => l.insumo_id)).size !== lineas.length) throw new ErrorHttp(422, 'Hay un insumo repetido.');
    const ids = lineas.map((l) => l.insumo_id);
    const [{ total }] = await q('SELECT count(*) AS total FROM insumos WHERE id = ANY($1::bigint[])', [ids]);
    if (total !== ids.length) throw new ErrorHttp(422, 'Elegí un insumo.');
    const [{ id }] = await q(
      'INSERT INTO pedidos_proveedor (proveedor_id, creado_por) VALUES ($1, $2) RETURNING id', [datos.proveedor_id, admin.id],
    );
    await insertarLineas(q, id, lineas);
    await auditar(q, 'pedido_creado', 'pedido', { entidadId: id, adminId: admin.id });
    return { id };
  },
  // Borrador con todo lo que esta por debajo del minimo. El coste se completa al revisarlo.
  async borrador_faltantes(q, admin, datos) {
    await exigirProveedor(q, datos.proveedor_id);
    const faltantes = await q(
      `SELECT id AS insumo_id, greatest(stock_minimo * 2 - stock, 1)::numeric(12, 2) AS cantidad, '0' AS coste_unitario
       FROM insumos WHERE stock <= stock_minimo ORDER BY nombre LIMIT 100`,
    );
    if (!faltantes.length) throw new ErrorHttp(409, 'No hay insumos por reponer.');
    const [{ id }] = await q(
      'INSERT INTO pedidos_proveedor (proveedor_id, creado_por) VALUES ($1, $2) RETURNING id', [datos.proveedor_id, admin.id],
    );
    await insertarLineas(q, id, faltantes);
    await auditar(q, 'pedido_creado', 'pedido', { entidadId: id, adminId: admin.id, detalle: 'faltantes' });
    return { id, lineas: faltantes.length };
  },
  async costear(q, admin, datos) {
    const pedido = await pedidoBloqueado(q, datos.pedido_id);
    if (pedido.estado !== 'borrador') throw new ErrorHttp(409, 'Este pedido ya no está en borrador.');
    if (!esId(datos.insumo_id)) throw new ErrorHttp(422, 'Elegí un insumo.');
    const filas = await q(
      'UPDATE pedido_lineas SET coste_unitario = $1 WHERE pedido_id = $2 AND insumo_id = $3 RETURNING id',
      [numero(datos, 'coste_unitario', { obligatorio: true, maximo: 1e8 }), pedido.id, datos.insumo_id],
    );
    if (!filas.length) throw new ErrorHttp(404, 'No encontrado.');
    await auditar(q, 'pedido_costeado', 'pedido', { entidadId: pedido.id, adminId: admin.id });
    return { ok: true };
  },
  async aprobar(q, admin, datos) {
    const pedido = await pedidoBloqueado(q, datos.pedido_id);
    if (pedido.estado !== 'borrador') throw new ErrorHttp(409, 'Este pedido ya no está en borrador.');
    const [{ total, sin_coste: sinCoste }] = await q(
      `SELECT coalesce(sum(cantidad * coste_unitario), 0) AS total, count(*) FILTER (WHERE coste_unitario = 0) AS sin_coste
       FROM pedido_lineas WHERE pedido_id = $1`, [pedido.id],
    );
    // Sin este control, un pedido a coste cero se aprobaria sin pasar por la comision.
    if (sinCoste) throw new ErrorHttp(409, 'Falta el coste de algún insumo.');
    const limite = Number(await configuracion(q, 'pedido_aprobacion_monto'));
    if (admin.rol !== 'comision_directiva' && Number(total) > limite) {
      throw new ErrorHttp(403, 'Este pedido supera el monto: lo aprueba la comisión.');
    }
    await q(
      "UPDATE pedidos_proveedor SET estado = 'aprobado', aprobado_por = $1, aprobado_en = now() WHERE id = $2", [admin.id, pedido.id],
    );
    await auditar(q, 'pedido_aprobado', 'pedido', { entidadId: pedido.id, adminId: admin.id });
    return { estado: 'aprobado' };
  },
  async recibir(q, admin, datos) {
    const pedido = await pedidoBloqueado(q, datos.pedido_id);
    if (pedido.estado !== 'aprobado') throw new ErrorHttp(409, 'Solo se recibe un pedido aprobado.');
    const lineas = await q('SELECT insumo_id, cantidad FROM pedido_lineas WHERE pedido_id = $1 ORDER BY insumo_id', [pedido.id]);
    for (const linea of lineas) {
      await moverStock(q, admin.id, {
        insumoId: linea.insumo_id, tipo: 'ingreso', cantidad: linea.cantidad, baja: false, motivo: `Pedido ${pedido.id}`,
      });
    }
    await q("UPDATE pedidos_proveedor SET estado = 'recibido', recibido_en = now() WHERE id = $1", [pedido.id]);
    await auditar(q, 'pedido_recibido', 'pedido', { entidadId: pedido.id, adminId: admin.id });
    return { estado: 'recibido' };
  },
  async cancelar(q, admin, datos) {
    const pedido = await pedidoBloqueado(q, datos.pedido_id);
    if (!['borrador', 'aprobado'].includes(pedido.estado)) throw new ErrorHttp(409, 'Este pedido ya no se puede cancelar.');
    await q("UPDATE pedidos_proveedor SET estado = 'cancelado' WHERE id = $1", [pedido.id]);
    await auditar(q, 'pedido_cancelado', 'pedido', { entidadId: pedido.id, adminId: admin.id });
    return { estado: 'cancelado' };
  },
};

export async function accion(c) {
  await exigirModulo();
  const admin = await exigirSesion(c, 'admin', { roles: ROLES, csrf: true });
  const datos = leerJson(c);
  if (!Object.hasOwn(ACCIONES, datos.accion ?? '')) throw new ErrorHttp(422, 'Pedido inválido.');
  return json(200, await transaccion((q) => ACCIONES[datos.accion](q, admin, datos)));
}
