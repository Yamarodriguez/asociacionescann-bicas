const mensaje = document.getElementById('mensaje');
const mostrarSeccion = (id, visible = true) => document.getElementById(id).classList.toggle('oculto', !visible);

async function iniciar() {
  try {
    const sesion = await leerSesion();
    if (!sesion || sesion.tipo !== 'admin') {
      location.href = '/login.html';
      return;
    }
    const estado = await pedir('/api/admin_seguridad');
    mostrarSeccion('volver', estado.activo || !estado.obligatorio);
    mostrarSeccion('estado-activo', estado.activo);
    mostrarSeccion('paso-inicio', !estado.activo);
    mostrarSeccion('aviso-obligatorio', estado.obligatorio && !estado.activo);
    document.getElementById('restantes').textContent = estado.codigos_restantes;
  } catch (error) {
    mostrarMensaje(mensaje, error.message);
  } finally {
    mostrarSeccion('cargando', false);
  }
}

document.getElementById('iniciar').addEventListener('click', async (evento) => {
  evento.target.disabled = true;
  try {
    const { qr, secreto } = await pedir('/api/admin_seguridad', { accion: 'iniciar' });
    document.getElementById('qr').src = qr;
    document.getElementById('secreto').textContent = secreto;
    mostrarSeccion('paso-inicio', false);
    mostrarSeccion('paso-confirmar');
  } catch (error) {
    mostrarMensaje(mensaje, error.message);
    evento.target.disabled = false;
  }
});

document.getElementById('paso-confirmar').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const boton = evento.target.querySelector('button[type=submit]');
  boton.disabled = true;
  try {
    const { codigos } = await pedir('/api/admin_seguridad', {
      accion: 'confirmar', codigo: evento.target.codigo.value.trim() });
    const elementos = codigos.map((valor) => {
      const item = document.createElement('li');
      item.textContent = valor;
      return item;
    });
    document.getElementById('codigos').replaceChildren(...elementos);
    mostrarSeccion('paso-confirmar', false);
    mostrarSeccion('volver');
    mostrarSeccion('paso-codigos');
    mostrarMensaje(mensaje, 'Doble factor activado.', 'exito');
  } catch (error) {
    mostrarMensaje(mensaje, error.message);
    boton.disabled = false;
  }
});

iniciar();
