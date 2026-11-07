// Armazón común de la gestión: menú lateral, título con dibujo y resumen de contadores.
// Va dentro de una función para no chocar con las variables de cada pantalla.
const armazon = (() => {
  const PUBLICACIONES = ['comision_directiva', 'secretaria'];
  const FINANZAS = ['comision_directiva', 'tesoreria'];
  const SOLO_COMISION = ['comision_directiva'];
  const GUARDADO = 'resumen-panel';

  // `clave` es el contador del resumen: si el rol no lo recibe, la sección no se le muestra.
  // `aviso` indica que un número mayor que cero pide atención. Un lote activo no es un problema.
  // `menu` cambia el nombre en el menú y `soloMosaico` la deja fuera de él.
  // `tambien` es otro contador que da derecho a ver esa entrada del menú.
  const GRUPOS = [
    { titulo: 'Personas', secciones: [
      { titulo: 'Socios', detalle: 'Solicitudes pendientes', enlace: '/admin_socios.html', dibujo: 'socios', tono: 'verde', clave: 'pendientes', aviso: true },
      { titulo: 'Bajas', detalle: 'Pedidos de baja', enlace: '/admin_socios.html', dibujo: 'bajas', tono: 'terracota', clave: 'bajas', aviso: true, soloMosaico: true },
      { titulo: 'Cuotas', detalle: 'Socios con la cuota vencida', enlace: '/admin_cuotas.html', dibujo: 'cuotas', tono: 'dorado', clave: 'vencidas', aviso: true },
      { titulo: 'Mora', detalle: 'Socios sobre el límite de atraso', enlace: '/admin_mora.html', dibujo: 'mora', tono: 'terracota', clave: 'en_mora', aviso: true },
      { titulo: 'Contacto', detalle: 'Mensajes recibidos', enlace: '/admin_contactos.html', dibujo: 'contacto', tono: 'azul', clave: 'mensajes', aviso: true },
    ] },
    { titulo: 'Producción', secciones: [
      { titulo: 'Cultivo', detalle: 'Lotes activos', enlace: '/admin_cultivo.html', otras: ['/admin_lote.html', '/admin_lote_nuevo.html', '/admin_etiquetas.html'], dibujo: 'cultivo', tono: 'verde', clave: 'lotes_activos' },
      { titulo: 'Tareas', detalle: 'Para hoy o vencidas', enlace: '/admin_tareas.html', dibujo: 'tareas', tono: 'azul', clave: 'tareas_hoy', aviso: true },
      { titulo: 'Inventario', detalle: 'Insumos por reponer', enlace: '/admin_inventario.html', dibujo: 'inventario', tono: 'dorado', clave: 'stock_bajo', aviso: true },
      { titulo: 'Abastecimiento', enlace: '/admin_abastecimiento.html', dibujo: 'abastecimiento', tono: 'azul', requiere: 'stock_bajo' },
    ] },
    { titulo: 'Organización', secciones: [
      { titulo: 'Finanzas', enlace: '/admin_finanzas.html', dibujo: 'finanzas', tono: 'dorado', roles: FINANZAS },
      { titulo: 'Equipo', enlace: '/admin_equipo.html', dibujo: 'equipo', tono: 'azul' },
      { titulo: 'Calendario', enlace: '/admin_calendario.html', dibujo: 'calendario', tono: 'verde' },
      { titulo: 'Publicaciones', enlace: '/admin_comunicados.html', dibujo: 'publicaciones', tono: 'terracota', roles: PUBLICACIONES },
    ] },
    { titulo: 'Cumplimiento', secciones: [
      { titulo: 'Vencimientos', menu: 'Plazos y normas', tambien: 'procedimientos_sin_leer', detalle: 'En los próximos 60 días', enlace: '/admin_cumplimiento.html', dibujo: 'vencimientos', tono: 'terracota', clave: 'vencimientos_proximos', aviso: true },
      { titulo: 'Procedimientos', detalle: 'Por confirmar la lectura', enlace: '/admin_cumplimiento.html', dibujo: 'procedimientos', tono: 'azul', clave: 'procedimientos_sin_leer', aviso: true, soloMosaico: true },
      { titulo: 'Informe de inspección', enlace: '/admin_informe.html', dibujo: 'informe', tono: 'verde', roles: PUBLICACIONES },
      { titulo: 'Auditoría', enlace: '/admin_auditoria.html', dibujo: 'auditoria', tono: 'azul', roles: SOLO_COMISION },
    ] },
    { titulo: 'Sistema', secciones: [
      { titulo: 'Configuración', enlace: '/admin_configuracion.html', dibujo: 'configuracion', tono: 'dorado', roles: SOLO_COMISION },
      { titulo: 'Seguridad', enlace: '/admin_seguridad.html', dibujo: 'seguridad', tono: 'verde' },
    ] },
  ];

  const INICIO = { titulo: 'Inicio', enlace: '/admin.html', dibujo: 'panel' };
  const todas = GRUPOS.flatMap((grupo) => grupo.secciones);
  const ruta = location.pathname;
  const actual = todas.find((s) => s.enlace === ruta || s.otras?.includes(ruta));

  function dibujo(nombre) {
    const espacio = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(espacio, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', '0 0 24 24');
    const uso = document.createElementNS(espacio, 'use');
    uso.setAttribute('href', `/dibujos.svg#${nombre}`);
    svg.append(uso);
    return svg;
  }

  function puedeVer(seccion, resumen) {
    if (seccion.clave && !(seccion.clave in resumen)) return false;
    if (seccion.requiere && !(seccion.requiere in resumen)) return false;
    return !seccion.roles || seccion.roles.includes(resumen.rol);
  }

  function enMenu(seccion, resumen) {
    if (seccion.soloMosaico) return false;
    return puedeVer(seccion, resumen) || (seccion.tambien in resumen);
  }

  function enlaceMenu(seccion, numero) {
    const enlace = document.createElement('a');
    enlace.href = seccion.enlace;
    if (seccion === actual || (seccion === INICIO && ruta === INICIO.enlace)) enlace.setAttribute('aria-current', 'page');
    const nombre = document.createElement('span');
    nombre.textContent = seccion.menu ?? seccion.titulo;
    enlace.append(dibujo(seccion.dibujo), nombre);
    if (seccion.aviso && numero > 0) {
      const marca = document.createElement('span');
      marca.className = 'lateral-numero';
      marca.textContent = numero;
      marca.setAttribute('aria-label', `${numero} para revisar`);
      enlace.append(marca);
    }
    return enlace;
  }

  function pintarMenu(resumen) {
    const bloques = GRUPOS.map((grupo) => {
      const visibles = grupo.secciones.filter((s) => enMenu(s, resumen));
      if (!visibles.length) return null;
      const bloque = document.createElement('div');
      const titulo = document.createElement('p');
      titulo.className = 'lateral-grupo';
      titulo.textContent = grupo.titulo;
      bloque.append(titulo, ...visibles.map((s) => enlaceMenu(s, Number(resumen[s.clave] ?? resumen[s.tambien] ?? 0))));
      return bloque;
    }).filter(Boolean);
    document.getElementById('navegacion-panel').replaceChildren(enlaceMenu(INICIO, 0), ...bloques);
  }

  function leerGuardado() {
    try {
      return JSON.parse(sessionStorage.getItem(GUARDADO));
    } catch {
      return null;
    }
  }

  function guardar(resumen) {
    try {
      sessionStorage.setItem(GUARDADO, JSON.stringify(resumen));
    } catch {
      // Sin almacenamiento, el menú solo tarda un instante más en aparecer.
    }
  }

  function crearLateral() {
    const lateral = document.createElement('aside');
    lateral.className = 'lateral no-imprimir';
    const arriba = document.createElement('div');
    arriba.className = 'lateral-arriba';
    const marca = document.createElement('a');
    marca.className = 'lateral-marca';
    marca.href = INICIO.enlace;
    marca.dataset.sitio = 'nombre';
    marca.textContent = 'Asociación';
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'secundario lateral-boton';
    boton.textContent = 'Menú';
    boton.setAttribute('aria-expanded', 'false');
    boton.setAttribute('aria-controls', 'navegacion-panel');
    const menu = document.createElement('nav');
    menu.id = 'navegacion-panel';
    menu.className = 'lateral-menu';
    menu.setAttribute('aria-label', 'Secciones del sistema');
    boton.addEventListener('click', () => {
      boton.setAttribute('aria-expanded', String(menu.classList.toggle('abierto')));
    });
    arriba.append(marca, boton);
    lateral.append(arriba, menu);
    const salir = document.getElementById('salir');
    if (salir) {
      salir.className = 'secundario lateral-salir';
      lateral.append(salir);
    }
    return lateral;
  }

  function ponerDibujoAlTitulo(principal) {
    const titulo = principal.querySelector('h1');
    if (!titulo || !actual) return;
    const circulo = document.createElement('span');
    circulo.className = `titulo-dibujo tono-${actual.tono} no-imprimir`;
    circulo.append(dibujo(actual.dibujo));
    const contenedor = document.createElement('div');
    contenedor.className = 'titulo-pagina';
    titulo.before(contenedor);
    contenedor.append(circulo, titulo);
  }

  function montar() {
    const principal = document.querySelector('main');
    const envoltura = document.createElement('div');
    envoltura.className = 'armazon';
    const estrecha = !principal.classList.contains('pagina-ancha');
    principal.className = estrecha ? 'area area-estrecha' : 'area';
    principal.before(envoltura);
    envoltura.append(crearLateral(), principal);
    ponerDibujoAlTitulo(principal);
  }

  montar();
  const guardado = leerGuardado();
  if (guardado) pintarMenu(guardado);
  const resumenListo = pedir('/api/admin_resumen');
  // Sin resumen (sin sesión o sin doble factor) cada pantalla ya lleva a quien corresponde.
  resumenListo.then((resumen) => {
    guardar(resumen);
    pintarMenu(resumen);
  }, () => {});

  return { GRUPOS, dibujo, puedeVer, resumenListo };
})();
