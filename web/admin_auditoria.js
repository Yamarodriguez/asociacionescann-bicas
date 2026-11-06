const estadoLista = document.getElementById('estado-lista');

function celda(etiqueta, texto) {
  const td = document.createElement('td');
  td.dataset.etiqueta = etiqueta;
  td.textContent = texto;
  return td;
}

function fila(registro) {
  const tr = document.createElement('tr');
  const sobre = [registro.entidad, registro.entidad_id, registro.detalle].filter(Boolean).join(' ');
  tr.append(
    celda('Fecha', new Date(registro.creado_en).toLocaleString('es-AR')),
    celda('Responsable', registro.responsable ?? 'Sistema o socio'),
    celda('Acción', registro.accion.replaceAll('_', ' ')),
    celda('Sobre', sobre),
  );
  return tr;
}

async function iniciar() {
  try {
    const sesion = await leerSesion();
    if (!sesion || sesion.tipo !== 'admin') {
      location.href = '/login.html';
      return;
    }
    const { auditoria } = await pedir('/api/admin_auditoria');
    document.getElementById('filas').replaceChildren(...auditoria.map(fila));
    document.getElementById('tabla').classList.toggle('oculto', auditoria.length === 0);
    estadoLista.className = auditoria.length ? 'oculto' : 'estado-vacio';
    estadoLista.textContent = 'Todavía no hay registros.';
  } catch (error) {
    estadoLista.className = 'oculto';
    mostrarMensaje(document.getElementById('mensaje'), error.message);
  }
}

iniciar();
