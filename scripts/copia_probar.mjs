// npm run copia:probar: copia la base local, la restaura y compara el resultado.
import { spawnSync } from 'node:child_process';
import { arrancarBd, PYTHON } from './_comun.mjs';

const pararBd = await arrancarBd();
const resultado = spawnSync(PYTHON, ['-m', 'scripts.copia', 'probar'], {
  stdio: 'inherit',
  env: { ...process.env, PYTHONUTF8: '1' },
});
if (pararBd) await pararBd();
process.exit(resultado.status ?? 1);
