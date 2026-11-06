-- Gestion interna: finanzas, cumplimiento, equipo, abastecimiento y plantas con QR.
-- Solo datos inventados durante el prototipo.

CREATE TABLE movimientos_caja (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha          date NOT NULL,
  tipo           text NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
  categoria      text NOT NULL,
  concepto       text NOT NULL,
  importe        numeric(12, 2) NOT NULL CHECK (importe > 0),
  metodo         text NOT NULL CHECK (metodo IN ('efectivo', 'transferencia')),
  cuota_id       bigint UNIQUE REFERENCES cuotas (id) ON DELETE SET NULL,
  anulado_en     timestamptz,
  anulado_por    bigint REFERENCES admins (id),
  anulado_motivo text,
  creado_por     bigint NOT NULL REFERENCES admins (id),
  creado_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movimientos_caja_fecha_idx ON movimientos_caja (fecha);

CREATE TABLE cierres_caja (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha      date NOT NULL UNIQUE,
  esperado   numeric(14, 2) NOT NULL,
  contado    numeric(14, 2) NOT NULL,
  notas      text,
  creado_por bigint NOT NULL REFERENCES admins (id),
  creado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE presupuestos (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anio      integer NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  tipo      text NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
  categoria text NOT NULL,
  importe   numeric(14, 2) NOT NULL CHECK (importe >= 0),
  UNIQUE (anio, tipo, categoria)
);

CREATE TABLE vencimientos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo        text NOT NULL CHECK (tipo IN ('habilitacion', 'seguro', 'contrato', 'otro')),
  titulo      text NOT NULL,
  vence_en    date NOT NULL,
  notas       text,
  resuelto_en timestamptz,
  creado_por  bigint NOT NULL REFERENCES admins (id),
  creado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE procedimientos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titulo     text NOT NULL UNIQUE,
  creado_por bigint NOT NULL REFERENCES admins (id),
  creado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE procedimiento_versiones (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  procedimiento_id bigint NOT NULL REFERENCES procedimientos (id),
  version          integer NOT NULL CHECK (version > 0),
  contenido        text NOT NULL,
  publicado_por    bigint NOT NULL REFERENCES admins (id),
  publicado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (procedimiento_id, version)
);

CREATE TABLE lecturas_procedimiento (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id bigint NOT NULL REFERENCES procedimiento_versiones (id),
  admin_id   bigint NOT NULL REFERENCES admins (id),
  leido_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, admin_id)
);

CREATE TABLE capacitaciones (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titulo      text NOT NULL,
  fecha       date NOT NULL,
  dictada_por text NOT NULL,
  creado_por  bigint NOT NULL REFERENCES admins (id),
  creado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE capacitacion_asistentes (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  capacitacion_id bigint NOT NULL REFERENCES capacitaciones (id),
  admin_id        bigint NOT NULL REFERENCES admins (id),
  UNIQUE (capacitacion_id, admin_id)
);

CREATE TABLE turnos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id   bigint NOT NULL REFERENCES admins (id),
  fecha      date NOT NULL,
  franja     text NOT NULL CHECK (franja IN ('manana', 'tarde', 'noche', 'guardia')),
  creado_por bigint NOT NULL REFERENCES admins (id),
  creado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_id, fecha, franja)
);

CREATE TABLE fichajes (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id   bigint NOT NULL REFERENCES admins (id),
  entrada_en timestamptz NOT NULL DEFAULT now(),
  salida_en  timestamptz CHECK (salida_en >= entrada_en)
);
CREATE UNIQUE INDEX fichaje_abierto_idx ON fichajes (admin_id) WHERE salida_en IS NULL;

