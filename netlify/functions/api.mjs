// Funcion de Netlify: atiende todas las rutas de datos.
import { manejar } from '../../servidor/app.mjs';

export default (request, context) => manejar(request, context.ip);

export const config = { path: '/api/*' };
