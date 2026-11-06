// Arranca el prototipo completo en este ordenador: npm run dev
import { spawn, spawnSync } from 'node:child_process';
import { arrancarBd, PYTHON } from './_comun.mjs';

const pararBd = await arrancarBd();

const migrar = spawnSync(PYTHON, ['-m', 'api.migrate'], { stdio: 'inherit' });
if (migrar.status !== 0) process.exit(1);
const datos = spawnSync(PYTHON, ['-m', 'scripts.datos_prueba'], { stdio: 'inherit' });
if (datos.status !== 0) process.exit(1);

const servidor = spawn(PYTHON, ['servidor.py'], { stdio: 'inherit' });

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
