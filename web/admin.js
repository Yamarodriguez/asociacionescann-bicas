const SECCIONES = [
  { clave: 'pendientes', titulo: 'Socios', detalle: 'Solicitudes pendientes', enlace: '/admin_socios.html' },
  { clave: 'bajas', titulo: 'Bajas', detalle: 'Pedidos de baja', enlace: '/admin_socios.html' },
  { clave: 'vencidas', titulo: 'Cuotas', detalle: 'Socios con la cuota vencida', enlace: '/admin_cuotas.html' },
  { clave: 'mensajes', titulo: 'Contacto', detalle: 'Mensajes recibidos', enlace: '/admin_contactos.html' },
  { clave: 'lotes_activos', titulo: 'Cultivo', detalle: 'Lotes activos', enlace: '/admin_cultivo.html' },
  { clave: 'tareas_hoy', titulo: 'Tareas', detalle: 'Para hoy o vencidas', enlace: '/admin_tareas.html' },
  { clave: 'stock_bajo', titulo: 'Inventario', detalle: 'Insumos por reponer', enlace: '/admin_inventario.html' },
  { clave: 'en_mora', titulo: 'Mora', detalle: 'Socios sobre el límite de atraso', enlace: '/admin_mora.html' },
  { clave: 'vencimientos_proximos', titulo: 'Vencimientos', detalle: 'En los próximos 60 días', enlace: '/admin_cumplimiento.html' },
  { clave: 'procedimientos_sin_leer', titulo: 'Procedimientos', detalle: 'Por confirmar la lectura', enlace: '/admin_cumplimiento.html' },
];
const PUBLICACIONES = ['comision_directiva', 'secretaria'];
const FINANZAS = ['comision_directiva', 'tesoreria'];

function tarjeta(titulo, detalle, enlace, valor) {
  const elemento = document.createElement('a');
  elemento.className = 'tarjeta tarjeta-menu';
  elemento.href = enlace;
  const nombre = document.createElement('h2');
  nombre.textContent = titulo;
  elemento.append(nombre);
  if (valor !== undefined) {
    const contador = document.createElement('p');
    contador.className = 'contador';
    contador.textContent = valor;
    elemento.append(contador);
  }
  const texto = document.createElement('p');
  texto.className = 'nota';
  texto.textContent = detalle;
  elemento.append(texto);
  return elemento;
}

async function iniciar() {
  const cargando = document.getElementById('cargando');
  try {
    const sesion = await leerSesion();
    if (!sesion || sesion.tipo !== 'admin') {
      location.href = '/login.html';
      return;
    }
    const resumen = await pedir('/api/admin_resumen');
    const tarjetas = SECCIONES.filter((s) => s.clave in resumen)
      .map((s) => tarjeta(s.titulo, s.detalle, s.enlace, resumen[s.clave]));
    if (PUBLICACIONES.includes(sesion.rol)) {
      tarjetas.push(tarjeta('Publicaciones', 'Comunicados, documentos, asambleas y actas', '/admin_comunicados.html'));
    }
    if (PUBLICACIONES.includes(sesion.rol)) {
      tarjetas.push(tarjeta('Informe de inspección', 'Resumen listo para imprimir', '/admin_informe.html'));
    }
    if (FINANZAS.includes(sesion.rol)) {
      tarjetas.push(tarjeta('Finanzas', 'Caja, presupuesto e informes', '/admin_finanzas.html'));
    }
    if ('stock_bajo' in resumen) {
      tarjetas.push(tarjeta('Abastecimiento', 'Proveedores y pedidos', '/admin_abastecimiento.html'));
    }
    tarjetas.push(tarjeta('Equipo', 'Fichaje, turnos, notas y proyectos', '/admin_equipo.html'));
    tarjetas.push(tarjeta('Calendario', 'Próximos 60 días', '/admin_calendario.html'));
    if (sesion.rol === 'comision_directiva') {
      tarjetas.push(tarjeta('Configuración', 'Límites, plazos e interruptores', '/admin_configuracion.html'));
    }
    if (sesion.rol === 'comision_directiva') {
      tarjetas.push(tarjeta('Auditoría', 'Quién hizo qué y cuándo', '/admin_auditoria.html'));
    }
    tarjetas.push(tarjeta('Seguridad', 'Doble factor de tu cuenta', '/admin_seguridad.html'));
    document.getElementById('menu').replaceChildren(...tarjetas);
    document.getElementById('bloque-sin-permisos').classList.toggle('oculto', tarjetas.length > 0);
  } catch (error) {
    mostrarMensaje(document.getElementById('error'), error.message);
  } finally {
    cargando.classList.add('oculto');
  }
}

iniciar();
