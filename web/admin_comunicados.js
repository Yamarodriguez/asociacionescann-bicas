const mensaje = document.getElementById('mensaje');
const formulario = document.getElementById('form-publicacion');
const estadoLista = document.getElementById('estado-lista');
const camposAsamblea = document.getElementById('campos-asamblea');

function actualizarTipo() {
  const esAsamblea = formulario.tipo.value === 'asamblea';
  camposAsamblea.classList.toggle('oculto', !esAsamblea);
  formulario.fecha.required = esAsamblea;
  formulario.lugar.required = esAsamblea;
  document.getElementById('etiqueta-cuerpo').textContent = esAsamblea ? 'Orden del día' : 'Texto';
}

function linea(tipo, publicacion) {
  const parrafo = document.createElement('p');
  const fecha = new Date(publicacion.publicado_en ?? publicacion.fecha).toLocaleDateString('es-AR');
  parrafo.textContent = `${tipo}: ${publicacion.titulo} · ${fecha}`;
  return parrafo;
}

async function cargar() {
  const datos = await pedir('/api/admin_publicaciones');
  const lineas = [
    ...datos.comunicados.map((p) => linea('Comunicado', p)),
    ...datos.documentos.map((p) => linea('Documento', p)),
    ...datos.asambleas.map((p) => linea('Asamblea', p)),
    ...datos.actas.map((p) => linea('Acta', p)),
  ];
  document.getElementById('lista').replaceChildren(...lineas);
  estadoLista.className = lineas.length ? 'oculto' : 'estado-vacio';
  estadoLista.textContent = 'Todavía no hay publicaciones.';
}

formulario.tipo.addEventListener('change', actualizarTipo);

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const boton = formulario.querySelector('button[type=submit]');
  boton.disabled = true;
  try {
    await pedir('/api/admin_publicaciones', Object.fromEntries(new FormData(formulario)));
    formulario.reset();
    actualizarTipo();
    mostrarMensaje(mensaje, 'Publicado.', 'exito');
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
    await cargar();
  } catch (error) {
    estadoLista.className = 'oculto';
    mostrarMensaje(mensaje, error.message);
  }
}

iniciar();
