const buscar = document.getElementById('buscar');
let socios = [];

const NOMBRE_ESTADO = {
  pendiente: 'Por aprobar', activo: 'Activo', suspendido: 'Suspendido', baja: 'De baja', rechazado: 'Rechazado',
};
const nombreDe = (socio) => `${socio.nombre} ${socio.apellido}`;

async function ejecutar(socio, accion, extra = {}) {
  const respuesta = await pedir('/api/admin_socios', { socio_id: socio.id, accion, ...extra });
  confirmar(respuesta.numero_socio ? `Solicitud aprobada. Número de socio: ${respuesta.numero_socio}.` : respuesta.mensaje);
  await cargar();
}

function botonAprobar(socio) {
  return botonConfirmado('Revisar y aprobar', {
    titulo: `Aprobar a ${nombreDe(socio)}`,
    dibujo: dibujoDe('socios'),
    ayuda: socio.avalista_numero_socio ? `Aval: socio ${socio.avalista_numero_socio}.` : 'Solo se aprueba después de verlo en persona.',
    campos: [{
      nombre: 'verificado', etiqueta: 'Verifiqué la edad y la identidad en persona', tipo: 'casilla', obligatorio: true,
      falta: 'Para aprobar tenés que marcar la verificación en persona.',
    }],
    boton: 'Aprobar',
    clase: '',
    alGuardar: () => ejecutar(socio, 'aprobar', { identidad_verificada: true }),
  });
}

function accion(texto, socio, clave, ayuda, peligro = true) {
  return botonConfirmado(texto, {
    titulo: `${texto}: ${nombreDe(socio)}`,
    ayuda,
    boton: `Sí, ${texto.toLowerCase()}`,
    peligro,
    alGuardar: () => ejecutar(socio, clave),
  });
}

function accionesDe(socio) {
  const acciones = [];
  if (socio.estado === 'pendiente') {
    acciones.push(botonAprobar(socio), accion('Rechazar', socio, 'rechazar', 'La solicitud se rechaza y sus datos se eliminan. No se puede deshacer.'));
  }
  if (socio.estado === 'activo') {
    acciones.push(accion('Suspender', socio, 'suspender', 'No va a poder usar el portal hasta que lo reactives.'));
  }
  if (socio.estado === 'suspendido') {
    acciones.push(accion('Reactivar', socio, 'reactivar', 'Vuelve a tener acceso al portal.', false));
  }
  if (socio.estado === 'activo' || socio.estado === 'suspendido') {
    acciones.push(accion('Dar de baja', socio, 'baja', 'Deja de ser socio. Esta acción no se puede deshacer desde acá.'));
  }
  return acciones;
}

function recuadroSocio(socio) {
  const hasta = socio.cuota_vigente_hasta
    ? new Date(socio.cuota_vigente_hasta).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : null;
  const clase = socio.estado === 'pendiente' ? 'etiqueta pendiente' : `etiqueta ${socio.estado}`;
  const estado = nuevo('span', clase, NOMBRE_ESTADO[socio.estado] ?? socio.estado);
  const pidioBaja = socio.baja_solicitada_en && socio.estado !== 'baja';
  return recuadroFicha({
    titulo: nombreDe(socio),
    subtitulo: socio.numero_socio ? `Socio ${socio.numero_socio}` : 'Sin número todavía',
    alerta: Boolean(pidioBaja),
    dibujo: dibujoDe('socios'),
    lineas: [`${socio.tipo_documento} ${socio.numero_documento}`, hasta && `Cuota hasta ${hasta}`],
    etiquetas: [estado, pidioBaja && nuevo('span', 'etiqueta pendiente', 'Pidió la baja')],
    acciones: accionesDe(socio),
  });
}

function pintarCifras() {
  const cuenta = (estado) => socios.filter((socio) => socio.estado === estado).length;
  const pedidos = socios.filter((socio) => socio.baja_solicitada_en && socio.estado !== 'baja').length;
  document.getElementById('cifras').replaceChildren(
    cajaCifra(cuenta('activo'), 'Socios activos', '', { dibujo: dibujoDe('socios') }),
    cajaCifra(cuenta('pendiente'), 'Por aprobar', '', { dibujo: dibujoDe('reloj'), alerta: cuenta('pendiente') > 0 }),
    cajaCifra(pedidos, 'Pidieron la baja', '', { dibujo: dibujoDe('bajas'), alerta: pedidos > 0 }),
  );
}

function pintar() {
  // La busqueda ocurre en el navegador: nada personal viaja en la direccion.
  const texto = buscar.value.trim().toLowerCase();
  const estado = valorFiltro('estado');
  const visibles = socios.filter((socio) => {
    if (estado !== 'todos' && socio.estado !== estado) return false;
    return !texto || `${socio.nombre} ${socio.apellido} ${socio.numero_documento} ${socio.numero_socio ?? ''}`.toLowerCase().includes(texto);
  });
  const orden = (socio) => (socio.estado === 'pendiente' ? 0 : 1);
  pintarEn(
    'socios', [...visibles].sort((a, b) => orden(a) - orden(b)).map(recuadroSocio),
    socios.length ? 'Ningún socio coincide con la búsqueda.' : 'Todavía no hay solicitudes.',
  );
}

async function cargar() {
  ({ socios } = await pedir('/api/admin_socios'));
  pintarCifras();
  pintar();
}

filtroRecuadros('estados', 'estado', [
  { valor: 'todos', texto: 'Todos' }, { valor: 'pendiente', texto: 'Por aprobar' }, { valor: 'activo', texto: 'Activos' },
  { valor: 'suspendido', texto: 'Suspendidos' }, { valor: 'baja', texto: 'De baja' },
], pintar);
buscar.addEventListener('input', pintar);

arrancar(cargar);
