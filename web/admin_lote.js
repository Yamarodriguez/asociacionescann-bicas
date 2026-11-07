const parametros = new URLSearchParams(location.search);
const loteId = Number(parametros.get('id'));
const plantaCodigo = parametros.get('planta');
const RECIENTES = 8;
let rol = '';
let actual = null;

const coordina = () => rol === 'coordinador_cultivo';
const anota = () => ['coordinador_cultivo', 'cultivador'].includes(rol);
const activo = () => actual.lote.estado === 'activo';
const fechaLarga = (valor) => new Date(valor).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
const accionCultivo = (accion, datos) => pedir('/api/cultivo', { accion, lote_id: loteId, ...datos });

const PH = { nombre: 'ph', etiqueta: 'pH', tipo: 'decimal', maximo: 14, ayuda: 'Lo que marca el medidor, de 0 a 14.' };
const EC = { nombre: 'ec', etiqueta: 'EC', tipo: 'decimal', maximo: 100, ayuda: 'Conductividad: lo que marca el medidor.' };
const NOTA = { nombre: 'nota', etiqueta: 'Algo más que quieras anotar', tipo: 'largo', largo: 800 };

function camposProducto() {
  if (!actual.insumos.length) return [];
  const opciones = actual.insumos.map(({ id, nombre, unidad }) => ({ valor: String(id), texto: `${nombre} (${unidad})` }));
  return [
    { nombre: 'insumo_id', etiqueta: 'Producto usado', tipo: 'lista', opciones: [{ valor: '', texto: 'Ninguno del inventario' }, ...opciones] },
    { nombre: 'cantidad_insumo', etiqueta: 'Cantidad usada', tipo: 'decimal', maximo: 100000000, ayuda: 'Se descuenta sola del inventario.' },
  ];
}

// Valor anterior de una medida, para que se vea sin tener que buscarlo.
function ultimaMedida(campo) {
  const previo = actual.registros.find((registro) => registro[campo] !== null);
  return previo ? `La última vez: ${cifra(previo[campo])}.` : undefined;
}
function ultimaAltura() {
  const previa = actual.registros.find((registro) => registro.altura_cm !== null);
  return previa ? `La última vez: ${cifra(previa.altura_cm)} cm.` : '';
}
const conUltima = (campo) => ({ ...campo, ayuda: [campo.ayuda, ultimaMedida(campo.nombre)].filter(Boolean).join(' ') });

function productoUsado({ insumo_id: insumo, cantidad_insumo: cantidad }) {
  const producto = actual.insumos.find(({ id }) => String(id) === insumo);
  return producto ? `${producto.nombre}, ${cantidad} ${producto.unidad}` : '';
}

const unir = (...partes) => partes.filter(Boolean).join('. ');

