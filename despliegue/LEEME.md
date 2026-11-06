# Publicar la versión de prueba

Esta versión lleva solo datos inventados y está marcada para que los buscadores no la indexen.

**Estado:** estos archivos aún no se han probado en un servidor real. La primera instalación servirá de prueba.

## Lo que necesitas

1. Una cuenta de GitHub con un repositorio privado vacío.
2. Una cuenta de Hetzner.
3. Un dominio o subdominio para la prueba. HTTPS es obligatorio, porque las sesiones solo funcionan con conexión segura.

## Pasos

1. Crea en Hetzner un servidor en Alemania con Ubuntu 24.04. Para el prototipo basta con 4 GB de memoria.
2. Activa las copias automáticas de Hetzner en ese servidor.
3. Apunta el dominio a la IP del servidor.
4. Entra en el servidor como `root` y ejecuta esto, sustituyendo los tres valores:

```bash
curl -fsSL https://raw.githubusercontent.com/USUARIO/REPOSITORIO/RAMA/despliegue/instalar.sh -o instalar.sh
```

```bash
bash instalar.sh https://github.com/USUARIO/REPOSITORIO.git DOMINIO RAMA
```

Si el repositorio es privado, ambas órdenes necesitan una clave de acceso de GitHub. Se configurará en el momento de instalar.

## Después de instalar

- La contraseña de las cuentas inventadas queda en `/opt/asociacion/.dev/credenciales_prueba.txt`.
- Los correos no se envían: quedan en `/opt/asociacion/.dev/correos/`.
- Hay una copia diaria de la base en `/var/backups/asociacion`, con 7 días de conservación.

## Antes de usar datos reales

- Pasar las cuentas a la asociación.
- Tener la confirmación del abogado sobre guardar datos fuera de Argentina.
- Cambiar `ENTORNO` a `produccion`, configurar el correo real y eliminar los datos inventados.
- Activar el doble factor y probar la restauración de una copia.
- Guardar una copia en otro lugar: las de este servidor se pierden si se pierde el servidor.
