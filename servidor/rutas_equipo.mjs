// Turnos, fichaje, notas de traspaso, proyectos, tareas recurrentes y calendario.
import { auditar, configuracion, transaccion } from './db.mjs';
import { ErrorHttp, exigirSesion, json, leerJson } from './http.mjs';
import { entero, esId, fecha, opcion, texto } from './validar.mjs';

const GESTIONA = ['comision_directiva', 'coordinador_cultivo'];
const FRANJAS = ['manana', 'tarde', 'noche', 'guardia'];
const COLUMNAS = ['pendiente', 'en_curso', 'hecho'];
const VE_VENCIMIENTOS = ['comision_directiva', 'secretaria'];
const VE_LOTES = ['comision_directiva', 'coordinador_cultivo', 'cultivador', 'director_medico'];
const VE_EQUIPOS = ['comision_directiva', 'coordinador_cultivo'];

async function exigirPersona(q, id) {
  if (!esId(id)) throw new ErrorHttp(422, 'Elegí una persona.');
  const [persona] = await q('SELECT id FROM admins WHERE id = $1 AND activo', [id]);
  if (!persona) throw new ErrorHttp(422, 'Elegí una persona.');
  return id;
}

export async function ver(c) {
  const admin = await exigirSesion(c, 'admin');
  const gestiona = GESTIONA.includes(admin.rol);
  const datos = await transaccion(async (q) => ({
    turnos: await q(
      `SELECT t.id, t.fecha, t.franja, a.email AS persona FROM turnos t JOIN admins a ON a.id = t.admin_id
       WHERE t.fecha >= current_date ORDER BY t.fecha, t.franja LIMIT 200`,
    ),
    fichaje_abierto: (await q('SELECT id, entrada_en FROM fichajes WHERE admin_id = $1 AND salida_en IS NULL', [admin.id]))[0] ?? null,
    fichajes: await q(
      `SELECT f.id, a.email AS persona, f.entrada_en, f.salida_en FROM fichajes f JOIN admins a ON a.id = f.admin_id
       WHERE $1::boolean OR f.admin_id = $2 ORDER BY f.entrada_en DESC LIMIT 50`, [gestiona, admin.id],
    ),
    notas: await q(
      `SELECT n.id, n.texto, n.creado_en, a.email AS autor FROM notas_traspaso n JOIN admins a ON a.id = n.autor_id
       ORDER BY n.creado_en DESC, n.id DESC LIMIT 30`,
    ),
    proyectos: await q(
      `SELECT p.id, p.titulo, p.columna, a.email AS responsable FROM proyectos p LEFT JOIN admins a ON a.id = p.responsable_id
       ORDER BY p.creado_en DESC LIMIT 200`,
    ),
    recurrentes: gestiona ? await q(
      `SELECT r.id, r.titulo, r.cada_dias, r.proxima_en, a.email AS responsable FROM tareas_recurrentes r
       LEFT JOIN admins a ON a.id = r.asignada_a ORDER BY r.proxima_en LIMIT 100`,
    ) : [],
    personas: gestiona ? await q('SELECT id, email FROM admins WHERE activo ORDER BY email') : [],
  }));
  return json(200, { ...datos, gestiona });
}

