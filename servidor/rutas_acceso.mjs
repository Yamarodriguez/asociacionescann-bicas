// Acceso, solicitud, contacto y recuperacion de contrasena.
import { randomBytes } from 'node:crypto';
import { auditar, configuracion, transaccion } from './db.mjs';
import { enviar } from './correo.mjs';
import {
  ErrorHttp, comprobarOrigen, faltaDosfa, galletaBorrada, galletaSesion, json, leerGalleta, leerJson, sesion,
} from './http.mjs';
import {
  LONGITUD_MINIMA_CLAVE, crearToken, descifrarTexto, hashCodigo, hashToken, hashearClave, huella, leerToken,
  verificarClave, verificarTotp,
} from './seguridad.mjs';

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DOCUMENTOS = ['DNI', 'Pasaporte', 'Otro'];
const GENERICO = 'Correo o contraseña incorrectos.';
const CODIGO_MALO = 'El código no es correcto.';
const RECIBIDA = { mensaje: 'Recibimos tu solicitud. Vas a ver su estado al ingresar.' };
const CONTACTO_OK = { mensaje: 'Recibimos tu mensaje. Te vamos a responder por correo electrónico.' };
const RECUPERAR_OK = { mensaje: 'Si el correo está registrado, vas a recibir un enlace para cambiar tu contraseña.' };

function texto(datos, clave, maximo = 120) {
  const valor = datos[clave];
  if (typeof valor !== 'string' || !valor.trim() || valor.length > maximo) {
    throw new ErrorHttp(422, 'Revisá los datos del formulario.');
  }
  return valor.trim();
}

function edad(nacimiento, hoy) {
  const [anio, mes, dia] = nacimiento.split('-').map(Number);
  const antes = (hoy.getMonth() + 1 < mes) || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia);
  return hoy.getFullYear() - anio - (antes ? 1 : 0);
}

export function fechaValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(valor);
}

export async function publico() {
  return transaccion(async (q) => json(200, {
    edad_minima: Number(await configuracion(q, 'edad_minima')),
    aval_activo: (await configuracion(q, 'aval_activo')) === 'true',
  }));
}

export async function verSesion(c) {
  const admin = await sesion(c, 'admin');
  if (admin) {
    return json(200, { tipo: 'admin', rol: admin.rol, csrf: admin.csrf, falta_2fa: Boolean(faltaDosfa(admin)) });
  }
  const socio = await sesion(c, 'socio');
  if (socio) {
    return json(200, {
      tipo: 'socio', estado: socio.estado, nombre: socio.nombre, numero_socio: socio.numero_socio, csrf: socio.csrf,
    });
  }
  return json(401, { error: 'Tenés que iniciar sesión.' });
}

