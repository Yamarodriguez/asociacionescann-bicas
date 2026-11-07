function recuadroContacto(contacto) {
  const correo = nuevo('a', 'boton secundario', 'Responder por correo');
  correo.href = `mailto:${encodeURIComponent(contacto.email).replace('%40', '@')}`;
  return recuadroFicha({
    titulo: contacto.nombre,
    subtitulo: contacto.email,
    dibujo: dibujoDe('contacto'),
    lineas: [nuevo('p', 'mensaje-contacto', contacto.mensaje), new Date(contacto.creado_en).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })],
    acciones: [correo],
  });
}

async function cargar() {
  const { contactos } = await pedir('/api/admin_contactos');
  pintarEn('lista', contactos.map(recuadroContacto), 'Todavía no hay mensajes.');
}

arrancar(cargar);
