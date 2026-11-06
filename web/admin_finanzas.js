let anio = 0;

function filaMovimiento(movimiento) {
  let estado = etiquetaDe('vigente');
  if (movimiento.anulado_en) {
    estado = etiquetaDe(`anulado: ${movimiento.anulado_motivo}`, true);
  } else if (!movimiento.cuota_id) {
    estado = botonAccion('Anular', async () => {
      const motivo = window.prompt('Motivo de la anulación');
      if (!motivo) return;
      await pedir('/api/finanzas', { accion: 'anular', id: movimiento.id, motivo });
      avisar('Movimiento anulado.', 'exito');
      await cargar();
    });
  }
  return filaDe([
    ['Fecha', fechaDia(movimiento.fecha)], ['Tipo', movimiento.tipo], ['Categoría', movimiento.categoria],
    ['Concepto', movimiento.concepto], ['Importe', dinero(movimiento.importe)], ['Método', movimiento.metodo],
    ['Estado', estado],
  ]);
}

function filaPresupuesto(linea) {
  const diferencia = Number(linea.previsto) - Number(linea.real);
  return filaDe([
    ['Tipo', linea.tipo], ['Categoría', linea.categoria], ['Previsto', dinero(linea.previsto)],
    ['Real', dinero(linea.real)], ['Diferencia', dinero(diferencia)],
  ]);
}

async function cargar() {
  const datos = await pedir('/api/finanzas');
  anio = datos.anio;
  const { caja } = datos;
  document.getElementById('caja').textContent =
    `Efectivo en caja: ${dinero(caja.efectivo)}. Hoy: ingresos ${dinero(caja.ingresos)}, gastos ${dinero(caja.gastos)}.`;
  document.getElementById('estado-caja').textContent = datos.cerrado_hoy ? 'El día de hoy ya está cerrado.' : 'El día de hoy está abierto.';
  document.getElementById('titulo-presupuesto').textContent = `Presupuesto ${datos.anio}`;
  document.getElementById('fecha').value = datos.hoy;
  document.getElementById('cierre-fecha').value = datos.hoy;
  tablaEn('tabla-movimientos', 'filas-movimientos', datos.movimientos.map(filaMovimiento));
  document.getElementById('sin-movimientos').classList.toggle('oculto', datos.movimientos.length > 0);
  tablaEn('tabla-presupuesto', 'filas-presupuesto', datos.presupuesto.map(filaPresupuesto));
  parrafosEn('cierres', datos.cierres.map((c) => {
    const notas = c.notas ? ` · ${c.notas}` : '';
    return `${fechaDia(c.fecha)} · esperado ${dinero(c.esperado)} · contado ${dinero(c.contado)} · diferencia ${dinero(c.diferencia)}${notas}`;
  }), 'Todavía no hay cierres.');
}

enviarForm('form-movimiento', '/api/finanzas', (datos) => ({ ...datos, accion: 'movimiento' }), cargar);
enviarForm('form-cierre', '/api/finanzas', (datos) => ({ ...datos, accion: 'cerrar' }), cargar);
enviarForm('form-presupuesto', '/api/finanzas', (datos) => ({ ...datos, accion: 'presupuesto', anio }), cargar);

arrancar(cargar);
