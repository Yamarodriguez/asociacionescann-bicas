// Piezas comunes de las pantallas de gestion del equipo.
const dinero = (valor) => Number(valor).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const momento = (valor) => new Date(valor).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

function avisar(texto, clase = 'error') {
  mostrarMensaje(document.getElementById('mensaje'), texto, clase);
}

function parrafosEn(id, textos, vacio) {
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

function opcionesEn(id, lista, etiqueta, vacio = null) {
  const opciones = lista.map((item) => {
    const opcion = document.createElement('option');
    opcion.value = item.id;
    opcion.textContent = item[etiqueta];
    return opcion;
  });
  if (vacio !== null) {
    const primera = document.createElement('option');
    primera.value = '';
    primera.textContent = vacio;
    opciones.unshift(primera);
  }
  document.getElementById(id).replaceChildren(...opciones);
}

function filaDe(celdas) {
  const tr = document.createElement('tr');
  for (const [etiqueta, valor] of celdas) {
    const td = celdaTabla(etiqueta, valor instanceof Node ? '' : valor);
    if (valor instanceof Node) td.append(valor);
    tr.append(td);
  }
  return tr;
}

function tablaEn(tablaId, cuerpoId, filas) {
  document.getElementById(cuerpoId).replaceChildren(...filas);
  document.getElementById(tablaId).classList.toggle('oculto', filas.length === 0);
}

function etiquetaDe(texto, resaltada = false) {
  const span = document.createElement('span');
  span.className = resaltada ? 'etiqueta pendiente' : 'etiqueta';
  span.textContent = texto;
  return span;
}

function botonAccion(texto, alPulsar, clase = 'secundario') {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = clase;
  boton.textContent = texto;
  boton.addEventListener('click', async () => {
    boton.disabled = true;
    try {
      await alPulsar();
    } catch (error) {
      avisar(error.message);
    } finally {
      boton.disabled = false;
    }
  });
  return boton;
}

function enviarForm(id, ruta, preparar, recargar) {
  const formulario = document.getElementById(id);
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = formulario.querySelector('button[type=submit]');
    boton.disabled = true;
    try {
      await pedir(ruta, preparar(Object.fromEntries(new FormData(formulario))));
      formulario.reset();
      avisar('Guardado.', 'exito');
      await recargar();
    } catch (error) {
      avisar(error.message);
    } finally {
      boton.disabled = false;
    }
  });
}

async function arrancar(cargar, alEntrar = () => {}) {
  const cargando = document.getElementById('cargando');
  try {
    const sesion = await leerSesion();
    if (!sesion || sesion.tipo !== 'admin') {
      location.href = '/login.html';
      return;
    }
    alEntrar(sesion);
    await cargar();
    document.getElementById('contenido').classList.remove('oculto');
  } catch (error) {
    avisar(error.message);
  } finally {
    cargando.classList.add('oculto');
  }
}
