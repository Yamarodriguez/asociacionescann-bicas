function tarjetaDia(dia, eventos) {
  const articulo = document.createElement('article');
  articulo.className = 'tarjeta';
  const titulo = document.createElement('h2');
  titulo.textContent = fechaDia(dia);
  articulo.append(titulo);
  for (const evento of eventos) {
    const linea = document.createElement('p');
    linea.append(etiquetaDe(evento.tipo), ` ${nombreCultivo(evento.titulo)}`);
    articulo.append(linea);
  }
  return articulo;
}

async function cargar() {
  const { eventos } = await pedir('/api/calendario');
  const porDia = new Map();
  for (const evento of eventos) porDia.set(evento.fecha, [...(porDia.get(evento.fecha) ?? []), evento]);
  if (!eventos.length) {
    parrafosEn('dias', [], 'No hay nada previsto.');
    return;
  }
  document.getElementById('dias').replaceChildren(...[...porDia].map(([dia, lista]) => tarjetaDia(dia, lista)));
}

arrancar(cargar);
