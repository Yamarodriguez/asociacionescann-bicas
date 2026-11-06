// Punto de entrada comun: recibe un pedido web y devuelve la respuesta.
import { rutaDemo } from './demo.mjs';
import { ErrorHttp, TAMANO_MAXIMO, json } from './http.mjs';
import * as acceso from './rutas_acceso.mjs';
import * as panel from './rutas_panel.mjs';
import * as socio from './rutas_socio.mjs';

// Las rutas del modulo de reservas no existen mientras este apagado.
export const RUTAS = {
  'GET /api/sesion': acceso.verSesion,
  'GET /api/publico': acceso.publico,
  'POST /api/contacto': acceso.contacto,
  'POST /api/login': acceso.login,
  'POST /api/login_2fa': acceso.login2fa,
  'POST /api/logout': acceso.logout,
  'POST /api/solicitud': acceso.solicitud,
  'POST /api/recuperar': acceso.recuperar,
  'POST /api/recuperar_cambiar': acceso.recuperarCambiar,
  'POST /api/preparar_demo': rutaDemo,
  'GET /api/socio_portal': socio.portal,
  'POST /api/socio_portal': socio.actualizar,
  'GET /api/socio_exportar': socio.exportar,
  'POST /api/socio_baja': socio.pedirBaja,
  'GET /api/admin_socios': panel.socios,
  'POST /api/admin_socios': panel.accionSocio,
  'GET /api/admin_socios_csv': panel.sociosCsv,
  'GET /api/admin_contactos': panel.contactos,
  'GET /api/admin_resumen': panel.resumen,
  'GET /api/admin_cuotas': panel.cuotas,
  'POST /api/admin_cuotas': panel.registrarCuota,
  'GET /api/admin_publicaciones': panel.publicaciones,
  'POST /api/admin_publicaciones': panel.publicar,
  'GET /api/admin_configuracion': panel.verConfiguracion,
  'POST /api/admin_configuracion': panel.cambiarConfiguracion,
  'GET /api/admin_auditoria': panel.auditoria,
  'GET /api/admin_seguridad': panel.verSeguridad,
  'POST /api/admin_seguridad': panel.cambiarSeguridad,
};

// Solo el tipo y la ruta: los mensajes de la base pueden contener datos personales.
export const describirError = (error, ruta) => `Error interno ${error?.name ?? 'desconocido'}${error?.code ? ` ${error.code}` : ''} en ${ruta}`;

export async function manejar(request, ip) {
  const url = new URL(request.url);
  const funcion = RUTAS[`${request.method} ${url.pathname}`];
  try {
    const longitud = Number(request.headers.get('content-length') ?? 0);
    if (!Number.isFinite(longitud) || longitud > TAMANO_MAXIMO) throw new ErrorHttp(413, 'Pedido inválido.');
    if (!funcion) return json(404, { error: 'No encontrado.' });
    const cuerpo = request.method === 'POST' ? await request.text() : '';
    if (cuerpo.length > TAMANO_MAXIMO) throw new ErrorHttp(413, 'Pedido inválido.');
    return await funcion({ request, url, ip, cuerpo });
  } catch (error) {
    if (error instanceof ErrorHttp) return json(error.estado, { error: error.mensaje });
    console.error(describirError(error, url.pathname));
    return json(500, { error: 'Algo salió mal. Probá de nuevo más tarde.' });
  }
}
