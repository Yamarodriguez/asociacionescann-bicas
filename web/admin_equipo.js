const accionEquipo = async (datos, texto) => {
  await pedir('/api/equipo', datos);
  avisar(texto, 'exito');
  await cargar();
};
const COLUMNAS = ['pendiente', 'en_curso', 'hecho'];

function tarjetaProyecto(proyecto, gestiona) {
  const articulo = document.createElement('article');
  articulo.className = 'tarjeta';
  const titulo = document.createElement('p');
  titulo.textContent = proyecto.titulo;
  const responsable = document.createElement('p');
  responsable.className = 'nota';
  responsable.textContent = proyecto.responsable ?? 'Sin responsable';
  articulo.append(titulo, responsable);
  if (gestiona) {
    for (const columna of COLUMNAS.filter((c) => c !== proyecto.columna)) {
      articulo.append(botonAccion(`Pasar a ${nombreCultivo(columna)}`, () => accionEquipo(
        { accion: 'mover_proyecto', id: proyecto.id, columna }, 'Proyecto movido.',
      )), ' ');
    }
  }
  return articulo;
}

function pintarFichaje({ fichaje_abierto: abierto, fichajes }) {
  document.getElementById('estado-fichaje').textContent = abierto
    ? `Entrada registrada: ${momento(abierto.entrada_en)}` : 'No tenés una entrada abierta.';
  const accion = abierto ? 'salida' : 'entrada';
  document.getElementById('boton-fichaje').replaceChildren(botonAccion(
    abierto ? 'Fichar salida' : 'Fichar entrada', () => accionEquipo({ accion }, 'Fichaje guardado.'), '',
  ));
  parrafosEn('fichajes', fichajes.map((f) => `${f.persona} · ${momento(f.entrada_en)} · ${f.salida_en ? momento(f.salida_en) : 'en curso'}`), 'Sin fichajes.');
}

function pintarTurnos(turnos, gestiona) {
  const contenedor = document.getElementById('turnos');
  if (!turnos.length) {
    parrafosEn('turnos', [], 'No hay turnos cargados.');
    return;
  }
  contenedor.replaceChildren(...turnos.map((turno) => {
    const linea = document.createElement('p');
    linea.textContent = `${fechaDia(turno.fecha)} · ${nombreCultivo(turno.franja)} · ${turno.persona} `;
    if (gestiona) linea.append(botonAccion('Quitar', () => accionEquipo({ accion: 'quitar_turno', id: turno.id }, 'Turno quitado.')));
    return linea;
  }));
}

async function cargar() {
  const datos = await pedir('/api/equipo');
  document.getElementById('gestion').classList.toggle('oculto', !datos.gestiona);
  pintarFichaje(datos);
  pintarTurnos(datos.turnos, datos.gestiona);
  parrafosEn('notas', datos.notas.map((n) => `${momento(n.creado_en)} · ${n.autor}: ${n.texto}`), 'Todavía no hay notas.');
  for (const columna of COLUMNAS) {
    const proyectos = datos.proyectos.filter((p) => p.columna === columna);
    document.getElementById(`columna-${columna}`).replaceChildren(...proyectos.map((p) => tarjetaProyecto(p, datos.gestiona)));
  }
  if (datos.gestiona) {
    opcionesEn('turno-persona', datos.personas, 'email');
    opcionesEn('proyecto-responsable', datos.personas, 'email', 'Sin responsable');
    opcionesEn('recurrente-responsable', datos.personas, 'email', 'Sin responsable');
    parrafosEn('recurrentes', datos.recurrentes.map((r) => `${r.titulo} · cada ${r.cada_dias} días · próxima ${fechaDia(r.proxima_en)} · ${r.responsable ?? 'Sin responsable'}`), 'Todavía no hay tareas recurrentes.');
  }
}

const numeroDe = (valor) => (valor ? Number(valor) : null);

enviarForm('form-nota', '/api/equipo', (datos) => ({ ...datos, accion: 'nota' }), cargar);
enviarForm('form-turno', '/api/equipo', (datos) => ({ ...datos, accion: 'crear_turno', admin_id: Number(datos.admin_id) }), cargar);
enviarForm('form-proyecto', '/api/equipo', (datos) => ({ ...datos, accion: 'crear_proyecto', responsable_id: numeroDe(datos.responsable_id) }), cargar);
enviarForm('form-recurrente', '/api/equipo', (datos) => ({
  ...datos, accion: 'crear_recurrente', cada_dias: Number(datos.cada_dias), asignada_a: numeroDe(datos.asignada_a),
}), cargar);

arrancar(cargar);
