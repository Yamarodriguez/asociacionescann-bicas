// Genera las tres direcciones de diseno sobre la misma pantalla y comprueba el contraste.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DIRECCIONES = {
  a: {
    nombre: 'Institución cercana',
    fuentes: [
      ['Titulos', 'fraunces.woff2', '100 900'],
      ['Cuerpo', 'dm-sans.woff2', '100 1000'],
    ],
    color: {
      ink: '#18261f', paper: '#f3efe6', card: '#fcfaf5', principal: '#2f6b4f',
      deep: '#1f4e39', accent: '#b7862f', line: '#ddd6c6', muted: '#5f645a',
    },
    disposicion: `
      .portada { text-align: center; padding: 4.5rem 1.5rem 3.5rem; }
      .portada p { margin-inline: auto; }
      .bloques { grid-template-columns: repeat(3, 1fr); gap: 1rem; }
      .bloque { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 1.5rem; }
      .bloque h2 { padding-bottom: .625rem; border-bottom: 2px solid var(--accent); }
      h1 { font-weight: 500; }
    `,
  },
  b: {
    nombre: 'Rigor sanitario',
    fuentes: [
      ['Titulos', 'ibm-plex-serif-600.woff2', '600'],
      ['Cuerpo', 'ibm-plex-sans-400.woff2', '400'],
      ['Cuerpo', 'ibm-plex-sans-600.woff2', '600'],
    ],
    color: {
      ink: '#16252b', paper: '#ffffff', card: '#f2f6f7', principal: '#17505c',
      deep: '#0f3a43', accent: '#2c7a7b', line: '#d3dde0', muted: '#4f5f67',
    },
    disposicion: `
      .barra { border-bottom: 1px solid var(--line); }
      .portada { background: var(--card); border-bottom: 1px solid var(--line); padding: 3.5rem 0; }
      .portada > * { max-width: 62rem; margin-inline: auto; padding-inline: 1.5rem; }
      .bloques { grid-template-columns: repeat(3, 1fr); gap: 2.5rem; }
      .bloque { border-top: 3px solid var(--principal); padding-top: 1rem; }
      .aviso { border-radius: 0; }
      .boton { border-radius: 4px; }
    `,
  },
  m: {
    nombre: 'Mezcla de A y B',
    fuentes: [
      ['Titulos', 'fraunces.woff2', '100 900'],
      ['Cuerpo', 'ibm-plex-sans-400.woff2', '400'],
      ['Cuerpo', 'ibm-plex-sans-600.woff2', '600'],
    ],
    color: {
      ink: '#16252b', paper: '#fbf9f4', card: '#ffffff', principal: '#17505c',
      deep: '#0f3a43', accent: '#b7862f', line: '#ded9cd', muted: '#55605f',
    },
    disposicion: `
      .barra { border-bottom: 1px solid var(--line); }
      .portada { padding: 3.5rem 0; }
      .portada > * { max-width: 62rem; margin-inline: auto; padding-inline: 1.5rem; }
      .bloques { grid-template-columns: repeat(3, 1fr); gap: 2.5rem; }
      .bloque { border-top: 2px solid var(--accent); padding-top: 1rem; }
      h1 { font-weight: 500; }
      h2 { font-weight: 600; }
    `,
  },
  c: {
    nombre: 'Comunidad editorial',
    fuentes: [
      ['Titulos', 'newsreader.woff2', '200 800'],
      ['Cuerpo', 'public-sans.woff2', '100 900'],
    ],
    color: {
      ink: '#211a17', paper: '#fbf8f3', card: '#ffffff', principal: '#8f3b24',
      deep: '#6f2c1a', accent: '#c98a2b', line: '#e3d9cc', muted: '#665a52',
    },
    disposicion: `
      .portada { display: grid; grid-template-columns: 3fr 2fr; gap: 3rem; align-items: end;
        max-width: 62rem; margin: 0 auto; padding: 4.5rem 1.5rem 3rem; }
      .portada h1 { font-size: clamp(2.75rem, 6vw, 4.5rem); font-weight: 400; margin: 0; }
      .portada p { margin: 0; padding-left: 1.25rem; border-left: 3px solid var(--principal); }
      .bloques { grid-template-columns: 1fr; gap: 0; }
      .bloque { display: grid; grid-template-columns: 1fr 2fr; gap: 2rem; padding: 1.5rem 0; border-top: 1px solid var(--line); }
      .bloque h2 { margin: 0; }
      @media (max-width: 700px) {
        .portada { grid-template-columns: 1fr; gap: 1.5rem; padding-top: 2.5rem; }
        .bloque { grid-template-columns: 1fr; gap: .5rem; }
      }
    `,
  },
};

