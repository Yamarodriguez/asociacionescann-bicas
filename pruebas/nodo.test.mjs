// Pruebas internas que no se pueden hacer desde fuera del servidor.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { describirError } from '../servidor/app.mjs';
import { PLANTILLAS } from '../servidor/correo.mjs';
import { codigoTotp, generarSecretoTotp, uriTotp } from '../servidor/seguridad.mjs';

test('los registros no guardan datos personales', () => {
  const error = new Error('Key (email)=(secreta@ejemplo.test) already exists');
  error.code = '23505';
  const linea = describirError(error, '/api/solicitud');
  assert.ok(!linea.includes('secreta'));
  assert.ok(linea.includes('23505'));
});

test('el codigo cumple el estandar RFC 6238', () => {
  // GEZDGNBV... es "12345678901234567890" en base32; instante 59, recortado a 6 cifras.
  assert.equal(codigoTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1), '287082');
});

test('el secreto generado es base32 de 20 bytes', () => {
  assert.match(generarSecretoTotp(), /^[A-Z2-7]{32}$/);
});

test('el nombre en el telefono y los correos son neutros', () => {
  const textos = [uriTotp('ABC', 'persona@ejemplo.test'), ...Object.values(PLANTILLAS).flat()].join(' ').toLowerCase();
  for (const palabra of ['cannabis', 'gramo', 'variedad', 'reprocann']) assert.ok(!textos.includes(palabra));
});

test('el servidor local no imita cabeceras de origen abierto', () => {
  const codigo = readFileSync('servidor/http.mjs', 'utf8');
  assert.ok(!codigo.includes('Access-Control-Allow-Origin'));
});