const DE_GESTION = {
  async crear_turno(q, admin, datos) {
    const persona = await exigirPersona(q, datos.admin_id);
    const filas = await q(
      `INSERT INTO turnos (admin_id, fecha, franja, creado_por) VALUES ($1, $2, $3, $4)
       ON CONFLICT (admin_id, fecha, franja) DO NOTHING RETURNING id`,
      [persona, fecha(datos, 'fecha'), opcion(datos, 'franja', FRANJAS), admin.id],
    );
    if (!filas.length) throw new ErrorHttp(409, 'Esa persona ya tiene ese turno.');
    await auditar(q, 'turno_creado', 'turno', { entidadId: filas[0].id, adminId: admin.id });
    return { id: filas[0].id };
  },
  async quitar_turno(q, admin, datos) {
    if (!esId(datos.id)) throw new ErrorHttp(422, 'Pedido inválido.');
    const filas = await q('DELETE FROM turnos WHERE id = $1 RETURNING id', [datos.id]);
    if (!filas.length) throw new ErrorHttp(404, 'No encontrado.');
    await auditar(q, 'turno_quitado', 'turno', { entidadId: datos.id, adminId: admin.id });
    return { ok: true };
  },
  async crear_proyecto(q, admin, datos) {
    const responsable = datos.responsable_id ? await exigirPersona(q, datos.responsable_id) : null;
    const [{ id }] = await q(
      'INSERT INTO proyectos (titulo, responsable_id, creado_por) VALUES ($1, $2, $3) RETURNING id',
      [texto(datos, 'titulo', 200), responsable, admin.id],
    );
    await auditar(q, 'proyecto_creado', 'proyecto', { entidadId: id, adminId: admin.id });
    return { id };
  },
  async mover_proyecto(q, admin, datos) {
    if (!esId(datos.id)) throw new ErrorHttp(422, 'Pedido inválido.');
    const columna = opcion(datos, 'columna', COLUMNAS);
    const filas = await q('UPDATE proyectos SET columna = $1 WHERE id = $2 RETURNING id', [columna, datos.id]);
    if (!filas.length) throw new ErrorHttp(404, 'No encontrado.');
    await auditar(q, 'proyecto_movido', 'proyecto', { entidadId: datos.id, adminId: admin.id, detalle: columna });
    return { ok: true };
  },
  async crear_recurrente(q, admin, datos) {
    const asignada = datos.asignada_a ? await exigirPersona(q, datos.asignada_a) : null;
    const [{ id }] = await q(
      `INSERT INTO tareas_recurrentes (titulo, cada_dias, proxima_en, asignada_a, creado_por)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [texto(datos, 'titulo', 200), entero(datos, 'cada_dias', 1, 366), fecha(datos, 'proxima_en'), asignada, admin.id],
    );
    await auditar(q, 'recurrente_creada', 'tarea', { entidadId: id, adminId: admin.id });
    return { id };
  },
};

const DE_CADA_UNO = {
  async entrada(q, admin) {
    const filas = await q(
      `INSERT INTO fichajes (admin_id) VALUES ($1) ON CONFLICT (admin_id) WHERE salida_en IS NULL DO NOTHING RETURNING id`,
      [admin.id],
    );
    if (!filas.length) throw new ErrorHttp(409, 'Ya tenés una entrada abierta.');
    await auditar(q, 'fichaje_entrada', 'fichaje', { entidadId: filas[0].id, adminId: admin.id });
    return { id: filas[0].id };
  },
  async salida(q, admin) {
    const filas = await q('UPDATE fichajes SET salida_en = now() WHERE admin_id = $1 AND salida_en IS NULL RETURNING id', [admin.id]);
    if (!filas.length) throw new ErrorHttp(409, 'No tenés una entrada abierta.');
    await auditar(q, 'fichaje_salida', 'fichaje', { entidadId: filas[0].id, adminId: admin.id });
    return { id: filas[0].id };
  },
  async nota(q, admin, datos) {
    const [{ id }] = await q(
      'INSERT INTO notas_traspaso (texto, autor_id) VALUES ($1, $2) RETURNING id', [texto(datos, 'texto', 2000), admin.id],
    );
    await auditar(q, 'nota_traspaso', 'nota', { entidadId: id, adminId: admin.id });
    return { id };
  },
};

export async function accion(c) {
  const admin = await exigirSesion(c, 'admin', { csrf: true });
  const datos = leerJson(c);
  const nombre = datos.accion ?? '';
  if (Object.hasOwn(DE_GESTION, nombre)) {
    if (!GESTIONA.includes(admin.rol)) throw new ErrorHttp(403, 'No tenés permiso para esta acción.');
    return json(200, await transaccion((q) => DE_GESTION[nombre](q, admin, datos)));
  }
  if (!Object.hasOwn(DE_CADA_UNO, nombre)) throw new ErrorHttp(422, 'Pedido inválido.');
  return json(200, await transaccion((q) => DE_CADA_UNO[nombre](q, admin, datos)));
}

// Junta lo que cada rol ya puede ver: no abre datos nuevos.
export async function calendario(c) {
  const admin = await exigirSesion(c, 'admin');
  const eventos = await transaccion(async (q) => {
    const cultivo = (await configuracion(q, 'modulo_cultivo_activo')) === 'true';
    const lista = [
      ...await q(
        `SELECT fecha::date::text AS fecha, 'asamblea' AS tipo, titulo FROM asambleas
         WHERE fecha >= current_date AND fecha < current_date + 60`,
      ),
      ...await q(
        `SELECT fecha::text AS fecha, 'turno' AS tipo, franja AS titulo FROM turnos
         WHERE admin_id = $1 AND fecha >= current_date AND fecha < current_date + 60`, [admin.id],
      ),
      ...await q(
        `SELECT vence_en::text AS fecha, 'tarea' AS tipo, titulo FROM tareas
         WHERE completada_en IS NULL AND asignada_a = $1 AND vence_en < current_date + 60`, [admin.id],
      ),
    ];
    if (VE_VENCIMIENTOS.includes(admin.rol)) {
      lista.push(...await q(
        `SELECT vence_en::text AS fecha, 'vencimiento' AS tipo, titulo FROM vencimientos
         WHERE resuelto_en IS NULL AND vence_en < current_date + 60`,
      ));
    }
    if (cultivo && VE_LOTES.includes(admin.rol)) {
      lista.push(...await q(
        `SELECT cosecha_prevista::text AS fecha, 'cosecha' AS tipo, codigo AS titulo FROM lotes
         WHERE estado = 'activo' AND cosecha_prevista >= current_date AND cosecha_prevista < current_date + 60`,
      ));
    }
    if (cultivo && VE_EQUIPOS.includes(admin.rol)) {
      lista.push(...await q(
        `SELECT proximo_mantenimiento::text AS fecha, 'mantenimiento' AS tipo, nombre AS titulo FROM equipos
         WHERE proximo_mantenimiento < current_date + 60`,
      ));
    }
    return lista;
  });
  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return json(200, { eventos });
}
