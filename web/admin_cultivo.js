const mensaje = document.getElementById('mensaje');
const estadoLista = document.getElementById('estado-lista');

function opciones(id, lista) {
  document.getElementById(id).replaceChildren(...lista.map((item) => {
    const opcion = document.createElement('option');
    opcion.value = item.id;
    opcion.textContent = item.nombre;
    return opcion;
  }));
}

function fila(lote) {
  const tr = document.createElement('tr');
  const enlace = document.createElement('a');
  enlace.href = `/admin_lote.html?id=${lote.id}`;
  enlace.textContent = lote.codigo;
  const primera = celdaTabla('Código', '');
  primera.append(enlace);
  tr.append(
    primera,
    celdaTabla('Genética', lote.genetica),
    celdaTabla('Sala', lote.sala),
    celdaTabla('Etapa', nombreCultivo(lote.etapa)),
    celdaTabla('Plantas', lote.cantidad_plantas),
    celdaTabla('Estado', lote.estado),
  );
  return tr;
}

function pintarPlantas({ autorizadas, florecidas, excede }) {
  const aviso = document.getElementById('plantas');
  if (!autorizadas) {
    aviso.textContent = `Plantas en floración: ${florecidas}. Falta cargar el límite del certificado.`;
  } else {
    aviso.textContent = `Plantas en floración: ${florecidas} de ${autorizadas} autorizadas.`;
  }
  aviso.classList.toggle('error', excede);
}

async function cargar() {
  const datos = await pedir('/api/cultivo');
  pintarPlantas(datos.plantas);
  document.getElementById('filas').replaceChildren(...datos.lotes.map(fila));
  document.getElementById('tabla').classList.toggle('oculto', datos.lotes.length === 0);
  estadoLista.className = datos.lotes.length ? 'oculto' : 'estado-vacio';
  estadoLista.textContent = 'Todavía no hay lotes.';
  opciones('genetica_id', datos.geneticas);
  opciones('sala_id', datos.salas);
}

function enviar(id, preparar) {
  const formulario = document.getElementById(id);
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = formulario.querySelector('button[type=submit]');
    boton.disabled = true;
    try {
      await pedir('/api/cultivo', preparar(Object.fromEntries(new FormData(formulario))));
      formulario.reset();
      mostrarMensaje(mensaje, 'Guardado.', 'exito');
      await cargar();
    } catch (error) {
      mostrarMensaje(mensaje, error.message);
    } finally {
      boton.disabled = false;
    }
  });
}

enviar('form-lote', (datos) => ({
  ...datos,
  accion: 'crear_lote',
  genetica_id: Number(datos.genetica_id),
  sala_id: Number(datos.sala_id),
  cantidad_plantas: Number(datos.cantidad_plantas),
}));
enviar('form-sala', (datos) => ({ ...datos, accion: 'crear_sala' }));
enviar('form-genetica', (datos) => ({ ...datos, accion: 'crear_genetica' }));

async function iniciar() {
  try {
    const sesion = await leerSesion();
    if (!sesion || sesion.tipo !== 'admin') {
      location.href = '/login.html';
      return;
    }
    document.getElementById('gestion').classList.toggle('oculto', sesion.rol !== 'coordinador_cultivo');
    await cargar();
  } catch (error) {
    estadoLista.className = 'oculto';
    mostrarMensaje(mensaje, error.message);
  }
}

iniciar();
