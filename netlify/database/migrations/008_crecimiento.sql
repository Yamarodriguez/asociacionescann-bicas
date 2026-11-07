-- Seguimiento del crecimiento: altura de las plantas de cada lote a lo largo del tiempo.

ALTER TABLE registros_lote ADD COLUMN altura_cm numeric(6, 2) CHECK (altura_cm > 0);

ALTER TABLE registros_lote DROP CONSTRAINT registros_lote_tipo_check;
ALTER TABLE registros_lote ADD CONSTRAINT registros_lote_tipo_check CHECK (tipo IN (
  'riego', 'nutrientes', 'poda', 'aplicacion', 'incidencia', 'medicion',
  'baja', 'destruccion', 'etapa', 'correccion', 'crecimiento'));

-- Las descripciones de los ajustes ya se leen en pantalla: se escriben con sus tildes.
UPDATE configuracion SET descripcion = replace(replace(replace(replace(replace(replace(descripcion,
  'Duracion', 'Duración'), 'codigo', 'código'), 'contrasena', 'contraseña'),
  'coordinacion', 'coordinación'), 'comision', 'comisión'), 'carne', 'carné');
