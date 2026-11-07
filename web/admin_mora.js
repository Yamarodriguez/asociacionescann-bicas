let rol = '';

function recuadroSocio(socio, limite) {
  const superaLimite = Boolean(limite) && socio.meses >= limite;
  return recuadroFicha({
    titulo: `${socio.nombre} ${socio.apellido}`,
    subtitulo: `Socio ${socio.numero_socio}`,
    destacado: `${socio.meses} ${Number(socio.meses) === 1 ? 'mes' : 'meses'}`,
    alerta: superaLimite,
    lineas: [socio.cuota_vigente_hasta ? `Cuota hasta ${fechaDia(socio.cuota_vigente_hasta)}` : 'Sin pagos'],
    etiquetas: [superaLimite && etiquetaDe('Se propone suspender', true)],
  });
}

async function cargar() {
  const { limite, socios } = await pedir('/api/mora');
  document.getElementById('regla').textContent = limite
    ? `Se propone suspender con ${limite} ${Number(limite) === 1 ? 'mes' : 'meses'} de atraso o más.`
    : 'Todavía no hay meses fijados: nadie se suspende por atraso.';
  const afectados = limite ? socios.filter((socio) => socio.meses >= limite).length : 0;
  document.getElementById('cifras').replaceChildren(
    cajaCifra(socios.length, 'Socios atrasados', '', { dibujo: dibujoDe('mora') }),
    cajaCifra(afectados, 'Sobre el límite', '', { dibujo: dibujoDe('alerta'), alerta: afectados > 0 }),
  );
  const acciones = [];
  if (rol === 'comision_directiva' && afectados) {
    acciones.push(botonConfirmado(`Suspender a ${afectados}`, {
      titulo: 'Suspender por atraso',
      ayuda: `Se suspende a ${afectados} ${afectados === 1 ? 'socio' : 'socios'}. Después se puede reactivar desde Socios.`,
      boton: 'Sí, suspender',
      peligro: true,
      clase: '',
      alGuardar: async () => {
        const { suspendidos } = await pedir('/api/mora', { accion: 'suspender' });
        confirmar(`Socios suspendidos: ${suspendidos}.`);
        await cargar();
      },
    }));
  }
  document.getElementById('accion').replaceChildren(...acciones);
  pintarEn('socios', socios.map((socio) => recuadroSocio(socio, limite)), 'No hay socios atrasados.');
}

arrancar(cargar, (sesion) => { rol = sesion.rol; });
