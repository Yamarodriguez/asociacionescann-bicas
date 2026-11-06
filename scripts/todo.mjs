// npm run todo: comprueba todo y se para en el primer fallo.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { arrancarBd, PYTHON } from './_comun.mjs';

const informe = [];

function paso(nombre, comando, argumentos) {
  console.log(`\n== ${nombre}`);
  const resultado = spawnSync(comando, argumentos, {
    encoding: 'utf8',
    timeout: 180000,
    env: { ...process.env, PYTHONUTF8: '1' },
  });
  const salida = `${resultado.stdout ?? ''}${resultado.stderr ?? ''}${resultado.error ? `\n${resultado.error.message}` : ''}`;
  console.log(salida.trim());
  informe.push(`== ${nombre}\n${salida}`);
  return resultado.status === 0;
}

function terminar(codigo, ultimaLinea) {
  console.log(`\n${ultimaLinea}`);
  informe.push(ultimaLinea);
  mkdirSync('informes', { recursive: true });
  const fecha = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(`informes/todo-${fecha}.txt`, informe.join('\n'));
  process.exit(codigo);
}

const pasosSinBd = [
  ['Sintaxis de Python', PYTHON, ['-m', 'compileall', '-q', 'api', 'servidor.py', 'scripts', 'pruebas']],
  ['Validador de pantallas y palabras', PYTHON, ['-m', 'scripts.validar']],
];

for (const [nombre, comando, argumentos] of pasosSinBd) {
  if (!paso(nombre, comando, argumentos)) terminar(1, `SE HA PARADO EN: ${nombre}`);
}

const nombreBd = 'Arrancar la base de datos local';
let pararBd;
try {
  pararBd = await arrancarBd();
} catch (error) {
  informe.push(String(error));
  terminar(1, `SE HA PARADO EN: ${nombreBd}`);
}
const nombrePruebas = 'Pruebas de funciones y permisos';
const correcto = paso(nombrePruebas, PYTHON, ['-m', 'unittest', 'discover', '-s', 'pruebas', '-t', '.', '-v']);
if (!correcto) {
  if (pararBd) await pararBd();
  terminar(1, `SE HA PARADO EN: ${nombrePruebas}`);
}
const nombreCopia = 'Copia y restauración real';
const copiaCorrecta = paso(nombreCopia, PYTHON, ['-m', 'scripts.copia', 'probar']);
if (pararBd) await pararBd();
if (!copiaCorrecta) terminar(1, `SE HA PARADO EN: ${nombreCopia}`);
terminar(0, 'TODO CORRECTO: 0 fallos');