const pagina = (clave, d) => `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Dirección ${clave.toUpperCase()}: ${d.nombre}</title>
<style>
${d.fuentes.map(([familia, archivo, peso]) => `@font-face { font-family: ${familia}; src: url(fuentes/${archivo}) format("woff2"); font-weight: ${peso}; font-display: swap; }`).join('\n')}
:root { ${Object.entries(d.color).map(([k, v]) => `--${k}: ${v};`).join(' ')} }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: Cuerpo, system-ui, sans-serif; font-size: 1.0625rem; line-height: 1.6; }
h1, h2 { font-family: Titulos, Georgia, serif; line-height: 1.15; color: var(--ink); }
h1 { font-size: clamp(2.25rem, 5vw, 3.5rem); margin: 0 0 1rem; }
h2 { font-size: 1.375rem; margin: 0 0 .75rem; }
p { margin: 0; max-width: 34rem; }
.prototipo { background: var(--deep); color: #fff; text-align: center; font-size: .875rem; padding: .375rem 1rem; max-width: none; }
.barra { display: flex; justify-content: space-between; align-items: center; gap: 1rem; max-width: 62rem; margin: 0 auto; padding: 1rem 1.5rem; }
.marca { font-family: Titulos, Georgia, serif; font-size: 1.125rem; }
.boton { display: inline-flex; align-items: center; min-height: 44px; padding: .5rem 1.125rem; background: var(--principal); color: #fff; border-radius: 6px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.portada p { color: var(--muted); }
.contenido { max-width: 62rem; margin: 0 auto; padding: 2rem 1.5rem 3rem; }
.bloques { display: grid; }
.bloque p { color: var(--muted); }
.aviso { margin-top: 2rem; padding: 1rem 1.25rem; border-radius: 8px; background: var(--deep); color: #fff; }
.aviso p { max-width: none; }
@media (max-width: 700px) { .bloques { grid-template-columns: 1fr !important; } .barra { padding: .75rem 1rem; } .contenido { padding-inline: 1rem; } .portada { padding-inline: 1rem !important; } }
${d.disposicion}
</style>
</head>
<body>
<p class="prototipo">Prototipo: propuesta de diseño, sin datos reales.</p>
<header class="barra">
  <span class="marca">[Nombre de la asociación]</span>
  <a class="boton" href="#">Acceso socios</a>
</header>
<section class="portada">
  <h1>[Nombre de la asociación]</h1>
  <p>Acá va la presentación que apruebe la asociación, con sus fines según los estatutos.</p>
</section>
<main class="contenido">
  <div class="bloques">
    <section class="bloque"><h2>Quiénes somos</h2><p>Forma jurídica, número de registro y fines.</p></section>
    <section class="bloque"><h2>Requisitos para asociarse</h2><p>Condiciones y pasos para solicitar el alta.</p></section>
    <section class="bloque"><h2>Horario y contacto</h2><p>Dirección, horario y formulario de contacto.</p></section>
  </div>
  <div class="aviso"><p>Solo para mayores de la edad mínima. Acceso exclusivo para socios. Consumo responsable.</p></div>
</main>
</body>
</html>
`;

const FILAS = [
  ['Ana Prueba', 'DNI 99000001', 'pendiente', '—', true],
  ['Bruno Prueba', 'DNI 99000002', 'pendiente', '—', true],
  ['Carla Prueba', 'DNI 99000003', 'activo', '1', false],
  ['Diego Prueba', 'DNI 99000004', 'activo', '2', false],
  ['Elena Prueba', 'DNI 99000005', 'suspendido', '3', false],
];

