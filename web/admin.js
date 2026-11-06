const SECCIONES = [
  { clave: 'pendientes', titulo: 'Socios', detalle: 'Solicitudes pendientes', enlace: '/admin_socios.html' },
  { clave: 'bajas', titulo: 'Bajas', detalle: 'Pedidos de baja', enlace: '/admin_socios.html' },
  { clave: 'vencidas', titulo: 'Cuotas', detalle: 'Socios con la cuota vencida', enlace: '/admin_cuotas.html' },
  { clave: 'mensajes', titulo: 'Contacto', detalle: 'Mensajes recibidos', enlace: '/admin_contactos.html' },
];
const PUBLICACIONES = ['comision_directiva', 'secretaria'];

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
    if (sesion.rol === 'comision_directiva') {
      tarjetas.push(tarjeta('Configuración', 'Límites, plazos e interruptores', '/admin_configuracion.html'));
    }
    document.getElementById('menu').replaceChildren(...tarjetas);
    document.getElementById('bloque-sin-permisos').classList.toggle('oculto', tarjetas.length > 0);
  } catch (error) {
    mostrarMensaje(document.getElementById('error'), error.message);
  } finally {
    cargando.classList.add('oculto');
  }
}

iniciar();
