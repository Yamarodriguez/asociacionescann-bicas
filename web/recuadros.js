// Piezas comunes de todas las pantallas: recuadros, cifras, ventanas para rellenar y avisos.
const cifra = (valor) => Number(valor).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const nombreCorto = (correo) => (correo ? correo.split('@')[0] : 'Sin responsable');

function fechaLocal(fecha = new Date()) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${String(fecha.getDate()).padStart(2, '0')}`;
}

function nuevo(etiqueta, clase, texto) {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function dibujoDe(nombre, archivo = 'dibujos') {
  const espacio = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(espacio, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', '0 0 24 24');
  const uso = document.createElementNS(espacio, 'use');
  uso.setAttribute('href', `/${archivo}.svg#${nombre}`);
  svg.append(uso);
  return svg;
}

function haceCuanto(valor) {
  if (!valor) return 'Sin anotaciones todavía';
  const dia = (fecha) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const dias = Math.round((dia(new Date()) - dia(new Date(valor))) / 86400000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  return `Hace ${dias} días`;
}

// Confirma sin mover la página: quien va rellenando recuadros no pierde su sitio.
function confirmar(texto) {
  document.querySelector('.aviso-flotante')?.remove();
  const aviso = nuevo('p', 'aviso-flotante', texto);
  aviso.setAttribute('role', 'status');
  document.body.append(aviso);
  setTimeout(() => aviso.remove(), 4000);
}

// Un recuadro que se elige con un toque. Por debajo es un botón de opción: funciona con teclado.
function recuadroEleccion(grupo, valor, titulo, { detalle, dibujo, marcado = false, tipo = 'radio' } = {}) {
  const etiqueta = nuevo('label', 'eleccion');
  const entrada = document.createElement('input');
  entrada.type = tipo;
  entrada.name = grupo;
  entrada.value = valor;
  entrada.checked = marcado;
  const caja = nuevo('span', 'eleccion-caja');
  if (dibujo) caja.append(dibujo);
  caja.append(nuevo('span', 'eleccion-titulo', titulo));
  if (detalle) caja.append(nuevo('span', 'eleccion-detalle', detalle));
  etiqueta.append(entrada, caja);
  return etiqueta;
}

// Fila de opciones cortas para filtrar una lista. Avisa al cambiar.
function filtroRecuadros(destino, grupo, opciones, alCambiar) {
  const contenedor = document.getElementById(destino);
  contenedor.setAttribute('role', 'radiogroup');
  contenedor.replaceChildren(...opciones.map(({ valor, texto }, posicion) => (
    recuadroEleccion(grupo, valor, texto, { marcado: posicion === 0 })
  )));
  contenedor.addEventListener('change', alCambiar);
}

const valorFiltro = (grupo) => document.querySelector(`input[name="${grupo}"]:checked`)?.value;

function campoEleccion(campo) {
  const grupo = document.createElement('fieldset');
  grupo.className = 'campo grupo-eleccion';
  grupo.append(nuevo('legend', '', campo.etiqueta));
  const opciones = nuevo('div', 'elecciones');
  opciones.append(...campo.opciones.map((opcion) => {
    const { valor, texto } = typeof opcion === 'string' ? { valor: opcion, texto: opcion } : opcion;
    return recuadroEleccion(campo.nombre, valor, texto, { marcado: campo.valor === valor });
  }));
  grupo.append(opciones);
  if (campo.ayuda) grupo.append(nuevo('p', 'nota', campo.ayuda));
  return grupo;
}

function campoCasilla(campo) {
  const bloque = nuevo('div', 'casilla casilla-recuadro');
  const entrada = document.createElement('input');
  entrada.type = 'checkbox';
  entrada.id = `ventana-${campo.nombre}`;
  entrada.name = campo.nombre;
  const etiqueta = nuevo('label', '', campo.etiqueta);
  etiqueta.htmlFor = entrada.id;
  bloque.append(entrada, etiqueta);
  return bloque;
}

function listaSugerencias(campo, entrada) {
  const lista = document.createElement('datalist');
  lista.id = `sugerencias-${campo.nombre}`;
  lista.append(...campo.sugerencias.map((valor) => {
    const opcion = document.createElement('option');
    opcion.value = valor;
    return opcion;
  }));
  entrada.setAttribute('list', lista.id);
  return lista;
}

const TIPOS_ENTRADA = { fecha: 'date', mes: 'month', 'fecha-hora': 'datetime-local', clave: 'password', telefono: 'tel' };

function entradaDe(campo) {
  if (campo.tipo === 'largo') {
    const area = document.createElement('textarea');
    area.rows = campo.filas ?? 3;
    area.maxLength = campo.largo ?? 1000;
    area.value = campo.valor ?? '';
    return area;
  }
  if (campo.tipo === 'lista') {
    const lista = document.createElement('select');
    lista.append(...campo.opciones.map(({ valor, texto }) => {
      const opcion = nuevo('option', '', texto);
      opcion.value = valor;
      return opcion;
    }));
    if (campo.valor !== undefined) lista.value = campo.valor;
    return lista;
  }
  const entrada = document.createElement('input');
  if (TIPOS_ENTRADA[campo.tipo]) entrada.type = TIPOS_ENTRADA[campo.tipo];
  if (campo.tipo === 'decimal') entrada.inputMode = 'decimal';
  if (campo.tipo === 'entero') entrada.inputMode = 'numeric';
  if (campo.tipo === 'texto') entrada.maxLength = campo.largo ?? 200;
  entrada.autocomplete = campo.tipo === 'clave' ? 'current-password' : 'off';
  entrada.value = campo.valor ?? '';
  return entrada;
}

function construirCampo(campo) {
  if (campo.tipo === 'elegir') return campoEleccion(campo);
  if (campo.tipo === 'casilla') return campoCasilla(campo);
  const bloque = nuevo('div', 'campo');
  const id = `ventana-${campo.nombre}`;
  const conAviso = !campo.obligatorio && campo.tipo !== 'lista';
  const etiqueta = nuevo('label', '', conAviso ? `${campo.etiqueta} (opcional)` : campo.etiqueta);
  etiqueta.htmlFor = id;
  const entrada = entradaDe(campo);
  entrada.id = id;
  entrada.name = campo.nombre;
  bloque.append(etiqueta);
  if (campo.unidad) {
    const fila = nuevo('div', 'con-unidad');
    fila.append(entrada, nuevo('span', '', campo.unidad));
    bloque.append(fila);
  } else {
    bloque.append(entrada);
  }
  if (campo.sugerencias?.length) bloque.append(listaSugerencias(campo, entrada));
  if (campo.ayuda) bloque.append(nuevo('p', 'nota', campo.ayuda));
  return bloque;
}

// Devuelve el texto del problema, o null si el campo está bien.
function problemaDe(campo, valor) {
  const vacio = valor === undefined || valor === '';
  if (vacio) {
    if (!campo.obligatorio) return null;
    return campo.falta ?? `Falta rellenar «${campo.etiqueta}».`;
  }
  if (campo.tipo === 'decimal' || campo.tipo === 'entero') {
    const formato = campo.tipo === 'entero' ? /^\d+$/ : /^\d+([.,]\d{1,2})?$/;
    const numero = Number(valor.replace(',', '.'));
    if (!formato.test(valor) || numero > (campo.maximo ?? Infinity) || numero < (campo.minimo ?? 0)) {
      const tope = campo.maximo === undefined ? 'solo números' : `un número hasta ${campo.maximo}`;
      return `Revisá «${campo.etiqueta}»: escribí ${tope}, sin letras ni puntos de miles.`;
    }
  }
  return null;
}

function leerVentana(formulario, campos) {
  const datos = Object.fromEntries(new FormData(formulario));
  for (const clave of Object.keys(datos)) {
    const esClave = campos.some((campo) => campo.nombre === clave && campo.tipo === 'clave');
    if (!esClave) datos[clave] = datos[clave].trim();
  }
  return datos;
}

// Abre una ventana con solo los campos que hacen falta. `alGuardar` recibe lo rellenado.
function abrirVentana({ titulo, dibujo, ayuda, aviso, campos = [], boton = 'Guardar', peligro = false, alGuardar }) {
  const ventana = nuevo('dialog', 'ventana');
  const formulario = document.createElement('form');
  formulario.noValidate = true;
  const cabecera = nuevo('div', 'ventana-cabecera');
  if (dibujo) {
    const circulo = nuevo('span', 'ventana-dibujo');
    circulo.append(dibujo);
    cabecera.append(circulo);
  }
  cabecera.append(nuevo('h2', '', titulo));
  const error = nuevo('div', 'mensaje');
  error.setAttribute('role', 'alert');
  formulario.append(cabecera);
  if (ayuda) formulario.append(nuevo('p', 'nota', ayuda));
  if (aviso) formulario.append(nuevo('p', 'mensaje error', aviso));
  formulario.append(error, ...campos.map(construirCampo));

  const acciones = nuevo('div', 'acciones-aviso ventana-acciones');
  const cancelar = nuevo('button', 'secundario', 'Cancelar');
  cancelar.type = 'button';
  cancelar.addEventListener('click', () => ventana.close());
  const guardar = nuevo('button', peligro ? 'peligro' : '', boton);
  guardar.type = 'submit';
  acciones.append(guardar, cancelar);
  formulario.append(acciones);

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const datos = leerVentana(formulario, campos);
    const problema = campos.map((campo) => problemaDe(campo, datos[campo.nombre])).find(Boolean);
    if (problema) {
      mostrarMensaje(error, problema);
      return;
    }
    guardar.disabled = true;
    try {
      await alGuardar(datos);
      ventana.close();
    } catch (fallo) {
      mostrarMensaje(error, fallo.message);
    } finally {
      guardar.disabled = false;
    }
  });
  ventana.addEventListener('close', () => ventana.remove());
  ventana.append(formulario);
  document.body.append(ventana);
  ventana.showModal();
}

