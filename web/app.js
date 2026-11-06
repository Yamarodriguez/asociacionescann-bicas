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

// Selector para comparar disenos. Se retirara cuando se elija uno.
function crearSelectorTema() {
  const aviso = document.querySelector('.aviso-prototipo');
  if (!aviso) return;
  const opciones = [['a', 'Diseño A'], ['b', 'Diseño B'], ['mezcla', 'Mezcla']];
  const selector = document.createElement('div');
  selector.className = 'selector-tema';
  selector.setAttribute('role', 'group');
  selector.setAttribute('aria-label', 'Elegir diseño de prueba');
  const botones = opciones.map(([valor, texto]) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = texto;
    boton.dataset.valor = valor;
    boton.addEventListener('click', () => {
      if (valor === 'mezcla') delete document.documentElement.dataset.tema;
      else document.documentElement.dataset.tema = valor;
      try {
        localStorage.setItem('tema', valor);
      } catch {
        // El cambio sigue activo en esta pantalla.
      }
      marcar();
    });
    return boton;
  });
  function marcar() {
    const actual = document.documentElement.dataset.tema || 'mezcla';
    for (const boton of botones) {
      const activo = boton.dataset.valor === actual;
      boton.classList.toggle('secundario', !activo);
      boton.setAttribute('aria-pressed', String(activo));
    }
  }
  selector.append(...botones);
  aviso.after(selector);
  marcar();
}

document.addEventListener('DOMContentLoaded', () => {
  crearSelectorTema();
  activarSalir();
  cargarSitio();
});
