function etiquetaDia(dia) {
  const hoy = fechaLocal();
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  if (dia === hoy) return 'Hoy';
  return dia === fechaLocal(manana) ? 'Mañana' : null;
}

function recuadroDia(dia, eventos) {
  const [anio, mes, numero] = dia.split('-').map(Number);
  const fecha = new Date(anio, mes - 1, numero);
  const articulo = nuevo('article', 'dia-recuadro');
  const cabeza = nuevo('div', 'dia-cabeza');
  const hoja = nuevo('span', 'dia-hoja');
  hoja.append(
    nuevo('strong', '', numero),
    nuevo('span', '', fecha.toLocaleDateString('es-AR', { month: 'short' })),
  );
  const nombres = nuevo('div');
  nombres.append(nuevo('h3', '', fecha.toLocaleDateString('es-AR', { weekday: 'long' })));
  const cercano = etiquetaDia(dia);
  if (cercano) nombres.append(etiquetaDe(cercano, true));
  cabeza.append(hoja, nombres);
  articulo.append(cabeza);
  for (const evento of eventos) {
    const linea = nuevo('p', 'dia-evento');
    linea.append(etiquetaDe(evento.tipo), ` ${nombreCultivo(evento.titulo)}`);
    articulo.append(linea);
  }
  return articulo;
}

async function cargar() {
  const { eventos } = await pedir('/api/calendario');
  const porDia = new Map();
  for (const evento of eventos) porDia.set(evento.fecha, [...(porDia.get(evento.fecha) ?? []), evento]);
  pintarEn('dias', [...porDia].map(([dia, lista]) => recuadroDia(dia, lista)), 'No hay nada previsto.');
}

arrancar(cargar);
