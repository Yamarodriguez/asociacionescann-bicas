# Sistema de la asociación

El encargo completo está en `Prompt_proyecto_asociacion.md`, fuera de Git. Sus reglas de cumplimiento mandan sobre todo lo demás.

## Cómo trabajar

- La responsable no es técnica: háblale de tú, en castellano de España y sin jerga.
- Los textos de la web y del portal van en español rioplatense (de vos).
- Junta las dudas y hazlas numeradas al cierre de cada fase.
- Lenguaje del producto: socio, reserva, retiro y aportación. Nunca cliente, compra, venta, tienda ni carrito.
- Nada inventado: los datos que falten quedan como pendientes en `web/site.json`.
- Nunca `git add .` ni `-A`. Una rama por trabajo. Producción solo tras el piloto.
- Nada se da por bueno sin `npm run todo` con 0 fallos.
- Cada fallo que se vea a ojo entra ese día como comprobación.

## Decisiones tomadas

- 2026-11-06: sistema completo, construido por etapas (Fase 0).
- 2026-11-06: prototipo a nombre de la responsable y solo con datos inventados. Los datos reales exigen pasar antes las cuentas a la asociación.
- 2026-11-06: el servidor se ejecuta como un proceso normal, no en Vercel. Vercel pide aprobación escrita para información sanitaria protegida y Supabase prohíbe distribuir sustancias controladas. Fuentes en la Fase 1.
- 2026-11-06: un solo sistema en Hetzner y el código en GitHub, sin Netlify. `web/` podría publicarse aparte más adelante. Sigue pendiente de que el abogado admita datos fuera de Argentina.
- 2026-11-06: repositorio de GitHub público por decisión expresa de la responsable, avisada de lo que queda visible. Nunca subir secretos, datos reales ni material del cliente.
- El módulo de reservas no se construye hasta que el abogado responda las preguntas 1 a 6 de la Fase 0.
- No se guardan fotos de documentos ni datos médicos, salvo decisión con el abogado.

## Documentos

- Fase 0, mapa legal: https://claude.ai/artifact/6bwbVwNatMHqAaqUo7svdT
- Fase 1, arquitectura y datos: https://claude.ai/artifact/EdsLmZu7cpfjfwrk7AndV5

## Estado

- Hecho: base de datos, sesiones, solicitud, aprobación manual, panel mínimo, web pública con contacto, legales en borrador y `npm run todo`.
- Fase 4 hecha con contenido pendiente: los textos reales dependen de la ficha y del abogado. La retención de contactos (30 días) y la edad (18) son valores provisionales en `configuracion`.
- Falta en Fase 2: repositorio remoto y despliegue de pruebas, que requieren las cuentas. `despliegue/` está preparado, pero sin probar en un servidor real.
- Seguridad hecha en local (Fase 7). Falta repetir la restauración en el servidor real.
- Falta de la asociación: ficha, checklist rellenado y respuestas del abogado.

## Lecciones

- Toda ruta debe consumir el cuerpo del pedido antes de responder. Si no, sus bytes contaminan el siguiente pedido de la misma conexión. Lo resuelve `_http.ejecutar`.
- Una base local huérfana puede ocupar el puerto sin responder. `scripts/_comun.mjs` la detecta con una consulta real, no solo mirando el puerto.
- En Windows, tras un cierre brusco sobrevive un proceso `io_worker` de PostgreSQL que retiene el puerto, aunque su proceso padre ya no exista y no quede `postmaster.pid`. Se identifica por la línea de órdenes, que usa barras `/`.

## Diseño

- 2026-11-06: se eligió el diseño A, Institución cercana: crema y verde, con detalles dorados, en Fraunces y DM Sans. Las demás propuestas quedan en `diseno/`.
- El gris secundario es `#5f645a`, más oscuro que el del encargo, porque aquel no llegaba al contraste AA.
- Las letras van en `web/fuentes/`, con su licencia. No se cargan desde servicios externos.

## Fase 5

- Portal, cuotas, publicaciones, configuración, recuperación de contraseña, exportación y borrado real hechos con datos inventados.
- El aval y el QR del carné van detrás de `aval_activo` y `carne_qr_activo`: dependen del abogado. El QR lleva un código al azar y aún no hay pantalla que lo lea.
- Los documentos son texto. Subir archivos PDF queda pendiente.
- Las votaciones online, los recibos y la firma digital no están construidos: dependen del abogado.
- `scripts/purgar_bajas.py` debe programarse en el servidor cuando se fije el plazo de retención.
- Para Fase 7: enviar los correos en segundo plano, para que el tiempo de respuesta de `/api/recuperar` no revele si la cuenta existe.

## Fase 7

- Doble factor TOTP con códigos de recuperación. `dosfa_obligatorio` es `true` por defecto y no se cambia desde el panel; `scripts/datos_prueba.py` lo apaga fuera de producción.
- Auditoría inmutable por disparador. Solo admite quitar la referencia a un socio borrado.
- `pruebas/test_seguridad.py` exige clasificar cada ruta nueva con sus roles.
- Copias propias cifradas con `scripts/copia.py`, porque el PostgreSQL local no trae `pg_dump`. `npm run todo` restaura una copia real y compara cada tabla. Sin `COPIA_CLAVE` no se recupera nada.
- Los registros solo guardan tipo de error, ruta y línea: los mensajes de la base pueden contener datos personales.
- Revisar dependencias con `pip-audit` antes de cada publicación. Hoy: sin vulnerabilidades conocidas.
- Pendiente fuera del prototipo: repetir la restauración en el servidor y guardar copias fuera de él.
