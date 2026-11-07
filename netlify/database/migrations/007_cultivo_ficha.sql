-- Ficha del lote para rellenar por recuadros.
-- Litros de cada riego, notas del lote y correcciones de peso que dejan rastro.

ALTER TABLE registros_lote ADD COLUMN litros numeric(8, 2) CHECK (litros > 0);

ALTER TABLE registros_lote DROP CONSTRAINT registros_lote_tipo_check;
ALTER TABLE registros_lote ADD CONSTRAINT registros_lote_tipo_check CHECK (tipo IN (
  'riego', 'nutrientes', 'poda', 'aplicacion', 'incidencia', 'medicion',
  'baja', 'destruccion', 'etapa', 'correccion'));

ALTER TABLE lotes ADD COLUMN notas text;
