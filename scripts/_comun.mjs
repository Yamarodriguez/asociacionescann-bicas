// Funciones compartidas por los scripts de desarrollo.
import { fork, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

export const PYTHON = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';

export function leerEnv() {
  const env = {};
  for (const linea of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function bdResponde(env) {
  const cliente = new pg.Client({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
  });
  try {
    await cliente.connect();
    await cliente.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await cliente.end().catch(() => {});
  }
}

// Si un cierre brusco dejo una base huerfana que ya no responde, la para.
function pararHuerfana() {
  if (!existsSync('.dev/pg/postmaster.pid')) return;
  const sistema = process.platform === 'win32' ? 'windows' : process.platform;
  const binario = process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl';
  const ruta = join('node_modules', '@embedded-postgres', `${sistema}-x64`, 'native', 'bin', binario);
  spawnSync(ruta, ['stop', '-D', '.dev/pg', '-m', 'immediate', '-t', '15'], { stdio: 'ignore' });
}

// Arranca la base de datos local si no esta en marcha.
// Devuelve una funcion para pararla, o null si ya estaba arrancada.
export async function arrancarBd() {
  if (await bdResponde(leerEnv())) return null;
  pararHuerfana();
  const hijo = fork('scripts/bd_local.mjs', { silent: true });
  await new Promise((resolver, rechazar) => {
    const limite = setTimeout(() => rechazar(new Error('La base de datos no arrancó a tiempo.')), 90000);
    hijo.stdout.on('data', (datos) => {
      if (String(datos).includes('BASE DE DATOS LISTA')) { clearTimeout(limite); resolver(); }
    });
    hijo.stderr.on('data', (datos) => console.error(String(datos)));
    hijo.once('exit', () => { clearTimeout(limite); rechazar(new Error('La base de datos se cerró.')); });
  });
  return () => new Promise((resolver) => {
    hijo.once('exit', resolver);
    hijo.send('parar');
  });
}
