// Panel del equipo. Cada ruta declara los roles que la pueden usar.
import { auditar, transaccion } from './db.mjs';
import { enviar } from './correo.mjs';
import { ErrorHttp, archivo, exigirSesion, json, leerJson } from './http.mjs';
import { fechaValida } from './rutas_acceso.mjs';
import { contadorTareas, contadoresCultivo } from './rutas_cultivo.mjs';
import { contadoresCumplimiento } from './rutas_cumplimiento.mjs';
import { asentarEnCaja, contarMora } from './rutas_finanzas.mjs';
import { dataUriQr } from './rutas_socio.mjs';
import { celdaCsv, opcion } from './validar.mjs';
import {
  cifrarTexto, descifrarTexto, generarCodigosRecuperacion, generarSecretoTotp, hashCodigo, uriTotp, verificarTotp,
} from './seguridad.mjs';

const SOCIOS = ['comision_directiva', 'secretaria'];
const CUOTAS = ['comision_directiva', 'tesoreria'];
const COMISION = ['comision_directiva'];
const SEGMENTOS = ['todos', 'al_dia', 'morosos'];
const METODOS = ['efectivo', 'transferencia'];
const COLUMNAS_CSV = [
  'numero_socio', 'nombre', 'apellido', 'tipo_documento', 'numero_documento', 'email', 'telefono',
  'estado', 'alta_en', 'baja_en', 'cuota_vigente_hasta',
];
// Clave: tipo de valor y limites. Lo que no este aqui no se puede cambiar.
const EDITABLES = {
  edad_minima: ['entero', 18, 99],
  aval_activo: ['interruptor'],
  carne_qr_activo: ['interruptor'],
  modulo_cultivo_activo: ['interruptor'],
  plantas_autorizadas: ['entero', 0, 100000],
  mora_suspension_meses: ['entero', 0, 60],
  pedido_aprobacion_monto: ['entero', 0, 1000000000],
  retencion_baja_dias: ['entero', 0, 3650],
  contacto_retencion_dias: ['entero', 1, 365],
  login_max_por_email: ['entero', 3, 20],
  login_max_por_ip: ['entero', 5, 200],
  login_ventana_minutos: ['entero', 5, 240],
};

const esId = (valor) => Number.isInteger(valor);

export async function socios(c) {
  const admin = await exigirSesion(c, 'admin', { roles: SOCIOS });
  const filas = await transaccion(async (q) => {
    await auditar(q, 'socios_consultados', 'socio', { adminId: admin.id });
    return q(
      `SELECT id, numero_socio, nombre, apellido, tipo_documento, numero_documento, email, telefono, estado,
       avalista_numero_socio, cuota_vigente_hasta, baja_solicitada_en, creado_en FROM socios
       ORDER BY estado <> 'pendiente', baja_solicitada_en IS NULL, creado_en DESC LIMIT 1000`,
    );
  });
  return json(200, { socios: filas });
}

export async function sociosCsv(c) {
  const admin = await exigirSesion(c, 'admin', { roles: SOCIOS });
  const filas = await transaccion(async (q) => {
    const resultado = await q(
      `SELECT ${COLUMNAS_CSV.join(', ')} FROM socios ORDER BY numero_socio NULLS LAST`,
    );
    await auditar(q, 'socios_exportados', 'socio', { adminId: admin.id });
    return resultado;
  });
  const lineas = [COLUMNAS_CSV.join(';'), ...filas.map((f) => COLUMNAS_CSV.map((k) => celdaCsv(f[k])).join(';'))];
  return archivo(`﻿${lineas.join('\r\n')}\r\n`, 'text/csv; charset=utf-8', 'socios.csv');
}

