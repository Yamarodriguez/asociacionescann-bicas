let puedeGestionar = false;
let actual = null;

const NOMBRE_MOVIMIENTO = { ingreso: 'Entrada', consumo: 'Consumo', ajuste: 'Ajuste' };
const accionInventario = async (datos, texto) => {
  await pedir('/api/inventario', datos);
  confirmar(texto);
  await cargar();
};

function boton(texto, clase, alPulsar) {
  const elemento = nuevo('button', clase, texto);
  elemento.type = 'button';
  elemento.addEventListener('click', alPulsar);
  return elemento;
}

function moverStock(insumo, tipo) {
  const PREGUNTAS = {
    ingreso: { titulo: `Entró ${insumo.nombre}`, cantidad: '¿Cuánto entró?', motivo: 'Entrada', dibujo: 'entra' },
    consumo: { titulo: `Se usó ${insumo.nombre}`, cantidad: '¿Cuánto se usó?', motivo: 'Consumo', dibujo: 'sale' },
    ajuste: { titulo: `Ajustar ${insumo.nombre}`, cantidad: '¿Cuánto hay que corregir?', motivo: '', dibujo: 'inventario' },
  };
  const texto = PREGUNTAS[tipo];
  const esAjuste = tipo === 'ajuste';
  abrirVentana({
    titulo: texto.titulo,
    dibujo: dibujoDe(texto.dibujo),
    ayuda: `Hoy hay ${cifra(insumo.stock)} ${insumo.unidad}.`,
    campos: [
      ...(esAjuste ? [{
        nombre: 'sentido', etiqueta: '¿Sobra o falta?', tipo: 'elegir', obligatorio: true,
        opciones: [{ valor: 'alta', texto: 'Hay más de lo anotado' }, { valor: 'baja', texto: 'Hay menos de lo anotado' }],
      }] : []),
      { nombre: 'cantidad', etiqueta: texto.cantidad, tipo: 'decimal', maximo: 100000000, unidad: insumo.unidad, obligatorio: true },
      { nombre: 'motivo', etiqueta: esAjuste ? '¿Por qué se corrige?' : 'Algo más que quieras anotar', tipo: 'texto', largo: 300, obligatorio: esAjuste },
    ],
    alGuardar: (datos) => accionInventario({
      ...datos, accion: 'movimiento', tipo, insumo_id: insumo.id, motivo: datos.motivo || texto.motivo,
    }, 'Inventario actualizado.'),
  });
}

function recuadroInsumo(insumo) {
  return recuadroFicha({
    titulo: insumo.nombre,
    subtitulo: insumo.categoria,
    destacado: `${cifra(insumo.stock)} ${insumo.unidad}`,
    alerta: insumo.bajo,
    lineas: [`Mínimo: ${cifra(insumo.stock_minimo)} ${insumo.unidad}`],
    etiquetas: [insumo.bajo ? etiquetaDe('Hay que reponer', true) : etiquetaDe('Alcanza')],
    acciones: puedeGestionar ? [
      boton('Entró', '', () => moverStock(insumo, 'ingreso')),
      boton('Se usó', 'secundario', () => moverStock(insumo, 'consumo')),
      boton('Ajustar', 'secundario', () => moverStock(insumo, 'ajuste')),
    ] : [],
  });
}

function nuevoInsumo() {
  abrirVentana({
    titulo: 'Nuevo insumo',
    dibujo: dibujoDe('inventario'),
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', largo: 120, obligatorio: true },
      {
        nombre: 'categoria', etiqueta: 'Categoría', tipo: 'texto', largo: 60, obligatorio: true,
        sugerencias: [...new Set(actual.insumos.map(({ categoria }) => categoria))],
      },
      { nombre: 'unidad', etiqueta: '¿En qué se mide?', tipo: 'elegir', obligatorio: true, opciones: ['unidades', 'litros', 'kilos', 'gramos'] },
      { nombre: 'stock_minimo', etiqueta: 'Avisame cuando queden menos de', tipo: 'decimal', maximo: 100000000 },
    ],
    alGuardar: (datos) => accionInventario({ ...datos, accion: 'crear_insumo' }, 'Insumo creado.'),
  });
}

function nuevaAveria(equipo) {
  abrirVentana({
    titulo: `Avería: ${equipo.nombre}`,
    dibujo: dibujoDe('alerta'),
    campos: [
      { nombre: 'detalle', etiqueta: '¿Qué le pasa?', tipo: 'largo', largo: 500, obligatorio: true },
      { nombre: 'coste', etiqueta: 'Cuánto costó arreglarlo', tipo: 'decimal', maximo: 1000000000, unidad: '$' },
    ],
    alGuardar: (datos) => accionInventario({ ...datos, accion: 'crear_averia', equipo_id: equipo.id }, 'Avería anotada.'),
  });
}

