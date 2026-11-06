# Publicar en Netlify

Esta versión lleva solo datos inventados y está marcada para que los buscadores no la indexen.

**Estado:** publicado en `asociacionescannabis`, protegido con la contraseña de Netlify.

## 1. Conectar el proyecto

1. Entra en Netlify y crea un proyecto importando el repositorio de GitHub.
2. Elige la rama `fase-2-esqueleto`. La configuración ya está en `netlify.toml`.

## 2. Cargar las claves

1. En tu ordenador, ejecuta `npm run netlify:variables`. Se crea `.dev/variables-netlify.env`, fuera de Git.
2. En Netlify, abre **Project configuration > Environment variables > Import from a .env file**.
3. Pega el contenido de ese archivo. No lo compartas ni lo subas a ningún sitio.

## 3. Publicar

1. Lanza un despliegue. Netlify crea la base de datos y aplica las migraciones de `netlify/database/migrations/`.
2. Si la base no se crea sola, abre **Data & Storage > Database > Create a database manually** y vuelve a desplegar.

## 4. Datos inventados

Con `ENTORNO=pruebas`, la primera visita carga solos los datos inventados. Las cuentas son las de `.dev/credenciales_prueba.txt` y usan `DEMO_CLAVE` como contraseña.

## Límites de esta versión

- No se envían correos, así que la recuperación de contraseña no llega a ningún sitio.
- El borrado definitivo de bajas se ejecuta a mano con `scripts/purgar_bajas.py`.
- Las copias automáticas de Netlify dependen del plan: 3 días en el gratuito.

## Antes de usar datos reales

- Pasar las cuentas a la asociación.
- Resolver con el abogado si los datos pueden estar en este proveedor y país. Netlify no publica en esta guía la región de su base de datos.
- Revisar las condiciones de Netlify: prohíben guardar información sanitaria protegida sin un acuerdo firmado.
- No usar vistas previas de despliegue con la base real: copian los datos de producción.
- Usar un dominio propio y un servicio de correo real.
- Dejar `dosfa_obligatorio` en `true`: los datos inventados lo apagan.
- Probar la restauración de una copia en la base publicada y guardar copias fuera de Netlify.
- Eliminar los datos inventados y quitar `DEMO_CLAVE`.
