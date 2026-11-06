let rol = '';

async function cargar() {
  const { limite, socios } = await pedir('/api/mora');
  document.getElementById('regla').textContent = limite
    ? `Se propone suspender con ${limite} meses de atraso o más.`
    : 'Todavía no hay meses fijados: nadie se suspende por mora.';
  const afectados = limite ? socios.filter((socio) => socio.meses >= limite).length : 0;
  const acciones = [];
  if (rol === 'comision_directiva' && afectados) {
    acciones.push(botonAccion(`Suspender a ${afectados}`, async () => {
      if (!window.confirm('¿Confirmás la suspensión por mora?')) return;
      const { suspendidos } = await pedir('/api/mora', { accion: 'suspender' });
      avisar(`Socios suspendidos: ${suspendidos}.`, 'exito');
      await cargar();
    }, ''));
  }
  document.getElementById('accion').replaceChildren(...acciones);
  tablaEn('tabla', 'filas', socios.map((socio) => filaDe([
    ['Socio', socio.numero_socio], ['Nombre', `${socio.nombre} ${socio.apellido}`],
    ['Cuota hasta', socio.cuota_vigente_hasta ? fechaDia(socio.cuota_vigente_hasta) : 'Sin pagos'], ['Meses de atraso', socio.meses],
  ])));
  document.getElementById('sin-mora').classList.toggle('oculto', socios.length > 0);
}

arrancar(cargar, (sesion) => { rol = sesion.rol; });
