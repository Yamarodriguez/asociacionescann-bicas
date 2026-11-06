# Publicar la versión de prueba

Esta versión lleva solo datos inventados y está marcada para que los buscadores no la indexen.

**Estado:** estos pasos aún no se han probado en un servidor real. La primera instalación servirá de prueba.

## Lo que necesitas

1. Una cuenta de GitHub con un repositorio **privado** y vacío.
2. Una cuenta de Hetzner.
3. Una clave SSH en tu ordenador, para entrar al servidor sin contraseña.
4. Una dirección web. HTTPS es obligatorio, porque las sesiones solo funcionan con conexión segura. Para una prueba sirve `IP.nip.io`, sin comprar un dominio.

## 1. Crear tu clave SSH

Ejecuta esto en tu ordenador y acepta las opciones por defecto:

```bash
ssh-keygen -t ed25519
```

Después muestra la parte pública, que es la única que se comparte:

```bash
type %USERPROFILE%\.ssh\id_ed25519.pub
```

## 2. Crear el servidor

En Hetzner, crea un servidor con estos datos:

- Ubicación: Alemania.
- Sistema: Ubuntu 24.04.
- Tipo: 4 GB de memoria.
- Copias de seguridad: activadas.
- Clave SSH: pega la parte pública del paso anterior.

## 3. Dar acceso de lectura al código

Entra al servidor, sustituyendo `IP`:

```bash
ssh root@IP
```

Dentro del servidor, crea una clave solo para descargar el código:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
```

```bash
cat ~/.ssh/id_ed25519.pub
```

En GitHub, abre el repositorio y entra en **Settings > Deploy keys > Add deploy key**. Pega esa línea y deja **sin marcar** el permiso de escritura.

## 4. Instalar

Sigue dentro del servidor. Sustituye `USUARIO`, `REPOSITORIO` e `IP`:

```bash
apt-get update -q && apt-get install -y -q git
```

```bash
GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new" git clone --branch fase-2-esqueleto git@github.com:USUARIO/REPOSITORIO.git /opt/asociacion
```

```bash
bash /opt/asociacion/despliegue/instalar.sh git@github.com:USUARIO/REPOSITORIO.git IP.nip.io fase-2-esqueleto
```

## Después de instalar

- La contraseña de las cuentas inventadas queda en `/opt/asociacion/.dev/credenciales_prueba.txt`.
- Los correos no se envían: quedan en `/opt/asociacion/.dev/correos/`.
- Hay una copia diaria cifrada de la base en `/var/backups/asociacion`, con 7 días de conservación.
- Guarda `COPIA_CLAVE`, de `/opt/asociacion/.env`, fuera del servidor: sin esa clave las copias no se pueden recuperar.

## Antes de usar datos reales

- Pasar las cuentas a la asociación.
- Tener la confirmación del abogado sobre guardar datos fuera de Argentina.
- Usar un dominio propio en lugar de `nip.io`.
- Cambiar `ENTORNO` a `produccion`, configurar el correo real y eliminar los datos inventados.
- Dejar `dosfa_obligatorio` en `true`: los datos inventados lo apagan.
- Repetir la prueba de restauración en el servidor.
- Guardar una copia en otro lugar: las de este servidor se pierden si se pierde el servidor.
