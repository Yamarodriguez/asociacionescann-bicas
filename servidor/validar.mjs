// Comprobaciones de los datos que llegan en un pedido.
import { ErrorHttp } from './http.mjs';
import { fechaValida } from './rutas_acceso.mjs';

const DECIMAL = /^\d{1,10}(\.\d{1,2})?$/;

export const esId = (valor) => Number.isInteger(valor);

export function texto(datos, clave, maximo = 200, obligatorio = true) {
  const valor = datos[clave];
  if (!obligatorio && (valor === undefined || valor === null || valor === '')) return null;
  if (typeof valor !== 'string' || !valor.trim() || valor.length > maximo) {
    throw new ErrorHttp(422, 'Revisá los datos del formulario.');
  }
  return valor.trim();
}

export function numero(datos, clave, { obligatorio = false, maximo = 1e9 } = {}) {
  const valor = datos[clave];
  if (valor === undefined || valor === null || valor === '') {
    if (obligatorio) throw new ErrorHttp(422, 'Revisá los valores numéricos.');
    return null;
  }
  const crudo = String(valor);
  if (!DECIMAL.test(crudo) || Number(crudo) > maximo) throw new ErrorHttp(422, 'Revisá los valores numéricos.');
  return crudo;
}

export function positivo(datos, clave, opciones = {}) {
  const valor = numero(datos, clave, { ...opciones, obligatorio: true });
  if (Number(valor) <= 0) throw new ErrorHttp(422, 'Revisá los valores numéricos.');
  return valor;
}

export function entero(datos, clave, minimo = 1, maximo = 100000) {
  const valor = datos[clave];
  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new ErrorHttp(422, 'Revisá la cantidad.');
  }
  return valor;
}

export function fecha(datos, clave) {
  if (!fechaValida(datos[clave])) throw new ErrorHttp(422, 'Revisá la fecha.');
  return datos[clave];
}

export function fechaOpcional(datos, clave) {
  return datos[clave] ? fecha(datos, clave) : null;
}

export function opcion(datos, clave, permitidas) {
  if (!permitidas.includes(datos[clave])) throw new ErrorHttp(422, 'Pedido inválido.');
  return datos[clave];
}

// Evita que una hoja de calculo ejecute un texto como formula.
export function celdaCsv(valor) {
  let salida = valor === null || valor === undefined ? '' : String(valor instanceof Date ? valor.toISOString() : valor);
  if (['=', '+', '-', '@', '\t', '\r'].includes(salida[0])) salida = `'${salida}`;
  return /[;"\n\r]/.test(salida) ? `"${salida.replaceAll('"', '""')}"` : salida;
}
