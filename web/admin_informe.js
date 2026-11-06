function pintarCultivo(cultivo) {
  document.getElementById('bloque-cultivo').classList.remove('oculto');
  document.getElementById('plantas').textContent =
    `Plantas en floración: ${cultivo.plantas_floracion} de ${cultivo.plantas_autorizadas} autorizadas.`;
  parrafosEn('lotes', cultivo.lotes.map((l) => {
    const pesos = l.peso_seco_g ? ` · húmedo ${l.peso_humedo_g} g · seco ${l.peso_seco_g} g` : '';
    return `${l.codigo} · ${l.genetica} · ${l.sala} · ${nombreCultivo(l.etapa)} · ${l.estado} · ${l.cantidad_plantas} plantas${pesos} · ${l.analisis} análisis`;
  }), 'Sin lotes.');
  parrafosEn('destrucciones', cultivo.destrucciones.map((d) => `${momento(d.creado_en)} · ${d.codigo} · ${d.detalle} · Testigos: ${d.testigos}`), 'Sin registros.');
}

async function cargar() {
  const datos = await pedir('/api/informe_inspeccion');
  const { socios, auditoria } = datos;
  document.getElementById('generado').textContent = `Generado: ${momento(datos.generado_en)}`;
  document.getElementById('socios').textContent =
    `Activos: ${socios.activos}. Suspendidos: ${socios.suspendidos}. Pendientes: ${socios.pendientes}. Bajas: ${socios.bajas}. Equipo: ${datos.equipo_total}.`;
  if (datos.cultivo) pintarCultivo(datos.cultivo);
  parrafosEn('vencimientos', datos.vencimientos.map((v) => `${v.titulo} · ${nombreCultivo(v.tipo)} · ${fechaDia(v.vence_en)}${v.vencido ? ' · vencido' : ''}`), 'Sin vencimientos.');
  parrafosEn('procedimientos', datos.procedimientos.map((p) => `${p.titulo} · versión ${p.version} · ${p.lecturas} lecturas confirmadas`), 'Sin procedimientos.');
  parrafosEn('capacitaciones', datos.capacitaciones.map((c) => `${c.titulo} · ${fechaDia(c.fecha)} · ${c.dictada_por} · ${c.asistentes} asistentes`), 'Sin capacitaciones.');
  document.getElementById('auditoria').textContent = `Acciones registradas: ${auditoria.total}. En los últimos 30 días: ${auditoria.ultimos_30}.`;
}

document.getElementById('imprimir').addEventListener('click', () => window.print());

arrancar(cargar);
