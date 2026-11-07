const TEXTOS = {
  pendiente: 'Tu solicitud está pendiente. Para aprobarla tenemos que verificar tu identidad en persona.',
  suspendido: 'Tu cuenta está suspendida. Comunicate con la administración.',
};

async function iniciar() {
  const contenido = document.getElementById('contenido');
  const parrafo = document.createElement('p');
  try {
    const sesion = await leerSesion();
    if (!sesion) {
      location.href = '/login.html';
      return;
    }
    if (sesion.tipo !== 'socio' || sesion.estado === 'activo') {
      location.href = destinoDe(sesion);
      return;
    }
    parrafo.textContent = TEXTOS[sesion.estado];
    document.getElementById('pasos').classList.toggle('oculto', sesion.estado !== 'pendiente');
  } catch (error) {
    parrafo.className = 'error mensaje';
    parrafo.textContent = error.message;
  }
  contenido.replaceChildren(parrafo);
}

iniciar();
