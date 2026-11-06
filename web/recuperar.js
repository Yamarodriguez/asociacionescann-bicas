const mensaje = document.getElementById('mensaje');
const formPedir = document.getElementById('form-pedir');
const formCambiar = document.getElementById('form-cambiar');
const token = new URLSearchParams(location.hash.slice(1)).get('t');

if (token) {
  formPedir.classList.add('oculto');
  formCambiar.classList.remove('oculto');
  // El codigo no queda en el historial del navegador.
  history.replaceState(null, '', location.pathname);
}

async function enviar(formulario, accion) {
  const boton = formulario.querySelector('button[type=submit]');
  boton.disabled = true;
  try {
    await accion();
  } catch (error) {
    mostrarMensaje(mensaje, error.message);
  } finally {
    boton.disabled = false;
  }
}

formPedir.addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviar(formPedir, async () => {
    const respuesta = await pedir('/api/recuperar', { email: formPedir.email.value });
    formPedir.reset();
    mostrarMensaje(mensaje, respuesta.mensaje, 'exito');
  });
});

formCambiar.addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviar(formCambiar, async () => {
    const respuesta = await pedir('/api/recuperar_cambiar', { token, clave: formCambiar.clave.value });
    formCambiar.classList.add('oculto');
    mostrarMensaje(mensaje, respuesta.mensaje, 'exito');
  });
});