const ANOTACIONES = [
  {
    tipo: 'crecimiento', titulo: 'Crecimiento', detalle: 'Cuánto miden y cómo se ven',
    campos: () => [
      {
        nombre: 'altura_cm', etiqueta: '¿Cuánto miden?', tipo: 'decimal', maximo: 9999, unidad: 'cm', obligatorio: true,
        ayuda: [ 'Medí una planta típica del lote, desde la tierra.', ultimaAltura() ].filter(Boolean).join(' '),
      },
      { nombre: 'clase', etiqueta: '¿Cómo se ven?', tipo: 'elegir', opciones: ['Muy bien', 'Bien', 'Regular', 'Mal'] },
      NOTA,
    ],
    componer: (d) => unir(d.clase && `Se ven: ${d.clase.toLowerCase()}`, d.nota),
  },
  {
    tipo: 'riego', titulo: 'Riego', detalle: 'Agua que les diste',
    campos: () => [
      { nombre: 'litros', etiqueta: 'Litros de agua', tipo: 'decimal', maximo: 100000, unidad: 'litros', ayuda: 'En total, para todo el lote.' },
      conUltima(PH), conUltima(EC), NOTA,
    ],
    componer: (d) => d.nota,
  },
  {
    tipo: 'nutrientes', titulo: 'Nutrientes', detalle: 'Abono o fertilizante',
    campos: () => [...camposProducto(), conUltima(PH), conUltima(EC), NOTA],
    componer: (d) => unir(productoUsado(d), d.nota),
  },
  {
    tipo: 'poda', titulo: 'Poda', detalle: 'Cortes y limpieza',
    campos: () => [
      { nombre: 'clase', etiqueta: '¿Qué poda hiciste?', tipo: 'elegir', obligatorio: true, opciones: ['Limpieza', 'Apical', 'Defoliación', 'Otra'] },
      NOTA,
    ],
    componer: (d) => unir(`Poda: ${d.clase.toLowerCase()}`, d.nota),
  },
  {
    tipo: 'aplicacion', titulo: 'Aplicación', detalle: 'Productos contra plagas',
    campos: () => [
      { nombre: 'clase', etiqueta: '¿Por qué la hiciste?', tipo: 'elegir', obligatorio: true, opciones: ['Prevención', 'Plagas', 'Hongos', 'Otro motivo'] },
      ...camposProducto(), NOTA,
    ],
    componer: (d) => unir(`Motivo: ${d.clase.toLowerCase()}`, productoUsado(d), d.nota),
  },
  {
    tipo: 'medicion', titulo: 'Medición', detalle: 'Temperatura, humedad, pH',
    campos: () => [
      { nombre: 'temperatura', etiqueta: 'Temperatura', tipo: 'decimal', maximo: 100, unidad: '°C' },
      { nombre: 'humedad', etiqueta: 'Humedad', tipo: 'decimal', maximo: 100, unidad: '%' },
      conUltima(PH), conUltima(EC), NOTA,
    ],
    componer: (d) => d.nota,
  },
  {
    tipo: 'incidencia', titulo: 'Problema', detalle: 'Plagas, averías, algo raro',
    campos: () => [
      { nombre: 'clase', etiqueta: '¿Qué pasó?', tipo: 'elegir', obligatorio: true, opciones: ['Plagas', 'Hongos', 'Riego', 'Luz o temperatura', 'Avería', 'Otro'] },
      { nombre: 'gravedad', etiqueta: '¿Qué tan grave es?', tipo: 'elegir', obligatorio: true, opciones: ['Leve', 'Media', 'Grave'] },
      { ...NOTA, etiqueta: 'Contá qué viste' },
    ],
    componer: (d) => unir(`${d.clase} (${d.gravedad.toLowerCase()})`, d.nota),
  },
  {
    tipo: 'baja', titulo: 'Baja de plantas', detalle: 'Plantas que se pierden',
    campos: () => [
      ...(plantaCodigo ? [] : [{
        nombre: 'plantas', etiqueta: '¿Cuántas plantas?', tipo: 'entero', minimo: 1, maximo: actual.lote.cantidad_plantas, obligatorio: true,
        ayuda: `Hoy quedan ${textoPlantas(actual.lote.cantidad_plantas)} en este lote.`,
      }]),
      { nombre: 'clase', etiqueta: '¿Por qué?', tipo: 'elegir', obligatorio: true, opciones: ['Enferma', 'Rota', 'No prendió', 'Otro motivo'] },
      NOTA,
    ],
    componer: (d) => unir(`Motivo: ${d.clase.toLowerCase()}`, d.nota),
    preparar: (d) => ({ plantas: d.plantas ? Number(d.plantas) : undefined }),
  },
  {
    tipo: 'destruccion', titulo: 'Destrucción', detalle: 'Restos que se eliminan',
    campos: () => [
      { nombre: 'clase', etiqueta: '¿Qué se destruyó?', tipo: 'elegir', obligatorio: true, opciones: ['Restos de poda', 'Plantas de baja', 'Restos de cosecha', 'Otro'] },
      { nombre: 'testigos', etiqueta: '¿Quiénes estuvieron presentes?', tipo: 'texto', largo: 300, obligatorio: true, ayuda: 'Hace falta al menos un testigo.' },
      NOTA,
    ],
    componer: (d) => unir(d.clase, d.nota),
  },
];

