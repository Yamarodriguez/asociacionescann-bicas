// Arranca el prototipo completo en este ordenador: npm run dev
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arrancarBd, PYTHON } from './_comun.mjs';
import { cerrarPool } from '../servidor/db.mjs';
import { CUENTAS, prepararDemo } from '../servidor/demo.mjs';

const CREDENCIALES = '.dev/credenciales_prueba.txt';

process.loadEnvFile('.env');
const pararBd = await arrancarBd();

const migrar = spawnSync(PYTHON, ['-m', 'herramientas.migrate'], { stdio: 'inherit' });
if (migrar.status !== 0) process.exit(1);

const clave = existsSync(CREDENCIALES)
  ? readFileSync(CREDENCIALES, 'utf8').split(/\r?\n/)[1]
  : randomBytes(12).toString('base64url');
await prepararDemo(clave);
await cerrarPool();
mkdirSync('.dev', { recursive: true });
writeFileSync(CREDENCIALES, ['Cuentas inventadas del prototipo. Todas usan la misma contraseña:', clave, '', ...CUENTAS, ''].join('\n'));

const servidor = spawn(process.execPath, ['scripts/servidor_local.mjs'], { stdio: 'inherit' });

let cerrando = false;
async function cerrar() {
  if (cerrando) return;
  cerrando = true;
  servidor.kill();
  if (pararBd) await pararBd();
  process.exit(0);
}
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
servidor.on('exit', cerrar);