export async function solicitud(c) {
  comprobarOrigen(c);
  const datos = leerJson(c);
  const email = texto(datos, 'email', 254).toLowerCase();
  const { clave } = datos;
  if (!CORREO.test(email)) throw new ErrorHttp(422, 'Revisá el correo electrónico.');
  if (typeof clave !== 'string' || clave.length < LONGITUD_MINIMA_CLAVE || clave.length > 200) {
    throw new ErrorHttp(422, 'La contraseña debe tener al menos 10 caracteres.');
  }
  if (datos.consentimiento !== true || datos.estatutos !== true) {
    throw new ErrorHttp(422, 'Tenés que aceptar la privacidad y los estatutos.');
  }
  const tipo = texto(datos, 'tipo_documento', 20);
  if (!DOCUMENTOS.includes(tipo)) throw new ErrorHttp(422, 'Revisá el tipo de documento.');
  const nacimiento = texto(datos, 'fecha_nacimiento', 10);
  if (!fechaValida(nacimiento)) throw new ErrorHttp(422, 'Revisá la fecha de nacimiento.');
  const telefono = datos.telefono || null;
  if (telefono !== null && (typeof telefono !== 'string' || telefono.length > 30)) {
    throw new ErrorHttp(422, 'Revisá el teléfono.');
  }
  const nombre = texto(datos, 'nombre');
  const apellido = texto(datos, 'apellido');
  const numero = texto(datos, 'numero_documento', 30);
  let avalista = datos.avalista_numero_socio || null;
  if (avalista !== null) {
    if (!/^\d{1,12}$/.test(String(avalista))) throw new ErrorHttp(422, 'Revisá el número de socio que te avala.');
    avalista = Number(avalista);
  }
  const claveHash = await hashearClave(clave);
  const huellaIp = huella(`solicitud:${c.ip}`);

  const creado = await transaccion(async (q) => {
    const maximo = Number(await configuracion(q, 'solicitud_max_por_ip'));
    const [{ total }] = await q(
      "SELECT count(*) AS total FROM intentos_login WHERE huella_ip = $1 AND creado_en > now() - interval '1 hour'",
      [huellaIp],
    );
    if (total >= maximo) throw new ErrorHttp(429, 'Demasiadas solicitudes. Probá de nuevo más tarde.');
    await q("INSERT INTO intentos_login (huella_email, huella_ip) VALUES ('solicitud', $1)", [huellaIp]);
    // El aval lo comprueba el equipo: asi no se revela que numeros existen.
    if ((await configuracion(q, 'aval_activo')) === 'true' && avalista === null) {
      throw new ErrorHttp(422, 'Necesitás indicar el número de socio que te avala.');
    }
    const minima = Number(await configuracion(q, 'edad_minima'));
    if (edad(nacimiento, new Date()) < minima) {
      throw new ErrorHttp(422, `Tenés que tener al menos ${minima} años para solicitar el alta.`);
    }
    // Una cuenta repetida recibe la misma respuesta: no se revela que existe.
    const filas = await q(
      `INSERT INTO socios (email, clave_hash, nombre, apellido, fecha_nacimiento, tipo_documento, numero_documento,
       telefono, avalista_numero_socio, consentimiento_en, estatutos_aceptados_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now()) ON CONFLICT DO NOTHING RETURNING id`,
      [email, claveHash, nombre, apellido, nacimiento, tipo, numero, telefono, avalista],
    );
    if (!filas.length) return false;
    await auditar(q, 'solicitud_creada', 'socio', { entidadId: filas[0].id, socioId: filas[0].id });
    return true;
  });
  if (creado) await enviar(email, 'solicitud_recibida');
  return json(202, RECIBIDA);
}

async function intentosSuperados(q, email, ip) {
  const ventana = Number(await configuracion(q, 'login_ventana_minutos'));
  const maxEmail = Number(await configuracion(q, 'login_max_por_email'));
  const maxIp = Number(await configuracion(q, 'login_max_por_ip'));
  const [fila] = await q(
    `SELECT count(*) FILTER (WHERE huella_email = $1) AS por_email, count(*) FILTER (WHERE huella_ip = $2) AS por_ip
     FROM intentos_login WHERE creado_en > now() - make_interval(mins => $3::int)`,
    [huella(email), huella(ip), ventana],
  );
  return fila.por_email >= maxEmail || fila.por_ip >= maxIp;
}

const limpiarFallos = (q, email) => q('DELETE FROM intentos_login WHERE huella_email = $1', [huella(email)]);

export async function login(c) {
  comprobarOrigen(c);
  const datos = leerJson(c);
  if (typeof datos.email !== 'string' || typeof datos.clave !== 'string' || datos.clave.length > 200) {
    throw new ErrorHttp(401, GENERICO);
  }
  const email = datos.email.trim().toLowerCase();
  const { bloqueado, admin, socio } = await transaccion(async (q) => {
    const superado = await intentosSuperados(q, email, c.ip);
    const [equipo] = await q(
      'SELECT id, clave_hash, sesion_version, totp_activado_en FROM admins WHERE email = $1 AND activo', [email],
    );
    const [persona] = equipo ? [] : await q(
      "SELECT id, clave_hash, sesion_version FROM socios WHERE email = $1 AND estado <> 'baja'", [email],
    );
    return { bloqueado: superado, admin: equipo, socio: persona };
  });
  if (bloqueado) {
    await verificarClave(datos.clave, null);
    throw new ErrorHttp(429, 'Demasiados intentos. Probá de nuevo más tarde.');
  }
  const cuenta = admin ?? socio;
  if (!(await verificarClave(datos.clave, cuenta?.clave_hash ?? null))) {
    await transaccion((q) => q(
      'INSERT INTO intentos_login (huella_email, huella_ip) VALUES ($1, $2)', [huella(email), huella(c.ip)],
    ));
    throw new ErrorHttp(401, GENERICO);
  }
  if (admin?.totp_activado_en) {
    // La contrasena era correcta, pero la sesion solo se abre con el segundo factor.
    await transaccion((q) => limpiarFallos(q, email));
    const previo = crearToken('pre', admin.id, admin.sesion_version);
    return json(200, { tipo: 'admin', requiere_2fa: true }, [galletaSesion('pre', previo)]);
  }
  const tipo = admin ? 'admin' : 'socio';
  const token = crearToken(tipo, cuenta.id, cuenta.sesion_version);
  await transaccion(async (q) => {
    await limpiarFallos(q, email);
    if (admin) await auditar(q, 'login', 'admin', { entidadId: admin.id, adminId: admin.id });
  });
  return json(200, { tipo }, [galletaSesion(tipo, token)]);
}