function recuadroEquipo(equipo) {
  const cuando = equipo.proximo_mantenimiento
    ? `Mantenimiento: ${fechaDia(equipo.proximo_mantenimiento)}` : 'Sin mantenimiento programado';
  return recuadroFicha({
    titulo: equipo.nombre,
    subtitulo: [equipo.tipo, equipo.sala].filter(Boolean).join(' · '),
    alerta: Boolean(equipo.vencido),
    lineas: [cuando, equipo.frecuencia_dias && `Se repite cada ${equipo.frecuencia_dias} días`],
    etiquetas: [equipo.vencido && etiquetaDe('Mantenimiento vencido', true)],
    acciones: puedeGestionar ? [boton('Anotar una avería', 'secundario', () => nuevaAveria(equipo))] : [],
  });
}

function nuevoEquipo() {
  abrirVentana({
    titulo: 'Nuevo equipo',
    ayuda: 'Luces, extractores, medidores: lo que necesita mantenimiento.',
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', largo: 120, obligatorio: true },
      {
        nombre: 'tipo', etiqueta: 'Tipo', tipo: 'texto', largo: 60, obligatorio: true,
        sugerencias: [...new Set(actual.equipos.map(({ tipo }) => tipo))],
      },
      {
        nombre: 'sala_id', etiqueta: '¿En qué sala está?', tipo: 'lista',
        opciones: [{ valor: '', texto: 'Sin sala' }, ...actual.salas.map(({ id, nombre }) => ({ valor: String(id), texto: nombre }))],
      },
      { nombre: 'proximo_mantenimiento', etiqueta: 'Próximo mantenimiento', tipo: 'fecha' },
      { nombre: 'frecuencia_dias', etiqueta: 'Repetir cada', tipo: 'entero', minimo: 1, maximo: 3660, unidad: 'días' },
    ],
    alGuardar: (datos) => accionInventario({
      ...datos,
      accion: 'crear_equipo',
      sala_id: datos.sala_id ? Number(datos.sala_id) : null,
      frecuencia_dias: datos.frecuencia_dias ? Number(datos.frecuencia_dias) : null,
    }, 'Equipo creado.'),
  });
}

function recuadroAveria(averia) {
  return recuadroFicha({
    titulo: averia.equipo,
    subtitulo: momento(averia.creado_en),
    alerta: !averia.resuelta_en,
    lineas: [averia.detalle, averia.coste && `Coste: ${dinero(averia.coste)}`],
    etiquetas: [etiquetaDe(averia.resuelta_en ? 'Resuelta' : 'Pendiente', !averia.resuelta_en)],
    acciones: puedeGestionar && !averia.resuelta_en
      ? [botonAccion('Ya está resuelta', () => accionInventario({ accion: 'resolver_averia', id: averia.id }, 'Avería resuelta.'), '')] : [],
  });
}

async function cargar() {
  actual = await pedir('/api/inventario');
  const { insumos, movimientos, equipos, averias } = actual;
  const pendientes = averias.filter((averia) => !averia.resuelta_en);
  const porReponer = insumos.filter((insumo) => insumo.bajo);
  document.getElementById('cifras').replaceChildren(
    cajaCifra(insumos.length, 'Insumos', '', { dibujo: dibujoDe('inventario') }),
    cajaCifra(porReponer.length, 'Por reponer', '', { dibujo: dibujoDe('alerta'), alerta: porReponer.length > 0 }),
    cajaCifra(pendientes.length, 'Averías sin resolver', '', { dibujo: dibujoDe('configuracion'), alerta: pendientes.length > 0 }),
  );
  const fichasInsumo = insumos.map(recuadroInsumo);
  if (puedeGestionar) fichasInsumo.push(recuadroNuevo('Agregar un insumo', 'Sustratos, abonos, envases…', nuevoInsumo));
  pintarEn('insumos', fichasInsumo, 'Todavía no hay insumos.');
  const fichasEquipo = equipos.map(recuadroEquipo);
  if (puedeGestionar) fichasEquipo.push(recuadroNuevo('Agregar un equipo', 'Para no olvidar su mantenimiento', nuevoEquipo));
  pintarEn('equipos', fichasEquipo, 'Todavía no hay equipos.');
  pintarEn('averias', averias.map(recuadroAveria), 'No hay averías anotadas.');
  pintarEn('movimientos', movimientos.map((movimiento) => filaApunte({
    titulo: `${movimiento.insumo}: ${cifra(Math.abs(movimiento.cantidad))} ${movimiento.unidad}`,
    detalle: [NOMBRE_MOVIMIENTO[movimiento.tipo], movimiento.motivo].filter(Boolean).join(' · '),
    pie: momento(movimiento.creado_en),
    dibujo: dibujoDe(Number(movimiento.cantidad) < 0 ? 'sale' : 'entra'),
  })), 'Todavía no hay movimientos.');
}

arrancar(cargar, (sesion) => { puedeGestionar = sesion.rol === 'coordinador_cultivo'; });