CREATE TABLE notas_traspaso (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  texto     text NOT NULL,
  autor_id  bigint NOT NULL REFERENCES admins (id),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE proyectos (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titulo         text NOT NULL,
  columna        text NOT NULL DEFAULT 'pendiente' CHECK (columna IN ('pendiente', 'en_curso', 'hecho')),
  responsable_id bigint REFERENCES admins (id),
  creado_por     bigint NOT NULL REFERENCES admins (id),
  creado_en      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tareas_recurrentes (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titulo     text NOT NULL,
  cada_dias  integer NOT NULL CHECK (cada_dias BETWEEN 1 AND 366),
  proxima_en date NOT NULL,
  asignada_a bigint REFERENCES admins (id),
  creado_por bigint NOT NULL REFERENCES admins (id),
  creado_en  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE equipos ADD COLUMN frecuencia_dias integer CHECK (frecuencia_dias BETWEEN 1 AND 3660);

ALTER TABLE tareas
  ADD COLUMN insumo_id bigint REFERENCES insumos (id),
  ADD COLUMN equipo_id bigint REFERENCES equipos (id),
  ADD COLUMN recurrente_id bigint REFERENCES tareas_recurrentes (id);
-- Un solo aviso abierto por insumo o equipo.
CREATE UNIQUE INDEX tareas_insumo_abierta_idx ON tareas (insumo_id) WHERE completada_en IS NULL;
CREATE UNIQUE INDEX tareas_equipo_abierta_idx ON tareas (equipo_id) WHERE completada_en IS NULL;

CREATE TABLE averias (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  equipo_id   bigint NOT NULL REFERENCES equipos (id),
  detalle     text NOT NULL,
  coste       numeric(12, 2) CHECK (coste >= 0),
  resuelta_en timestamptz,
  creado_por  bigint NOT NULL REFERENCES admins (id),
  creado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE proveedores (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre    text NOT NULL UNIQUE,
  contacto  text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pedidos_proveedor (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proveedor_id bigint NOT NULL REFERENCES proveedores (id),
  estado       text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'aprobado', 'recibido', 'cancelado')),
  creado_por   bigint NOT NULL REFERENCES admins (id),
  aprobado_por bigint REFERENCES admins (id),
  aprobado_en  timestamptz,
  recibido_en  timestamptz,
  creado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pedido_lineas (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id      bigint NOT NULL REFERENCES pedidos_proveedor (id),
  insumo_id      bigint NOT NULL REFERENCES insumos (id),
  cantidad       numeric(12, 2) NOT NULL CHECK (cantidad > 0),
  coste_unitario numeric(12, 2) NOT NULL CHECK (coste_unitario >= 0),
  UNIQUE (pedido_id, insumo_id)
);

ALTER TABLE lotes
  ADD COLUMN sala_inicial_id bigint REFERENCES salas (id),
  ADD COLUMN cosecha_prevista date;
UPDATE lotes SET sala_inicial_id = sala_id;
ALTER TABLE lotes ALTER COLUMN sala_inicial_id SET NOT NULL;

CREATE TABLE plantas (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lote_id   bigint NOT NULL REFERENCES lotes (id),
  codigo    text NOT NULL UNIQUE,
  estado    text NOT NULL DEFAULT 'viva' CHECK (estado IN ('viva', 'baja')),
  baja_en   timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plantas_lote_idx ON plantas (lote_id);

INSERT INTO plantas (lote_id, codigo)
  SELECT l.id, l.codigo || '-P' || lpad(n::text, 3, '0')
  FROM lotes l CROSS JOIN LATERAL generate_series(1, l.cantidad_plantas) AS n;

ALTER TABLE registros_lote ADD COLUMN planta_id bigint REFERENCES plantas (id);

ALTER TABLE comunicados
  ADD COLUMN segmento text NOT NULL DEFAULT 'todos' CHECK (segmento IN ('todos', 'al_dia', 'morosos'));

INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('mora_suspension_meses', '0', 'Meses de atraso para suspender. Con 0 no se suspende. Depende de los estatutos'),
  ('pedido_aprobacion_monto', '0', 'Hasta este importe aprueba la coordinacion. Por encima, la comision');
