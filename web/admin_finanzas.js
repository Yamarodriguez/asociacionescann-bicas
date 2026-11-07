let actual = null;

const RECIENTES = 10;
const accionFinanzas = async (datos, texto) => {
  await pedir('/api/finanzas', datos);
  confirmar(texto);
  await cargar();
};
const categorias = () => [...new Set([
  ...actual.movimientos.map(({ categoria }) => categoria), ...actual.presupuesto.map(({ categoria }) => categoria),
])];

function nuevoMovimiento(tipo) {
  const entra = tipo === 'ingreso';
  abrirVentana({
    titulo: entra ? 'Entró dinero' : 'Salió dinero',
    dibujo: dibujoDe(entra ? 'entra' : 'sale'),
    campos: [
      { nombre: 'importe', etiqueta: '¿Cuánto?', tipo: 'decimal', maximo: 9999999999, unidad: '$', obligatorio: true },
      { nombre: 'concepto', etiqueta: entra ? '¿De qué es?' : '¿En qué se gastó?', tipo: 'texto', obligatorio: true },
      { nombre: 'categoria', etiqueta: 'Categoría', tipo: 'texto', largo: 60, obligatorio: true, sugerencias: categorias(), ayuda: 'Sirve para ordenar el presupuesto.' },
      {
        nombre: 'metodo', etiqueta: '¿Cómo?', tipo: 'elegir', obligatorio: true, valor: 'efectivo',
        opciones: [{ valor: 'efectivo', texto: 'Efectivo' }, { valor: 'transferencia', texto: 'Transferencia' }],
      },
      { nombre: 'fecha', etiqueta: '¿Qué día?', tipo: 'fecha', obligatorio: true, valor: actual.hoy },
    ],
    alGuardar: (datos) => accionFinanzas({ ...datos, tipo, accion: 'movimiento' }, 'Movimiento guardado.'),
  });
}

function cerrarCaja() {
  abrirVentana({
    titulo: 'Cerrar la caja',
    dibujo: dibujoDe('candado'),
    ayuda: `Según lo anotado debería haber ${dinero(actual.caja.efectivo)} en efectivo. Cerrado un día, ya no admite movimientos ni anulaciones.`,
    campos: [
      { nombre: 'contado', etiqueta: '¿Cuánto efectivo contaste?', tipo: 'decimal', maximo: 9999999999, unidad: '$', obligatorio: true },
      { nombre: 'fecha', etiqueta: '¿Qué día cerrás?', tipo: 'fecha', obligatorio: true, valor: actual.hoy },
      { nombre: 'notas', etiqueta: 'Algo más que quieras anotar', tipo: 'texto', largo: 300 },
    ],
    boton: 'Cerrar el día',
    alGuardar: (datos) => accionFinanzas({ ...datos, accion: 'cerrar' }, 'Caja cerrada.'),
  });
}

function nuevaPartida() {
  abrirVentana({
    titulo: `Presupuesto ${actual.anio}`,
    dibujo: dibujoDe('finanzas'),
    campos: [
      {
        nombre: 'tipo', etiqueta: '¿Qué vas a prever?', tipo: 'elegir', obligatorio: true, valor: 'gasto',
        opciones: [{ valor: 'gasto', texto: 'Un gasto' }, { valor: 'ingreso', texto: 'Un ingreso' }],
      },
      { nombre: 'categoria', etiqueta: 'Categoría', tipo: 'texto', largo: 60, obligatorio: true, sugerencias: categorias() },
      { nombre: 'importe', etiqueta: 'Importe de todo el año', tipo: 'decimal', maximo: 9999999999, unidad: '$', obligatorio: true },
    ],
    alGuardar: (datos) => accionFinanzas({ ...datos, accion: 'presupuesto', anio: actual.anio }, 'Presupuesto guardado.'),
  });
}

function anular(movimiento) {
  return botonConfirmado('Anular', {
    titulo: 'Anular el movimiento',
    ayuda: `${movimiento.concepto}: ${dinero(movimiento.importe)}. Queda en la lista, marcado como anulado.`,
    campos: [{ nombre: 'motivo', etiqueta: '¿Por qué lo anulás?', tipo: 'texto', largo: 300, obligatorio: true }],
    boton: 'Anular',
    peligro: true,
    alGuardar: ({ motivo }) => accionFinanzas({ accion: 'anular', id: movimiento.id, motivo }, 'Movimiento anulado.'),
  });
}

