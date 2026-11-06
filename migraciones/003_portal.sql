-- Portal del socio y panel. Solo datos inventados durante el prototipo.

ALTER TABLE socios
  ADD COLUMN carne_token text UNIQUE,
  ADD COLUMN baja_solicitada_en timestamptz;

-- Borrar a una persona no debe borrar el rastro de auditoria.
ALTER TABLE auditoria DROP CONSTRAINT auditoria_socio_id_fkey;
ALTER TABLE auditoria
  ADD CONSTRAINT auditoria_socio_id_fkey
  FOREIGN KEY (socio_id) REFERENCES socios (id) ON DELETE SET NULL;

CREATE TABLE cuotas (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  socio_id       bigint REFERENCES socios (id) ON DELETE SET NULL,
  periodo        date NOT NULL CHECK (extract(day FROM periodo) = 1),
  importe        numeric(12, 2) NOT NULL CHECK (importe > 0),
  pagado_en      date NOT NULL,
  metodo         text NOT NULL CHECK (metodo IN ('efectivo', 'transferencia')),
  registrado_por bigint NOT NULL REFERENCES admins (id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (socio_id, periodo)
);

CREATE TABLE comunicados (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titulo       text NOT NULL,
  cuerpo       text NOT NULL,
  autor_id     bigint NOT NULL REFERENCES admins (id),
  publicado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documentos (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titulo       text NOT NULL,
  contenido    text NOT NULL,
  autor_id     bigint NOT NULL REFERENCES admins (id),
  publicado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE asambleas (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titulo    text NOT NULL,
  fecha     timestamptz NOT NULL,
  lugar     text NOT NULL,
  orden_dia text NOT NULL,
  autor_id  bigint NOT NULL REFERENCES admins (id),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE actas (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asamblea_id  bigint REFERENCES asambleas (id) ON DELETE SET NULL,
  titulo       text NOT NULL,
  contenido    text NOT NULL,
  autor_id     bigint NOT NULL REFERENCES admins (id),
  publicado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recuperaciones (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo       text NOT NULL CHECK (tipo IN ('socio', 'admin')),
  usuario_id bigint NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expira_en  timestamptz NOT NULL,
  usado_en   timestamptz,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recuperaciones_usuario_idx ON recuperaciones (tipo, usuario_id, creado_en);

INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('aval_activo', 'false', 'Exige el aval de otro socio. Depende de los estatutos'),
  ('carne_qr_activo', 'true', 'Muestra el QR del carne. Solo datos inventados hasta la respuesta del abogado'),
  ('recuperacion_vigencia_minutos', '60', 'Duracion del enlace para cambiar la contrasena'),
  ('recuperacion_max_por_hora', '3', 'Enlaces por cuenta y hora');
