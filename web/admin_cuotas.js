const fechaUtc = (valor) => new Date(valor).toLocaleDateString('es-AR', { timeZone: 'UTC' });
const mesDe = (periodo) => periodo.split('-').reverse().join('/');
let actual = null;

function registrarPago(socio) {
  const opciones = actual.socios.map(({ id, numero_socio: numero, nombre, apellido }) => ({
    valor: String(id), texto: `${numero} · ${nombre} ${apellido}`,
  }));
  abrirVentana({
    titulo: socio ? `Pago de ${socio.nombre} ${socio.apellido}` : 'Registrar un pago',
    dibujo: dibujoDe('cuotas'),
    ayuda: 'Solo anota un pago hecho en el local o por transferencia.',
    campos: [
      ...(socio ? [] : [{ nombre: 'socio_id', etiqueta: '¿Quién pagó?', tipo: 'lista', opciones, obligatorio: true }]),
      { nombre: 'periodo', etiqueta: '¿De qué mes es la cuota?', tipo: 'mes', obligatorio: true, valor: fechaLocal().slice(0, 7) },
      { nombre: 'importe', etiqueta: '¿Cuánto pagó?', tipo: 'decimal', maximo: 9999999999, unidad: 'ARS', obligatorio: true },
      {
        nombre: 'metodo', etiqueta: '¿Cómo pagó?', tipo: 'elegir', obligatorio: true, valor: 'efectivo',
        opciones: [{ valor: 'efectivo', texto: 'Efectivo' }, { valor: 'transferencia', texto: 'Transferencia' }],
      },
      { nombre: 'pagado_en', etiqueta: '¿Qué día pagó?', tipo: 'fecha', obligatorio: true, valor: fechaLocal() },
    ],
    boton: 'Registrar el pago',
    alGuardar: async (datos) => {
      await pedir('/api/admin_cuotas', {
        ...datos, socio_id: socio ? socio.id : Number(datos.socio_id), importe: datos.importe.replace(',', '.'),
      });
      confirmar('Pago registrado.');
      await cargar();
    },
  });
}

function recuadroSocio(socio) {
  const pagar = nuevo('button', socio.vencida ? '' : 'secundario', 'Registrar pago');
  pagar.type = 'button';
  pagar.addEventListener('click', () => registrarPago(socio));
  return recuadroFicha({
    titulo: `${socio.nombre} ${socio.apellido}`,
    subtitulo: `Socio ${socio.numero_socio}`,
    alerta: socio.vencida,
    lineas: [socio.cuota_vigente_hasta ? `Cuota hasta ${fechaUtc(socio.cuota_vigente_hasta)}` : 'Sin pagos todavía'],
    etiquetas: [socio.vencida ? etiquetaDe('Vencida', true) : etiquetaDe('Al día')],
    acciones: [pagar],
  });
}

function pintar() {
  const soloVencidas = valorFiltro('cuota') === 'vencidas';
  const visibles = actual.socios.filter((socio) => !soloVencidas || socio.vencida);
  const recuadros = visibles.map(recuadroSocio);
  recuadros.push(recuadroNuevo('Registrar un pago', 'De cualquier socio', () => registrarPago()));
  pintarEn('socios', recuadros, '');
}

async function cargar() {
  actual = await pedir('/api/admin_cuotas');
  const { socios, pagos } = actual;
  const vencidas = socios.filter((socio) => socio.vencida).length;
  document.getElementById('cifras').replaceChildren(
    cajaCifra(socios.length - vencidas, 'Al día', '', { dibujo: dibujoDe('hecho') }),
    cajaCifra(vencidas, vencidas === 1 ? 'Cuota vencida' : 'Cuotas vencidas', '', { dibujo: dibujoDe('alerta'), alerta: vencidas > 0 }),
  );
  pintar();
  pintarEn('pagos', pagos.map((pago) => filaApunte({
    titulo: pago.numero_socio ? `${pago.nombre} ${pago.apellido}` : 'Socio dado de baja',
    detalle: `Cuota ${mesDe(pago.periodo)} · ${pago.metodo}`,
    pie: fechaUtc(pago.pagado_en),
    dibujo: dibujoDe('cuotas'),
    derecha: nuevo('strong', 'apunte-importe', dinero(pago.importe)),
  })), 'Todavía no hay pagos registrados.');
}

filtroRecuadros('filtro-cuota', 'cuota', [
  { valor: 'todas', texto: 'Todos los socios' }, { valor: 'vencidas', texto: 'Solo vencidas' },
], pintar);

arrancar(cargar);
