const accionPedido = (accion, id, texto) => async () => {
  await pedir('/api/abastecimiento', { accion, pedido_id: id });
  avisar(texto, 'exito');
  await cargar();
};

async function cargarCostes(pedido) {
  for (const linea of pedido.detalle) {
    const coste = window.prompt(`Coste por unidad de ${linea.insumo}`, linea.coste_unitario);
    if (coste === null) break;
    await pedir('/api/abastecimiento', {
      accion: 'costear', pedido_id: pedido.id, insumo_id: linea.insumo_id, coste_unitario: coste.replace(',', '.'),
    });
  }
  await cargar();
}

function accionesDe(pedido) {
  const contenedor = document.createElement('div');
  if (pedido.estado === 'borrador') {
    contenedor.append(botonAccion('Cargar costes', () => cargarCostes(pedido)), ' ');
    if (!pedido.sin_coste) contenedor.append(botonAccion('Aprobar', accionPedido('aprobar', pedido.id, 'Pedido aprobado.')), ' ');
  }
  if (pedido.estado === 'aprobado') {
    contenedor.append(botonAccion('Recibir', accionPedido('recibir', pedido.id, 'Pedido recibido: el stock ya está sumado.')), ' ');
  }
  if (['borrador', 'aprobado'].includes(pedido.estado)) {
    contenedor.append(botonAccion('Cancelar', accionPedido('cancelar', pedido.id, 'Pedido cancelado.')));
  }
  return contenedor;
}

async function cargar() {
  const datos = await pedir('/api/abastecimiento');
  document.getElementById('regla').textContent =
    `La coordinación aprueba hasta ${dinero(datos.limite)}. Por encima, lo aprueba la comisión.`;
  tablaEn('tabla', 'filas', datos.pedidos.map((pedido) => filaDe([
    ['Pedido', pedido.id], ['Proveedor', pedido.proveedor], ['Insumos', pedido.lineas], ['Total', dinero(pedido.total)],
    ['Estado', pedido.estado === 'borrador' && pedido.sin_coste ? 'borrador, faltan costes' : pedido.estado], ['Acciones', accionesDe(pedido)],
  ])));
  document.getElementById('sin-pedidos').classList.toggle('oculto', datos.pedidos.length > 0);
  opcionesEn('proveedor_id', datos.proveedores, 'nombre');
  opcionesEn('faltantes-proveedor', datos.proveedores, 'nombre');
  opcionesEn('insumo_id', datos.insumos, 'nombre');
  parrafosEn('proveedores', datos.proveedores.map((p) => `${p.nombre}${p.contacto ? ` · ${p.contacto}` : ''}`), 'Todavía no hay proveedores.');
  parrafosEn('costes', datos.costes.map((c) => `${c.insumo} · ${c.proveedor} · ${dinero(c.coste_unitario)} por ${c.unidad} · ${fechaDia(c.fecha)}`), 'Todavía no hay costes.');
}

enviarForm('form-pedido', '/api/abastecimiento', (datos) => ({
  accion: 'crear_pedido',
  proveedor_id: Number(datos.proveedor_id),
  lineas: [{ insumo_id: Number(datos.insumo_id), cantidad: datos.cantidad, coste_unitario: datos.coste_unitario }],
}), cargar);
enviarForm('form-faltantes', '/api/abastecimiento', (datos) => ({ accion: 'borrador_faltantes', proveedor_id: Number(datos.proveedor_id) }), cargar);
enviarForm('form-proveedor', '/api/abastecimiento', (datos) => ({ ...datos, accion: 'crear_proveedor' }), cargar);

arrancar(cargar);
