-- Doble factor para el equipo y auditoria que no se puede alterar.

ALTER TABLE admins
  ADD COLUMN totp_cifrado text,
  ADD COLUMN totp_activado_en timestamptz,
  ADD COLUMN totp_ultimo_paso bigint;

CREATE TABLE codigos_recuperacion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id    bigint NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
  codigo_hash text NOT NULL UNIQUE,
  usado_en    timestamptz
);

INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('dosfa_obligatorio', 'true', 'El equipo debe usar doble factor. Los datos de prueba lo apagan solo en desarrollo'),
  ('dosfa_max_intentos', '5', 'Intentos fallidos de codigo dentro de la ventana de acceso'),
  ('solicitud_max_por_ip', '10', 'Solicitudes de alta por IP dentro de una hora');

CREATE FUNCTION auditoria_inmutable() RETURNS trigger AS $$
BEGIN
  -- Lo unico permitido es quitar la referencia a una persona cuyos datos se borran.
  IF TG_OP = 'UPDATE'
     AND NEW.socio_id IS NULL
     AND OLD.socio_id IS NOT NULL
     AND NEW.id = OLD.id
     AND NEW.admin_id IS NOT DISTINCT FROM OLD.admin_id
     AND NEW.accion = OLD.accion
     AND NEW.entidad = OLD.entidad
     AND NEW.entidad_id IS NOT DISTINCT FROM OLD.entidad_id
     AND NEW.detalle IS NOT DISTINCT FROM OLD.detalle
     AND NEW.creado_en = OLD.creado_en THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La auditoria no se puede modificar';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auditoria_sin_cambios
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable();