// Botón que pide confirmar en una ventana antes de hacer algo que no se deshace.
function botonConfirmado(texto, { titulo, ayuda, boton, peligro = false, clase = 'secundario', campos, dibujo, alGuardar }) {
  const elemento = nuevo('button', clase, texto);
  elemento.type = 'button';
  elemento.addEventListener('click', () => abrirVentana({
    titulo, ayuda, boton, peligro, campos, dibujo, alGuardar,
  }));
  return elemento;
}

function cajaCifra(numero, titulo, detalle, { dibujo, alerta = false, enlace } = {}) {
  const caja = nuevo(enlace ? 'a' : 'div', alerta ? 'cifra-caja alerta' : 'cifra-caja');
  if (enlace) caja.href = enlace;
  if (dibujo) {
    const circulo = nuevo('span', 'cifra-dibujo');
    circulo.append(dibujo);
    caja.append(circulo);
  }
  const textos = nuevo('div');
  textos.append(nuevo('p', 'cifra-numero', numero), nuevo('p', 'cifra-titulo', titulo));
  if (detalle) textos.append(nuevo('p', 'nota', detalle));
  caja.append(textos);
  return caja;
}

// Recuadro punteado para agregar algo. Va al final de cada lista.
function recuadroNuevo(titulo, detalle, alPulsar) {
  const esEnlace = typeof alPulsar === 'string';
  const elemento = nuevo(esEnlace ? 'a' : 'button', 'recuadro-nuevo');
  if (esEnlace) {
    elemento.href = alPulsar;
  } else {
    elemento.type = 'button';
    elemento.addEventListener('click', alPulsar);
  }
  const mas = nuevo('span', 'recuadro-mas');
  mas.append(dibujoDe('mas'));
  elemento.append(mas, nuevo('strong', '', titulo), nuevo('span', 'nota', detalle));
  return elemento;
}

