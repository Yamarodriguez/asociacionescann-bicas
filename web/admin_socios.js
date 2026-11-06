const mensaje = document.getElementById('mensaje');
const estadoLista = document.getElementById('estado-lista');
const tabla = document.getElementById('tabla');
const filas = document.getElementById('filas');
const buscar = document.getElementById('buscar');
let socios = [];

function celda(etiqueta, texto) {
  const td = document.createElement('td');
  td.dataset.etiqueta = etiqueta;
  td.textContent = texto;
  return td;
}

function celdaEstado(socio) {
  const td = document.createElement('td');
  td.dataset.etiqueta = 'Estado';
  const etiqueta = document.createElement('span');
  etiqueta.className = `etiqueta ${socio.estado}`;
  etiqueta.textContent = socio.estado;
  td.append(etiqueta);
  if (socio.baja_solicitada_en && socio.estado !== 'baja') {
    const aviso = document.createElement('span');
    aviso.className = 'etiqueta pendiente';
    aviso.textContent = 'pidió la baja';
    td.append(' ', aviso);
  }
  return td;
}

async function ejecutar(socio, accion, boton, extra = {}) {
  boton.disabled = true;
  try {
    const respuesta = await pedir('/api/admin_socios', { socio_id: socio.id, accion, ...extra });
    const texto = respuesta.numero_socio
      ? `Solicitud aprobada. Número de socio: ${respuesta.numero_socio}.` : respuesta.mensaje;
    mostrarMensaje(mensaje, texto, 'exito');
    await cargar();
  } catch (error) {
    mostrarMensaje(mensaje, error.message);
    boton.disabled = false;
  }
}

function boton(texto, clase, alPulsar) {
  const elemento = document.createElement('button');
  elemento.type = 'button';
  elemento.textContent = texto;
  if (clase) elemento.className = clase;
  elemento.addEventListener('click', () => alPulsar(elemento));
  return elemento;
}

// Lo que se borra o da de baja pide un segundo clic.
function botonConfirmado(texto, socio, accion) {
  const elemento = boton(texto, 'peligro', () => {
    if (elemento.dataset.armado) {
      ejecutar(socio, accion, elemento);
      return;
    }
    elemento.dataset.armado = 'si';
    elemento.textContent = 'Confirmar';
  });
  return elemento;
}

function accionesDe(socio) {
  const acciones = document.createElement('td');
  acciones.className = 'acciones';
  if (socio.estado === 'pendiente') {
    if (socio.avalista_numero_socio) {
      const aval = document.createElement('p');
      aval.className = 'nota';
      aval.textContent = `Aval: socio ${socio.avalista_numero_socio}`;
      acciones.append(aval);
    }
    const casilla = document.createElement('div');
    casilla.className = 'casilla';
    const marca = document.createElement('input');
    marca.type = 'checkbox';
    marca.id = `verificado-${socio.id}`;
    const etiqueta = document.createElement('label');
    etiqueta.htmlFor = marca.id;
    etiqueta.textContent = 'Verifiqué la edad y la identidad en persona';
    casilla.append(marca, etiqueta);
    const aprobar = boton('Aprobar', '', (b) => ejecutar(socio, 'aprobar', b, { identidad_verificada: true }));
    aprobar.disabled = true;
    marca.addEventListener('change', () => { aprobar.disabled = !marca.checked; });
    acciones.append(casilla, aprobar, ' ', botonConfirmado('Rechazar', socio, 'rechazar'));
  }
  if (socio.estado === 'activo') {
    acciones.append(boton('Suspender', 'secundario', (b) => ejecutar(socio, 'suspender', b)), ' ');
  }
  if (socio.estado === 'suspendido') {
    acciones.append(boton('Reactivar', 'secundario', (b) => ejecutar(socio, 'reactivar', b)), ' ');
  }
  if (socio.estado === 'activo' || socio.estado === 'suspendido') {
    acciones.append(botonConfirmado('Dar de baja', socio, 'baja'));
  }
  return acciones;
}

function fila(socio) {
  const tr = document.createElement('tr');
  const hasta = socio.cuota_vigente_hasta
    ? new Date(socio.cuota_vigente_hasta).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '—';
  tr.append(
    celda('Nombre', `${socio.nombre} ${socio.apellido}`),
    celda('Documento', `${socio.tipo_documento} ${socio.numero_documento}`),
    celdaEstado(socio),
    celda('Número', socio.numero_socio ?? '—'),
    celda('Cuota hasta', hasta),
    accionesDe(socio),
  );
  return tr;
}

function pintar() {
  // La busqueda ocurre en el navegador: nada personal viaja en la direccion.
  const texto = buscar.value.trim().toLowerCase();
  const visibles = socios.filter((s) => !texto
    || `${s.nombre} ${s.apellido} ${s.numero_documento} ${s.numero_socio ?? ''}`.toLowerCase().includes(texto));
  filas.replaceChildren(...visibles.map(fila));
  tabla.classList.toggle('oculto', visibles.length === 0);
  estadoLista.className = visibles.length ? 'oculto' : 'estado-vacio';
  estadoLista.textContent = socios.length ? 'Ningún socio coincide con la búsqueda.' : 'Todavía no hay solicitudes.';
}

async function cargar() {
  ({ socios } = await pedir('/api/admin_socios'));
  pintar();
}

buscar.addEventListener('input', pintar);

async function iniciar() {
  try {
    const sesion = await leerSesion();
    if (!sesion || sesion.tipo !== 'admin') {
      location.href = '/login.html';
      return;
    }
    await cargar();
  } catch (error) {
    estadoLista.className = 'oculto';
    mostrarMensaje(mensaje, error.message);
  }
}

iniciar();
