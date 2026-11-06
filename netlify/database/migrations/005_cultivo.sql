-- Cultivo, tareas e inventario. Modulo apagado por defecto.
-- Solo con datos inventados hasta confirmar el permiso y hablar con el abogado.

CREATE TABLE salas (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre    text NOT NULL UNIQUE,
  tipo      text NOT NULL CHECK (tipo IN ('cultivo', 'secado', 'curado')),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE geneticas (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre    text NOT NULL UNIQUE,
  notas     text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lotes (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo           text NOT NULL UNIQUE,
  genetica_id      bigint NOT NULL REFERENCES geneticas (id),
  sala_id          bigint NOT NULL REFERENCES salas (id),
  origen           text NOT NULL CHECK (origen IN ('semilla', 'esqueje')),
  cantidad_plantas integer NOT NULL CHECK (cantidad_plantas >= 0),
  etapa            text NOT NULL DEFAULT 'origen' CHECK (etapa IN (
                     'origen', 'vegetativo', 'floracion', 'cosecha', 'secado', 'curado', 'envasado')),
  estado           text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'finalizado', 'descartado')),
  peso_humedo_g    numeric(12, 2) CHECK (peso_humedo_g > 0),
  peso_seco_g      numeric(12, 2) CHECK (peso_seco_g > 0),
  creado_por       bigint NOT NULL REFERENCES admins (id),
  creado_en        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE registros_lote (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lote_id     bigint NOT NULL REFERENCES lotes (id),
  tipo        text NOT NULL CHECK (tipo IN (
                'riego', 'nutrientes', 'poda', 'aplicacion', 'incidencia', 'medicion',
                'baja', 'destruccion', 'etapa')),
  detalle     text NOT NULL,
  ph          numeric(4, 2),
  ec          numeric(6, 2),
  temperatura numeric(5, 2),
  humedad     numeric(5, 2),
  plantas     integer CHECK (plantas > 0),
  testigos    text,
  creado_por  bigint NOT NULL REFERENCES admins (id),
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX registros_lote_idx ON registros_lote (lote_id, creado_en);

CREATE TABLE analisis (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lote_id     bigint NOT NULL REFERENCES lotes (id),
  laboratorio text NOT NULL,
  fecha       date NOT NULL,
  thc         numeric(5, 2) NOT NULL CHECK (thc >= 0 AND thc <= 100),
  cbd         numeric(5, 2) NOT NULL CHECK (cbd >= 0 AND cbd <= 100),
  notas       text,
  creado_por  bigint NOT NULL REFERENCES admins (id),
  creado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plantillas_tarea (
  id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  etapa  text NOT NULL,
  titulo text NOT NULL,
  dias   integer NOT NULL DEFAULT 0 CHECK (dias >= 0),
  UNIQUE (etapa, titulo)
);

CREATE TABLE tareas (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titulo         text NOT NULL,
  detalle        text,
  lote_id        bigint REFERENCES lotes (id),
  asignada_a     bigint REFERENCES admins (id),
  vence_en       date NOT NULL,
  completada_en  timestamptz,
  completada_por bigint REFERENCES admins (id),
  creado_por     bigint REFERENCES admins (id),
  creado_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tareas_pendientes_idx ON tareas (vence_en) WHERE completada_en IS NULL;

CREATE TABLE insumos (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre       text NOT NULL UNIQUE,
  categoria    text NOT NULL,
  unidad       text NOT NULL,
  stock        numeric(12, 2) NOT NULL DEFAULT 0 CHECK (stock >= 0),
  stock_minimo numeric(12, 2) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  creado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE movimientos_insumo (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  insumo_id  bigint NOT NULL REFERENCES insumos (id),
  tipo       text NOT NULL CHECK (tipo IN ('ingreso', 'consumo', 'ajuste')),
  cantidad   numeric(12, 2) NOT NULL CHECK (cantidad <> 0),
  motivo     text NOT NULL,
  lote_id    bigint REFERENCES lotes (id),
  creado_por bigint NOT NULL REFERENCES admins (id),
  creado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE equipos (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre                text NOT NULL,
  tipo                  text NOT NULL,
  sala_id               bigint REFERENCES salas (id),
  proximo_mantenimiento date,
  notas                 text,
  creado_en             timestamptz NOT NULL DEFAULT now()
);

INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('modulo_cultivo_activo', 'false', 'Solo datos inventados hasta confirmar el permiso y hablar con el abogado'),
  ('plantas_autorizadas', '0', 'Plantas florecidas que permite el certificado. Pendiente de verlo');
