// Prepara el proyecto: crea .env con secretos aleatorios y el entorno de Python.
// Nunca sobrescribe un .env existente.
import { existsSync, writeFileSync } from 'node:fs';
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
    `MIGRATE_SECRET=${s()}`,
    'CORREO_MODO=archivo',
    'SMTP_HOST=',
    'SMTP_PUERTO=587',
    'SMTP_USUARIO=',
    'SMTP_CLAVE=',
    'SMTP_REMITENTE=',
    '',
  ].join('\n'), { mode: 0o600 });
  console.log('.env creado con secretos nuevos.');
}

if (!existsSync(PYTHON)) {
  console.log('Creando el entorno de Python...');
  const crear = spawnSync('python', ['-m', 'venv', '.venv'], { stdio: 'inherit' });
  if (crear.status !== 0) process.exit(1);
}
const instalar = spawnSync(
  PYTHON,
  ['-m', 'pip', 'install', '-q', '--disable-pip-version-check', '-r', 'requirements.txt'],
  { stdio: 'inherit' },
);
process.exit(instalar.status ?? 1);