const ACCIONES = {
  async aprobar(q, admin, id, socio, datos) {
    if (datos.identidad_verificada !== true) {
      throw new ErrorHttp(422, 'Primero hay que verificar la identidad en persona.');
    }
    if (socio.estado !== 'pendiente') throw new ErrorHttp(409, 'Esta solicitud ya no está pendiente.');
    const [{ numero_socio: numero }] = await q(
      `UPDATE socios SET estado = 'activo', numero_socio = nextval('numero_socio_seq'), alta_en = now(),
       identidad_verificada_en = now(), identidad_verificada_por = $1 WHERE id = $2 RETURNING numero_socio`,
      [admin.id, id],
    );
    await auditar(q, 'solicitud_aprobada', 'socio', { entidadId: id, adminId: admin.id });
    return { numero_socio: numero };
  },
  async rechazar(q, admin, id, socio) {
    if (socio.estado !== 'pendiente') throw new ErrorHttp(409, 'Esta solicitud ya no está pendiente.');
    // Una solicitud rechazada no tiene motivo para conservarse.
    await q('DELETE FROM socios WHERE id = $1', [id]);
    await auditar(q, 'solicitud_rechazada', 'socio', { entidadId: id, adminId: admin.id });
    return { mensaje: 'Solicitud rechazada y datos eliminados.' };
  },
  async suspender(q, admin, id, socio) {
    if (socio.estado !== 'activo') throw new ErrorHttp(409, 'Solo se puede suspender a un socio activo.');
    await q("UPDATE socios SET estado = 'suspendido' WHERE id = $1", [id]);
    await auditar(q, 'socio_suspendido', 'socio', { entidadId: id, adminId: admin.id });
    return { mensaje: 'Socio suspendido.' };
  },
  async reactivar(q, admin, id, socio) {
    if (socio.estado !== 'suspendido') throw new ErrorHttp(409, 'Solo se puede reactivar a un socio suspendido.');
    await q("UPDATE socios SET estado = 'activo' WHERE id = $1", [id]);
    await auditar(q, 'socio_reactivado', 'socio', { entidadId: id, adminId: admin.id });
    return { mensaje: 'Socio reactivado.' };
  },
  async baja(q, admin, id, socio) {
    if (!['activo', 'suspendido'].includes(socio.estado)) throw new ErrorHttp(409, 'Este socio no se puede dar de baja.');
    await q(
      `UPDATE socios SET estado = 'baja', baja_en = now(), carne_token = NULL,
       sesion_version = sesion_version + 1 WHERE id = $1`, [id],
    );
    await auditar(q, 'socio_baja', 'socio', { entidadId: id, adminId: admin.id });
    return { mensaje: 'Baja registrada.' };
  },
};

export async function accionSocio(c) {
  const admin = await exigirSesion(c, 'admin', { roles: SOCIOS, csrf: true });
  const datos = leerJson(c);
  const nombre = datos.accion ?? 'aprobar';
  if (!Object.hasOwn(ACCIONES, nombre) || !esId(datos.socio_id)) throw new ErrorHttp(422, 'Pedido inválido.');
  const { respuesta, email } = await transaccion(async (q) => {
    const [socio] = await q('SELECT estado, email FROM socios WHERE id = $1 FOR UPDATE', [datos.socio_id]);
    if (!socio) throw new ErrorHttp(409, 'Esta solicitud ya no está pendiente.');
    return { respuesta: await ACCIONES[nombre](q, admin, datos.socio_id, socio, datos), email: socio.email };
  });
  if (nombre === 'aprobar') await enviar(email, 'solicitud_aprobada');
  return json(200, respuesta);
}

export async function contactos(c) {
  const admin = await exigirSesion(c, 'admin', { roles: SOCIOS });
  const filas = await transaccion(async (q) => {
    const resultado = await q(
      'SELECT id, nombre, email, mensaje, creado_en FROM contactos ORDER BY creado_en DESC LIMIT 200',
    );
    await auditar(q, 'contactos_consultados', 'contacto', { adminId: admin.id });
    return resultado;
  });
  return json(200, { contactos: filas });
}

