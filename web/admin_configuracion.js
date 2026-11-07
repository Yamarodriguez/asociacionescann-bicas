// Nombre comprensible de cada ajuste y grupo en el que aparece.
const AJUSTES = {
  edad_minima: ['Edad mínima para asociarse', 'Socios'],
  aval_activo: ['Pedir el aval de otro socio', 'Socios'],
  carne_qr_activo: ['Mostrar el QR en el carné', 'Socios'],
  mora_suspension_meses: ['Meses de atraso para proponer suspender', 'Socios'],
  retencion_baja_dias: ['Días que se guardan los datos tras una baja', 'Socios'],
  contacto_retencion_dias: ['Días que se guardan los mensajes de contacto', 'Socios'],
  modulo_cultivo_activo: ['Módulo de cultivo', 'Cultivo'],
  plantas_autorizadas: ['Plantas autorizadas en floración', 'Cultivo'],
  pedido_aprobacion_monto: ['Importe que aprueba la coordinación', 'Cultivo'],
  modulo_reservas_activo: ['Módulo de reservas', 'Reservas'],
  dosfa_obligatorio: ['Doble factor obligatorio para el equipo', 'Seguridad'],
  dosfa_max_intentos: ['Intentos de código de seguridad', 'Seguridad'],
  login_max_por_email: ['Intentos de entrada por cuenta', 'Seguridad'],
  login_max_por_ip: ['Intentos de entrada por conexión', 'Seguridad'],
  login_ventana_minutos: ['Minutos que dura el bloqueo de entrada', 'Seguridad'],
  recuperacion_vigencia_minutos: ['Minutos que dura el enlace de contraseña', 'Seguridad'],
  recuperacion_max_por_hora: ['Enlaces de contraseña por hora', 'Seguridad'],
  solicitud_max_por_ip: ['Solicitudes de alta por hora', 'Seguridad'],
  contacto_max_por_ip: ['Mensajes de contacto por conexión', 'Seguridad'],
  contacto_ventana_minutos: ['Minutos entre tandas de mensajes', 'Seguridad'],
};
const ORDEN_GRUPOS = ['Socios', 'Cultivo', 'Reservas', 'Seguridad', 'Otros'];

const nombreDe = (fila) => AJUSTES[fila.clave]?.[0] ?? fila.clave.replaceAll('_', ' ');
const grupoDe = (fila) => AJUSTES[fila.clave]?.[1] ?? 'Otros';
const VALORES = { true: 'Activado', false: 'Desactivado' };
const valorVisible = (fila) => VALORES[fila.valor] ?? fila.valor;

function formulario(fila) {
  const elemento = nuevo('form', 'ajuste-form');
  let leer;
  if (fila.tipo === 'interruptor') {
    const opciones = nuevo('div', 'elecciones');
    opciones.setAttribute('role', 'radiogroup');
    opciones.setAttribute('aria-label', nombreDe(fila));
    const grupo = `valor-${fila.clave}`;
    opciones.append(
      recuadroEleccion(grupo, 'true', 'Activado', { marcado: fila.valor === 'true' }),
      recuadroEleccion(grupo, 'false', 'Desactivado', { marcado: fila.valor !== 'true' }),
    );
    elemento.append(opciones);
    leer = () => elemento.querySelector('input:checked').value;
  } else {
    const etiqueta = nuevo('label', 'oculto-visual', nombreDe(fila));
    etiqueta.htmlFor = `valor-${fila.clave}`;
    const campo = document.createElement('input');
    campo.id = etiqueta.htmlFor;
    campo.inputMode = 'numeric';
    campo.value = fila.valor;
    elemento.append(etiqueta, campo);
    leer = () => campo.value;
  }
  const boton = nuevo('button', 'secundario', 'Guardar');
  boton.type = 'submit';
  elemento.append(boton);
  elemento.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    boton.disabled = true;
    try {
      const respuesta = await pedir('/api/admin_configuracion', { clave: fila.clave, valor: leer() });
      confirmar(respuesta.mensaje);
    } catch (error) {
      avisar(error.message);
    } finally {
      boton.disabled = false;
    }
  });
  return elemento;
}

function recuadroAjuste(fila) {
  return recuadroFicha({
    titulo: nombreDe(fila),
    lineas: fila.editable
      ? [fila.descripcion, formulario(fila)]
      : [fila.descripcion, nuevo('p', 'ajuste-fijo', valorVisible(fila)), 'No se cambia desde acá.'],
  });
}

async function cargar() {
  const { configuracion } = await pedir('/api/admin_configuracion');
  const bloques = ORDEN_GRUPOS.flatMap((grupo) => {
    const filas = configuracion.filter((fila) => grupoDe(fila) === grupo);
    if (!filas.length) return [];
    const bloque = nuevo('section', 'bloque');
    const rejilla = nuevo('div', 'mosaico');
    rejilla.append(...filas.map(recuadroAjuste));
    bloque.append(nuevo('h2', '', grupo), rejilla);
    return [bloque];
  });
  document.getElementById('lista').replaceChildren(...bloques);
}

arrancar(cargar);