function anotar(anotacion) {
  abrirVentana({
    titulo: anotacion.titulo,
    dibujo: dibujoCultivo(anotacion.tipo),
    ayuda: plantaCodigo ? `Queda anotado en la planta ${plantaCodigo}.` : undefined,
    campos: anotacion.campos(),
    boton: 'Anotar',
    alGuardar: async (datos) => {
      if (datos.insumo_id && !datos.cantidad_insumo) throw new Error('Falta rellenar «Cantidad usada».');
      await pedir('/api/cultivo_registro', {
        ...datos,
        ...anotacion.preparar?.(datos),
        lote_id: loteId,
        tipo: anotacion.tipo,
        detalle: anotacion.componer(datos),
        insumo_id: datos.insumo_id ? Number(datos.insumo_id) : undefined,
        planta_codigo: plantaCodigo ?? undefined,
      });
      confirmar(`Anotado: ${anotacion.titulo.toLowerCase()}.`);
      await cargar();
    },
  });
}

function pintarAnotar() {
  document.getElementById('bloque-anotar').classList.toggle('oculto', !(activo() && anota()));
  document.getElementById('anotar').replaceChildren(...ANOTACIONES.map((anotacion) => (
    recuadroAccion(anotacion.titulo, anotacion.detalle, dibujoCultivo(anotacion.tipo), () => anotar(anotacion))
  )));
}

function pintarRecorrido() {
  const { lote, fechas_etapa: fechas } = actual;
  const indice = ETAPAS_CULTIVO.findIndex((etapa) => etapa.clave === lote.etapa);
  document.getElementById('recorrido').replaceChildren(...ETAPAS_CULTIVO.map((etapa, posicion) => {
    const terminado = posicion < indice || (posicion === indice && !activo());
    const clase = terminado ? 'hecha' : (posicion === indice ? 'actual' : 'pendiente');
    const caja = nuevo('li', `etapa-caja ${clase}`);
    if (clase === 'actual') caja.setAttribute('aria-current', 'step');
    caja.append(dibujoCultivo(`etapa-${etapa.clave}`), nuevo('strong', '', etapa.nombre));
    caja.append(nuevo('span', 'nota', fechas[etapa.clave] ? fechaLarga(fechas[etapa.clave]) : 'Pendiente'));
    return caja;
  }));
}

function pasarEtapa(siguiente) {
  const { lote, limite } = actual;
  const peso = { cosecha: 'Peso húmedo', curado: 'Peso seco' }[siguiente.clave];
  const entraEnFlor = siguiente.clave === 'floracion';
  const total = limite.florecidas + lote.cantidad_plantas;
  abrirVentana({
    titulo: `Pasar a ${siguiente.nombre}`,
    dibujo: dibujoCultivo(`etapa-${siguiente.clave}`),
    ayuda: `${siguiente.texto}. Este paso no se puede deshacer: revisá que sea el momento.`,
    aviso: entraEnFlor && limite.autorizadas && total > limite.autorizadas
      ? `Con este lote serían ${total} plantas en floración y el certificado autoriza ${limite.autorizadas}.` : undefined,
    campos: peso ? [{
      nombre: 'peso_g', etiqueta: peso, tipo: 'decimal', maximo: 100000000, unidad: 'gramos', obligatorio: true,
      ayuda: siguiente.clave === 'cosecha' ? 'Pesá todo junto, recién cortado.' : 'Pesá todo junto, ya seco.',
    }] : [],
    boton: `Sí, pasar a ${siguiente.nombre}`,
    alGuardar: async ({ peso_g: gramos }) => {
      await accionCultivo('avanzar', { peso_g: gramos });
      confirmar(`El lote pasó a ${siguiente.nombre}.`);
      await cargar();
    },
  });
}

function ventanaAnalisis() {
  abrirVentana({
    titulo: 'Análisis de laboratorio',
    dibujo: dibujoCultivo('analisis'),
    campos: [
      { nombre: 'laboratorio', etiqueta: 'Laboratorio', tipo: 'texto', largo: 120, obligatorio: true },
      { nombre: 'fecha', etiqueta: 'Fecha del análisis', tipo: 'fecha', obligatorio: true },
      { nombre: 'thc', etiqueta: 'THC', tipo: 'decimal', maximo: 100, unidad: '%', obligatorio: true },
      { nombre: 'cbd', etiqueta: 'CBD', tipo: 'decimal', maximo: 100, unidad: '%', obligatorio: true },
    ],
    alGuardar: async (datos) => {
      await accionCultivo('analisis', datos);
      confirmar('Análisis guardado.');
      await cargar();
    },
  });
}

