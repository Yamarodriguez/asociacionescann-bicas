const buscar = document.getElementById('buscar');
let registros = [];

const textoAccion = (registro) => {
  const texto = registro.accion.replaceAll('_', ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};
const sobreQue = (registro) => [registro.entidad, registro.entidad_id, registro.detalle].filter(Boolean).join(' ');
const responsable = (registro) => (registro.responsable ? nombreCorto(registro.responsable) : 'Sistema o socio');

function pintar() {
  const texto = buscar.value.trim().toLowerCase();
  const visibles = registros.filter((registro) => !texto
    || `${registro.accion} ${sobreQue(registro)} ${responsable(registro)}`.replaceAll('_', ' ').toLowerCase().includes(texto));
  pintarEn('lista', visibles.map((registro) => filaApunte({
    titulo: textoAccion(registro),
    detalle: sobreQue(registro),
    pie: `${momento(registro.creado_en)} · ${responsable(registro)}`,
    dibujo: dibujoDe('auditoria'),
  })), registros.length ? 'Nada coincide con la búsqueda.' : 'Todavía no hay registros.');
}

async function cargar() {
  ({ auditoria: registros } = await pedir('/api/admin_auditoria'));
  pintar();
}

buscar.addEventListener('input', pintar);

arrancar(cargar);
