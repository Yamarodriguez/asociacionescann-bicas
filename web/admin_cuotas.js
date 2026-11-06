const mensaje = document.getElementById('mensaje');
const formulario = document.getElementById('form-cuota');
const estadoLista = document.getElementById('estado-lista');
const fecha = (valor) => new Date(valor).toLocaleDateString('es-AR', { timeZone: 'UTC' });

function celda(etiqueta, contenido) {
  const td = document.createElement('td');
  td.dataset.etiqueta = etiqueta;
  td.append(contenido);
  return td;
}

function etiqueta(vencida) {
  const elemento = document.createElement('span');
  elemento.className = vencida ? 'etiqueta pendiente' : 'etiqueta';
  elemento.textContent = vencida ? 'vencida' : 'al día';
  return elemento;
}

function pintar({ socios, pagos }) {
  const opciones = socios.map((socio) => {
    const opcion = document.createElement('option');
    opcion.value = socio.id;
    opcion.textContent = `${socio.numero_socio} · ${socio.nombre} ${socio.apellido}`;
    return opcion;
  });
  document.getElementById('socio_id').replaceChildren(...opciones);
  const filas = socios.map((socio) => {
    const tr = document.createElement('tr');
    tr.append(
      celda('Número', String(socio.numero_socio)),
      celda('Nombre', `${socio.nombre} ${socio.apellido}`),
      celda('Cuota hasta', socio.cuota_vigente_hasta ? fecha(socio.cuota_vigente_hasta) : '—'),
      celda('Estado', etiqueta(socio.vencida)),
    );
    return tr;
  });
  document.getElementById('filas').replaceChildren(...filas);
  document.getElementById('tabla').classList.toggle('oculto', socios.length === 0);
  estadoLista.className = socios.length ? 'oculto' : 'estado-vacio';
  estadoLista.textContent = 'Todavía no hay socios activos.';
  const lineas = pagos.map((pago) => {
    const parrafo = document.createElement('p');
    parrafo.className = 'nota';
    const persona = pago.numero_socio ? `${pago.nombre} ${pago.apellido}` : 'Socio dado de baja';
    parrafo.textContent = `${pago.periodo} · ${persona} · $ ${pago.importe} · ${pago.metodo} · ${fecha(pago.pagado_en)}`;
    return parrafo;
  });
  if (!lineas.length) {
    const vacio = document.createElement('p');
    vacio.className = 'estado-vacio';
    vacio.textContent = 'Todavía no hay pagos registrados.';
    lineas.push(vacio);
  }
  document.getElementById('pagos').replaceChildren(...lineas);
}

async function cargar() {
  pintar(await pedir('/api/admin_cuotas'));
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const boton = formulario.querySelector('button[type=submit]');
  boton.disabled = true;
  try {
    const datos = Object.fromEntries(new FormData(formulario));
    datos.socio_id = Number(datos.socio_id);
    await pedir('/api/admin_cuotas', datos);
    mostrarMensaje(mensaje, 'Pago registrado.', 'exito');
    await cargar();
  } catch (error) {
    mostrarMensaje(mensaje, error.message);
  } finally {
    boton.disabled = false;
  }
});

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
