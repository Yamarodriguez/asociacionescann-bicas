// Caja, presupuesto y mora. Los movimientos no se borran: se anulan con motivo.
import { auditar, configuracion, transaccion } from './db.mjs';
import { ErrorHttp, archivo, exigirSesion, json, leerJson } from './http.mjs';
import { celdaCsv, entero, esId, fecha, numero, opcion, positivo, texto } from './validar.mjs';

const VE = ['comision_directiva', 'tesoreria'];
const COMISION = ['comision_directiva'];
const TIPOS = ['ingreso', 'gasto'];
const METODOS = ['efectivo', 'transferencia'];
const COLUMNAS_CSV = ['fecha', 'tipo', 'categoria', 'concepto', 'importe', 'metodo', 'anulado_en'];

const hoyEnBase = async (q) => (await q('SELECT current_date::text AS hoy'))[0].hoy;

async function exigirDiaAbierto(q, dia) {
  const filas = await q('SELECT 1 FROM cierres_caja WHERE fecha = $1', [dia]);
  if (filas.length) throw new ErrorHttp(409, 'Ese día de caja ya está cerrado.');
}

// Una sola entrada para que la caja no dependa de cargar nada dos veces.
export async function asentarEnCaja(q, adminId, movimiento) {
  const { dia, tipo, categoria, concepto, importe, metodo, cuotaId = null } = movimiento;
  await exigirDiaAbierto(q, dia);
  const [{ id }] = await q(
    `INSERT INTO movimientos_caja (fecha, tipo, categoria, concepto, importe, metodo, cuota_id, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [dia, tipo, categoria, concepto, importe, metodo, cuotaId, adminId],
  );
  return id;
}

async function cajaDelDia(q, dia) {
  const [fila] = await q(
    `SELECT coalesce(sum(CASE WHEN tipo = 'ingreso' THEN importe ELSE -importe END)
       FILTER (WHERE metodo = 'efectivo' AND fecha <= $1), 0) AS efectivo,
     coalesce(sum(importe) FILTER (WHERE tipo = 'ingreso' AND fecha = $1), 0) AS ingresos,
     coalesce(sum(importe) FILTER (WHERE tipo = 'gasto' AND fecha = $1), 0) AS gastos
     FROM movimientos_caja WHERE anulado_en IS NULL`, [dia],
  );
  return fila;
}

export async function ver(c) {
  await exigirSesion(c, 'admin', { roles: VE });
  const pedido = c.url.searchParams.get('anio');
  const datos = await transaccion(async (q) => {
    const hoy = await hoyEnBase(q);
    const anio = pedido === null ? Number(hoy.slice(0, 4)) : Number(pedido);
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new ErrorHttp(422, 'Revisá el año.');
    return {
      hoy,
      anio,
      caja: await cajaDelDia(q, hoy),
      cerrado_hoy: (await q('SELECT 1 FROM cierres_caja WHERE fecha = $1', [hoy])).length > 0,
      movimientos: await q(
        `SELECT id, fecha, tipo, categoria, concepto, importe, metodo, cuota_id, anulado_en, anulado_motivo
         FROM movimientos_caja ORDER BY fecha DESC, id DESC LIMIT 100`,
      ),
      cierres: await q('SELECT fecha, esperado, contado, contado - esperado AS diferencia, notas FROM cierres_caja ORDER BY fecha DESC LIMIT 30'),
      presupuesto: await q(
        `WITH reales AS (
           SELECT tipo, categoria, sum(importe) AS real FROM movimientos_caja
           WHERE anulado_en IS NULL AND extract(year FROM fecha) = $1 GROUP BY tipo, categoria)
         SELECT coalesce(p.tipo, r.tipo) AS tipo, coalesce(p.categoria, r.categoria) AS categoria,
         coalesce(p.importe, 0) AS previsto, coalesce(r.real, 0) AS real
         FROM (SELECT * FROM presupuestos WHERE anio = $1) p
         FULL JOIN reales r ON r.tipo = p.tipo AND r.categoria = p.categoria ORDER BY 1, 2`, [anio],
      ),
    };
  });
  return json(200, datos);
}

const ACCIONES = {
  async movimiento(q, admin, datos) {
    const dia = fecha(datos, 'fecha');
    const id = await asentarEnCaja(q, admin.id, {
      dia,
      tipo: opcion(datos, 'tipo', TIPOS),
      categoria: texto(datos, 'categoria', 60),
      concepto: texto(datos, 'concepto', 200),
      importe: positivo(datos, 'importe'),
      metodo: opcion(datos, 'metodo', METODOS),
    });
    await auditar(q, 'caja_movimiento', 'caja', { entidadId: id, adminId: admin.id });
    return { id };
  },
  async anular(q, admin, datos) {
    if (!esId(datos.id)) throw new ErrorHttp(422, 'Pedido inválido.');
    const motivo = texto(datos, 'motivo', 300);
    const [fila] = await q('SELECT fecha::text AS fecha, cuota_id, anulado_en FROM movimientos_caja WHERE id = $1 FOR UPDATE', [datos.id]);
    if (!fila) throw new ErrorHttp(404, 'No encontrado.');
    if (fila.anulado_en) throw new ErrorHttp(409, 'Ese movimiento ya está anulado.');
    if (fila.cuota_id) throw new ErrorHttp(409, 'Un ingreso de cuota no se anula desde la caja.');
    await exigirDiaAbierto(q, fila.fecha);
    await q(
      'UPDATE movimientos_caja SET anulado_en = now(), anulado_por = $1, anulado_motivo = $2 WHERE id = $3',
      [admin.id, motivo, datos.id],
    );
    await auditar(q, 'caja_anulacion', 'caja', { entidadId: datos.id, adminId: admin.id });
    return { ok: true };
  },
  async cerrar(q, admin, datos) {
    const dia = fecha(datos, 'fecha');
    const contado = numero(datos, 'contado', { obligatorio: true, maximo: 1e12 });
    if (dia > await hoyEnBase(q)) throw new ErrorHttp(409, 'No se puede cerrar un día que no llegó.');
    await exigirDiaAbierto(q, dia);
    const { efectivo } = await cajaDelDia(q, dia);
    await q(
      'INSERT INTO cierres_caja (fecha, esperado, contado, notas, creado_por) VALUES ($1, $2, $3, $4, $5)',
      [dia, efectivo, contado, texto(datos, 'notas', 300, false), admin.id],
    );
    await auditar(q, 'caja_cierre', 'caja', { adminId: admin.id, detalle: dia });
    return { esperado: efectivo, diferencia: (Number(contado) - Number(efectivo)).toFixed(2) };
  },
  async presupuesto(q, admin, datos) {
    await q(
      `INSERT INTO presupuestos (anio, tipo, categoria, importe) VALUES ($1, $2, $3, $4)
       ON CONFLICT (anio, tipo, categoria) DO UPDATE SET importe = EXCLUDED.importe`,
      [entero(datos, 'anio', 2000, 2100), opcion(datos, 'tipo', TIPOS), texto(datos, 'categoria', 60),
        numero(datos, 'importe', { obligatorio: true, maximo: 1e12 })],
    );
    await auditar(q, 'presupuesto_cambiado', 'caja', { adminId: admin.id });
    return { ok: true };
  },
};

export async function accion(c) {
  const admin = await exigirSesion(c, 'admin', { roles: VE, csrf: true });
  const datos = leerJson(c);
  if (!Object.hasOwn(ACCIONES, datos.accion ?? '')) throw new ErrorHttp(422, 'Pedido inválido.');
  return json(200, await transaccion((q) => ACCIONES[datos.accion](q, admin, datos)));
}

export async function csv(c) {
  const admin = await exigirSesion(c, 'admin', { roles: VE });
  const filas = await transaccion(async (q) => {
    const resultado = await q(
      `SELECT fecha, tipo, categoria, concepto, importe, metodo, anulado_en FROM movimientos_caja
       ORDER BY fecha, id`,
    );
    await auditar(q, 'caja_exportada', 'caja', { adminId: admin.id });
    return resultado;
  });
  const lineas = [COLUMNAS_CSV.join(';'), ...filas.map((f) => COLUMNAS_CSV.map((k) => celdaCsv(f[k])).join(';'))];
  return archivo(`﻿${lineas.join('\r\n')}\r\n`, 'text/csv; charset=utf-8', 'caja.csv');
}

const EN_MORA = `SELECT id, numero_socio, nombre, apellido, cuota_vigente_hasta, meses FROM (
    SELECT id, numero_socio, nombre, apellido, cuota_vigente_hasta,
    (extract(year FROM age(current_date, coalesce(cuota_vigente_hasta, alta_en::date))) * 12
     + extract(month FROM age(current_date, coalesce(cuota_vigente_hasta, alta_en::date))))::int AS meses
    FROM socios WHERE estado = 'activo'
    AND (cuota_vigente_hasta IS NULL OR cuota_vigente_hasta < current_date)) atrasos`;

const CONTAR_MORA = 'SELECT count(*) AS total FROM (' + EN_MORA + ') m WHERE meses >= $1';
const LISTAR_MORA = EN_MORA + ' ORDER BY meses DESC, numero_socio LIMIT 1000';

export async function contarMora(q) {
  const limite = Number(await configuracion(q, 'mora_suspension_meses'));
  if (!limite) return 0;
  const [{ total }] = await q(CONTAR_MORA, [limite]);
  return total;
}

export async function verMora(c) {
  await exigirSesion(c, 'admin', { roles: VE });
  const datos = await transaccion(async (q) => ({
    limite: Number(await configuracion(q, 'mora_suspension_meses')),
    socios: await q(LISTAR_MORA),
  }));
  return json(200, datos);
}

// Lo decide la comision: el sistema propone, no suspende por su cuenta.
export async function accionMora(c) {
  const admin = await exigirSesion(c, 'admin', { roles: COMISION, csrf: true });
  const datos = leerJson(c);
  if (datos.accion !== 'suspender') throw new ErrorHttp(422, 'Pedido inválido.');
  const suspendidos = await transaccion(async (q) => {
    const limite = Number(await configuracion(q, 'mora_suspension_meses'));
    if (!limite) throw new ErrorHttp(409, 'Primero fijá los meses de atraso en la configuración.');
    const filas = await q(EN_MORA);
    const afectados = filas.filter((fila) => fila.meses >= limite);
    for (const { id } of afectados) {
      await q("UPDATE socios SET estado = 'suspendido' WHERE id = $1 AND estado = 'activo'", [id]);
      await auditar(q, 'socio_suspendido', 'socio', { entidadId: id, adminId: admin.id, detalle: 'mora' });
    }
    return afectados.length;
  });
  return json(200, { suspendidos });
}