export async function resumen(c) {
  const admin = await exigirSesion(c, 'admin');
  const salida = { rol: admin.rol };
  await transaccion(async (q) => {
    if (SOCIOS.includes(admin.rol)) {
      const [fila] = await q(
        `SELECT count(*) FILTER (WHERE estado = 'pendiente') AS pendientes,
         count(*) FILTER (WHERE baja_solicitada_en IS NOT NULL AND estado <> 'baja') AS bajas FROM socios`,
      );
      Object.assign(salida, fila, (await q('SELECT count(*) AS mensajes FROM contactos'))[0]);
    }
    if (CUOTAS.includes(admin.rol)) {
      const [fila] = await q(
        `SELECT count(*) AS vencidas FROM socios WHERE estado = 'activo'
         AND (cuota_vigente_hasta IS NULL OR cuota_vigente_hasta < current_date)`,
      );
      Object.assign(salida, fila, { en_mora: await contarMora(q) });
    }
    salida.tareas_hoy = await contadorTareas(q, admin.rol, admin.id);
    Object.assign(salida, await contadoresCumplimiento(q, admin.rol, admin.id));
    const [{ valor }] = await q("SELECT valor FROM configuracion WHERE clave = 'modulo_cultivo_activo'");
    if (valor === 'true') Object.assign(salida, await contadoresCultivo(q, admin.rol));
  });
  return json(200, salida);
}

export async function cuotas(c) {
  await exigirSesion(c, 'admin', { roles: CUOTAS });
  const datos = await transaccion(async (q) => ({
    socios: await q(
      `SELECT id, numero_socio, nombre, apellido, cuota_vigente_hasta,
       (cuota_vigente_hasta IS NULL OR cuota_vigente_hasta < current_date) AS vencida
       FROM socios WHERE estado = 'activo'
       ORDER BY vencida DESC, cuota_vigente_hasta NULLS FIRST, numero_socio LIMIT 1000`,
    ),
    pagos: await q(
      `SELECT c.id, s.numero_socio, s.nombre, s.apellido, to_char(c.periodo, 'YYYY-MM') AS periodo, c.importe,
       c.pagado_en, c.metodo FROM cuotas c LEFT JOIN socios s ON s.id = c.socio_id
       ORDER BY c.creado_en DESC LIMIT 100`,
    ),
  }));
  return json(200, datos);
}

export async function registrarCuota(c) {
  const admin = await exigirSesion(c, 'admin', { roles: CUOTAS, csrf: true });
  const { socio_id: socioId, periodo, metodo, importe, pagado_en: pagadoEn } = leerJson(c);
  if (!esId(socioId)) throw new ErrorHttp(422, 'Elegí un socio.');
  if (typeof periodo !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) throw new ErrorHttp(422, 'Revisá el período.');
  if (!METODOS.includes(metodo)) throw new ErrorHttp(422, 'Revisá el método de pago.');
  const monto = String(importe);
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(monto) || Number(monto) <= 0) throw new ErrorHttp(422, 'Revisá el importe.');
  if (!fechaValida(pagadoEn)) throw new ErrorHttp(422, 'Revisá la fecha de pago.');

  const vigente = await transaccion(async (q) => {
    const [socio] = await q('SELECT estado FROM socios WHERE id = $1 FOR UPDATE', [socioId]);
    if (!socio || socio.estado !== 'activo') throw new ErrorHttp(409, 'Solo se registran cuotas de socios activos.');
    const filas = await q(
      `INSERT INTO cuotas (socio_id, periodo, importe, pagado_en, metodo, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (socio_id, periodo) DO NOTHING RETURNING id`,
      [socioId, `${periodo}-01`, monto, pagadoEn, metodo, admin.id],
    );
    if (!filas.length) throw new ErrorHttp(409, 'Ese período ya está registrado.');
    const [fila] = await q(
      `UPDATE socios SET cuota_vigente_hasta = (
         SELECT (max(periodo) + interval '1 month' - interval '1 day')::date FROM cuotas WHERE socio_id = $1)
       WHERE id = $1 RETURNING cuota_vigente_hasta`, [socioId],
    );
    await asentarEnCaja(q, admin.id, {
      dia: pagadoEn, tipo: 'ingreso', categoria: 'Cuotas', concepto: `Cuota ${periodo}`, importe: monto, metodo, cuotaId: filas[0].id,
    });
    await auditar(q, 'cuota_registrada', 'cuota', { entidadId: filas[0].id, adminId: admin.id });
    return fila.cuota_vigente_hasta;
  });
  return json(200, { cuota_vigente_hasta: vigente });
}

