// Servidor para desarrollo y pruebas: imita Netlify en este ordenador.
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { manejar } from '../servidor/app.mjs';
import { CABECERAS_SEGURIDAD } from '../servidor/http.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');

const WEB = resolve('web');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
};

async function estatico(ruta, salida) {
  let destino;
  try {
    destino = resolve(WEB, `.${decodeURIComponent(ruta === '/' ? '/index.html' : ruta)}`);
  } catch {
    destino = '';
  }
  const dentro = destino.startsWith(`${WEB}${sep}`) && TIPOS[extname(destino)];
  const archivo = dentro && (await stat(destino).catch(() => null))?.isFile();
  if (!archivo) {
    salida.writeHead(404, { ...CABECERAS_SEGURIDAD, 'Content-Type': 'application/json; charset=utf-8' });
    salida.end('{"error":"No encontrado."}');
    return;
  }
  const cache = extname(destino) === '.woff2' ? 'public, max-age=31536000, immutable' : 'no-cache';
  salida.writeHead(200, { ...CABECERAS_SEGURIDAD, 'Content-Type': TIPOS[extname(destino)], 'Cache-Control': cache });
  salida.end(await readFile(destino));
}

const servidor = createServer(async (entrada, salida) => {
  const url = new URL(entrada.url, `http://${entrada.headers.host}`);
  if (!url.pathname.startsWith('/api/')) {
    await estatico(url.pathname, salida);
    return;
  }
  const conCuerpo = entrada.method === 'POST';
  const request = new Request(url, {
    method: entrada.method,
    headers: Object.entries(entrada.headers).filter(([, v]) => typeof v === 'string'),
    body: conCuerpo ? Readable.toWeb(entrada) : undefined,
    duplex: conCuerpo ? 'half' : undefined,
  });
  const respuesta = await manejar(request, entrada.socket.remoteAddress);
  const cabeceras = Object.fromEntries(respuesta.headers);
  const galletas = respuesta.headers.getSetCookie();
  delete cabeceras['set-cookie'];
  if (galletas.length) cabeceras['set-cookie'] = galletas;
  if (respuesta.status === 413) cabeceras.connection = 'close';
  salida.writeHead(respuesta.status, cabeceras);
  salida.end(Buffer.from(await respuesta.arrayBuffer()));
});

servidor.requestTimeout = 30000;
const puerto = Number(process.env.PUERTO ?? 8080);
servidor.listen(puerto, '127.0.0.1', () => console.log(`SISTEMA LISTO en http://localhost:${puerto}`));
