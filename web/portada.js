const CLAVE_EDAD = 'aviso_edad';

function edadConfirmada() {
  try {
    return localStorage.getItem(CLAVE_EDAD) === 'si';
  } catch {
    return false;
  }
}

function recordarEdad() {
  try {
    localStorage.setItem(CLAVE_EDAD, 'si');
  } catch {
    // Sin almacenamiento, el aviso volverá a aparecer en la próxima visita.
  }
}

async function iniciarAvisoEdad() {
  const aviso = document.getElementById('aviso-edad');
  if (edadConfirmada()) return;
  aviso.showModal();
  // El aviso solo se cierra respondiendo.
  aviso.addEventListener('cancel', (evento) => evento.preventDefault());
  document.getElementById('edad-si').addEventListener('click', () => {
    recordarEdad();
    aviso.close();
  });
  document.getElementById('edad-no').addEventListener('click', () => {
    document.getElementById('aviso-edad-texto').textContent =
      'Este sitio no está disponible para vos.';
    document.getElementById('aviso-edad-acciones').remove();
  });
  try {
    const { edad_minima: edad } = await pedir('/api/publico');
    document.getElementById('aviso-edad-texto').textContent =
      `Este sitio es solo para personas de ${edad} años o más.`;
  } catch {
    // Se mantiene el texto general.
  }
}

function iniciarContacto() {
  const formulario = document.getElementById('form-contacto');
  const mensaje = document.getElementById('contacto-mensaje');
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = formulario.querySelector('button[type=submit]');
    boton.disabled = true;
    mensaje.textContent = '';
    try {
      const datos = Object.fromEntries(new FormData(formulario));
      datos.consentimiento = formulario.consentimiento.checked;
      const respuesta = await pedir('/api/contacto', datos);
      formulario.reset();
      mostrarMensaje(mensaje, respuesta.mensaje, 'exito');
    } catch (error) {
      mostrarMensaje(mensaje, error.message);
    } finally {
      boton.disabled = false;
    }
  });
}

iniciarAvisoEdad();
iniciarContacto();