export async function publicaciones(c) {
  await exigirSesion(c, 'admin', { roles: SOCIOS });
  const datos = await transaccion(async (q) => ({
    comunicados: await q('SELECT id, titulo, publicado_en, segmento FROM comunicados ORDER BY publicado_en DESC LIMIT 100'),
    documentos: await q('SELECT id, titulo, publicado_en FROM documentos ORDER BY publicado_en DESC LIMIT 100'),
    asambleas: await q('SELECT id, titulo, fecha, lugar FROM asambleas ORDER BY fecha DESC LIMIT 100'),
    actas: await q('SELECT id, titulo, publicado_en FROM actas ORDER BY publicado_en DESC LIMIT 100'),
  }));
  return json(200, datos);
}

function textoPublicacion(datos, clave, maximo) {
  const valor = datos[clave];
  if (typeof valor !== 'string' || !valor.trim() || valor.length > maximo) {
    throw new ErrorHttp(422, 'Revisá los datos del formulario.');
  }
  return valor.trim();
}

export async function publicar(c) {
  const admin = await exigirSesion(c, 'admin', { roles: SOCIOS, csrf: true });
  const datos = leerJson(c);
  const { tipo } = datos;
  const titulo = textoPublicacion(datos, 'titulo', 200);
  const id = await transaccion(async (q) => {
    let filas;
    if (tipo === 'comunicado') {
      filas = await q(
        'INSERT INTO comunicados (titulo, cuerpo, autor_id, segmento) VALUES ($1, $2, $3, $4) RETURNING id',
        [titulo, textoPublicacion(datos, 'cuerpo', 20000), admin.id, datos.segmento ? opcion(datos, 'segmento', SEGMENTOS) : 'todos'],
      );
    } else if (tipo === 'documento') {
      filas = await q(
        'INSERT INTO documentos (titulo, contenido, autor_id) VALUES ($1, $2, $3) RETURNING id',
        [titulo, textoPublicacion(datos, 'cuerpo', 40000), admin.id],
      );
    } else if (tipo === 'acta') {
      filas = await q(
        'INSERT INTO actas (titulo, contenido, autor_id) VALUES ($1, $2, $3) RETURNING id',
        [titulo, textoPublicacion(datos, 'cuerpo', 40000), admin.id],
      );
    } else if (tipo === 'asamblea') {
      const fecha = new Date(textoPublicacion(datos, 'fecha', 30));
      if (Number.isNaN(fecha.getTime())) throw new ErrorHttp(422, 'Revisá la fecha.');
      filas = await q(
        'INSERT INTO asambleas (titulo, fecha, lugar, orden_dia, autor_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [titulo, fecha, textoPublicacion(datos, 'lugar', 200), textoPublicacion(datos, 'cuerpo', 20000), admin.id],
      );
    } else {
      throw new ErrorHttp(422, 'Revisá el tipo de publicación.');
    }
    await auditar(q, 'publicacion_creada', tipo, { entidadId: filas[0].id, adminId: admin.id });
    return filas[0].id;
  });
  return json(200, { id });
}

export async function verConfiguracion(c) {
  await exigirSesion(c, 'admin', { roles: COMISION });
  const filas = await transaccion((q) => q('SELECT clave, valor, descripcion FROM configuracion ORDER BY clave'));
  return json(200, {
    configuracion: filas.map((fila) => ({
      ...fila,
      editable: Object.hasOwn(EDITABLES, fila.clave),
      tipo: EDITABLES[fila.clave]?.[0] ?? 'solo_lectura',
    })),
  });
}

