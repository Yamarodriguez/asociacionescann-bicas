async function iniciar() {
  try {
    const sesion = await leerSesion();
    if (!sesion || sesion.tipo !== 'admin') {
      location.href = '/login.html';
      return;
    }
    if (!['comision_directiva', 'secretaria'].includes(sesion.rol)) {
      document.getElementById('bloque-sin-permisos').classList.remove('oculto');
      return;
    }
    const { socios } = await pedir('/api/admin_socios');
    document.getElementById('pendientes').textContent =
      socios.filter((socio) => socio.estado === 'pendiente').length;
    document.getElementById('bloque-socios').classList.remove('oculto');
  } catch (error) {
    mostrarMensaje(document.getElementById('error'), error.message);
  }
}

iniciar();