function cerrarLote() {
  abrirVentana({
    titulo: 'Cerrar el lote',
    dibujo: dibujoCultivo('etapa-envasado'),
    ayuda: 'El lote queda terminado y ya no admite anotaciones.',
    boton: 'Sí, cerrar el lote',
    alGuardar: async () => {
      await accionCultivo('finalizar');
      confirmar('Lote cerrado.');
      await cargar();
    },
  });
}

function descartarLote() {
  abrirVentana({
    titulo: 'Descartar el lote',
    dibujo: dibujoCultivo('destruccion'),
    ayuda: 'Las plantas salen del recuento y el lote ya no admite anotaciones. No se puede deshacer.',
    campos: [{ nombre: 'motivo', etiqueta: '¿Por qué se descarta?', tipo: 'largo', largo: 500, obligatorio: true }],
    boton: 'Sí, descartar',
    peligro: true,
    alGuardar: async ({ motivo }) => {
      await accionCultivo('finalizar', { estado: 'descartado', motivo });
      confirmar('Lote descartado.');
      await cargar();
    },
  });
}

function textoSiguiente(siguiente, sinAnalisis) {
  if (sinAnalisis) return 'Falta el análisis de laboratorio: sin él, el lote no se puede envasar.';
  const momentos = {
    vegetativo: 'Cuando las plantas ya hayan prendido y empiecen a crecer.',
    floracion: 'Cuando empiecen a florecer. Te vamos a avisar si superás las plantas autorizadas.',
    cosecha: 'Cuando las cortes. Tené a mano la balanza: te vamos a pedir el peso húmedo.',
    secado: 'Cuando cuelgues todo a secar.',
    curado: 'Cuando esté seco. Tené a mano la balanza: te vamos a pedir el peso seco.',
    envasado: 'Cuando esté analizado y listo para envasar.',
  };
  return momentos[siguiente.clave];
}

function pintarLoQueSigue() {
  const { lote, analisis } = actual;
  const caja = document.getElementById('lo-que-sigue');
  const indice = ETAPAS_CULTIVO.findIndex((etapa) => etapa.clave === lote.etapa);
  const siguiente = ETAPAS_CULTIVO[indice + 1];
  if (!activo()) {
    const estado = lote.estado === 'descartado' ? 'Este lote se descartó.' : 'Este lote ya terminó.';
    caja.replaceChildren(nuevo('strong', '', estado));
    return;
  }
  const sinAnalisis = siguiente?.clave === 'envasado' && !analisis.length;
  const textos = nuevo('div');
  textos.append(nuevo('p', 'nota', `Ahora: ${ETAPAS_CULTIVO[indice].texto.toLowerCase()}`));
  if (siguiente) {
    textos.append(
      nuevo('strong', '', `Lo que sigue: ${siguiente.nombre}`),
      nuevo('p', 'nota', textoSiguiente(siguiente, sinAnalisis)),
    );
  } else {
    textos.append(nuevo('strong', '', 'Último paso: cerrar el lote'));
  }
  const botones = [];
  if (coordina()) {
    let boton;
    if (!siguiente) {
      boton = nuevo('button', '', 'Cerrar el lote');
      boton.addEventListener('click', cerrarLote);
    } else if (sinAnalisis) {
      boton = nuevo('button', '', 'Cargar el análisis');
      boton.addEventListener('click', ventanaAnalisis);
    } else {
      boton = nuevo('button', '', `Pasar a ${siguiente.nombre}`);
      boton.addEventListener('click', () => pasarEtapa(siguiente));
    }
    boton.type = 'button';
    botones.push(boton);
  } else {
    textos.append(nuevo('p', 'nota', 'El cambio de etapa lo hace quien coordina el cultivo.'));
  }
  caja.replaceChildren(textos, ...botones);
}

