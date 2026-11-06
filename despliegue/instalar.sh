#!/usr/bin/env bash
# Instala la version de prueba en un servidor nuevo con Ubuntu 24.04.
# Uso, como root:  bash instalar.sh URL_DEL_REPOSITORIO DOMINIO RAMA
# Se puede repetir: no cambia los secretos si ya existen.
set -euo pipefail

REPO="${1:?Falta la URL del repositorio}"
DOMINIO="${2:?Falta el dominio}"
RAMA="${3:-main}"
DESTINO=/opt/asociacion
USUARIO=asociacion

echo "== Paquetes del sistema"
apt-get update -q
apt-get install -y -q postgresql python3-venv git ufw caddy unattended-upgrades

echo "== Cortafuegos: solo SSH y web"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== Usuario sin privilegios"
id -u "$USUARIO" >/dev/null 2>&1 || useradd --system --home "$DESTINO" --shell /usr/sbin/nologin "$USUARIO"

echo "== Codigo"
if [ -d "$DESTINO/.git" ]; then
  git -C "$DESTINO" fetch --quiet origin "$RAMA"
  git -C "$DESTINO" checkout --quiet "$RAMA"
  git -C "$DESTINO" reset --quiet --hard "origin/$RAMA"
else
  git clone --quiet --branch "$RAMA" "$REPO" "$DESTINO"
fi
python3 -m venv "$DESTINO/.venv"
"$DESTINO/.venv/bin/pip" install --quiet --disable-pip-version-check -r "$DESTINO/requirements.txt"

echo "== Secretos y base de datos"
if [ ! -f "$DESTINO/.env" ]; then
  CLAVE_BD="$(openssl rand -hex 24)"
  umask 077
  cat > "$DESTINO/.env" <<ENV
ENTORNO=pruebas
PUERTO=8080
PROXY_CONFIABLE=1
SITIO_URL=https://${DOMINIO}
DATABASE_URL=postgresql://asociacion:${CLAVE_BD}@127.0.0.1:5432/asociacion
SESION_SECRETO_SOCIOS=$(openssl rand -hex 32)
SESION_SECRETO_ADMINS=$(openssl rand -hex 32)
HUELLAS_SECRETO=$(openssl rand -hex 32)
MIGRATE_SECRET=$(openssl rand -hex 32)
TOTP_CLAVE=$(openssl rand -hex 32)
COPIA_CLAVE=$(openssl rand -hex 32)
CORREO_MODO=archivo
ENV
  umask 022
  sudo -u postgres psql -v ON_ERROR_STOP=1 -v clave="$CLAVE_BD" <<'SQL'
CREATE ROLE asociacion LOGIN PASSWORD :'clave';
CREATE DATABASE asociacion OWNER asociacion;
SQL
fi
mkdir -p "$DESTINO/.dev" /var/backups/asociacion
chown -R "$USUARIO:$USUARIO" "$DESTINO" /var/backups/asociacion
chmod 600 "$DESTINO/.env"
chmod 700 /var/backups/asociacion

echo "== Migraciones y datos inventados"
cd "$DESTINO"
sudo -u "$USUARIO" "$DESTINO/.venv/bin/python" -m api.migrate
sudo -u "$USUARIO" "$DESTINO/.venv/bin/python" -m scripts.datos_prueba

echo "== Servicio, copias diarias y HTTPS"
install -m 644 despliegue/asociacion.service /etc/systemd/system/asociacion.service
install -m 644 despliegue/asociacion-copia.service /etc/systemd/system/asociacion-copia.service
install -m 644 despliegue/asociacion-copia.timer /etc/systemd/system/asociacion-copia.timer
sed "s/__DOMINIO__/$DOMINIO/" despliegue/Caddyfile > /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now asociacion.service asociacion-copia.timer
systemctl restart asociacion.service
systemctl reload caddy

echo "LISTO: https://$DOMINIO"
