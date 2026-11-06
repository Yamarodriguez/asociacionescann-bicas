const mensaje = document.getElementById('mensaje');
const estadoLista = document.getElementById('estado-lista');
const formulario = document.getElementById('form-tarea');
let rol = '';

function tarjeta(tarea, yo) {
  const articulo = document.createElement('article');
  articulo.className = 'tarjeta';
  const titulo = document.createElement('h2');
  titulo.textContent = tarea.titulo;
  const datos = document.createElement('p');
  datos.className = 'nota';
  const partes = [`Vence: ${fechaDia(tarea.vence_en)}`, tarea.lote && `Lote: ${tarea.lote}`, tarea.responsable ?? 'Sin responsable'];
  datos.textContent = partes.filter(Boolean).join(' · ');
  articulo.append(titulo, datos);
  if (tarea.vencida) {
    const aviso = document.createElement('span');
    aviso.className = 'etiqueta pendiente';
    aviso.textContent = 'vencida';
    articulo.append(aviso, ' ');
  }
  if (tarea.completada_en) {
    const hecha = document.createElement('span');
    hecha.className = 'etiqueta';
    hecha.textContent = 'hecha';
    articulo.append(hecha);
    return articulo;
  }
  const puede = rol === 'coordinador_cultivo' || (rol === 'cultivador' && [null, yo].includes(tarea.asignada_a));
  if (puede) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = 'Marcar como hecha';
    boton.addEventListener('click', async () => {
      boton.disabled = true;
      try {
        await pedir('/api/tareas', { accion: 'completar', tarea_id: tarea.id });
        mostrarMensaje(mensaje, 'Tarea hecha.', 'exito');
        await cargar();
      } catch (error) {
        mostrarMensaje(mensaje, error.message);
        boton.disabled = false;
      }
    });
    articulo.append(boton);
  }
  return articulo;
}

async function cargar() {
  const { tareas, equipo, yo, puede_crear: puedeCrear } = await pedir('/api/tareas');
  document.getElementById('lista').replaceChildren(...tareas.map((t) => tarjeta(t, yo)));
  estadoLista.className = tareas.length ? 'oculto' : 'estado-vacio';
  estadoLista.textContent = 'No hay tareas.';
  formulario.classList.toggle('oculto', !puedeCrear);
  const sinResponsable = document.createElement('option');
  sinResponsable.value = '';
  sinResponsable.textContent = 'Sin responsable';
  const personas = equipo.map((persona) => {
    const opcion = document.createElement('option');
    opcion.value = persona.id;
    opcion.textContent = persona.email;
    return opcion;
  });
  document.getElementById('asignada_a').replaceChildren(sinResponsable, ...personas);
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const boton = formulario.querySelector('button[type=submit]');
  boton.disabled = true;
  try {
    const datos = Object.fromEntries(new FormData(formulario));
    await pedir('/api/tareas', {
      ...datos, accion: 'crear', asignada_a: datos.asignada_a ? Number(datos.asignada_a) : null,
    });
    formulario.reset();
    mostrarMensaje(mensaje, 'Tarea creada.', 'exito');
    await cargar();
  } catch (error) {
    mostrarMensaje(mensaje, error.message);
  } finally {
    boton.disabled = false;
  }
});

async function iniciar() {
  try {
    const sesion = await leerSesion();
    if (!sesion || sesion.tipo !== 'admin') {
      location.href = '/login.html';
      return;
    }
    rol = sesion.rol;
    await cargar();
  } catch (error) {
    estadoLista.className = 'oculto';
    mostrarMensaje(mensaje, error.message);
  }
}

iniciar();