function filaMovimiento(movimiento) {
  const entra = movimiento.tipo === 'ingreso';
  const anulado = Boolean(movimiento.anulado_en);
  const lado = nuevo('div', 'apunte-lado');
  lado.append(nuevo('strong', anulado ? 'apunte-importe anulado' : 'apunte-importe', `${entra ? '+' : '−'} ${dinero(movimiento.importe)}`));
  if (!anulado && !movimiento.cuota_id) lado.append(anular(movimiento));
  return filaApunte({
    titulo: movimiento.concepto,
    detalle: anulado ? `Anulado: ${movimiento.anulado_motivo}` : `${movimiento.categoria} · ${movimiento.metodo}`,
    pie: fechaDia(movimiento.fecha),
    dibujo: dibujoDe(entra ? 'entra' : 'sale'),
    tipo: anulado ? 'anulado' : movimiento.tipo,
    derecha: lado,
  });
}

function recuadroPresupuesto(linea) {
  const previsto = Number(linea.previsto);
  const real = Number(linea.real);
  let barra = null;
  if (previsto) {
    barra = nuevo('progress', 'progreso');
    barra.max = previsto;
    barra.value = Math.min(real, previsto);
    barra.setAttribute('aria-label', `${linea.categoria}: ${dinero(real)} de ${dinero(previsto)}`);
  }
  const pasado = linea.tipo === 'gasto' && previsto > 0 && real > previsto;
  return recuadroFicha({
    titulo: linea.categoria,
    subtitulo: linea.tipo === 'gasto' ? 'Gasto' : 'Ingreso',
    destacado: dinero(real),
    alerta: pasado,
    lineas: [previsto ? `De ${dinero(previsto)} previstos` : 'Sin importe previsto', barra],
    etiquetas: [pasado && etiquetaDe('Se pasó de lo previsto', true)],
  });
}

async function cargar() {
  actual = await pedir('/api/finanzas');
  const { caja, movimientos, presupuesto, cierres, anio, cerrado_hoy: cerrado } = actual;
  document.getElementById('cifras').replaceChildren(
    cajaCifra(dinero(caja.efectivo), 'Efectivo en caja', cerrado ? 'Hoy ya está cerrado' : 'Hoy está abierto', { dibujo: dibujoDe('finanzas') }),
    cajaCifra(dinero(caja.ingresos), 'Entró hoy', '', { dibujo: dibujoDe('entra') }),
    cajaCifra(dinero(caja.gastos), 'Salió hoy', '', { dibujo: dibujoDe('sale') }),
  );
  document.getElementById('acciones').replaceChildren(
    recuadroAccion('Entró dinero', 'Aportes, cuotas en mano, otros ingresos', dibujoDe('entra'), () => nuevoMovimiento('ingreso')),
    recuadroAccion('Salió dinero', 'Gastos y pagos', dibujoDe('sale'), () => nuevoMovimiento('gasto')),
    recuadroAccion('Cerrar la caja', 'Contá el efectivo al terminar el día', dibujoDe('candado'), cerrarCaja),
  );
  pintarEn('movimientos', movimientos.slice(0, RECIENTES).map(filaMovimiento), 'Todavía no hay movimientos.');
  document.getElementById('movimientos-anteriores').replaceChildren(...movimientos.slice(RECIENTES).map(filaMovimiento));
  document.getElementById('bloque-anteriores').classList.toggle('oculto', movimientos.length <= RECIENTES);
  document.getElementById('titulo-presupuesto').textContent = `Presupuesto ${anio}`;
  const partidas = presupuesto.map(recuadroPresupuesto);
  partidas.push(recuadroNuevo('Agregar al presupuesto', 'Lo que esperás gastar o recibir', nuevaPartida));
  pintarEn('presupuesto', partidas, '');
  pintarEn('cierres', cierres.map((cierre) => filaApunte({
    titulo: `Caja del ${fechaDia(cierre.fecha)}`,
    detalle: `Debía haber ${dinero(cierre.esperado)} · se contó ${dinero(cierre.contado)}`,
    pie: cierre.notas,
    dibujo: dibujoDe('candado'),
    tipo: Number(cierre.diferencia) ? 'incidencia' : undefined,
    derecha: nuevo('strong', 'apunte-importe', Number(cierre.diferencia) ? `Diferencia ${dinero(cierre.diferencia)}` : 'Cuadró'),
  })), 'Todavía no hay cierres.');
}

arrancar(cargar);
