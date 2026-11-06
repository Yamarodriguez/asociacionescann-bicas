// Aplica el diseno elegido antes de pintar la pagina. Solo existe durante el prototipo.
try {
  const tema = localStorage.getItem('tema');
  if (tema === 'a' || tema === 'b') document.documentElement.dataset.tema = tema;
} catch {
  // Sin almacenamiento se usa el diseno por defecto.
}
