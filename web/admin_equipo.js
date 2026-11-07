const COLUMNAS = ['pendiente', 'en_curso', 'hecho'];
const NOMBRE_COLUMNA = { pendiente: 'Pendiente', en_curso: 'En curso', hecho: 'Hecho' };
const FRANJAS = [
  { valor: 'manana', texto: 'Mañana' }, { valor: 'tarde', texto: 'Tarde' },
  { valor: 'noche', texto: 'Noche' }, { valor: 'guardia', texto: 'Guardia' },
];
let actual = null;

const accionEquipo = async (datos, texto) => {
  await pedir('/api/equipo', datos);
  confirmar(texto);
  await cargar();
};
const numeroDe = (valor) => (valor ? Number(valor) : null);
const personas = (vacio) => [
  ...(vacio ? [{ valor: '', texto: vacio }] : []),
  ...actual.personas.map(({ id, email }) => ({ valor: String(id), texto: nombreCorto(email) })),
];

function pintarFichaje({ fichaje_abierto: abierto, fichajes }) {
  const textos = nuevo('div');
  textos.append(
    nuevo('strong', '', abierto ? 'Estás trabajando' : 'No estás fichado'),
    nuevo('p', 'nota', abierto ? `Entraste: ${momento(abierto.entrada_en)}` : 'Fichá cuando empieces tu turno.'),
  );
  const accion = abierto ? 'salida' : 'entrada';
  document.getElementById('fichaje').replaceChildren(textos, botonAccion(
    abierto ? 'Fichar salida' : 'Fichar entrada', () => accionEquipo({ accion }, 'Fichaje guardado.'), '',
  ));
  pintarEn('fichajes', fichajes.map((fichaje) => filaApunte({
    titulo: nombreCorto(fichaje.persona),
    detalle: `Entró ${momento(fichaje.entrada_en)}`,
    pie: fichaje.salida_en ? `Salió ${momento(fichaje.salida_en)}` : 'Sigue trabajando',
    dibujo: dibujoDe('reloj'),
  })), 'Sin fichajes.');
}

function nuevoTurno() {
  abrirVentana({
    titulo: 'Nuevo turno',
    dibujo: dibujoDe('calendario'),
    campos: [
      { nombre: 'admin_id', etiqueta: '¿Quién trabaja?', tipo: 'lista', opciones: personas(), obligatorio: true },
      { nombre: 'fecha', etiqueta: '¿Qué día?', tipo: 'fecha', obligatorio: true, valor: fechaLocal() },
      { nombre: 'franja', etiqueta: '¿En qué turno?', tipo: 'elegir', opciones: FRANJAS, obligatorio: true },
    ],
    alGuardar: (datos) => accionEquipo({ ...datos, accion: 'crear_turno', admin_id: Number(datos.admin_id) }, 'Turno guardado.'),
  });
}

function pintarTurnos({ turnos, gestiona }) {
  const recuadros = turnos.map((turno) => recuadroFicha({
    titulo: fechaDia(turno.fecha),
    subtitulo: FRANJAS.find(({ valor }) => valor === turno.franja)?.texto ?? turno.franja,
    lineas: [nombreCorto(turno.persona)],
    acciones: gestiona ? [botonAccion('Quitar', () => accionEquipo({ accion: 'quitar_turno', id: turno.id }, 'Turno quitado.'))] : [],
  }));
  if (gestiona) recuadros.push(recuadroNuevo('Agregar un turno', 'Mañana, tarde, noche o guardia', nuevoTurno));
  pintarEn('turnos', recuadros, 'No hay turnos cargados.');
}

function nuevaNota() {
  abrirVentana({
    titulo: 'Nota para el turno siguiente',
    dibujo: dibujoDe('contacto'),
    campos: [{ nombre: 'texto', etiqueta: '¿Qué tiene que saber quien viene?', tipo: 'largo', largo: 2000, obligatorio: true }],
    alGuardar: (datos) => accionEquipo({ ...datos, accion: 'nota' }, 'Nota guardada.'),
  });
}