export async function login2fa(c) {
  comprobarOrigen(c);
  const datos = leerJson(c);
  const previo = leerToken('pre', leerGalleta(c, 'pre'));
  if (!previo) throw new ErrorHttp(401, 'Volvé a ingresar tu correo y contraseña.');
  if (typeof datos.codigo !== 'string' || datos.codigo.length > 40) throw new ErrorHttp(401, CODIGO_MALO);
  const recibido = datos.codigo.trim();
  const adminId = previo.id;
  const marca = huella(`2fa:${adminId}`);

  const resultado = await transaccion(async (q) => {
    const maximo = Number(await configuracion(q, 'dosfa_max_intentos'));
    const ventana = Number(await configuracion(q, 'login_ventana_minutos'));
    const [{ total }] = await q(
      `SELECT count(*) AS total FROM intentos_login WHERE huella_email = $1
       AND creado_en > now() - make_interval(mins => $2::int)`, [marca, ventana],
    );
    if (total >= maximo) throw new ErrorHttp(429, 'Demasiados intentos. Probá de nuevo más tarde.');
    const [admin] = await q(
      `SELECT totp_cifrado, totp_ultimo_paso, sesion_version FROM admins
       WHERE id = $1 AND activo AND totp_activado_en IS NOT NULL FOR UPDATE`, [adminId],
    );
    if (!admin || admin.sesion_version !== previo.v) {
      throw new ErrorHttp(401, 'Volvé a ingresar tu correo y contraseña.');
    }
    const secreto = descifrarTexto(admin.totp_cifrado, 'TOTP_CLAVE');
    const paso = verificarTotp(secreto, recibido, admin.totp_ultimo_paso);
    let valido = paso !== null;
    if (valido) {
      await q('UPDATE admins SET totp_ultimo_paso = $1 WHERE id = $2', [paso, adminId]);
    } else {
      const usados = await q(
        `UPDATE codigos_recuperacion SET usado_en = now() WHERE admin_id = $1 AND codigo_hash = $2
         AND usado_en IS NULL RETURNING id`, [adminId, hashCodigo(recibido)],
      );
      valido = usados.length > 0;
      if (valido) await auditar(q, 'codigo_recuperacion_usado', 'admin', { entidadId: adminId, adminId });
    }
    if (valido) {
      await q('DELETE FROM intentos_login WHERE huella_email = $1', [marca]);
      await auditar(q, 'login', 'admin', { entidadId: adminId, adminId });
    } else {
      await q('INSERT INTO intentos_login (huella_email, huella_ip) VALUES ($1, $2)', [marca, huella(`2fa:${c.ip}`)]);
    }
    return { valido, version: admin.sesion_version };
  });
  if (!resultado.valido) throw new ErrorHttp(401, CODIGO_MALO);
  const token = crearToken('admin', adminId, resultado.version);
  return json(200, { tipo: 'admin' }, [galletaSesion('admin', token), galletaBorrada('pre')]);
}

export async function logout(c) {
  comprobarOrigen(c);
  const socio = await sesion(c, 'socio');
  const admin = await sesion(c, 'admin');
  await transaccion(async (q) => {
    if (socio) await q('UPDATE socios SET sesion_version = sesion_version + 1 WHERE id = $1', [socio.id]);
    if (admin) await q('UPDATE admins SET sesion_version = sesion_version + 1 WHERE id = $1', [admin.id]);
  });
  return json(200, { ok: true }, [galletaBorrada('socio'), galletaBorrada('admin'), galletaBorrada('pre')]);
}

