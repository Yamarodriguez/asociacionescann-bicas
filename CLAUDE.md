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
- El módulo de reservas no se construye hasta que el abogado responda las preguntas 1 a 6 de la Fase 0.
- No se guardan fotos de documentos ni datos médicos, salvo decisión con el abogado.

## Documentos

- Fase 0, mapa legal: https://claude.ai/artifact/6bwbVwNatMHqAaqUo7svdT
- Fase 1, arquitectura y datos: https://claude.ai/artifact/EdsLmZu7cpfjfwrk7AndV5

## Estado

- Hecho: base de datos, sesiones, solicitud, aprobación manual, panel mínimo y `npm run todo`.
- Falta en Fase 2: repositorio remoto y despliegue de pruebas, que requieren las cuentas. `despliegue/` está preparado, pero sin probar en un servidor real.
- Falta para seguridad: 2FA, recuperación de contraseña, exportación de datos y copias.
- Falta de la asociación: ficha, checklist rellenado y respuestas del abogado.

## Lecciones

- Toda ruta debe consumir el cuerpo del pedido antes de responder. Si no, sus bytes contaminan el siguiente pedido de la misma conexión. Lo resuelve `_http.ejecutar`.
- Una base local huérfana puede ocupar el puerto sin responder. `scripts/_comun.mjs` la detecta con una consulta real, no solo mirando el puerto.

## Diseño

- 2026-11-06: se eligió el diseño A, Institución cercana: crema y verde, con detalles dorados, en Fraunces y DM Sans. Las demás propuestas quedan en `diseno/`.
- El gris secundario es `#5f645a`, más oscuro que el del encargo, porque aquel no llegaba al contraste AA.
- Las letras van en `web/fuentes/`, con su licencia. No se cargan desde servicios externos.
