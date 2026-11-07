const NOMBRES_ROL = {
  comision_directiva: 'Comisión directiva', secretaria: 'Secretaría', tesoreria: 'Tesorería',
  coordinador: 'Coordinación', cultivador: 'Cultivo', dispensador: 'Dispensa',
};

function ficha(seccion, numero) {
  const elemento = document.createElement('a');
  elemento.className = `ficha tono-${seccion.tono}`;
  elemento.href = seccion.enlace;
  const circulo = document.createElement('span');
  circulo.className = 'ficha-dibujo';
  circulo.append(armazon.dibujo(seccion.dibujo));
  const nombre = document.createElement('h3');
  nombre.textContent = seccion.titulo;
  const contador = document.createElement('p');
  contador.className = 'ficha-numero';
  contador.textContent = numero;
  const texto = document.createElement('p');
  texto.className = 'nota';
  texto.textContent = seccion.detalle;
  elemento.append(circulo, nombre, contador, texto);
  if (seccion.aviso) {
    const estado = document.createElement('span');
    estado.className = numero > 0 ? 'ficha-estado revisar' : 'ficha-estado al-dia';
    estado.textContent = numero > 0 ? 'Para revisar' : 'Al día';
    elemento.append(estado);
  }
  return elemento;
}

function fraseResumen(pendientes) {
  if (pendientes === 0) return 'Todo al día. No hay nada pendiente por ahora.';
  if (pendientes === 1) return 'Tenés 1 apartado para revisar.';
  return `Tenés ${pendientes} apartados para revisar.`;
}

function pintarSaludo(rol, pendientes) {
  const fecha = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date());
  document.getElementById('saludo-fecha').textContent = `${fecha} · ${NOMBRES_ROL[rol] ?? 'Equipo'}`;
  document.getElementById('saludo-resumen').textContent = fraseResumen(pendientes);
}

async function iniciar() {
  const cargando = document.getElementById('cargando');
  try {
    const sesion = await leerSesion();
    if (!sesion || sesion.tipo !== 'admin') {
      location.href = '/login.html';
      return;
    }
    const resumen = await armazon.resumenListo;
    const conNumero = armazon.GRUPOS.flatMap((g) => g.secciones)
      .filter((s) => s.clave && armazon.puedeVer(s, resumen));
    const numeroDe = (s) => Number(resumen[s.clave]);
    const pideAtencion = (s) => s.aviso && numeroDe(s) > 0;
    const ordenadas = [...conNumero.filter(pideAtencion), ...conNumero.filter((s) => !pideAtencion(s))];

    pintarSaludo(sesion.rol, conNumero.filter(pideAtencion).length);
    document.getElementById('menu').replaceChildren(...ordenadas.map((s) => ficha(s, numeroDe(s))));
    document.getElementById('bloque-hoy').classList.toggle('oculto', conNumero.length === 0);
    document.getElementById('bloque-sin-permisos').classList.toggle('oculto', conNumero.length > 0);
  } catch (error) {
    mostrarMensaje(document.getElementById('error'), error.message);
  } finally {
    cargando.classList.add('oculto');
  }
}

iniciar();