export async function contacto(c) {
  comprobarOrigen(c);
  const datos = leerJson(c);
  // Campo oculto: una persona no lo ve; un programa automatico suele rellenarlo.
  if (datos.sitio_web) return json(202, CONTACTO_OK);
  const nombre = texto(datos, 'nombre', 120);
  const email = texto(datos, 'email', 254).toLowerCase();
  const mensaje = texto(datos, 'mensaje', 2000);
  if (!CORREO.test(email)) throw new ErrorHttp(422, 'Revisá el correo electrónico.');
  if (datos.consentimiento !== true) throw new ErrorHttp(422, 'Tenés que aceptar la política de privacidad.');
  const marca = huella(c.ip);
  await transaccion(async (q) => {
    const maximo = Number(await configuracion(q, 'contacto_max_por_ip'));
    const ventana = Number(await configuracion(q, 'contacto_ventana_minutos'));
    const retencion = Number(await configuracion(q, 'contacto_retencion_dias'));
    await q('DELETE FROM contactos WHERE creado_en < now() - make_interval(days => $1::int)', [retencion]);
    const [{ total }] = await q(
      `SELECT count(*) AS total FROM contactos WHERE huella_ip = $1
       AND creado_en > now() - make_interval(mins => $2::int)`, [marca, ventana],
    );
    if (total >= maximo) throw new ErrorHttp(429, 'Enviaste demasiados mensajes. Probá de nuevo más tarde.');
    await q(
      'INSERT INTO contactos (nombre, email, mensaje, huella_ip, consentimiento_en) VALUES ($1, $2, $3, $4, now())',
      [nombre, email, mensaje, marca],
    );
  });
  return json(202, CONTACTO_OK);
}

async function buscarCuenta(q, email) {
  const [admin] = await q('SELECT id FROM admins WHERE email = $1 AND activo', [email]);
  if (admin) return { tipo: 'admin', id: admin.id };
  const [socio] = await q("SELECT id FROM socios WHERE email = $1 AND estado <> 'baja'", [email]);
  return socio ? { tipo: 'socio', id: socio.id } : null;
}

export async function recuperar(c) {
  comprobarOrigen(c);
  const { email: crudo } = leerJson(c);
  if (typeof crudo !== 'string' || crudo.length > 254) return json(202, RECUPERAR_OK);
  const email = crudo.trim().toLowerCase();
  const token = await transaccion(async (q) => {
    const cuenta = await buscarCuenta(q, email);
    if (!cuenta) return null;
    const maximo = Number(await configuracion(q, 'recuperacion_max_por_hora'));
    const vigencia = Number(await configuracion(q, 'recuperacion_vigencia_minutos'));
    const [{ total }] = await q(
      `SELECT count(*) AS total FROM recuperaciones WHERE tipo = $1 AND usuario_id = $2
       AND creado_en > now() - interval '1 hour'`, [cuenta.tipo, cuenta.id],
    );
    if (total >= maximo) return null;
    const nuevo = randomBytes(32).toString('base64url');
    await q(
      `INSERT INTO recuperaciones (tipo, usuario_id, token_hash, expira_en)
       VALUES ($1, $2, $3, now() + make_interval(mins => $4::int))`,
      [cuenta.tipo, cuenta.id, hashToken(nuevo), vigencia],
    );
    return nuevo;
  });
  if (token) {
    // El codigo va tras la almohadilla: no llega a ningun registro de servidor.
    await enviar(email, 'recuperar_clave', `${c.url.origin}/recuperar.html#t=${token}`);
  }
  return json(202, RECUPERAR_OK);
}

export async function recuperarCambiar(c) {
  comprobarOrigen(c);
  const { token, clave } = leerJson(c);
  if (typeof clave !== 'string' || clave.length < LONGITUD_MINIMA_CLAVE || clave.length > 200) {
    throw new ErrorHttp(422, 'La contraseña debe tener al menos 10 caracteres.');
  }
  if (typeof token !== 'string' || token.length > 100) throw new ErrorHttp(400, 'El enlace no es válido o ya venció.');
  const nuevoHash = await hashearClave(clave);
  await transaccion(async (q) => {
    const [fila] = await q(
      `SELECT id, tipo, usuario_id FROM recuperaciones WHERE token_hash = $1 AND usado_en IS NULL
       AND expira_en > now() FOR UPDATE`, [hashToken(token)],
    );
    if (!fila) throw new ErrorHttp(400, 'El enlace no es válido o ya venció.');
    const cambio = fila.tipo === 'socio'
      ? 'UPDATE socios SET clave_hash = $1, sesion_version = sesion_version + 1 WHERE id = $2'
      : 'UPDATE admins SET clave_hash = $1, sesion_version = sesion_version + 1 WHERE id = $2';
    await q(cambio, [nuevoHash, fila.usuario_id]);
    await q(
      'UPDATE recuperaciones SET usado_en = now() WHERE tipo = $1 AND usuario_id = $2 AND usado_en IS NULL',
      [fila.tipo, fila.usuario_id],
    );
    await auditar(q, 'contrasena_cambiada', fila.tipo, { entidadId: fila.usuario_id });
  });
  return json(200, { mensaje: 'Cambiamos tu contraseña. Ya podés ingresar.' });
}