function recuadroProyecto(proyecto, gestiona) {
  return recuadroFicha({
    titulo: proyecto.titulo,
    lineas: [nombreCorto(proyecto.responsable)],
    acciones: gestiona ? COLUMNAS.filter((columna) => columna !== proyecto.columna).map((columna) => botonAccion(
      `Pasar a ${NOMBRE_COLUMNA[columna]}`, () => accionEquipo({ accion: 'mover_proyecto', id: proyecto.id, columna }, 'Proyecto movido.'),
    )) : [],
  });
}

function nuevoProyecto() {
  abrirVentana({
    titulo: 'Nuevo proyecto',
    campos: [
      { nombre: 'titulo', etiqueta: '¿De qué se trata?', tipo: 'texto', obligatorio: true },
      { nombre: 'responsable_id', etiqueta: '¿Quién lo lleva?', tipo: 'lista', opciones: personas('Sin responsable') },
    ],
    boton: 'Crear proyecto',
    alGuardar: (datos) => accionEquipo({ ...datos, accion: 'crear_proyecto', responsable_id: numeroDe(datos.responsable_id) }, 'Proyecto creado.'),
  });
}

function pintarProyectos({ proyectos, gestiona }) {
  for (const columna of COLUMNAS) {
    const fichas = proyectos.filter((proyecto) => proyecto.columna === columna).map((proyecto) => recuadroProyecto(proyecto, gestiona));
    if (gestiona && columna === 'pendiente') fichas.push(recuadroNuevo('Agregar un proyecto', 'Algo más largo que una tarea', nuevoProyecto));
    pintarEn(`columna-${columna}`, fichas, 'Nada por acá.');
  }
}

function nuevaRecurrente() {
  abrirVentana({
    titulo: 'Tarea que se repite',
    dibujo: dibujoDe('tareas'),
    ayuda: 'Se crea sola cada vez que toca.',
    campos: [
      { nombre: 'titulo', etiqueta: '¿Qué hay que hacer?', tipo: 'texto', obligatorio: true },
      { nombre: 'cada_dias', etiqueta: '¿Cada cuánto?', tipo: 'entero', minimo: 1, maximo: 366, unidad: 'días', obligatorio: true },
      { nombre: 'proxima_en', etiqueta: '¿Cuándo es la primera vez?', tipo: 'fecha', obligatorio: true, valor: fechaLocal() },
      { nombre: 'asignada_a', etiqueta: '¿Quién se encarga?', tipo: 'lista', opciones: personas('Sin responsable') },
    ],
    alGuardar: (datos) => accionEquipo({
      ...datos, accion: 'crear_recurrente', cada_dias: Number(datos.cada_dias), asignada_a: numeroDe(datos.asignada_a),
    }, 'Tarea creada.'),
  });
}

async function cargar() {
  actual = await pedir('/api/equipo');
  const { gestiona } = actual;
  pintarFichaje(actual);
  pintarTurnos(actual);
  pintarEn('notas', actual.notas.map((nota) => filaApunte({
    titulo: nombreCorto(nota.autor), texto: nota.texto, pie: momento(nota.creado_en), dibujo: dibujoDe('contacto'),
  })), 'Todavía no hay notas.');
  pintarProyectos(actual);
  document.getElementById('bloque-recurrentes').classList.toggle('oculto', !gestiona);
  if (gestiona) {
    const fichas = actual.recurrentes.map((tarea) => recuadroFicha({
      titulo: tarea.titulo,
      subtitulo: `Cada ${tarea.cada_dias} días`,
      lineas: [`Próxima: ${fechaDia(tarea.proxima_en)}`, nombreCorto(tarea.responsable)],
    }));
    fichas.push(recuadroNuevo('Agregar una tarea que se repite', 'Riegos, limpiezas, revisiones', nuevaRecurrente));
    pintarEn('recurrentes', fichas, '');
  }
}

document.getElementById('nueva-nota').addEventListener('click', nuevaNota);

arrancar(cargar);
