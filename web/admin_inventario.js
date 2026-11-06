const mensaje = document.getElementById('mensaje');
const estadoLista = document.getElementById('estado-lista');

function lineas(id, textos, vacio) {
  const elementos = textos.map((texto) => {
    const parrafo = document.createElement('p');
    parrafo.className = 'nota';
    parrafo.textContent = texto;
    return parrafo;
  });
  if (!elementos.length) {
    const nada = document.createElement('p');
    nada.className = 'estado-vacio';
    nada.textContent = vacio;
    elementos.push(nada);
  }
  document.getElementById(id).replaceChildren(...elementos);
}

function filaInsumo(insumo) {
  const tr = document.createElement('tr');
  const estado = celdaTabla('Estado', '');
  const etiqueta = document.createElement('span');
  etiqueta.className = insumo.bajo ? 'etiqueta pendiente' : 'etiqueta';
  etiqueta.textContent = insumo.bajo ? 'reponer' : 'correcto';
  estado.append(etiqueta);
  tr.append(
    celdaTabla('Nombre', insumo.nombre),
    celdaTabla('Categoría', insumo.categoria),
    celdaTabla('Stock', `${insumo.stock} ${insumo.unidad}`),
    celdaTabla('Mínimo', `${insumo.stock_minimo} ${insumo.unidad}`),
    estado,
  );
  return tr;
}

async function cargar() {
  const { insumos, movimientos, equipos } = await pedir('/api/inventario');
  document.getElementById('filas').replaceChildren(...insumos.map(filaInsumo));
  document.getElementById('tabla').classList.toggle('oculto', insumos.length === 0);
  estadoLista.className = insumos.length ? 'oculto' : 'estado-vacio';
  estadoLista.textContent = 'Todavía no hay insumos.';
  document.getElementById('insumo_id').replaceChildren(...insumos.map((insumo) => {
    const opcion = document.createElement('option');
    opcion.value = insumo.id;
    opcion.textContent = insumo.nombre;
    return opcion;
  }));
  lineas('equipos', equipos.map((e) => {
    const cuando = e.proximo_mantenimiento ? `mantenimiento: ${fechaDia(e.proximo_mantenimiento)}` : 'sin mantenimiento programado';
    return `${e.nombre} · ${e.tipo}${e.sala ? ` · ${e.sala}` : ''} · ${cuando}${e.vencido ? ' (vencido)' : ''}`;
  }), 'Todavía no hay equipos.');
  lineas('movimientos', movimientos.map((m) => `${m.insumo} · ${m.tipo} · ${m.cantidad} ${m.unidad} · ${m.motivo}`),
    'Todavía no hay movimientos.');
}

function enviar(id, accion, preparar = (datos) => datos) {
  const formulario = document.getElementById(id);
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = formulario.querySelector('button[type=submit]');
    boton.disabled = true;
    try {
      await pedir('/api/inventario', { ...preparar(Object.fromEntries(new FormData(formulario))), accion });
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

enviar('form-movimiento', 'movimiento', (datos) => ({ ...datos, insumo_id: Number(datos.insumo_id) }));
enviar('form-insumo', 'crear_insumo');
enviar('form-equipo', 'crear_equipo');

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
