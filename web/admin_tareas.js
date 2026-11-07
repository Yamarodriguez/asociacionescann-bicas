let estado = null;

const unicos = (valores) => [...new Set(valores.filter(Boolean))].sort();
const accionTarea = async (datos, texto) => {
  await pedir('/api/tareas', datos);
  confirmar(texto);
  await cargar();
};
const opcionesPersonas = () => [
  { valor: '', texto: 'Sin responsable' },
  ...estado.equipo.map(({ id, email }) => ({ valor: String(id), texto: nombreCorto(email) })),
];

function cambiarResponsable(tarea) {
  abrirVentana({
    titulo: 'Cambiar responsable',
    ayuda: tarea.titulo,
    campos: [{
      nombre: 'asignada_a', etiqueta: '¿Quién se encarga?', tipo: 'lista', opciones: opcionesPersonas(), valor: String(tarea.asignada_a ?? ''),
    }],
    alGuardar: ({ asignada_a: persona }) => accionTarea(
      { accion: 'asignar', tarea_id: tarea.id, asignada_a: persona ? Number(persona) : null }, 'Responsable cambiado.',
    ),
  });
}

function nuevaTarea() {
  abrirVentana({
    titulo: 'Nueva tarea',
    dibujo: dibujoDe('tareas'),
    campos: [
      { nombre: 'titulo', etiqueta: '¿Qué hay que hacer?', tipo: 'texto', obligatorio: true },
      { nombre: 'vence_en', etiqueta: '¿Para cuándo?', tipo: 'fecha', obligatorio: true, valor: estado.hoy },
      { nombre: 'asignada_a', etiqueta: '¿Quién se encarga?', tipo: 'lista', opciones: opcionesPersonas() },
    ],
    boton: 'Crear tarea',
    alGuardar: (datos) => accionTarea(
      { ...datos, accion: 'crear', asignada_a: datos.asignada_a ? Number(datos.asignada_a) : null }, 'Tarea creada.',
    ),
  });
}

function puedeCompletar(tarea) {
  if (estado.puede_crear || tarea.asignada_a === estado.yo) return true;
  return estado.rol === 'cultivador' && tarea.asignada_a === null;
}

function recuadroTarea(tarea) {
  const hecha = Boolean(tarea.completada_en);
  const acciones = [];
  if (!hecha && puedeCompletar(tarea)) {
    acciones.push(botonAccion('Hecha', () => accionTarea({ accion: 'completar', tarea_id: tarea.id }, 'Tarea hecha.'), ''));
  }
  if (!hecha && estado.puede_crear) {
    const cambiar = nuevo('button', 'secundario', 'Cambiar responsable');
    cambiar.type = 'button';
    cambiar.addEventListener('click', () => cambiarResponsable(tarea));
    acciones.push(cambiar);
  }
  return recuadroFicha({
    titulo: tarea.titulo,
    subtitulo: hecha ? momento(tarea.completada_en) : `Para el ${fechaDia(tarea.vence_en)}`,
    alerta: Boolean(tarea.vencida),
    lineas: [
      [tarea.lote && `Lote ${tarea.lote}`, tarea.sala].filter(Boolean).join(' · '),
      hecha ? `La hizo ${nombreCorto(tarea.hecha_por)}` : nombreCorto(tarea.responsable),
    ],
    etiquetas: [tarea.vencida && etiquetaDe('Vencida', true)],
    acciones,
  });
}

function pintarCifras() {
  const pendientes = estado.tareas.filter((tarea) => !tarea.completada_en);
  const vencidas = pendientes.filter((tarea) => tarea.vencida);
  const hoy = pendientes.filter((tarea) => tarea.vence_en === estado.hoy);
  document.getElementById('cifras').replaceChildren(
    cajaCifra(hoy.length, 'Para hoy', '', { dibujo: dibujoDe('calendario') }),
    cajaCifra(vencidas.length, vencidas.length === 1 ? 'Vencida' : 'Vencidas', '', { dibujo: dibujoDe('alerta'), alerta: vencidas.length > 0 }),
    cajaCifra(pendientes.length, 'Pendientes en total', '', { dibujo: dibujoDe('tareas') }),
  );
}

function pintar() {
  const vista = valorFiltro('vista');
  const persona = document.getElementById('filtro-persona').value;
  const sala = document.getElementById('filtro-sala').value;
  const visibles = estado.tareas.filter((tarea) => {
    if (vista === 'hechas' && !tarea.completada_en) return false;
    if (vista !== 'hechas' && tarea.completada_en) return false;
    if (vista === 'hoy' && tarea.vence_en > estado.hoy) return false;
    if (persona && tarea.responsable !== persona) return false;
    return !sala || tarea.sala === sala;
  });
  const recuadros = visibles.map(recuadroTarea);
  if (estado.puede_crear) recuadros.push(recuadroNuevo('Nueva tarea', 'Para vos o para alguien del equipo', nuevaTarea));
  pintarEn('lista', recuadros, 'No hay tareas para mostrar.');
}

function opcionesFiltro(id, valores, vacio) {
  const actual = document.getElementById(id).value;
  opcionesEn(id, valores.map((valor) => ({ id: valor, nombre: nombreCorto(valor) })), 'nombre', vacio);
  if (valores.includes(actual)) document.getElementById(id).value = actual;
}

async function cargar() {
  estado = await pedir('/api/tareas');
  opcionesFiltro('filtro-persona', unicos(estado.tareas.map((tarea) => tarea.responsable)), 'Todas');
  opcionesFiltro('filtro-sala', unicos(estado.tareas.map((tarea) => tarea.sala)), 'Todas');
  pintarCifras();
  pintar();
}

filtroRecuadros('vistas', 'vista', [
  { valor: 'hoy', texto: 'Para hoy' }, { valor: 'pendientes', texto: 'Todas las pendientes' }, { valor: 'hechas', texto: 'Hechas' },
], pintar);
for (const id of ['filtro-persona', 'filtro-sala']) document.getElementById(id).addEventListener('change', pintar);

arrancar(cargar);
