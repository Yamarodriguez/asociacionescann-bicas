let coordina = false;

function pintarCifras(plantas, lotes) {
  const activos = lotes.filter((lote) => lote.estado === 'activo');
  const pendientes = activos.reduce((total, lote) => total + lote.tareas_pendientes, 0);
  const detallePlantas = plantas.autorizadas
    ? `De ${plantas.autorizadas} autorizadas${plantas.excede ? ': se superó el límite' : ''}`
    : 'Falta cargar el límite del certificado';
  document.getElementById('cifras').replaceChildren(
    cajaCifra(activos.length, activos.length === 1 ? 'Lote en marcha' : 'Lotes en marcha', '', { dibujo: dibujoCultivo('etapa-vegetativo') }),
    cajaCifra(plantas.florecidas, 'Plantas en floración', detallePlantas, { dibujo: dibujoCultivo('etapa-floracion'), alerta: plantas.excede }),
    cajaCifra(pendientes, 'Tareas de cultivo', 'Ver lo que falta hacer', { dibujo: dibujoDe('hecho'), enlace: '/admin_tareas.html' }),
  );
}

function tarjetaLote(lote) {
  const cerrado = lote.estado !== 'activo';
  const tarjeta = nuevo('a', cerrado ? 'lote-recuadro cerrado' : 'lote-recuadro');
  tarjeta.href = `/admin_lote.html?id=${lote.id}`;
  const cabeza = nuevo('div', 'lote-cabeza');
  const circulo = nuevo('span', 'lote-dibujo');
  circulo.append(dibujoCultivo(`etapa-${lote.etapa}`));
  const nombres = nuevo('div');
  nombres.append(nuevo('h3', '', lote.genetica), nuevo('p', 'nota', lote.codigo));
  cabeza.append(circulo, nombres);

  const estado = cerrado
    ? (lote.estado === 'descartado' ? 'Descartado' : 'Finalizado')
    : nombreEtapa(lote.etapa);
  const etapa = nuevo('p', 'lote-etapa', estado);
  const lugar = nuevo('p', 'nota', `${lote.sala} · ${textoPlantas(lote.cantidad_plantas)}`);
  const ultimo = nuevo('p', 'nota', `Última anotación: ${haceCuanto(lote.ultimo_registro).toLowerCase()}`);
  tarjeta.append(cabeza, etapa, pasosEtapa(lote.etapa, cerrado), lugar);
  if (lote.ultima_altura) tarjeta.append(nuevo('p', 'nota', `Altura: ${cifra(lote.ultima_altura)} cm`));
  tarjeta.append(ultimo);
  if (lote.tareas_pendientes) {
    const tareas = lote.tareas_pendientes === 1 ? '1 tarea pendiente' : `${lote.tareas_pendientes} tareas pendientes`;
    tarjeta.append(etiquetaDe(tareas, true));
  }
  return tarjeta;
}

function pintarLotes(lotes) {
  const activos = lotes.filter((lote) => lote.estado === 'activo');
  const cerrados = lotes.filter((lote) => lote.estado !== 'activo');
  const tarjetas = activos.map(tarjetaLote);
  if (coordina) tarjetas.push(recuadroNuevo('Empezar un lote', 'Te guiamos paso a paso', '/admin_lote_nuevo.html'));
  if (!tarjetas.length) tarjetas.push(nuevo('p', 'estado-vacio', 'Todavía no hay lotes en marcha.'));
  document.getElementById('lotes').replaceChildren(...tarjetas);
  document.getElementById('cerrados').replaceChildren(...cerrados.map(tarjetaLote));
  document.getElementById('bloque-cerrados').classList.toggle('oculto', cerrados.length === 0);
}

const NOMBRE_TIPO_SALA = { cultivo: 'Sala de cultivo', secado: 'Sala de secado', curado: 'Sala de curado' };

