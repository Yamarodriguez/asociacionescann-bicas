-- Tablas base. Cada campo personal tiene su motivo y plazo en la Fase 1.
-- Las tablas de cultivo, autorizaciones y dispensa se anaden en su etapa.

CREATE TABLE configuracion (
  clave       text PRIMARY KEY,
  valor       text NOT NULL,
  descripcion text NOT NULL
);

INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('edad_minima', '18', 'Valor provisional de prototipo: pendiente de estatutos y abogado'),
  ('modulo_reservas_activo', 'false', 'Solo se activa con visto bueno escrito del abogado'),
  ('login_max_por_email', '5', 'Intentos fallidos por correo dentro de la ventana'),
  ('login_max_por_ip', '20', 'Intentos fallidos por IP dentro de la ventana'),
  ('login_ventana_minutos', '15', 'Duracion de la ventana de intentos'),
  ('retencion_baja_dias', '0', 'Valor provisional: pendiente de la pregunta 15 al abogado');

CREATE TABLE admins (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email          text NOT NULL UNIQUE CHECK (email = lower(email)),
  clave_hash     text NOT NULL,
  rol            text NOT NULL CHECK (rol IN (
                   'comision_directiva', 'secretaria', 'tesoreria', 'director_medico',
                   'coordinador_cultivo', 'cultivador', 'dispensador')),
  activo         boolean NOT NULL DEFAULT true,
  sesion_version integer NOT NULL DEFAULT 1,
  creado_en      timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE numero_socio_seq START 1;

CREATE TABLE socios (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero_socio             bigint UNIQUE,
  email                    text NOT NULL UNIQUE CHECK (email = lower(email)),
  clave_hash               text NOT NULL,
  nombre                   text NOT NULL,
  apellido                 text NOT NULL,
  fecha_nacimiento         date NOT NULL,
  tipo_documento           text NOT NULL,
  numero_documento         text NOT NULL,
  telefono                 text,
  estado                   text NOT NULL DEFAULT 'pendiente'
                           CHECK (estado IN ('pendiente', 'activo', 'suspendido', 'baja')),
  avalista_numero_socio    bigint,
  identidad_verificada_en  timestamptz,
  identidad_verificada_por bigint REFERENCES admins (id),
  alta_en                  timestamptz,
  baja_en                  timestamptz,
  cuota_vigente_hasta      date,
  consentimiento_en        timestamptz NOT NULL,
  estatutos_aceptados_en   timestamptz NOT NULL,
  sesion_version           integer NOT NULL DEFAULT 1,
  creado_en                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo_documento, numero_documento),
  -- Nadie pasa a activo sin verificacion presencial registrada.
  CONSTRAINT activo_con_verificacion CHECK (
    estado <> 'activo'
    OR (identidad_verificada_en IS NOT NULL
        AND identidad_verificada_por IS NOT NULL
        AND numero_socio IS NOT NULL
        AND alta_en IS NOT NULL)
  )
);

CREATE TABLE intentos_login (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  huella_email text NOT NULL,
  huella_ip    text NOT NULL,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intentos_email_idx ON intentos_login (huella_email, creado_en);
CREATE INDEX intentos_ip_idx ON intentos_login (huella_ip, creado_en);

CREATE TABLE auditoria (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id     bigint REFERENCES admins (id),
  socio_id     bigint REFERENCES socios (id),
  accion       text NOT NULL,
  entidad      text NOT NULL,
  entidad_id   bigint,
  detalle      text,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
