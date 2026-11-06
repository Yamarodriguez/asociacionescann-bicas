-- Mensajes del formulario de contacto. Se conservan poco tiempo.

CREATE TABLE contactos (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre            text NOT NULL,
  email             text NOT NULL,
  mensaje           text NOT NULL,
  huella_ip         text NOT NULL,
  consentimiento_en timestamptz NOT NULL,
  creado_en         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contactos_ip_idx ON contactos (huella_ip, creado_en);
CREATE INDEX contactos_fecha_idx ON contactos (creado_en);

INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('contacto_retencion_dias', '30', 'Valor provisional: pendiente de la pregunta 15 al abogado'),
  ('contacto_max_por_ip', '5', 'Mensajes por IP dentro de la ventana'),
  ('contacto_ventana_minutos', '60', 'Duracion de la ventana de mensajes');
