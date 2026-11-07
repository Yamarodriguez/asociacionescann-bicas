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
- 2026-11-06: todo va en Netlify por decisión expresa de la responsable, avisada de sus condiciones sobre información sanitaria protegida y de su veto a criterio propio. Sustituye a Hetzner: el servidor pasó de Python a JavaScript. Es solo para datos inventados hasta resolver esos puntos con el abogado. 
- 2026-11-06: repositorio de GitHub público por decisión expresa de la responsable, avisada de lo que queda visible. Nunca subir secretos, datos reales ni material del cliente.
- El módulo de reservas no se construye hasta que el abogado responda las preguntas 1 a 6 de la Fase 0.
- No se guardan fotos de documentos ni datos médicos, salvo decisión con el abogado.

## Documentos

- Fase 0, mapa legal: https://claude.ai/artifact/6bwbVwNatMHqAaqUo7svdT
- Fase 1, arquitectura y datos: https://claude.ai/artifact/EdsLmZu7cpfjfwrk7AndV5

## Estado

- Hecho: base de datos, sesiones, solicitud, aprobación manual, panel, portal, cultivo con tareas e inventario, web pública con contacto, legales en borrador y `npm run todo`.
- Fase 4 hecha con contenido pendiente: los textos reales dependen de la ficha y del abogado. La retención de contactos (30 días) y la edad (18) son valores provisionales en `configuracion`.
- Publicado en Netlify (`asociacionescannabis`) tras contraseña de sitio. 2026-11-07: la captura de Netlify muestra cero variables de entorno. Sin ellas no existen las cuentas de prueba y no se puede entrar. Pendiente: importar `.dev/variables-netlify.env` y volver a desplegar. La entrada anterior con la cuenta de coordinación fue un error de lectura.
- Seguridad hecha en local (Fase 7). Falta repetir la restauración en la base publicada.
- Falta de la asociación: ficha, checklist rellenado y respuestas del abogado.

## Lecciones

- Toda ruta debe consumir el cuerpo del pedido antes de responder. Si no, sus bytes contaminan el siguiente pedido de la misma conexión. Lo resuelve `_http.ejecutar`.
- Una base local huérfana puede ocupar el puerto sin responder. `scripts/_comun.mjs` la detecta con una consulta real, no solo mirando el puerto.
- En Windows, tras un cierre brusco sobrevive un proceso `io_worker` de PostgreSQL que retiene el puerto, aunque su proceso padre ya no exista y no quede `postmaster.pid`. Se identifica por la línea de órdenes, que usa barras `/`.

## Diseño

- 2026-11-06: se eligió el diseño A, Institución cercana: crema y verde, con detalles dorados, en Fraunces y DM Sans. Las demás propuestas quedan en `diseno/`.
- 2026-11-07: la responsable pidió un aspecto más amigable y profesional, con dibujos. Se mantienen los colores y letras del diseño A y se añaden menú lateral, fichas y dibujos propios. No llegó a verse la aplicación de ejemplo que mencionó.
- La web pública y la entrada solo llevan dibujos neutros: las macetas de `web/bienvenida.svg` son solo de la zona interna (regla 2 del encargo).
- El gris secundario es `#5f645a`, más oscuro que el del encargo, porque aquel no llegaba al contraste AA.
- Las letras van en `web/fuentes/`, con su licencia. No se cargan desde servicios externos.

## Fase 5

- Portal, cuotas, publicaciones, configuración, recuperación de contraseña, exportación y borrado real hechos con datos inventados.
- `scripts/purgar_bajas.py` y las copias de `scripts/copia.py` se ejecutan a mano contra la base.
- El aval y el QR del carné van detrás de `aval_activo` y `carne_qr_activo`: dependen del abogado. El QR lleva un código al azar y aún no hay pantalla que lo lea.
- Los documentos son texto. Subir archivos PDF queda pendiente.
- Las votaciones online, los recibos y la firma digital no están construidos: dependen del abogado.
- El borrado definitivo debe programarse cuando se fije el plazo de retención.
- Con correo real, enviar en segundo plano (`context.waitUntil`) para que el tiempo de respuesta no revele si la cuenta existe.

## Fase 7

- Doble factor TOTP con códigos de recuperación. `dosfa_obligatorio` es `true` por defecto y no se cambia desde el panel; `servidor/demo.mjs` lo apaga en los datos inventados.
- Auditoría inmutable por disparador. Solo admite quitar la referencia a un socio borrado.
- `pruebas/test_seguridad.py` exige clasificar cada ruta nueva con sus roles.
- Copias propias cifradas con `scripts/copia.py`, porque el PostgreSQL local no trae `pg_dump`. `npm run todo` restaura una copia real y compara cada tabla. Sin `COPIA_CLAVE` no se recupera nada.
- Los registros solo guardan tipo de error, ruta y línea: los mensajes de la base pueden contener datos personales.
- Revisar dependencias con `pip-audit` antes de cada publicación. Hoy: sin vulnerabilidades conocidas.
- Pendiente fuera del prototipo: repetir la restauración en la base publicada y guardar copias fuera de Netlify.

## Cultivo, tareas e inventario

