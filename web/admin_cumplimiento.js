const TIPOS_VENCIMIENTO = [
  { valor: 'habilitacion', texto: 'Habilitación' }, { valor: 'seguro', texto: 'Seguro' },
  { valor: 'contrato', texto: 'Contrato' }, { valor: 'otro', texto: 'Otro' },
];
const accionCumplimiento = async (datos, texto) => {
  await pedir('/api/cumplimiento', datos);
  confirmar(texto);
  await cargar();
};

function diasRestantes(dias) {
  if (dias < 0) return `Venció hace ${-dias} días`;
  return dias === 0 ? 'Vence hoy' : `Faltan ${dias} días`;
}

function recuadroVencimiento(vencimiento) {
  const cerca = vencimiento.dias <= 60;
  return recuadroFicha({
    titulo: vencimiento.titulo,
    subtitulo: `${nombreCultivo(vencimiento.tipo)} · ${fechaDia(vencimiento.vence_en)}`,
    alerta: vencimiento.dias < 0,
    etiquetas: [etiquetaDe(diasRestantes(vencimiento.dias), cerca)],
    acciones: [
      botonConfirmado('Renovar', {
        titulo: `Renovar: ${vencimiento.titulo}`,
        campos: [{ nombre: 'vence_en', etiqueta: '¿Cuándo vence ahora?', tipo: 'fecha', obligatorio: true }],
        boton: 'Renovar',
        clase: '',
        alGuardar: ({ vence_en: fecha }) => accionCumplimiento({ accion: 'renovar', id: vencimiento.id, vence_en: fecha }, 'Vencimiento renovado.'),
      }),
      botonConfirmado('Ya no aplica', {
        titulo: `Cerrar: ${vencimiento.titulo}`,
        ayuda: 'Deja de avisar. No se puede deshacer.',
        boton: 'Sí, cerrarlo',
        alGuardar: () => accionCumplimiento({ accion: 'resolver', id: vencimiento.id }, 'Vencimiento cerrado.'),
      }),
    ],
  });
}

function nuevoVencimiento() {
  abrirVentana({
    titulo: 'Nuevo vencimiento',
    dibujo: dibujoDe('vencimientos'),
    campos: [
      { nombre: 'titulo', etiqueta: '¿Qué vence?', tipo: 'texto', obligatorio: true },
      { nombre: 'tipo', etiqueta: '¿De qué tipo es?', tipo: 'elegir', opciones: TIPOS_VENCIMIENTO, obligatorio: true },
      { nombre: 'vence_en', etiqueta: '¿Cuándo vence?', tipo: 'fecha', obligatorio: true },
    ],
    alGuardar: (datos) => accionCumplimiento({ ...datos, accion: 'crear_vencimiento' }, 'Vencimiento guardado.'),
  });
}

function recuadroProcedimiento(procedimiento, total) {
  const detalles = nuevo('details', 'plegable-texto');
  detalles.append(nuevo('summary', '', 'Leer el procedimiento'), nuevo('p', 'mensaje-contacto', procedimiento.contenido));
  return recuadroFicha({
    titulo: procedimiento.titulo,
    subtitulo: `Versión ${procedimiento.version} · leído por ${procedimiento.lecturas} de ${total}`,
    alerta: !procedimiento.leido,
    lineas: [detalles],
    etiquetas: [procedimiento.leido && etiquetaDe('Ya lo leíste')],
    acciones: procedimiento.leido ? [] : [botonAccion('Confirmo que lo leí', () => accionCumplimiento(
      { accion: 'confirmar_lectura', version_id: procedimiento.version_id }, 'Lectura confirmada.',
    ), '')],
  });
}

function nuevoProcedimiento() {
  abrirVentana({
    titulo: 'Publicar un procedimiento',
    dibujo: dibujoDe('procedimientos'),
    ayuda: 'Con un título que ya existe se publica una versión nueva, y hay que volver a confirmar la lectura.',
    campos: [
      { nombre: 'titulo', etiqueta: 'Título', tipo: 'texto', obligatorio: true },
      { nombre: 'contenido', etiqueta: 'Texto', tipo: 'largo', largo: 40000, filas: 8, obligatorio: true },
    ],
    boton: 'Publicar',
    alGuardar: (datos) => accionCumplimiento({ ...datos, accion: 'publicar_procedimiento' }, 'Procedimiento publicado.'),
  });
}

function recuadroCapacitacion(capacitacion) {
  return recuadroFicha({
    titulo: capacitacion.titulo,
    subtitulo: `${fechaDia(capacitacion.fecha)} · ${capacitacion.dictada_por}`,
    lineas: [`${capacitacion.asistentes} asistentes`],
    etiquetas: [capacitacion.asistio && etiquetaDe('Asististe')],
    acciones: capacitacion.asistio ? [] : [botonAccion('Confirmo que asistí', () => accionCumplimiento(
      { accion: 'confirmar_asistencia', capacitacion_id: capacitacion.id }, 'Asistencia confirmada.',
    ))],
  });
}

function nuevaCapacitacion() {
  abrirVentana({
    titulo: 'Nueva capacitación',
    campos: [
      { nombre: 'titulo', etiqueta: '¿Sobre qué fue?', tipo: 'texto', obligatorio: true },
      { nombre: 'fecha', etiqueta: '¿Qué día?', tipo: 'fecha', obligatorio: true, valor: fechaLocal() },
      { nombre: 'dictada_por', etiqueta: '¿Quién la dio?', tipo: 'texto', largo: 120, obligatorio: true },
    ],
    alGuardar: (datos) => accionCumplimiento({ ...datos, accion: 'crear_capacitacion' }, 'Capacitación guardada.'),
  });
}

async function cargar() {
  const datos = await pedir('/api/cumplimiento');
  const { gestiona } = datos;
  const cerca = datos.vencimientos.filter((vencimiento) => vencimiento.dias <= 60).length;
  const sinLeer = datos.procedimientos.filter((procedimiento) => !procedimiento.leido).length;
  document.getElementById('cifras').replaceChildren(
    ...(gestiona ? [cajaCifra(cerca, 'Vencen pronto', 'En 60 días o menos', { dibujo: dibujoDe('vencimientos'), alerta: cerca > 0 })] : []),
    cajaCifra(sinLeer, 'Procedimientos por leer', '', { dibujo: dibujoDe('procedimientos'), alerta: sinLeer > 0 }),
    cajaCifra(datos.capacitaciones.length, 'Capacitaciones', '', { dibujo: dibujoDe('equipo') }),
  );
  document.getElementById('bloque-vencimientos').classList.toggle('oculto', !gestiona);
  const vencimientos = datos.vencimientos.map(recuadroVencimiento);
  if (gestiona) vencimientos.push(recuadroNuevo('Agregar un vencimiento', 'Seguros, contratos, habilitaciones', nuevoVencimiento));
  pintarEn('vencimientos', vencimientos, 'No hay vencimientos cargados.');
  const procedimientos = datos.procedimientos.map((procedimiento) => recuadroProcedimiento(procedimiento, datos.equipo_total));
  if (gestiona) procedimientos.push(recuadroNuevo('Publicar un procedimiento', 'Para que lo lea todo el equipo', nuevoProcedimiento));
  pintarEn('procedimientos', procedimientos, 'Todavía no hay procedimientos.');
  const capacitaciones = datos.capacitaciones.map(recuadroCapacitacion);
  if (gestiona) capacitaciones.push(recuadroNuevo('Agregar una capacitación', 'Para dejar constancia', nuevaCapacitacion));
  pintarEn('capacitaciones', capacitaciones, 'Todavía no hay capacitaciones.');
}

arrancar(cargar);
