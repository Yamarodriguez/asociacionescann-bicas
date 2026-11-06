const estadoLista = document.getElementById('estado-lista');
const lista = document.getElementById('lista');

function tarjeta(contacto) {
  const articulo = document.createElement('article');
  articulo.className = 'tarjeta';
  const titulo = document.createElement('h2');
  titulo.textContent = contacto.nombre;
  const correo = document.createElement('p');
  correo.textContent = contacto.email;
  const fecha = document.createElement('p');
  fecha.className = 'nota';
  fecha.textContent = new Date(contacto.creado_en).toLocaleString('es-AR');
  const texto = document.createElement('p');
  texto.className = 'mensaje-contacto';
  texto.textContent = contacto.mensaje;
  articulo.append(titulo, correo, fecha, texto);
  return articulo;
}

async function iniciar() {
  try {
    const sesion = await leerSesion();
    if (!sesion || sesion.tipo !== 'admin') {
      location.href = '/login.html';
      return;
    }
    const { contactos } = await pedir('/api/admin_contactos');
    lista.replaceChildren(...contactos.map(tarjeta));
    estadoLista.className = contactos.length ? 'oculto' : 'estado-vacio';
    estadoLista.textContent = 'Todavía no hay mensajes.';
  } catch (error) {
    estadoLista.className = 'oculto';
    mostrarMensaje(document.getElementById('mensaje'), error.message);
  }
}

iniciar();
