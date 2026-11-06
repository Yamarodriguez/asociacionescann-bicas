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

let puedeGestionar = false;

function pintarAverias(averias) {
  const contenedor = document.getElementById('averias');
  if (!averias.length) {
    lineas('averias', [], 'No hay averías registradas.');
    return;
  }
  contenedor.replaceChildren(...averias.map((averia) => {
    const parrafo = document.createElement('p');
    parrafo.className = 'nota';
    const coste = averia.coste ? ` · coste ${averia.coste}` : '';
    parrafo.textContent = `${averia.equipo} · ${averia.detalle}${coste} · ${averia.resuelta_en ? 'resuelta' : 'pendiente'} `;
    if (puedeGestionar && !averia.resuelta_en) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'secundario';
      boton.textContent = 'Marcar resuelta';
      boton.addEventListener('click', async () => {
        boton.disabled = true;
        try {
          await pedir('/api/inventario', { accion: 'resolver_averia', id: averia.id });
          await cargar();
        } catch (error) {
          mostrarMensaje(mensaje, error.message);
          boton.disabled = false;
        }
      });
      parrafo.append(boton);
    }
    return parrafo;
  }));
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
  const { insumos, movimientos, equipos, averias } = await pedir('/api/inventario');
  pintarAverias(averias);
  document.getElementById('equipo_id').replaceChildren(...equipos.map((equipo) => {
    const opcion = document.createElement('option');
    opcion.value = equipo.id;
    opcion.textContent = equipo.nombre;
    return opcion;
  }));
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
    const repetir = e.frecuencia_dias ? ` · cada ${e.frecuencia_dias} días` : '';
    return `${e.nombre} · ${e.tipo}${e.sala ? ` · ${e.sala}` : ''} · ${cuando}${repetir}${e.vencido ? ' (vencido)' : ''}`;
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
enviar('form-equipo', 'crear_equipo', (datos) => ({
  ...datos, frecuencia_dias: datos.frecuencia_dias ? Number(datos.frecuencia_dias) : null,
}));
enviar('form-averia', 'crear_averia', (datos) => ({ ...datos, equipo_id: Number(datos.equipo_id) }));

async function iniciar() {
  try {
    const sesion = await leerSesion();
    if (!sesion || sesion.tipo !== 'admin') {
      location.href = '/login.html';
      return;
    }
    puedeGestionar = sesion.rol === 'coordinador_cultivo';
    document.getElementById('gestion').classList.toggle('oculto', !puedeGestionar);
    await cargar();
  } catch (error) {
    estadoLista.className = 'oculto';
    mostrarMensaje(mensaje, error.message);
  }
}

iniciar();
