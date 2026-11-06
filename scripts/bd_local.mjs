// Arranca una base de datos PostgreSQL local, solo para desarrollo.
// Los datos quedan en .dev/pg, fuera de Git.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, readFileSync } from 'node:fs';

function leerEnv() {
  const env = {};
  for (const linea of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = leerEnv();
const dir = '.dev/pg';
let parando = false;
const nuevo = !existsSync(`${dir}/PG_VERSION`);
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'asociacion',
  password: env.PG_LOCAL_CLAVE,
  port: Number(env.PG_LOCAL_PUERTO),
  persistent: true,
  onLog: () => {},
  onError: (e) => { if (!parando) console.error(String(e)); },
});

if (nuevo) await pg.initialise();
await pg.start();
for (const nombre of ['asociacion_dev', 'asociacion_pruebas']) {
  try { await pg.createDatabase(nombre); } catch { /* ya existe */ }
}
console.log(`BASE DE DATOS LISTA en el puerto ${env.PG_LOCAL_PUERTO}`);

const parar = async () => { parando = true; await pg.stop(); process.exit(0); };
process.on('SIGINT', parar);
process.on('SIGTERM', parar);
process.on('message', (m) => { if (m === 'parar') parar(); });
// Si se cierra de golpe el programa que la lanzo, la base se para tambien.
process.on('disconnect', parar);
setInterval(() => {}, 1 << 30);
