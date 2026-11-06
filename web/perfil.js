const mensaje = document.getElementById('mensaje');

const fechaCorta = (valor) => new Date(valor).toLocaleDateString('es-AR', { timeZone: 'UTC' });
const fechaHora = (valor) => new Date(valor).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

function vacio(texto) {
  const parrafo = document.createElement('p');
  parrafo.className = 'estado-vacio';
  parrafo.textContent = texto;
  return parrafo;
}

function desplegable(titulo, detalle, cuerpo) {
  const bloque = document.createElement('details');
  const resumen = document.createElement('summary');
  resumen.textContent = `${titulo} · ${detalle}`;
  const texto = document.createElement('p');
  texto.className = 'mensaje-contacto';
  texto.textContent = cuerpo;
  bloque.append(resumen, texto);
  return bloque;
}

function pintarLista(id, elementos, textoVacio) {
  const contenedor = document.getElementById(id);
  contenedor.replaceChildren(...(elementos.length ? elementos : [vacio(textoVacio)]));
}

function pintarCuota(perfil, cuotas) {
  const estado = document.getElementById('cuota-estado');
  if (!perfil.cuota_vigente_hasta) {
    estado.textContent = 'Todavía no hay cuotas registradas.';
  } else {
    const hasta = fechaCorta(perfil.cuota_vigente_hasta);
    const vigente = new Date(perfil.cuota_vigente_hasta) >= new Date(new Date().toDateString());
    estado.textContent = vigente ? `Al día hasta el ${hasta}.` : `Vencida desde el ${hasta}.`;
  }
  const filas = cuotas.map((cuota) => {
    const parrafo = document.createElement('p');
    parrafo.className = 'nota';
    parrafo.textContent = `${cuota.periodo}: $ ${cuota.importe} (${cuota.metodo}, ${fechaCorta(cuota.pagado_en)})`;
    return parrafo;
  });
  document.getElementById('cuotas').replaceChildren(...filas);
}

function pintar(datos) {
  const { perfil } = datos;
  document.getElementById('nombre').textContent = perfil.nombre;
  document.getElementById('numero').textContent = perfil.numero_socio;
  document.getElementById('alta').textContent = fechaCorta(perfil.alta_en);
  document.getElementById('nombre-completo').textContent = `${perfil.nombre} ${perfil.apellido}`;
  document.getElementById('correo').textContent = perfil.email;
  document.getElementById('telefono').value = perfil.telefono ?? '';
  if (datos.qr) {
    const imagen = document.getElementById('qr');
    imagen.src = datos.qr;
    imagen.classList.remove('oculto');
  }
  pintarCuota(perfil, datos.cuotas);
  pintarLista('comunicados', datos.comunicados.map((c) => desplegable(c.titulo, fechaCorta(c.publicado_en), c.cuerpo)),
    'Todavía no hay comunicados.');
  pintarLista('documentos', datos.documentos.map((d) => desplegable(d.titulo, fechaCorta(d.publicado_en), d.contenido)),
    'Todavía no hay documentos.');
  pintarLista('asambleas', datos.asambleas.map((a) => desplegable(a.titulo, `${fechaHora(a.fecha)}, ${a.lugar}`, a.orden_dia)),
    'Todavía no hay asambleas.');
  pintarLista('actas', datos.actas.map((a) => desplegable(a.titulo, fechaCorta(a.publicado_en), a.contenido)),
    'Todavía no hay actas.');
  if (perfil.baja_solicitada_en) {
    document.getElementById('baja-pedida').classList.remove('oculto');
    document.getElementById('form-baja').classList.add('oculto');
  }
}

async function enviar(formulario, accion) {
  const boton = formulario.querySelector('button[type=submit]');
  boton.disabled = true;
  try {
    await accion();
  } catch (error) {
    mostrarMensaje(mensaje, error.message);
  } finally {
    boton.disabled = false;
  }
}

document.getElementById('form-telefono').addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviar(evento.target, async () => {
    const respuesta = await pedir('/api/socio_portal', { telefono: evento.target.telefono.value });
    mostrarMensaje(mensaje, respuesta.mensaje, 'exito');
  });
});

document.getElementById('form-baja').addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviar(evento.target, async () => {
    const respuesta = await pedir('/api/socio_baja', { clave: evento.target.clave.value });
    evento.target.classList.add('oculto');
    document.getElementById('baja-pedida').classList.remove('oculto');
    mostrarMensaje(mensaje, respuesta.mensaje, 'exito');
  });
});

async function iniciar() {
  const cargando = document.getElementById('cargando');
  try {
    const sesion = await leerSesion();
    if (!sesion) {
      location.href = '/login.html';
      return;
    }
    if (sesion.tipo !== 'socio' || sesion.estado !== 'activo') {
      location.href = destinoDe(sesion);
      return;
    }
    pintar(await pedir('/api/socio_portal'));
    document.getElementById('contenido').classList.remove('oculto');
  } catch (error) {
    mostrarMensaje(mensaje, error.message);
  } finally {
    cargando.classList.add('oculto');
  }
}

iniciar();
