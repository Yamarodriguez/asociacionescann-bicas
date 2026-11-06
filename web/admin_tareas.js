const accionTarea = async (datos, texto) => {
  await pedir('/api/tareas', datos);
  avisar(texto, 'exito');
  await cargar();
};
const unicos = (valores) => [...new Set(valores.filter(Boolean))].sort();
let estado = null;

function selectorResponsable(tarea) {
  const selector = document.createElement('select');
  selector.setAttribute('aria-label', `Responsable de ${tarea.titulo}`);
  const opciones = [{ id: '', email: 'Sin responsable' }, ...estado.equipo].map((persona) => {
    const opcion = document.createElement('option');
    opcion.value = persona.id;
    opcion.textContent = persona.email;
    return opcion;
  });
  selector.replaceChildren(...opciones);
  selector.value = tarea.asignada_a ?? '';
  selector.addEventListener('change', async () => {
    try {
      await accionTarea({ accion: 'asignar', tarea_id: tarea.id, asignada_a: selector.value ? Number(selector.value) : null }, 'Tarea reasignada.');
    } catch (error) {
      avisar(error.message);
    }
  });
  return selector;
}

function puedeCompletar(tarea) {
  if (estado.puede_crear || tarea.asignada_a === estado.yo) return true;
  return estado.rol === 'cultivador' && tarea.asignada_a === null;
}

function tarjeta(tarea) {
  const articulo = document.createElement('article');
  articulo.className = 'tarjeta';
  const titulo = document.createElement('h2');
  titulo.textContent = tarea.titulo;
  const datos = document.createElement('p');
  datos.className = 'nota';
  const partes = [
    `Vence: ${fechaDia(tarea.vence_en)}`, tarea.lote && `Lote: ${tarea.lote}`, tarea.sala,
    tarea.responsable ?? 'Sin responsable',
  ];
  datos.textContent = partes.filter(Boolean).join(' · ');
  articulo.append(titulo, datos);
  if (tarea.vencida) articulo.append(etiquetaDe('vencida', true), ' ');
  if (tarea.completada_en) {
    articulo.append(etiquetaDe(`hecha por ${tarea.hecha_por} · ${momento(tarea.completada_en)}`));
    return articulo;
  }
  if (estado.puede_crear) articulo.append(selectorResponsable(tarea));
  if (puedeCompletar(tarea)) {
    articulo.append(botonAccion('Marcar como hecha', () => accionTarea({ accion: 'completar', tarea_id: tarea.id }, 'Tarea hecha.'), ''));
  }
  return articulo;
}

function pintar() {
  const vista = document.getElementById('vista').value;
  const persona = document.getElementById('filtro-persona').value;
  const sala = document.getElementById('filtro-sala').value;
  const visibles = estado.tareas.filter((tarea) => {
    if (vista === 'hechas' && !tarea.completada_en) return false;
    if (vista !== 'hechas' && tarea.completada_en) return false;
    if (vista === 'hoy' && tarea.vence_en > estado.hoy) return false;
    if (persona && tarea.responsable !== persona) return false;
    return !sala || tarea.sala === sala;
  });
  document.getElementById('lista').replaceChildren(...visibles.map(tarjeta));
  document.getElementById('vacio').classList.toggle('oculto', visibles.length > 0);
}

function opcionesFiltro(id, valores, vacio) {
  const actual = document.getElementById(id).value;
  opcionesEn(id, valores.map((valor) => ({ id: valor, nombre: valor })), 'nombre', vacio);
  if (valores.includes(actual)) document.getElementById(id).value = actual;
}

async function cargar() {
  estado = await pedir('/api/tareas');
  document.getElementById('form-tarea').classList.toggle('oculto', !estado.puede_crear);
  opcionesFiltro('filtro-persona', unicos(estado.tareas.map((t) => t.responsable)), 'Todas');
  opcionesFiltro('filtro-sala', unicos(estado.tareas.map((t) => t.sala)), 'Todas');
  opcionesEn('asignada_a', estado.equipo, 'email', 'Sin responsable');
  pintar();
}

for (const id of ['vista', 'filtro-persona', 'filtro-sala']) {
  document.getElementById(id).addEventListener('change', pintar);
}

enviarForm('form-tarea', '/api/tareas', (datos) => ({
  ...datos, accion: 'crear', asignada_a: datos.asignada_a ? Number(datos.asignada_a) : null,
}), cargar);

arrancar(cargar);
