async function iniciar() {
  try {
    const sesion = await leerSesion();
    if (!sesion) {
      location.href = '/login.html';
      return;
    }
    if (sesion.tipo !== 'socio' || sesion.estado !== 'activo') {
      location.href = destinoDe(sesion);
      return;
    }
    document.getElementById('nombre').textContent = sesion.nombre;
    document.getElementById('numero').textContent = sesion.numero_socio;
  } catch (error) {
    mostrarMensaje(document.getElementById('error'), error.message);
  }
}

iniciar();
