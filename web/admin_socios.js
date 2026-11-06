const mensaje = document.getElementById('mensaje');
const estadoLista = document.getElementById('estado-lista');
const tabla = document.getElementById('tabla');
const filas = document.getElementById('filas');

function celda(etiqueta, texto) {
  const td = document.createElement('td');
  td.dataset.etiqueta = etiqueta;
  td.textContent = texto;
  return td;
}

async function aprobar(socio, boton) {
  boton.disabled = true;
  try {
    const respuesta = await pedir('/api/admin_socios', {
      socio_id: socio.id, identidad_verificada: true });
    mostrarMensaje(mensaje, `Solicitud aprobada. Número de socio: ${respuesta.numero_socio}.`, 'exito');
    await cargar();
  } catch (error) {
    mostrarMensaje(mensaje, error.message);
    boton.disabled = false;
  }
}

function fila(socio) {
  const tr = document.createElement('tr');
  tr.append(
    celda('Nombre', `${socio.nombre} ${socio.apellido}`),
    celda('Documento', `${socio.tipo_documento} ${socio.numero_documento}`),
    celda('Estado', socio.estado),
    celda('Número', socio.numero_socio ?? '—'),
  );
  const acciones = document.createElement('td');
  acciones.className = 'acciones';
  if (socio.estado === 'pendiente') {
    const casilla = document.createElement('div');
    casilla.className = 'casilla';
    const marca = document.createElement('input');
    marca.type = 'checkbox';
    marca.id = `verificado-${socio.id}`;
    const etiqueta = document.createElement('label');
    etiqueta.htmlFor = marca.id;
    etiqueta.textContent = 'Verifiqué la edad y la identidad en persona';
    casilla.append(marca, etiqueta);

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.textContent = 'Aprobar';
    boton.disabled = true;
    marca.addEventListener('change', () => { boton.disabled = !marca.checked; });
    boton.addEventListener('click', () => aprobar(socio, boton));
    acciones.append(casilla, boton);
  }
  tr.append(acciones);
  return tr;
}

async function cargar() {
  const { socios } = await pedir('/api/admin_socios');
  filas.replaceChildren(...socios.map(fila));
  tabla.classList.toggle('oculto', socios.length === 0);
  estadoLista.classList.toggle('oculto', socios.length > 0);
  estadoLista.textContent = 'Todavía no hay solicitudes.';
}

async function iniciar() {
  try {
    const sesion = await leerSesion();
    if (!sesion || sesion.tipo !== 'admin') {
      location.href = '/login.html';
      return;
    }
    await cargar();
  } catch (error) {
    estadoLista.classList.add('oculto');
    mostrarMensaje(mensaje, error.message);
  }
}

iniciar();
