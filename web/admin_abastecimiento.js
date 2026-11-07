let actual = null;

const ESTADOS = { borrador: 'Borrador', aprobado: 'Aprobado', recibido: 'Recibido', cancelado: 'Cancelado' };
const opcionesDe = (lista) => lista.map(({ id, nombre }) => ({ valor: String(id), texto: nombre }));
const accionPedido = async (datos, texto) => {
  await pedir('/api/abastecimiento', datos);
  confirmar(texto);
  await cargar();
};

function cargarCostes(pedido) {
  abrirVentana({
    titulo: `Costes del pedido ${pedido.id}`,
    ayuda: 'Hasta tener todos los costes, el pedido no se puede aprobar.',
    campos: pedido.detalle.map((linea) => ({
      nombre: `coste_${linea.insumo_id}`, etiqueta: `Coste por unidad de ${linea.insumo}`, tipo: 'decimal',
      maximo: 1000000000, unidad: '$', obligatorio: true, valor: linea.coste_unitario ?? '',
    })),
    alGuardar: async (datos) => {
      for (const linea of pedido.detalle) {
        await pedir('/api/abastecimiento', {
          accion: 'costear', pedido_id: pedido.id, insumo_id: linea.insumo_id,
          coste_unitario: datos[`coste_${linea.insumo_id}`].replace(',', '.'),
        });
      }
      confirmar('Costes guardados.');
      await cargar();
    },
  });
}

function accionesDe(pedido) {
  const acciones = [];
  if (pedido.estado === 'borrador') {
    const costes = nuevo('button', pedido.sin_coste ? '' : 'secundario', 'Cargar costes');
    costes.type = 'button';
    costes.addEventListener('click', () => cargarCostes(pedido));
    acciones.push(costes);
    if (!pedido.sin_coste) {
      acciones.push(botonAccion('Aprobar', () => accionPedido({ accion: 'aprobar', pedido_id: pedido.id }, 'Pedido aprobado.'), ''));
    }
  }
  if (pedido.estado === 'aprobado') {
    acciones.push(botonConfirmado('Ya llegó', {
      titulo: 'Recibir el pedido',
      ayuda: 'Se suma todo al inventario.',
      boton: 'Sí, ya llegó',
      clase: '',
      alGuardar: () => accionPedido({ accion: 'recibir', pedido_id: pedido.id }, 'Pedido recibido: el inventario ya está sumado.'),
    }));
  }
  if (['borrador', 'aprobado'].includes(pedido.estado)) {
    acciones.push(botonConfirmado('Cancelar', {
      titulo: 'Cancelar el pedido',
      ayuda: `Pedido a ${pedido.proveedor}. No se puede deshacer.`,
      boton: 'Sí, cancelarlo',
      peligro: true,
      alGuardar: () => accionPedido({ accion: 'cancelar', pedido_id: pedido.id }, 'Pedido cancelado.'),
    }));
  }
  return acciones;
}

function recuadroPedido(pedido) {
  const faltanCostes = pedido.estado === 'borrador' && pedido.sin_coste;
  return recuadroFicha({
    titulo: pedido.proveedor,
    subtitulo: `Pedido ${pedido.id}`,
    destacado: dinero(pedido.total),
    lineas: [pedido.lineas],
    etiquetas: [etiquetaDe(ESTADOS[pedido.estado] ?? pedido.estado, pedido.estado === 'borrador'), faltanCostes && etiquetaDe('Faltan costes', true)],
    acciones: accionesDe(pedido),
  });
}

function nuevoPedido() {
  if (!actual.proveedores.length || !actual.insumos.length) {
    avisar('Para hacer un pedido hace falta al menos un proveedor y un insumo.');
    return;
  }
  abrirVentana({
    titulo: 'Nuevo pedido',
    dibujo: dibujoDe('abastecimiento'),
    campos: [
      { nombre: 'proveedor_id', etiqueta: '¿A quién se lo pedís?', tipo: 'lista', opciones: opcionesDe(actual.proveedores), obligatorio: true },
      { nombre: 'insumo_id', etiqueta: '¿Qué necesitás?', tipo: 'lista', opciones: opcionesDe(actual.insumos), obligatorio: true },
      { nombre: 'cantidad', etiqueta: '¿Cuánto?', tipo: 'decimal', maximo: 100000000, obligatorio: true },
      { nombre: 'coste_unitario', etiqueta: 'Coste por unidad', tipo: 'decimal', maximo: 1000000000, unidad: '$', obligatorio: true },
    ],
    boton: 'Crear borrador',
    alGuardar: (datos) => accionPedido({
      accion: 'crear_pedido',
      proveedor_id: Number(datos.proveedor_id),
      lineas: [{ insumo_id: Number(datos.insumo_id), cantidad: datos.cantidad.replace(',', '.'), coste_unitario: datos.coste_unitario.replace(',', '.') }],
    }, 'Borrador creado.'),
  });
}

function pedidoDeFaltantes() {
  if (!actual.proveedores.length) {
    avisar('Primero agregá un proveedor.');
    return;
  }
  abrirVentana({
    titulo: 'Pedir lo que falta',
    dibujo: dibujoDe('inventario'),
    ayuda: 'Armamos un borrador con todos los insumos por debajo del mínimo. Después cargás los costes.',
    campos: [{ nombre: 'proveedor_id', etiqueta: '¿A quién se lo pedís?', tipo: 'lista', opciones: opcionesDe(actual.proveedores), obligatorio: true }],
    boton: 'Crear borrador',
    alGuardar: ({ proveedor_id: proveedor }) => accionPedido(
      { accion: 'borrador_faltantes', proveedor_id: Number(proveedor) }, 'Borrador creado.',
    ),
  });
}

function nuevoProveedor() {
  abrirVentana({
    titulo: 'Nuevo proveedor',
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', largo: 120, obligatorio: true },
      { nombre: 'contacto', etiqueta: 'Teléfono o correo', tipo: 'texto' },
    ],
    alGuardar: (datos) => accionPedido({ ...datos, accion: 'crear_proveedor' }, 'Proveedor creado.'),
  });
}

async function cargar() {
  actual = await pedir('/api/abastecimiento');
  document.getElementById('regla').textContent =
    `La coordinación aprueba hasta ${dinero(actual.limite)}. Por encima, lo aprueba la comisión.`;
  document.getElementById('acciones').replaceChildren(
    recuadroAccion('Nuevo pedido', 'Un insumo a un proveedor', dibujoDe('abastecimiento'), nuevoPedido),
    recuadroAccion('Pedir lo que falta', 'Todo lo que está por debajo del mínimo', dibujoDe('inventario'), pedidoDeFaltantes),
  );
  pintarEn('pedidos', actual.pedidos.map(recuadroPedido), 'Todavía no hay pedidos.');
  const proveedores = actual.proveedores.map((proveedor) => recuadroFicha({
    titulo: proveedor.nombre, lineas: [proveedor.contacto],
  }));
  proveedores.push(recuadroNuevo('Agregar un proveedor', 'Con su teléfono o correo', nuevoProveedor));
  pintarEn('proveedores', proveedores, '');
  pintarEn('costes', actual.costes.map((coste) => filaApunte({
    titulo: `${coste.insumo}: ${dinero(coste.coste_unitario)} por ${coste.unidad}`,
    detalle: coste.proveedor,
    pie: fechaDia(coste.fecha),
  })), 'Todavía no hay costes.');
}

arrancar(cargar);