// Recuadro de la ficha. Lleno, por rellenar o a la espera de que llegue su momento.
function recuadroDato({ titulo, valor, detalle, dibujo, espera, alPulsar, verbo }) {
  const lleno = valor !== null && valor !== undefined && valor !== '';
  const estado = lleno ? 'lleno' : (espera ? 'espera' : 'falta');
  const caja = nuevo(alPulsar ? 'button' : 'div', `dato-recuadro ${estado}`);
  if (alPulsar) {
    caja.type = 'button';
    caja.addEventListener('click', alPulsar);
  }
  const cabeza = nuevo('span', 'dato-cabeza');
  cabeza.append(nuevo('span', 'dato-titulo', titulo));
  const marca = nuevo('span', 'dato-marca');
  if (lleno) marca.append(dibujoCultivo('hecho'));
  if (!lleno && espera) marca.append(dibujoCultivo('candado'));
  cabeza.append(marca);
  caja.append(cabeza, nuevo('span', 'dato-valor', lleno ? valor : (espera ?? 'Sin rellenar')));
  if (detalle) caja.append(nuevo('span', 'nota', detalle));
  if (alPulsar) caja.append(nuevo('span', 'dato-accion', verbo ?? (lleno ? 'Cambiar' : 'Rellenar')));
  caja.dataset.lleno = lleno;
  return caja;
}

function cambiarSala() {
  abrirVentana({
    titulo: 'Cambiar de sala',
    campos: [{
      nombre: 'sala_id', etiqueta: '¿A qué sala pasa?', tipo: 'lista', obligatorio: true, valor: String(actual.lote.sala_id),
      opciones: actual.salas.map(({ id, nombre }) => ({ valor: String(id), texto: nombre })),
    }],
    alGuardar: async ({ sala_id: sala }) => {
      await accionCultivo('mover', { sala_id: Number(sala) });
      confirmar('Sala cambiada.');
      await cargar();
    },
  });
}

function editarDato(campo, titulo, descripcion) {
  abrirVentana({
    titulo,
    campos: [{ ...descripcion, nombre: 'valor', valor: actual.lote[campo] ?? '' }],
    alGuardar: async ({ valor }) => {
      await accionCultivo('actualizar_lote', { campo, valor });
      confirmar('Guardado.');
      await cargar();
    },
  });
}

function corregirPeso(cual, titulo) {
  abrirVentana({
    titulo: `Corregir ${titulo.toLowerCase()}`,
    dibujo: dibujoCultivo('balanza'),
    ayuda: 'El dato anterior y el motivo quedan guardados en el historial.',
    campos: [
      { nombre: 'peso_g', etiqueta: 'Peso correcto', tipo: 'decimal', maximo: 100000000, unidad: 'gramos', obligatorio: true },
      { nombre: 'motivo', etiqueta: '¿Por qué lo corregís?', tipo: 'texto', largo: 500, obligatorio: true },
    ],
    boton: 'Corregir',
    alGuardar: async (datos) => {
      await accionCultivo('corregir_peso', { ...datos, cual });
      confirmar('Peso corregido.');
      await cargar();
    },
  });
}