// Recuadro grande para empezar una acción: dibujo, nombre y una línea que la explica.
function recuadroAccion(titulo, detalle, dibujo, alPulsar) {
  const boton = nuevo('button', 'anotar-recuadro');
  boton.type = 'button';
  boton.append(dibujo, nuevo('strong', '', titulo), nuevo('span', 'nota', detalle));
  boton.addEventListener('click', alPulsar);
  return boton;
}

// Ficha de una cosa: un socio, un insumo, una tarea. Las líneas vacías no se pintan.
function recuadroFicha({ titulo, subtitulo, destacado, lineas = [], etiquetas = [], acciones = [], dibujo, alerta = false }) {
  const ficha = nuevo('article', alerta ? 'recuadro alerta' : 'recuadro');
  const cabeza = nuevo('div', 'recuadro-cabeza');
  if (dibujo) {
    const circulo = nuevo('span', 'lote-dibujo');
    circulo.append(dibujo);
    cabeza.append(circulo);
  }
  const nombres = nuevo('div', 'recuadro-nombres');
  nombres.append(nuevo('h3', '', titulo));
  if (subtitulo) nombres.append(nuevo('p', 'nota', subtitulo));
  cabeza.append(nombres);
  ficha.append(cabeza);
  if (destacado !== undefined) ficha.append(nuevo('p', 'cifra-numero', destacado));
  for (const linea of lineas.filter(Boolean)) {
    ficha.append(linea instanceof Node ? linea : nuevo('p', 'nota', linea));
  }
  const visibles = etiquetas.filter(Boolean);
  if (visibles.length) {
    const fila = nuevo('div', 'recuadro-etiquetas');
    fila.append(...visibles);
    ficha.append(fila);
  }
  const botones = acciones.filter(Boolean);
  if (botones.length) {
    const fila = nuevo('div', 'recuadro-acciones');
    fila.append(...botones);
    ficha.append(fila);
  }
  return ficha;
}

// Fila de una lista larga: un apunte con su dibujo, su texto y quién y cuándo.
function filaApunte({ titulo, texto, detalle, pie, dibujo, tipo, derecha }) {
  const fila = nuevo('article', 'apunte');
  if (tipo) fila.dataset.tipo = tipo;
  if (dibujo) {
    const circulo = nuevo('span', 'apunte-dibujo');
    circulo.append(dibujo);
    fila.append(circulo);
  }
  const cuerpo = nuevo('div', 'apunte-cuerpo');
  cuerpo.append(nuevo('strong', '', titulo));
  if (texto) cuerpo.append(nuevo('p', '', texto));
  if (detalle) cuerpo.append(nuevo('p', 'nota', detalle));
  if (pie) cuerpo.append(nuevo('p', 'nota', pie));
  fila.append(cuerpo);
  if (derecha) fila.append(derecha);
  return fila;
}

function pintarEn(id, elementos, vacio) {
  const contenedor = document.getElementById(id);
  contenedor.replaceChildren(...(elementos.length ? elementos : [nuevo('p', 'estado-vacio', vacio)]));
}
