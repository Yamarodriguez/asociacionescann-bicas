// Funciones comunes de todas las pantallas.
let tokenCsrf = '';

async function pedir(ruta, datos) {
  const opciones = { credentials: 'same-origin', headers: {} };
  if (datos !== undefined) {
    opciones.method = 'POST';
    opciones.headers['Content-Type'] = 'application/json';
    if (tokenCsrf) opciones.headers['X-CSRF-Token'] = tokenCsrf;
    opciones.body = JSON.stringify(datos);
  }
  let respuesta;
  try {
    respuesta = await fetch(ruta, opciones);
  } catch {
    throw new Error('No pudimos conectar. Revisá tu conexión y probá de nuevo.');
  }
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(cuerpo.error || 'Algo salió mal. Probá de nuevo más tarde.');
    error.estado = respuesta.status;
    throw error;
  }
  return cuerpo;
}

async function leerSesion() {
  try {
    const datos = await pedir('/api/sesion');
    tokenCsrf = datos.csrf;
    if (datos.falta_2fa && location.pathname !== '/admin_seguridad.html') {
      location.href = '/admin_seguridad.html';
    }
    return datos;
  } catch (error) {
    if (error.estado === 401) return null;
    throw error;
  }
}

function destinoDe(sesion) {
  if (sesion.tipo === 'admin') return '/admin.html';
  return sesion.estado === 'activo' ? '/perfil.html' : '/estado.html';
}

function mostrarMensaje(elemento, texto, clase = 'error') {
  elemento.className = `mensaje ${clase}`;
  elemento.textContent = texto;
  elemento.scrollIntoView({ block: 'center' });
}

function celdaTabla(etiqueta, texto) {
  const td = document.createElement('td');
  td.dataset.etiqueta = etiqueta;
  td.textContent = texto;
  return td;
}

const NOMBRES_CULTIVO = {
  floracion: 'floración', aplicacion: 'aplicación', medicion: 'medición', destruccion: 'destrucción',
  etapa: 'cambio de etapa',
};
const nombreCultivo = (clave) => NOMBRES_CULTIVO[clave] ?? clave;
const fechaDia = (valor) => valor.split('-').reverse().join('/');

function activarSalir() {
  const boton = document.getElementById('salir');
  if (!boton) return;
  boton.addEventListener('click', async () => {
    boton.disabled = true;
    try {
      await pedir('/api/logout', {});
    } finally {
      location.href = '/login.html';
    }
  });
}

async function cargarSitio() {
  try {
    const sitio = await (await fetch('/site.json')).json();
    document.querySelectorAll('[data-sitio]').forEach((elemento) => {
      elemento.textContent = sitio[elemento.dataset.sitio] ?? '';
    });
  } catch {
    // Los textos fijos de la pantalla siguen visibles.
  }
}

document.addEventListener('DOMContentLoaded', () => {
  activarSalir();
  cargarSitio();
});