function pintarFicha() {
  const { lote, analisis, merma, plantas } = actual;
  const edita = coordina() && activo();
  const textoAnalisis = analisis.map((a) => `${a.laboratorio}: THC ${cifra(a.thc)} %, CBD ${cifra(a.cbd)} %`).join(' · ');
  const baja = ANOTACIONES.find(({ tipo }) => tipo === 'baja');
  const recuadros = [
    recuadroDato({ titulo: 'Variedad', valor: lote.genetica }),
    recuadroDato({ titulo: 'Cómo empezó', valor: lote.origen === 'semilla' ? 'Semilla' : 'Esqueje' }),
    recuadroDato({ titulo: 'Fecha de inicio', valor: new Date(lote.creado_en).toLocaleDateString('es-AR') }),
    recuadroDato({ titulo: 'Sala', valor: lote.sala, alPulsar: edita ? cambiarSala : undefined }),
    recuadroDato({
      titulo: 'Plantas',
      valor: lote.cantidad_plantas,
      detalle: `De ${plantas.total} al empezar`,
      alPulsar: activo() && anota() ? () => anotar(baja) : undefined,
      verbo: 'Dar de baja',
    }),
    recuadroDato({
      titulo: 'Cosecha prevista',
      valor: lote.cosecha_prevista && fechaDia(lote.cosecha_prevista),
      alPulsar: edita ? () => editarDato('cosecha_prevista', 'Cosecha prevista', { etiqueta: 'Fecha prevista', tipo: 'fecha' }) : undefined,
    }),
    recuadroDato({
      titulo: 'Peso húmedo',
      valor: lote.peso_humedo_g && `${cifra(lote.peso_humedo_g)} g`,
      espera: 'Se pide al pasar a Cosecha',
      alPulsar: edita && lote.peso_humedo_g ? () => corregirPeso('humedo', 'Peso húmedo') : undefined,
      verbo: 'Corregir',
    }),
    recuadroDato({
      titulo: 'Peso seco',
      valor: lote.peso_seco_g && `${cifra(lote.peso_seco_g)} g`,
      detalle: merma === null ? undefined : `Perdió ${cifra(merma)} % al secar`,
      espera: 'Se pide al pasar a Curado',
      alPulsar: edita && lote.peso_seco_g ? () => corregirPeso('seco', 'Peso seco') : undefined,
      verbo: 'Corregir',
    }),
    recuadroDato({
      titulo: 'Análisis',
      valor: textoAnalisis,
      detalle: analisis.length ? undefined : 'Sin análisis no se puede envasar',
      alPulsar: coordina() ? ventanaAnalisis : undefined,
      verbo: analisis.length ? 'Agregar otro' : 'Rellenar',
    }),
    recuadroDato({
      titulo: 'Notas',
      valor: lote.notas,
      alPulsar: edita ? () => editarDato('notas', 'Notas del lote', { etiqueta: 'Notas', tipo: 'largo' }) : undefined,
    }),
  ];
  document.getElementById('ficha').replaceChildren(...recuadros);
  const llenos = recuadros.filter((recuadro) => recuadro.dataset.lleno === 'true').length;
  const progreso = document.getElementById('progreso');
  progreso.max = recuadros.length;
  progreso.value = llenos;
  document.getElementById('progreso-texto').textContent = `${llenos} de ${recuadros.length} recuadros rellenos`;
}

const TITULOS_REGISTRO = {
  ...Object.fromEntries(ANOTACIONES.map(({ tipo, titulo }) => [tipo, titulo])),
  correccion: 'Corrección',
};

function medidasDe(registro) {
  return [
    registro.altura_cm && `${cifra(registro.altura_cm)} cm de altura`,
    registro.litros && `${cifra(registro.litros)} litros`,
    registro.ph && `pH ${cifra(registro.ph)}`,
    registro.ec && `EC ${cifra(registro.ec)}`,
    registro.temperatura && `${cifra(registro.temperatura)} °C`,
    registro.humedad && `${cifra(registro.humedad)} % de humedad`,
    registro.plantas && textoPlantas(registro.plantas),
    registro.planta && `Planta ${registro.planta}`,
    registro.testigos && `Testigos: ${registro.testigos}`,
  ].filter(Boolean).join(' · ');
}

function apunte(registro) {
  const fila = nuevo('article', 'apunte');
  fila.dataset.tipo = registro.tipo;
  const circulo = nuevo('span', 'apunte-dibujo');
  const dibujo = registro.tipo === 'etapa' ? 'etapa-vegetativo' : registro.tipo;
  circulo.append(dibujoCultivo(dibujo));
  // Los cambios de etapa, de sala y el cierre ya se explican con su propio texto.
  const titulo = TITULOS_REGISTRO[registro.tipo] ?? registro.detalle;
  const cuerpo = nuevo('div', 'apunte-cuerpo');
  cuerpo.append(nuevo('strong', '', titulo));
  if (registro.detalle !== titulo) cuerpo.append(nuevo('p', '', registro.detalle));
  const medidas = medidasDe(registro);
  if (medidas) cuerpo.append(nuevo('p', 'nota', medidas));
  cuerpo.append(nuevo('p', 'nota', `${momento(registro.creado_en)} · ${nombreCorto(registro.responsable)}`));
  fila.append(circulo, cuerpo);
  return fila;
}

