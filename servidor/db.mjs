// Conexion a PostgreSQL. Todo el SQL va parametrizado.
import pg from 'pg';

// Enteros grandes como numeros y fechas como texto, sin cambios de zona horaria.
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1082, (valor) => valor);

let pool = null;

async function urlBase() {
  if (process.env.DATABASE_URL_ACTIVA) return process.env.DATABASE_URL_ACTIVA;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { getConnectionString } = await import('@netlify/database');
  return getConnectionString();
}

async function obtenerPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: await urlBase(),
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
    // Un corte de la conexion inactiva no debe tumbar la funcion.
    pool.on('error', () => {});
  }
  return pool;
}

export async function cerrarPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Abre una transaccion: confirma al terminar y deshace si hay error.
export async function transaccion(funcion) {
  const cliente = await (await obtenerPool()).connect();
  const consulta = async (sql, parametros = []) => (await cliente.query(sql, parametros)).rows;
  try {
    await cliente.query('BEGIN');
    const resultado = await funcion(consulta);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}

export async function configuracion(q, clave) {
  const filas = await q('SELECT valor FROM configuracion WHERE clave = $1', [clave]);
  if (!filas.length) throw new Error('Falta una clave de configuracion');
  return filas[0].valor;
}

export async function auditar(q, accion, entidad, { entidadId = null, adminId = null, socioId = null, detalle = null } = {}) {
  await q(
    'INSERT INTO auditoria (admin_id, socio_id, accion, entidad, entidad_id, detalle) VALUES ($1, $2, $3, $4, $5, $6)',
    [adminId, socioId, accion, entidad, entidadId, detalle],
  );
}
