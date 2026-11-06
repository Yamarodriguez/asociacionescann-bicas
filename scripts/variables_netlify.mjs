// Genera los secretos de la version publicada en .dev/variables-netlify.env, fuera de Git.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const RUTA = '.dev/variables-netlify.env';
if (existsSync(RUTA)) {
  console.log(`Ya existe ${RUTA}: no se cambia.`);
  process.exit(0);
}
const s = () => randomBytes(32).toString('hex');
mkdirSync('.dev', { recursive: true });
writeFileSync(RUTA, [
  'ENTORNO=pruebas',
  'CORREO_MODO=ninguno',
  `SESION_SECRETO_SOCIOS=${s()}`,
  `SESION_SECRETO_ADMINS=${s()}`,
  `HUELLAS_SECRETO=${s()}`,
  `TOTP_CLAVE=${s()}`,
  `DEMO_CLAVE=${randomBytes(12).toString('base64url')}`,
  '',
].join('\n'), { mode: 0o600 });
console.log(`Creado ${RUTA}.`);
