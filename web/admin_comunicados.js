const TIPOS = [
  { tipo: 'comunicado', titulo: 'Comunicado', detalle: 'Un aviso para los socios', dibujo: 'publicaciones' },
  { tipo: 'documento', titulo: 'Documento', detalle: 'Un texto para consultar', dibujo: 'informe' },
  { tipo: 'asamblea', titulo: 'Asamblea', detalle: 'Convocar a una reunión', dibujo: 'equipo' },
  { tipo: 'acta', titulo: 'Acta', detalle: 'Lo resuelto en una reunión', dibujo: 'procedimientos' },
];
const SEGMENTOS = [
  { valor: 'todos', texto: 'Todos los socios activos' },
  { valor: 'al_dia', texto: 'Solo con la cuota al día' },
  { valor: 'morosos', texto: 'Solo con la cuota atrasada' },
];

function camposDe(tipo) {
  const titulo = { nombre: 'titulo', etiqueta: 'Título', tipo: 'texto', obligatorio: true };
  if (tipo === 'asamblea') {
    return [
      titulo,
      { nombre: 'fecha', etiqueta: '¿Cuándo es?', tipo: 'fecha-hora', obligatorio: true },
      { nombre: 'lugar', etiqueta: '¿Dónde es?', tipo: 'texto', obligatorio: true },
      { nombre: 'cuerpo', etiqueta: 'Orden del día', tipo: 'largo', largo: 20000, filas: 6, obligatorio: true },
    ];
  }
  if (tipo === 'comunicado') {
    return [
      titulo,
      { nombre: 'segmento', etiqueta: '¿Para quién es?', tipo: 'elegir', opciones: SEGMENTOS, obligatorio: true, valor: 'todos' },
      { nombre: 'cuerpo', etiqueta: 'Texto', tipo: 'largo', largo: 20000, filas: 6, obligatorio: true },
    ];
  }
  return [titulo, { nombre: 'cuerpo', etiqueta: 'Texto', tipo: 'largo', largo: 40000, filas: 8, obligatorio: true }];
}

function publicar({ tipo, titulo, dibujo }) {
  abrirVentana({
    titulo,
    dibujo: dibujoDe(dibujo),
    ayuda: 'Al publicarlo, aparece en el portal de los socios.',
    campos: camposDe(tipo),
    boton: 'Publicar',
    alGuardar: async (datos) => {
      // La fecha viaja con su zona horaria, para que no cambie en el servidor.
      const fecha = tipo === 'asamblea' ? new Date(datos.fecha).toISOString() : undefined;
      await pedir('/api/admin_publicaciones', { ...datos, tipo, fecha });
      confirmar('Publicado.');
      await cargar();
    },
  });
}

function fila(tipo, publicacion) {
  const { titulo, dibujo } = TIPOS.find((item) => item.tipo === tipo);
  return filaApunte({
    titulo: publicacion.titulo,
    detalle: titulo,
    pie: new Date(publicacion.publicado_en ?? publicacion.fecha).toLocaleDateString('es-AR'),
    dibujo: dibujoDe(dibujo),
  });
}

async function cargar() {
  const datos = await pedir('/api/admin_publicaciones');
  pintarEn('lista', [
    ...datos.comunicados.map((publicacion) => fila('comunicado', publicacion)),
    ...datos.documentos.map((publicacion) => fila('documento', publicacion)),
    ...datos.asambleas.map((publicacion) => fila('asamblea', publicacion)),
    ...datos.actas.map((publicacion) => fila('acta', publicacion)),
  ], 'Todavía no hay publicaciones.');
}

document.getElementById('acciones').replaceChildren(...TIPOS.map((item) => (
  recuadroAccion(item.titulo, item.detalle, dibujoDe(item.dibujo), () => publicar(item))
)));

arrancar(cargar);
