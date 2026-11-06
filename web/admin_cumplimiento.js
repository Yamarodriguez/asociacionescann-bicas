const accionCumplimiento = (datos, texto) => async () => {
  await pedir('/api/cumplimiento', datos);
  avisar(texto, 'exito');
  await cargar();
};

function diasRestantes(dias) {
  if (dias < 0) return `venció hace ${-dias} días`;
  return dias === 0 ? 'vence hoy' : `faltan ${dias} días`;
}

function tarjetaVencimiento(vencimiento) {
  const articulo = document.createElement('article');
  articulo.className = 'espaciada';
  const titulo = document.createElement('p');
  titulo.textContent = `${vencimiento.titulo} · ${nombreCultivo(vencimiento.tipo)} · ${fechaDia(vencimiento.vence_en)} `;
  titulo.append(etiquetaDe(diasRestantes(vencimiento.dias), vencimiento.dias <= 60));
  const renovar = botonAccion('Renovar', async () => {
    const nueva = window.prompt('Nueva fecha de vencimiento (AAAA-MM-DD)');
    if (!nueva) return;
    await accionCumplimiento({ accion: 'renovar', id: vencimiento.id, vence_en: nueva }, 'Vencimiento renovado.')();
  });
  const resolver = botonAccion('Ya no aplica', accionCumplimiento({ accion: 'resolver', id: vencimiento.id }, 'Vencimiento cerrado.'));
  articulo.append(titulo, renovar, ' ', resolver);
  return articulo;
}

function tarjetaProcedimiento(procedimiento, total) {
  const detalles = document.createElement('details');
  detalles.className = 'espaciada';
  const resumen = document.createElement('summary');
  resumen.textContent = `${procedimiento.titulo} · versión ${procedimiento.version} · leído por ${procedimiento.lecturas} de ${total}`;
  const cuerpo = document.createElement('p');
  cuerpo.textContent = procedimiento.contenido;
  detalles.append(resumen, cuerpo);
  if (procedimiento.leido) {
    detalles.append(etiquetaDe('lectura confirmada'));
  } else {
    detalles.append(botonAccion('Confirmo que lo leí', accionCumplimiento(
      { accion: 'confirmar_lectura', version_id: procedimiento.version_id }, 'Lectura confirmada.',
    ), ''));
  }
  return detalles;
}

function tarjetaCapacitacion(capacitacion) {
  const articulo = document.createElement('article');
  articulo.className = 'espaciada';
  const datos = document.createElement('p');
  datos.textContent = `${capacitacion.titulo} · ${fechaDia(capacitacion.fecha)} · ${capacitacion.dictada_por} · ${capacitacion.asistentes} asistentes `;
  articulo.append(datos);
  articulo.append(capacitacion.asistio ? etiquetaDe('asistí') : botonAccion('Confirmo que asistí', accionCumplimiento(
    { accion: 'confirmar_asistencia', capacitacion_id: capacitacion.id }, 'Asistencia confirmada.',
  )));
  return articulo;
}

function listaEn(id, elementos, vacio) {
  if (elementos.length) {
    document.getElementById(id).replaceChildren(...elementos);
  } else {
    parrafosEn(id, [], vacio);
  }
}

async function cargar() {
  const datos = await pedir('/api/cumplimiento');
  document.getElementById('gestion-vencimientos').classList.toggle('oculto', !datos.gestiona);
  document.getElementById('form-procedimiento').classList.toggle('oculto', !datos.gestiona);
  document.getElementById('form-capacitacion').classList.toggle('oculto', !datos.gestiona);
  document.getElementById('vencimientos').replaceChildren(...datos.vencimientos.map(tarjetaVencimiento));
  document.getElementById('sin-vencimientos').classList.toggle('oculto', datos.vencimientos.length > 0);
  listaEn('procedimientos', datos.procedimientos.map((p) => tarjetaProcedimiento(p, datos.equipo_total)), 'Todavía no hay procedimientos.');
  listaEn('capacitaciones', datos.capacitaciones.map(tarjetaCapacitacion), 'Todavía no hay capacitaciones.');
}

enviarForm('form-vencimiento', '/api/cumplimiento', (datos) => ({ ...datos, accion: 'crear_vencimiento' }), cargar);
enviarForm('form-procedimiento', '/api/cumplimiento', (datos) => ({ ...datos, accion: 'publicar_procedimiento' }), cargar);
enviarForm('form-capacitacion', '/api/cumplimiento', (datos) => ({ ...datos, accion: 'crear_capacitacion' }), cargar);

arrancar(cargar);
