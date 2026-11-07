// Piezas propias del cultivo: etapas y dibujos. Las pantallas internas las cargan tras recuadros.js.
const ETAPAS_CULTIVO = [
  { clave: 'origen', nombre: 'Inicio', texto: 'Semillas o esquejes recién puestos' },
  { clave: 'vegetativo', nombre: 'Crecimiento', texto: 'Las plantas crecen y echan hojas' },
  { clave: 'floracion', nombre: 'Floración', texto: 'Las plantas empiezan a florecer' },
  { clave: 'cosecha', nombre: 'Cosecha', texto: 'Se corta y se pesa' },
  { clave: 'secado', nombre: 'Secado', texto: 'Se cuelga a secar' },
  { clave: 'curado', nombre: 'Curado', texto: 'Se guarda seco a la espera del análisis' },
  { clave: 'envasado', nombre: 'Envasado', texto: 'Analizado y envasado' },
];

const nombreEtapa = (clave) => ETAPAS_CULTIVO.find((etapa) => etapa.clave === clave)?.nombre ?? clave;
const textoPlantas = (cantidad) => `${cantidad} ${Number(cantidad) === 1 ? 'planta' : 'plantas'}`;
const dibujoCultivo = (nombre) => dibujoDe(nombre, 'dibujos_cultivo');

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

// Altura de las plantas en el tiempo: una línea con sus puntos, sin leyenda porque es una sola serie.
function graficoCrecimiento(mediciones) {
  const espacio = 'http://www.w3.org/2000/svg';
  const ANCHO = 640;
  const ALTO = 180;
  const MARGEN = { izquierda: 16, derecha: 56, arriba: 24, abajo: 26 };
  const crear = (etiqueta, atributos, texto) => {
    const elemento = document.createElementNS(espacio, etiqueta);
    for (const [clave, valor] of Object.entries(atributos)) elemento.setAttribute(clave, valor);
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
  };
  const tiempos = mediciones.map((punto) => new Date(punto.creado_en).getTime());
  const maximo = Math.max(...mediciones.map((punto) => Number(punto.altura_cm)));
  const inicio = tiempos[0];
  const rango = Math.max(tiempos[tiempos.length - 1] - inicio, 1);
  const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha;
  const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo;
  const x = (tiempo) => MARGEN.izquierda + (mediciones.length === 1 ? anchoUtil / 2 : ((tiempo - inicio) / rango) * anchoUtil);
  const y = (altura) => MARGEN.arriba + altoUtil - (Number(altura) / maximo) * altoUtil;
  const fecha = (valor) => new Date(valor).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

  const svg = crear('svg', {
    class: 'grafico-crecimiento', viewBox: `0 0 ${ANCHO} ${ALTO}`, role: 'img',
    'aria-label': `Altura de las plantas: de ${cifra(mediciones[0].altura_cm)} a ${cifra(mediciones[mediciones.length - 1].altura_cm)} centímetros`,
  });
  const base = ALTO - MARGEN.abajo;
  svg.append(crear('line', { class: 'grafico-base', x1: MARGEN.izquierda, x2: ANCHO - MARGEN.derecha, y1: base, y2: base }));
  const puntos = mediciones.map((punto, posicion) => `${x(tiempos[posicion])},${y(punto.altura_cm)}`);
  if (mediciones.length > 1) svg.append(crear('polyline', { class: 'grafico-linea', points: puntos.join(' ') }));
  mediciones.forEach((punto, posicion) => {
    const grupo = crear('g', { class: 'grafico-punto' });
    grupo.append(
      crear('title', {}, `${fecha(punto.creado_en)}: ${cifra(punto.altura_cm)} cm`),
      crear('circle', { class: 'grafico-zona', cx: x(tiempos[posicion]), cy: y(punto.altura_cm), r: 16 }),
      crear('circle', { class: 'grafico-marca', cx: x(tiempos[posicion]), cy: y(punto.altura_cm), r: 5 }),
    );
    svg.append(grupo);
  });
  const ultimo = mediciones.length - 1;
  svg.append(crear('text', {
    class: 'grafico-valor', x: x(tiempos[ultimo]) + 12, y: y(mediciones[ultimo].altura_cm) + 5,
  }, `${cifra(mediciones[ultimo].altura_cm)} cm`));
  if (mediciones.length > 1) {
    svg.append(crear('text', {
      class: 'grafico-valor secundario-valor', x: x(tiempos[0]), y: y(mediciones[0].altura_cm) - 12, 'text-anchor': 'start',
    }, `${cifra(mediciones[0].altura_cm)} cm`));
    svg.append(crear('text', { class: 'grafico-eje', x: MARGEN.izquierda, y: ALTO - 6 }, fecha(mediciones[0].creado_en)));
  }
  svg.append(crear('text', {
    class: 'grafico-eje', x: x(tiempos[ultimo]), y: ALTO - 6, 'text-anchor': mediciones.length > 1 ? 'end' : 'middle',
  }, fecha(mediciones[ultimo].creado_en)));
  return svg;
}