function pintarCrecimiento() {
  const mediciones = actual.registros.filter((registro) => registro.altura_cm !== null).reverse();
  const primera = mediciones[0];
  const ultima = mediciones[mediciones.length - 1];
  const textos = !mediciones.length
    ? []
    : [
      cajaCifra(`${cifra(ultima.altura_cm)} cm`, 'Altura actual', haceCuanto(ultima.creado_en), { dibujo: dibujoCultivo('crecimiento') }),
      mediciones.length > 1
        ? cajaCifra(`${cifra(Number(ultima.altura_cm) - Number(primera.altura_cm))} cm`, 'Creció en total', `En ${mediciones.length} mediciones`, { dibujo: dibujoCultivo('etapa-vegetativo') })
        : null,
    ].filter(Boolean);
  document.getElementById('crecimiento-cifras').replaceChildren(...textos);
  const contenedor = document.getElementById('crecimiento-grafico');
  if (mediciones.length) {
    contenedor.replaceChildren(graficoCrecimiento(mediciones));
  } else {
    contenedor.replaceChildren(nuevo('p', 'estado-vacio', 'Medí las plantas de vez en cuando: acá vas a ver cómo crecen.'));
  }
}

function pintarHistorial() {
  const { registros } = actual;
  const recientes = registros.slice(0, RECIENTES).map(apunte);
  if (!recientes.length) recientes.push(nuevo('p', 'estado-vacio', 'Todavía no hay nada anotado.'));
  document.getElementById('historial').replaceChildren(...recientes);
  document.getElementById('historial-anterior').replaceChildren(...registros.slice(RECIENTES).map(apunte));
  document.getElementById('bloque-anterior').classList.toggle('oculto', registros.length <= RECIENTES);
}

function pintarTareas() {
  const { tareas } = actual;
  document.getElementById('bloque-tareas').classList.toggle('oculto', tareas.length === 0);
  document.getElementById('tareas').replaceChildren(...tareas.map((tarea) => {
    const fila = nuevo('div', 'tarea-fila');
    const textos = nuevo('div');
    textos.append(
      nuevo('strong', '', tarea.titulo),
      nuevo('p', 'nota', `${tarea.vencida ? 'Venció el' : 'Para el'} ${fechaDia(tarea.vence_en)}`),
    );
    fila.append(textos);
    if (tarea.puede_completar) {
      fila.append(botonAccion('Hecha', async () => {
        await pedir('/api/tareas', { accion: 'completar', tarea_id: tarea.id });
        confirmar('Tarea hecha.');
        await cargar();
      }));
    }
    return fila;
  }));
}

function pintar() {
  const { lote, plantas, qr } = actual;
  document.getElementById('codigo').textContent = lote.genetica;
  document.title = `${lote.codigo} · Prototipo`;
  document.getElementById('datos').textContent =
    `${lote.codigo} · ${lote.sala} · ${textoPlantas(lote.cantidad_plantas)}`;
  document.getElementById('qr').src = qr;
  const etiquetas = document.getElementById('enlace-etiquetas');
  etiquetas.href = `/admin_etiquetas.html?id=${loteId}`;
  etiquetas.textContent = `Etiquetas: ${plantas.vivas} de ${plantas.total} plantas`;
  const avisoPlanta = document.getElementById('aviso-planta');
  avisoPlanta.classList.toggle('oculto', !plantaCodigo);
  avisoPlanta.textContent = `Estás en la planta ${plantaCodigo}: lo que anotes queda asociado a ella.`;
  document.getElementById('zona-descartar').classList.toggle('oculto', !(coordina() && activo()));
  pintarRecorrido();
  pintarLoQueSigue();
  pintarAnotar();
  pintarTareas();
  pintarCrecimiento();
  pintarFicha();
  pintarHistorial();
}

async function cargar() {
  actual = await pedir(`/api/cultivo_lote?id=${loteId}`);
  pintar();
}

document.getElementById('descartar').addEventListener('click', descartarLote);
arrancar(cargar, (sesion) => {
  rol = sesion.rol;
});
