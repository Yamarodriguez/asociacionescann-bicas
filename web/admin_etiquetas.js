const loteId = Number(new URLSearchParams(location.search).get('id'));

function etiquetaPlanta({ codigo, qr }) {
  const figura = document.createElement('figure');
  figura.className = 'etiqueta-planta';
  const imagen = document.createElement('img');
  imagen.src = qr;
  imagen.alt = `Código QR de ${codigo}`;
  imagen.width = 120;
  imagen.height = 120;
  const pie = document.createElement('figcaption');
  pie.textContent = codigo;
  figura.append(imagen, pie);
  return figura;
}

async function cargar() {
  const { codigo, plantas } = await pedir(`/api/lote_etiquetas?id=${loteId}`);
  document.getElementById('titulo').textContent = `Etiquetas de ${codigo}`;
  document.getElementById('volver').href = `/admin_lote.html?id=${loteId}`;
  document.getElementById('etiquetas').replaceChildren(...plantas.map(etiquetaPlanta));
}

document.getElementById('imprimir').addEventListener('click', () => window.print());

arrancar(cargar);
