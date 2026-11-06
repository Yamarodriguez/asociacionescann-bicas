const mensaje = document.getElementById('mensaje');
const parametros = new URLSearchParams(location.search);
const loteId = Number(parametros.get('id'));
const plantaCodigo = parametros.get('planta');
const ETAPAS = ['origen', 'vegetativo', 'floracion', 'cosecha', 'secado', 'curado', 'envasado'];
const PIDE_PESO = { cosecha: 'Peso húmedo en gramos', curado: 'Peso seco en gramos' };
const fecha = (valor) => new Date(valor).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
const plantas = (cantidad) => `${cantidad} ${cantidad === 1 ? 'planta' : 'plantas'}`;
let rol = '';

function parrafos(id, lineas, vacio) {
  const elementos = lineas.map((texto) => {
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

function linea(registro) {
  const medidas = [
    registro.ph && `pH ${registro.ph}`, registro.ec && `EC ${registro.ec}`,
    registro.temperatura && `${registro.temperatura} °C`, registro.humedad && `${registro.humedad} %`,
    registro.plantas && plantas(registro.plantas), registro.testigos && `Testigos: ${registro.testigos}`,
  ].filter(Boolean).join(' · ');
  return `${fecha(registro.creado_en)} · ${nombreCultivo(registro.tipo)}: ${registro.detalle}${medidas ? ` (${medidas})` : ''} · ${registro.responsable}`;
}

function pintarOpciones(selector, lista, vacio) {
  const elementos = lista.map((item) => {
    const opcion = document.createElement('option');
    opcion.value = item.id;
    opcion.textContent = item.nombre;
    return opcion;
  });
  if (vacio) {
    const primera = document.createElement('option');
    primera.value = '';
    primera.textContent = vacio;
    elementos.unshift(primera);
  }
  document.getElementById(selector).replaceChildren(...elementos);
}

function pintar({ lote, registros, analisis, merma, qr, plantas: cuenta, insumos, salas }) {
  document.getElementById('codigo').textContent = lote.codigo;
  document.getElementById('etapa').textContent = `Etapa: ${nombreCultivo(lote.etapa)}`;
  document.getElementById('datos').textContent =
    `${lote.genetica} · ${lote.sala} · ${plantas(lote.cantidad_plantas)} · ${lote.estado}`;
  const pesos = [
    lote.peso_humedo_g && `Húmedo: ${lote.peso_humedo_g} g`, lote.peso_seco_g && `Seco: ${lote.peso_seco_g} g`,
    merma !== null && `Merma: ${merma} %`,
  ].filter(Boolean);
  document.getElementById('pesos').textContent = pesos.join(' · ');
  document.getElementById('qr').src = qr;
  parrafos('historial', registros.map(linea), 'Todavía no hay registros.');
  parrafos('analisis', analisis.map((a) => `${fechaDia(a.fecha)} · ${a.laboratorio} · THC ${a.thc} % · CBD ${a.cbd} %`),
    'Sin análisis: el lote sigue en cuarentena.');

  pintarOpciones('insumo_id', insumos, 'Ninguno');
  pintarOpciones('sala_id', salas);
  document.getElementById('sala_id').value = lote.sala_id;
  document.getElementById('enlace-etiquetas').href = `/admin_etiquetas.html?id=${loteId}`;
  document.getElementById('enlace-etiquetas').textContent = `Etiquetas QR: ${cuenta.vivas} de ${cuenta.total} plantas`;
  const avisoPlanta = document.getElementById('aviso-planta');
  avisoPlanta.classList.toggle('oculto', !plantaCodigo);
  avisoPlanta.textContent = `Planta ${plantaCodigo}: los registros de abajo quedan asociados a ella.`;

  const activo = lote.estado === 'activo';
  const siguiente = ETAPAS[ETAPAS.indexOf(lote.etapa) + 1];
  const coordina = rol === 'coordinador_cultivo';
  document.getElementById('form-avanzar').classList.toggle('oculto', !(coordina && activo && siguiente));
  document.getElementById('form-analisis').classList.toggle('oculto', !coordina);
  document.getElementById('form-mover').classList.toggle('oculto', !(coordina && activo));
  document.getElementById('form-registro').classList.toggle(
    'oculto', !(activo && ['coordinador_cultivo', 'cultivador'].includes(rol)),
  );
  if (siguiente) {
    document.getElementById('boton-avanzar').textContent = `Pasar a ${nombreCultivo(siguiente)}`;
    document.getElementById('campo-peso').classList.toggle('oculto', !PIDE_PESO[siguiente]);
    document.getElementById('etiqueta-peso').textContent = PIDE_PESO[siguiente] ?? 'Peso en gramos';
    document.getElementById('peso_g').required = Boolean(PIDE_PESO[siguiente]);
  }
}

const cargar = async () => pintar(await pedir(`/api/cultivo_lote?id=${loteId}`));

function enviar(id, ruta, preparar) {
  const formulario = document.getElementById(id);
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = formulario.querySelector('button[type=submit]');
    boton.disabled = true;
    try {
      await pedir(ruta, preparar(Object.fromEntries(new FormData(formulario))));
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

enviar('form-avanzar', '/api/cultivo', (d) => ({ accion: 'avanzar', lote_id: loteId, peso_g: d.peso_g }));
enviar('form-analisis', '/api/cultivo', (d) => ({ ...d, accion: 'analisis', lote_id: loteId }));
enviar('form-registro', '/api/cultivo_registro', (d) => ({
  ...d,
  lote_id: loteId,
  plantas: d.plantas ? Number(d.plantas) : undefined,
  insumo_id: d.insumo_id ? Number(d.insumo_id) : undefined,
  planta_codigo: plantaCodigo ?? undefined,
}));
enviar('form-mover', '/api/cultivo', (d) => ({ accion: 'mover', lote_id: loteId, sala_id: Number(d.sala_id) }));

document.getElementById('tipo').addEventListener('change', (evento) => {
  const { value: tipo } = evento.target;
  const pideCantidad = tipo === 'baja' && !plantaCodigo;
  document.getElementById('campo-plantas').classList.toggle('oculto', !pideCantidad);
  document.getElementById('plantas').required = pideCantidad;
  document.getElementById('campo-testigos').classList.toggle('oculto', tipo !== 'destruccion');
  document.getElementById('testigos').required = tipo === 'destruccion';
});

async function iniciar() {
  const cargando = document.getElementById('cargando');
  try {
    const sesion = await leerSesion();
    if (!sesion || sesion.tipo !== 'admin') {
      location.href = '/login.html';
      return;
    }
    rol = sesion.rol;
    await cargar();
    document.getElementById('contenido').classList.remove('oculto');
  } catch (error) {
    mostrarMensaje(mensaje, error.message);
  } finally {
    cargando.classList.add('oculto');
  }
}

iniciar();