function ventanaSala() {
  abrirVentana({
    titulo: 'Nueva sala',
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre de la sala', tipo: 'texto', largo: 100, obligatorio: true },
      { nombre: 'tipo', etiqueta: 'Para qué se usa', tipo: 'elegir', opciones: ['Cultivo', 'Secado', 'Curado'], obligatorio: true },
    ],
    alGuardar: async ({ nombre, tipo }) => {
      await pedir('/api/cultivo', { accion: 'crear_sala', nombre, tipo: tipo.toLowerCase() });
      confirmar('Sala creada.');
      await cargar();
    },
  });
}

function pintarSalas(salas, lotes) {
  const recuadros = salas.map((sala) => {
    const contenido = lotes.filter((lote) => lote.sala_id === sala.id && lote.estado === 'activo');
    const caja = nuevo('article', contenido.length ? 'sala-recuadro' : 'sala-recuadro libre');
    caja.append(nuevo('h3', '', sala.nombre), nuevo('p', 'nota', NOMBRE_TIPO_SALA[sala.tipo]));
    if (!contenido.length) caja.append(nuevo('p', 'sala-libre', 'Libre'));
    for (const lote of contenido) {
      const enlace = nuevo('a', 'sala-lote', `${lote.codigo} · ${textoPlantas(lote.cantidad_plantas)} · ${nombreEtapa(lote.etapa)}`);
      enlace.href = `/admin_lote.html?id=${lote.id}`;
      caja.append(enlace);
    }
    return caja;
  });
  if (coordina) recuadros.push(recuadroNuevo('Agregar una sala', 'De cultivo, secado o curado', ventanaSala));
  if (!recuadros.length) recuadros.push(nuevo('p', 'estado-vacio', 'Todavía no hay salas.'));
  document.getElementById('salas').replaceChildren(...recuadros);
}

function pintarVariedades(geneticas) {
  const etiquetas = geneticas.map((genetica) => etiquetaDe(genetica.nombre));
  if (!etiquetas.length) etiquetas.push(nuevo('p', 'estado-vacio', 'Todavía no hay variedades.'));
  if (coordina) {
    const boton = nuevo('button', 'secundario', 'Agregar una variedad');
    boton.type = 'button';
    boton.addEventListener('click', () => abrirVentana({
      titulo: 'Nueva variedad',
      campos: [{ nombre: 'nombre', etiqueta: 'Nombre de la variedad', tipo: 'texto', largo: 100, obligatorio: true }],
      alGuardar: async ({ nombre }) => {
        await pedir('/api/cultivo', { accion: 'crear_genetica', nombre });
        confirmar('Variedad creada.');
        await cargar();
      },
    }));
    etiquetas.push(boton);
  }
  document.getElementById('variedades').replaceChildren(...etiquetas);
}

function pintarComparativas(geneticas, salas) {
  const recuadro = (fila, clase) => {
    const caja = nuevo('article', 'sala-recuadro');
    const lotes = Number(fila.lotes);
    caja.append(
      nuevo('p', 'nota', clase),
      nuevo('h3', '', fila.nombre),
      nuevo('p', 'cifra-numero', `${cifra(fila.gramos_por_planta)} g`),
      nuevo('p', 'nota', 'por planta, en seco'),
      nuevo('p', 'nota', `Pierde ${cifra(fila.merma)} % al secar · ${lotes} ${lotes === 1 ? 'lote' : 'lotes'}`),
    );
    return caja;
  };
  const recuadros = [
    ...geneticas.map((fila) => recuadro(fila, 'Variedad')),
    ...salas.map((fila) => recuadro(fila, 'Sala')),
  ];
  if (!recuadros.length) recuadros.push(nuevo('p', 'estado-vacio', 'Todavía no hay lotes con peso seco.'));
  document.getElementById('comparativas').replaceChildren(...recuadros);
}

async function cargar() {
  const datos = await pedir('/api/cultivo');
  pintarCifras(datos.plantas, datos.lotes);
  pintarLotes(datos.lotes);
  pintarSalas(datos.salas, datos.lotes);
  pintarVariedades(datos.geneticas);
  pintarComparativas(datos.por_genetica, datos.por_sala);
}

arrancar(cargar, (sesion) => {
  coordina = sesion.rol === 'coordinador_cultivo';
  document.getElementById('nuevo-lote').classList.toggle('oculto', !coordina);
});
