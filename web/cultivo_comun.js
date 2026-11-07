// Piezas comunes del cultivo: etapas, dibujos, recuadros para elegir y ventanas para rellenar.
const ETAPAS_CULTIVO = [
  { clave: 'origen', nombre: 'Inicio', texto: 'Semillas o esquejes recién puestos' },
  { clave: 'vegetativo', nombre: 'Vegetativo', texto: 'La planta crece y echa hojas' },
  { clave: 'floracion', nombre: 'Floración', texto: 'Las plantas empiezan a florecer' },
  { clave: 'cosecha', nombre: 'Cosecha', texto: 'Se corta y se pesa' },
  { clave: 'secado', nombre: 'Secado', texto: 'Se cuelga a secar' },
  { clave: 'curado', nombre: 'Curado', texto: 'Se guarda seco a la espera del análisis' },
  { clave: 'envasado', nombre: 'Envasado', texto: 'Analizado y envasado' },
];

const nombreEtapa = (clave) => ETAPAS_CULTIVO.find((etapa) => etapa.clave === clave)?.nombre ?? clave;
const textoPlantas = (cantidad) => `${cantidad} ${Number(cantidad) === 1 ? 'planta' : 'plantas'}`;
const cifra = (valor) => Number(valor).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const quienAnoto = (correo) => correo.split('@')[0];

function dibujoCultivo(nombre) {
  const espacio = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(espacio, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', '0 0 24 24');
  const uso = document.createElementNS(espacio, 'use');
  uso.setAttribute('href', `/dibujos_cultivo.svg#${nombre}`);
  svg.append(uso);
  return svg;
}

function nuevo(etiqueta, clase, texto) {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
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

// Fila de siete cuadraditos: se rellenan a medida que el lote avanza.
function pasosEtapa(etapa, cerrado = false) {
  const actual = ETAPAS_CULTIVO.findIndex((item) => item.clave === etapa);
  const fila = nuevo('span', 'pasos');
  fila.setAttribute('role', 'img');
  fila.setAttribute('aria-label', `Etapa ${actual + 1} de ${ETAPAS_CULTIVO.length}: ${nombreEtapa(etapa)}`);
  fila.append(...ETAPAS_CULTIVO.map((_, posicion) => {
    let clase = 'paso';
    if (posicion < actual || (cerrado && posicion === actual)) clase += ' hecho';
    else if (posicion === actual) clase += ' actual';
    return nuevo('span', clase);
  }));
  return fila;
}

// Un recuadro que se elige con un toque. Por debajo es un botón de opción: funciona con teclado.
function recuadroEleccion(grupo, valor, titulo, { detalle, dibujo, marcado = false } = {}) {
  const etiqueta = nuevo('label', 'eleccion');
  const entrada = document.createElement('input');
  entrada.type = 'radio';
  entrada.name = grupo;
  entrada.value = valor;
  entrada.checked = marcado;
  const caja = nuevo('span', 'eleccion-caja');
  if (dibujo) caja.append(dibujoCultivo(dibujo));
  caja.append(nuevo('span', 'eleccion-titulo', titulo));
  if (detalle) caja.append(nuevo('span', 'eleccion-detalle', detalle));
  etiqueta.append(entrada, caja);
  return etiqueta;
}

function campoEleccion(campo) {
  const grupo = document.createElement('fieldset');
  grupo.className = 'campo grupo-eleccion';
  grupo.append(nuevo('legend', '', campo.etiqueta));
  const opciones = nuevo('div', 'elecciones');
  opciones.append(...campo.opciones.map((opcion) => recuadroEleccion(campo.nombre, opcion, opcion, {
    marcado: campo.valor === opcion,
  })));
  grupo.append(opciones);
  return grupo;
}

function entradaDe(campo) {
  if (campo.tipo === 'largo') {
    const area = document.createElement('textarea');
    area.rows = 3;
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
  if (campo.tipo === 'fecha') entrada.type = 'date';
  if (campo.tipo === 'decimal') entrada.inputMode = 'decimal';
  if (campo.tipo === 'entero') entrada.inputMode = 'numeric';
  if (campo.tipo === 'texto') entrada.maxLength = campo.largo ?? 200;
  entrada.autocomplete = 'off';
  entrada.value = campo.valor ?? '';
  return entrada;
}

function construirCampo(campo) {
  if (campo.tipo === 'elegir') return campoEleccion(campo);
  const bloque = nuevo('div', 'campo');
  const id = `ventana-${campo.nombre}`;
  const etiqueta = nuevo('label', '', campo.obligatorio ? campo.etiqueta : `${campo.etiqueta} (opcional)`);
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
  if (campo.ayuda) bloque.append(nuevo('p', 'nota', campo.ayuda));
  return bloque;
}

// Devuelve el texto del problema, o null si el campo está bien.
function problemaDe(campo, valor) {
  const vacio = valor === undefined || valor === '';
  if (vacio) return campo.obligatorio ? `Falta rellenar «${campo.etiqueta}».` : null;
  if (campo.tipo === 'decimal' || campo.tipo === 'entero') {
    const formato = campo.tipo === 'entero' ? /^\d+$/ : /^\d+([.,]\d{1,2})?$/;
    const fueraDeRango = Number(valor.replace(',', '.')) > (campo.maximo ?? Infinity);
    const minimo = campo.minimo ?? 0;
    if (!formato.test(valor) || fueraDeRango || Number(valor.replace(',', '.')) < minimo) {
      const tope = campo.maximo === undefined ? 'solo números' : `un número hasta ${campo.maximo}`;
      return `Revisá «${campo.etiqueta}»: escribí ${tope}, sin letras ni puntos de miles.`;
    }
  }
  return null;
}

// Abre una ventana con solo los campos que hacen falta. `alGuardar` recibe lo rellenado.
function abrirVentana({ titulo, dibujo, ayuda, aviso, campos = [], boton = 'Guardar', peligro = false, alGuardar }) {
  const ventana = nuevo('dialog', 'ventana');
  const formulario = document.createElement('form');
  formulario.noValidate = true;
  const cabecera = nuevo('div', 'ventana-cabecera');
  if (dibujo) {
    const circulo = nuevo('span', 'ventana-dibujo');
    circulo.append(dibujoCultivo(dibujo));
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
    const datos = Object.fromEntries(new FormData(formulario));
    for (const clave of Object.keys(datos)) datos[clave] = datos[clave].trim();
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