const panel = (clave, d) => {
  const base = pagina(clave, d);
  const estilos = `
.panel { max-width: 62rem; margin: 0 auto; padding: 1.5rem; }
.panel h1 { font-size: 2rem; margin: 0 0 1rem; }
.resumen { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
.dato { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: .75rem 1rem; }
.dato strong { display: block; font-family: Titulos, Georgia, serif; font-size: 1.75rem; line-height: 1.2; }
.dato span { color: var(--muted); font-size: .9375rem; }
.lista { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: .25rem 1rem; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; color: var(--muted); font-size: .875rem; font-weight: 600; }
th, td { padding: .75rem .5rem; border-bottom: 1px solid var(--line); vertical-align: middle; }
tr:last-child td { border-bottom: 0; }
.etiqueta { display: inline-block; padding: .125rem .625rem; border: 1px solid var(--line); border-radius: 999px; font-size: .875rem; }
.etiqueta.pendiente { background: var(--deep); border-color: var(--deep); color: #fff; }
.boton.chico { padding: .375rem .875rem; }
@media (max-width: 700px) {
  .panel { padding: 1rem; }
  .resumen { gap: .5rem; }
  .dato { padding: .5rem .625rem; }
  thead { display: none; }
  table, tbody, tr, td { display: block; }
  tr { border-bottom: 1px solid var(--line); padding: .625rem 0; }
  tr:last-child { border-bottom: 0; }
  td { border: 0; padding: .1875rem 0; }
  td:first-child { font-weight: 600; }
  .boton.chico { display: flex; justify-content: center; margin-top: .375rem; }
}`;
  const contenido = `<main class="panel">
  <h1>Socios</h1>
  <div class="resumen">
    <div class="dato"><strong>2</strong><span>Pendientes</span></div>
    <div class="dato"><strong>2</strong><span>Activos</span></div>
    <div class="dato"><strong>1</strong><span>Suspendidos</span></div>
  </div>
  <div class="lista"><table>
    <thead><tr><th>Nombre</th><th>Documento</th><th>Estado</th><th>Número</th><th>Acción</th></tr></thead>
    <tbody>${FILAS.map(([nombre, documento, estado, numero, accion]) => `<tr><td>${nombre}</td><td>${documento}</td><td><span class="etiqueta ${estado}">${estado}</span></td><td>${numero}</td><td>${accion ? '<a class="boton chico" href="#">Aprobar</a>' : ''}</td></tr>`).join('')}</tbody>
  </table></div>
</main>`;
  return base
    .replace('</style>', `${estilos}\n</style>`)
    .replace(/<section class="portada">[\s\S]*<\/main>/, contenido)
    .replace('<a class="boton" href="#">Acceso socios</a>', '<a class="boton" href="#">Salir</a>')
    .replace('Prototipo: propuesta de diseño, sin datos reales.', 'Prototipo: todos los datos son inventados.');
};

const marco = (clave, d, archivo = `direccion-${clave}`) => `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8"><title>Marco ${clave}</title>
<style>
body { margin: 0; padding: 24px; background: #3b3f42; display: flex; gap: 24px; align-items: flex-start; }
iframe { border: 0; background: #fff; display: block; }
</style></head>
<body>
<iframe src="${archivo}.html" width="1040" height="900" title="Ordenador"></iframe>
<iframe src="${archivo}.html" width="375" height="900" title="Móvil"></iframe>
</body></html>
`;

function luminancia(hex) {
  const canales = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2];
}

function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const navegador = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const perfil = process.env.PERFIL_CAPTURAS;
const base = resolve('diseno');
mkdirSync('diseno/capturas', { recursive: true });
let fallos = 0;

for (const [clave, d] of Object.entries(DIRECCIONES)) {
  writeFileSync(`diseno/direccion-${clave}.html`, pagina(clave, d));
  writeFileSync(`diseno/.marco-direccion-${clave}.html`, marco(clave, d));
  writeFileSync(`diseno/panel-${clave}.html`, panel(clave, d));
  writeFileSync(`diseno/.marco-panel-${clave}.html`, marco(clave, d, `panel-${clave}`));
  const c = d.color;
  const pares = [
    ['texto sobre fondo', c.ink, c.paper], ['texto sobre tarjeta', c.ink, c.card],
    ['secundario sobre fondo', c.muted, c.paper], ['secundario sobre tarjeta', c.muted, c.card],
    ['blanco sobre botón', '#ffffff', c.principal], ['blanco sobre aviso', '#ffffff', c.deep],
  ];
  for (const [nombre, x, y] of pares) {
    const valor = contraste(x, y);
    const correcto = valor >= 4.5;
    if (!correcto) fallos += 1;
    console.log(`${clave.toUpperCase()} ${correcto ? 'ok   ' : 'FALLO'} ${valor.toFixed(2)} ${nombre}`);
  }
  for (const tipo of perfil ? ['direccion', 'panel'] : []) {
    const salida = spawnSync(navegador, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${perfil}`,
      '--force-device-scale-factor=1', '--window-size=1488,948', '--virtual-time-budget=4000',
      '--allow-file-access-from-files', `--screenshot=${base}/capturas/${tipo}-${clave}.png`,
      `file:///${base.replaceAll('\\', '/')}/.marco-${tipo}-${clave}.html`,
    ], { encoding: 'utf8', timeout: 60000 });
    if (salida.status !== 0) console.log(`Captura ${tipo}-${clave}: fallo ${salida.status}`);
  }
}
console.log(`${fallos} fallos de contraste`);
process.exit(fallos ? 1 : 0);
