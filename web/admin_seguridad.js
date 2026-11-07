const mensaje = document.getElementById('mensaje');
const mostrarSeccion = (id, visible = true) => document.getElementById(id).classList.toggle('oculto', !visible);

// Enciende el paso en curso y marca como hechos los anteriores.
function marcarPaso(actual) {
  document.getElementById('pasos').classList.remove('oculto');
  for (const numero of [1, 2, 3]) {
    let clase = 'pendiente';
    if (numero < actual) clase = 'hecha';
    if (numero === actual) clase = 'actual';
    document.getElementById(`paso-${numero}`).className = `etapa-caja ${clase}`;
  }
}

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
    if (!estado.activo) marcarPaso(1);
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
    marcarPaso(2);
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
    marcarPaso(3);
    mostrarMensaje(mensaje, 'Doble factor activado.', 'exito');
  } catch (error) {
    mostrarMensaje(mensaje, error.message);
    boton.disabled = false;
  }
});

iniciar();
