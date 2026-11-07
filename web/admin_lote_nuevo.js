const formulario = document.getElementById('formulario');
const entradaPlantas = document.getElementById('cantidad_plantas');
const OTRA = 'otra';
const MAXIMO_PLANTAS = 500;

const eleccionDe = (nombre) => new FormData(formulario).get(nombre);
const plantasValidas = () => /^\d+$/.test(entradaPlantas.value)
  && Number(entradaPlantas.value) >= 1 && Number(entradaPlantas.value) <= MAXIMO_PLANTAS;

function pintarOpciones(destino, grupo, lista, textoOtra) {
  const recuadros = lista.map((item) => recuadroEleccion(grupo, String(item.id), item.nombre));
  recuadros.push(recuadroEleccion(grupo, OTRA, textoOtra, { dibujo: 'mas' }));
  document.getElementById(destino).replaceChildren(...recuadros);
}

// Cada recuadro dice qué le falta. Solo se completa con un dato que el servidor va a aceptar.
function comprobar() {
  const variedad = eleccionDe('variedad');
  const sala = eleccionDe('sala');
  const variedadNueva = document.getElementById('genetica_nombre').value.trim();
  const salaNueva = document.getElementById('sala_nombre').value.trim();
  const pasos = [
    ['paso-variedad', 'la variedad', variedad && (variedad !== OTRA || variedadNueva)],
    ['paso-sala', 'la sala', sala && (sala !== OTRA || salaNueva)],
    ['paso-origen', 'cómo empiezan', eleccionDe('origen')],
    ['paso-plantas', 'cuántas plantas son', plantasValidas()],
  ];
  for (const [id, , listo] of pasos) document.getElementById(id).classList.toggle('listo', Boolean(listo));
  document.getElementById('campo-variedad').classList.toggle('oculto', variedad !== OTRA);
  document.getElementById('campo-sala').classList.toggle('oculto', sala !== OTRA);
  const faltan = pasos.filter(([, , listo]) => !listo).map(([, nombre]) => nombre);
  document.getElementById('falta').textContent = faltan.length ? `Falta: ${faltan.join(', ')}.` : 'Todo listo.';
  if (!faltan.length) document.getElementById('mensaje').replaceChildren();
  return faltan.length === 0;
}

function sumarPlantas(cuanto) {
  const actual = Number(entradaPlantas.value) || 0;
  entradaPlantas.value = Math.min(MAXIMO_PLANTAS, Math.max(1, actual + cuanto));
  comprobar();
}

formulario.addEventListener('change', comprobar);
formulario.addEventListener('input', comprobar);
document.getElementById('menos').addEventListener('click', () => sumarPlantas(-1));
document.getElementById('mas').addEventListener('click', () => sumarPlantas(1));

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!comprobar()) {
    avisar(`${document.getElementById('falta').textContent} Rellená los recuadros que siguen en blanco.`);
    return;
  }
  const boton = document.getElementById('crear');
  boton.disabled = true;
  const datos = new FormData(formulario);
  const variedad = datos.get('variedad');
  const sala = datos.get('sala');
  try {
    const { id } = await pedir('/api/cultivo', {
      accion: 'crear_lote',
      genetica_id: variedad === OTRA ? undefined : Number(variedad),
      genetica_nombre: variedad === OTRA ? datos.get('genetica_nombre').trim() : undefined,
      sala_id: sala === OTRA ? undefined : Number(sala),
      sala_nombre: sala === OTRA ? datos.get('sala_nombre').trim() : undefined,
      origen: datos.get('origen'),
      cantidad_plantas: Number(datos.get('cantidad_plantas')),
      cosecha_prevista: datos.get('cosecha_prevista'),
      codigo: datos.get('codigo').trim(),
    });
    location.href = `/admin_lote.html?id=${id}`;
  } catch (error) {
    avisar(error.message);
    boton.disabled = false;
  }
});

async function cargar() {
  const datos = await pedir('/api/cultivo');
  pintarOpciones('variedades', 'variedad', datos.geneticas, 'Otra variedad');
  pintarOpciones('salas', 'sala', datos.salas.filter((sala) => sala.tipo === 'cultivo'), 'Otra sala');
  document.getElementById('origenes').replaceChildren(
    recuadroEleccion('origen', 'semilla', 'Semilla', { detalle: 'Nacen de semillas', dibujo: 'etapa-origen' }),
    recuadroEleccion('origen', 'esqueje', 'Esqueje', { detalle: 'Salen de otra planta', dibujo: 'etapa-vegetativo' }),
  );
  document.getElementById('nombre-lote').textContent = `Este lote se va a llamar ${datos.siguiente_codigo}.`;
  comprobar();
}

arrancar(cargar, (sesion) => {
  if (sesion.rol !== 'coordinador_cultivo') location.href = '/admin_cultivo.html';
});
