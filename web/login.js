const mensaje = document.getElementById('mensaje');
const formIngreso = document.getElementById('form-ingreso');
const formSolicitud = document.getElementById('form-solicitud');
const verIngreso = document.getElementById('ver-ingreso');
const verSolicitud = document.getElementById('ver-solicitud');
const form2fa = document.getElementById('form-2fa');

function mostrar(ingreso) {
  formIngreso.classList.toggle('oculto', !ingreso);
  formSolicitud.classList.toggle('oculto', ingreso);
  verIngreso.classList.toggle('secundario', !ingreso);
  verSolicitud.classList.toggle('secundario', ingreso);
  mensaje.textContent = '';
}

verIngreso.addEventListener('click', () => mostrar(true));
verSolicitud.addEventListener('click', () => mostrar(false));

async function enviar(formulario, accion) {
  const boton = formulario.querySelector('button[type=submit]');
  boton.disabled = true;
  mensaje.textContent = '';
  try {
    await accion();
  } catch (error) {
    mostrarMensaje(mensaje, error.message);
  } finally {
    boton.disabled = false;
  }
}

formIngreso.addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviar(formIngreso, async () => {
    const datos = new FormData(formIngreso);
    const respuesta = await pedir('/api/login', { email: datos.get('email'), clave: datos.get('clave') });
    if (respuesta.requiere_2fa) {
      formIngreso.reset();
      formIngreso.classList.add('oculto');
      document.querySelector('.pestanas').classList.add('oculto');
      form2fa.classList.remove('oculto');
      document.getElementById('codigo-2fa').focus();
      return;
    }
    location.href = destinoDe(await leerSesion());
  });
});

form2fa.addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviar(form2fa, async () => {
    await pedir('/api/login_2fa', { codigo: form2fa.codigo.value });
    location.href = destinoDe(await leerSesion());
  });
});

formSolicitud.addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviar(formSolicitud, async () => {
    const datos = Object.fromEntries(new FormData(formSolicitud));
    datos.consentimiento = formSolicitud.consentimiento.checked;
    datos.estatutos = formSolicitud.estatutos.checked;
    const respuesta = await pedir('/api/solicitud', datos);
    formSolicitud.reset();
    mostrar(true);
    mostrarMensaje(mensaje, respuesta.mensaje, 'exito');
  });
});

pedir('/api/publico').then(({ aval_activo: aval }) => {
  document.getElementById('campo-aval').classList.toggle('oculto', !aval);
  document.getElementById('avalista_numero_socio').required = aval;
}).catch(() => {});

leerSesion().then((sesion) => {
  if (sesion) location.href = destinoDe(sesion);
}).catch(() => {});