- Módulo tras `modulo_cultivo_activo`: apagado por defecto, responde 404 y solo los datos inventados lo encienden. Las tareas quedan fuera del interruptor porque también son administrativas: con el módulo apagado se ocultan solo las de lotes.
- Lo real exige ver el certificado REPROCANN y la respuesta del abogado: registrar cifras distintas de las declaradas es un riesgo crítico de la Fase 0.
- Reservas y dispensa siguen sin construir: dependen de las preguntas 1 a 6 al abogado.
- `plantas_autorizadas` avisa pero no bloquea, y sale del certificado. Sin notas de efecto, por la regla 7.
- Sin fotos, sensores, WhatsApp ni IA por ahora.
- 2026-11-07: «Vegetativo» se llama «Crecimiento» en pantalla; la clave interna sigue siendo `vegetativo`. Crecimiento también es una anotación con la altura en centímetros y su gráfico en la ficha.
- `numero()` admite coma decimal en todo el sistema. Los puntos de miles se rechazan a propósito: «1.250» podría leerse como 1,25.

## Cultivo por recuadros

- 2026-11-07: la responsable pidió el cultivo con recuadros que se vayan rellenando, para que lo use una persona normal. Tres pantallas: `admin_cultivo` (lotes en recuadros), `admin_lote_nuevo` (cuatro preguntas) y `admin_lote` (etapas, qué se anota y ficha). Piezas comunes en `web/cultivo_comun.js`.
- En pantalla se dice «variedad», no «genética». Las tablas siguen con el nombre técnico.
- `web/dibujos_cultivo.svg` es solo de la zona interna (regla 2). Nada de `<style>` dentro de un archivo de dibujos: no se aplica con `<use>` externo.
- Las opciones de poda, problema, baja y destrucción son propuestas mías, no vienen del encargo: pendientes de validar con quien cultiva. La EC y el pH no llevan rangos recomendados: serían datos inventados.
- Pasar de etapa no se deshace. Un peso sí se corrige, con motivo, y queda en el historial y la auditoría. Los apuntes no se editan.
- Cerrar o descartar un lote cierra sus tareas pendientes.
- Las pruebas contra el servidor no ven si la pantalla envía bien los datos: el fallo de que no se guardaba ninguna anotación solo salió al recorrer la pantalla de verdad. Tras tocar una pantalla, recorrerla.
- Tras guardar, `confirmar` no mueve la página; `avisar` sí, y solo queda para errores.

## Recuadros en todos los módulos

- 2026-11-07: la responsable pidió llevar a todos los módulos el estilo del cultivo. Sin tablas, sin formularios abiertos y sin `window.prompt`: cifras arriba, recuadros y ventanas que piden solo lo necesario.
- Piezas comunes en `web/recuadros.js`, después de `gestion.js` y antes del código de cada pantalla. Lo propio del cultivo está en `web/cultivo_comun.js`.
- `.oculto` lleva `!important`: si no, un estilo posterior con `display` lo anula.
- En «Mora» la pantalla dice «Cuotas atrasadas» y el menú «Atrasos». La auditoría y el resto de nombres internos no cambian.
- El nombre de cada ajuste de Configuración está en `AJUSTES`. Un ajuste nuevo se añade ahí.
- Una migración ya aplicada no se vuelve a ejecutar aunque cambie su archivo: lo añadido a una migración local hay que probarlo aparte.

## Gestión interna

- Finanzas: los movimientos no se borran, se anulan con motivo. Una cuota registrada entra sola en la caja. Un día cerrado no admite cambios.
- La mora la propone el sistema y la suspende la comisión. `mora_suspension_meses` en 0 lo deja apagado: depende de los estatutos.
- Un pedido a proveedor sin todos sus costes no se aprueba: a coste cero saltaría el monto de la comisión. En pantalla se dice «pedido» y «abastecimiento», nunca la palabra prohibida del encargo.
- No hay tareas programadas en el servidor: las recurrentes y los mantenimientos se crean al consultar, con índices que impiden duplicados.
- `moverStock` es el único punto que cambia el stock.
- El informe de inspección es un modelo sin datos personales de socios: el formato lo fija el abogado.
- Sin hacer aún: conciliación bancaria, coste por lote, checklist con foto, tiempo por tarea, comparativa por cultivador, mesas dentro de la sala, tiempos medios por genética y recordatorios por correo (faltan correo real y adjuntar archivos).

## Estructura tras pasar a Netlify

- `web/`: pantallas, con piezas comunes en `web/gestion.js` y el menú lateral y las secciones en `web/armazon.js`. Una pantalla de gestión nueva debe cargar `armazon.js` y añadirse a `GRUPOS`. Los iconos están en `web/dibujos.svg`. `servidor/`: lógica en JavaScript, con las comprobaciones de datos en `servidor/validar.mjs`. `netlify/functions/api.mjs`: función que atiende `/api/*`.
- `netlify/database/migrations/`: migraciones que Netlify aplica al publicar.
- `scripts/servidor_local.mjs` imita Netlify en local. `herramientas/` y `pruebas/` siguen en Python: atacan al servidor desde fuera y comparten formato de hash, sesiones y cifrado.
- Una ruta nueva debe añadirse a `servidor/app.mjs` y clasificarse en `pruebas/test_seguridad.py`.
