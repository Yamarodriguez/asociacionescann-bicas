const mensaje = document.getElementById('mensaje');
const estadoLista = document.getElementById('estado-lista');

function formulario(fila) {
  const elemento = document.createElement('form');
  elemento.className = 'tarjeta';
  const etiqueta = document.createElement('label');
  etiqueta.htmlFor = `valor-${fila.clave}`;
  etiqueta.textContent = fila.clave.replaceAll('_', ' ');
  const nota = document.createElement('p');
  nota.className = 'nota';
  nota.textContent = fila.descripcion;

  let campo;
  if (fila.tipo === 'interruptor') {
    campo = document.createElement('select');
    for (const [valor, texto] of [['true', 'Activado'], ['false', 'Desactivado']]) {
      const opcion = document.createElement('option');
      opcion.value = valor;
      opcion.textContent = texto;
      campo.append(opcion);
    }
  } else {
    campo = document.createElement('input');
    campo.inputMode = 'numeric';
  }
  campo.id = etiqueta.htmlFor;
  campo.value = fila.valor;
  campo.disabled = !fila.editable;
  elemento.append(etiqueta, campo, nota);

  if (fila.editable) {
    const boton = document.createElement('button');
    boton.type = 'submit';
    boton.className = 'secundario';
    boton.textContent = 'Guardar';
    elemento.append(boton);
    elemento.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      boton.disabled = true;
      try {
        const respuesta = await pedir('/api/admin_configuracion', { clave: fila.clave, valor: campo.value });
        mostrarMensaje(mensaje, respuesta.mensaje, 'exito');
      } catch (error) {
        mostrarMensaje(mensaje, error.message);
      } finally {
        boton.disabled = false;
      }
    });
  } else {
    const aviso = document.createElement('p');
    aviso.className = 'nota';
    aviso.textContent = 'No se puede cambiar desde el panel.';
    elemento.append(aviso);
  }
  return elemento;
}

async function iniciar() {
  try {
    const sesion = await leerSesion();
    if (!sesion || sesion.tipo !== 'admin') {
      location.href = '/login.html';
      return;
    }
    const { configuracion } = await pedir('/api/admin_configuracion');
    document.getElementById('lista').replaceChildren(...configuracion.map(formulario));
    estadoLista.className = 'oculto';
  } catch (error) {
    estadoLista.className = 'oculto';
    mostrarMensaje(mensaje, error.message);
  }
}

iniciar();