function validarAjuste(clave, valor) {
  if (typeof clave !== 'string' || !Object.hasOwn(EDITABLES, clave)) {
    throw new ErrorHttp(403, 'Este valor no se puede cambiar desde el panel.');
  }
  const [tipo, minimo, maximo] = EDITABLES[clave];
  if (tipo === 'interruptor') {
    if (valor !== 'true' && valor !== 'false') throw new ErrorHttp(422, 'Revisá el valor.');
    return valor;
  }
  if (typeof valor !== 'string' || !/^\d+$/.test(valor) || Number(valor) < minimo || Number(valor) > maximo) {
    throw new ErrorHttp(422, `El valor debe estar entre ${minimo} y ${maximo}.`);
  }
  return String(Number(valor));
}

export async function cambiarConfiguracion(c) {
  const admin = await exigirSesion(c, 'admin', { roles: COMISION, csrf: true });
  const { clave, valor } = leerJson(c);
  const limpio = validarAjuste(clave, valor);
  await transaccion(async (q) => {
    await q('UPDATE configuracion SET valor = $1 WHERE clave = $2', [limpio, clave]);
    await auditar(q, 'configuracion_cambiada', 'configuracion', { adminId: admin.id, detalle: clave });
  });
  return json(200, { mensaje: 'Guardamos el cambio.' });
}

export async function auditoria(c) {
  const admin = await exigirSesion(c, 'admin', { roles: COMISION });
  const filas = await transaccion(async (q) => {
    const resultado = await q(
      `SELECT a.creado_en, a.accion, a.entidad, a.entidad_id, a.detalle, e.email AS responsable
       FROM auditoria a LEFT JOIN admins e ON e.id = a.admin_id ORDER BY a.creado_en DESC, a.id DESC LIMIT 300`,
    );
    await auditar(q, 'auditoria_consultada', 'auditoria', { adminId: admin.id });
    return resultado;
  });
  return json(200, { auditoria: filas });
}

export async function verSeguridad(c) {
  const admin = await exigirSesion(c, 'admin', { permitirSin2fa: true });
  const [{ total }] = await transaccion((q) => q(
    'SELECT count(*) AS total FROM codigos_recuperacion WHERE admin_id = $1 AND usado_en IS NULL', [admin.id],
  ));
  return json(200, {
    activo: admin.totp_activado_en !== null, obligatorio: admin.dosfa_obligatorio, codigos_restantes: total,
  });
}

export async function cambiarSeguridad(c) {
  const admin = await exigirSesion(c, 'admin', { csrf: true, permitirSin2fa: true });
  if (admin.totp_activado_en !== null) throw new ErrorHttp(409, 'El doble factor ya está activado.');
  const datos = leerJson(c);
  if (datos.accion === 'iniciar') {
    const secreto = generarSecretoTotp();
    await transaccion((q) => q(
      'UPDATE admins SET totp_cifrado = $1 WHERE id = $2', [cifrarTexto(secreto, 'TOTP_CLAVE'), admin.id],
    ));
    return json(200, { secreto, qr: await dataUriQr(uriTotp(secreto, admin.email)) });
  }
  if (datos.accion !== 'confirmar') throw new ErrorHttp(422, 'Pedido inválido.');
  const codigos = await transaccion(async (q) => {
    const [{ totp_cifrado: cifrado }] = await q('SELECT totp_cifrado FROM admins WHERE id = $1 FOR UPDATE', [admin.id]);
    if (!cifrado) throw new ErrorHttp(409, 'Primero generá el código QR.');
    const paso = verificarTotp(descifrarTexto(cifrado, 'TOTP_CLAVE'), datos.codigo);
    if (paso === null) throw new ErrorHttp(422, 'El código no es correcto.');
    const nuevos = generarCodigosRecuperacion();
    await q('DELETE FROM codigos_recuperacion WHERE admin_id = $1', [admin.id]);
    for (const valor of nuevos) {
      await q('INSERT INTO codigos_recuperacion (admin_id, codigo_hash) VALUES ($1, $2)', [admin.id, hashCodigo(valor)]);
    }
    await q('UPDATE admins SET totp_activado_en = now(), totp_ultimo_paso = $1 WHERE id = $2', [paso, admin.id]);
    await auditar(q, 'dosfa_activado', 'admin', { entidadId: admin.id, adminId: admin.id });
    return nuevos;
  });
  return json(200, { codigos });
}
