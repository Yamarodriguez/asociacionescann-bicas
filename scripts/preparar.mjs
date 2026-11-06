// Prepara el proyecto: crea .env con secretos aleatorios y el entorno de Python.
// Nunca sobrescribe un .env existente.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PYTHON } from './_comun.mjs';

const s = (n = 32) => randomBytes(n).toString('hex');

if (existsSync('.env')) {
  console.log('.env ya existe: no se cambia.');
} else {
  const clave = s(16);
  const puerto = 54329;
  writeFileSync('.env', [
    'ENTORNO=desarrollo',
    'PUERTO=8080',
    `PG_LOCAL_PUERTO=${puerto}`,
    `PG_LOCAL_CLAVE=${clave}`,
    `DATABASE_URL=postgresql://asociacion:${clave}@127.0.0.1:${puerto}/asociacion_dev`,
    `DATABASE_URL_PRUEBAS=postgresql://asociacion:${clave}@127.0.0.1:${puerto}/asociacion_pruebas`,
    `SESION_SECRETO_SOCIOS=${s()}`,
    `SESION_SECRETO_ADMINS=${s()}`,
    `HUELLAS_SECRETO=${s()}`,
    'CORREO_MODO=archivo',
    '',
  ].join('\n'), { mode: 0o600 });
  console.log('.env creado con secretos nuevos.');
}

// Anade los secretos nuevos a un .env anterior sin tocar los que ya existen.
const actual = readFileSync('.env', 'utf8');
for (const nombre of ['TOTP_CLAVE', 'COPIA_CLAVE']) {
  if (!new RegExp(`^${nombre}=`, 'm').test(actual)) {
    appendFileSync('.env', `${nombre}=${s()}\n`);
    console.log(`${nombre} añadida a .env.`);
  }
}

if (!existsSync(PYTHON)) {
  console.log('Creando el entorno de Python...');
  const crear = spawnSync('python', ['-m', 'venv', '.venv'], { stdio: 'inherit' });
  if (crear.status !== 0) process.exit(1);
}
const instalar = spawnSync(
  PYTHON,
  ['-m', 'pip', 'install', '-q', '--disable-pip-version-check', '-r', 'herramientas/requirements.txt'],
  { stdio: 'inherit' },
);
process.exit(instalar.status ?? 1);
