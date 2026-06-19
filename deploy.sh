#!/usr/bin/env bash
set -euo pipefail

# Pello one-service deployment script.
# Target: Ubuntu/Debian/CentOS/RHEL with systemd.
#
# The service hosts:
# - Website at /
# - Web game at /online.html
# - Competitive HTTP API
# - WebSocket game backend
# - APK download at /download/pello-debug.apk

SERVICE_NAME="${SERVICE_NAME:-pello}"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="${PROJECT_DIR}/server"
PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://pello.xincreates.com}"
DOMAIN_NAME="${DOMAIN_NAME:-pello.xincreates.com}"
SETUP_NGINX="${SETUP_NGINX:-1}"
SSL_EMAIL="${SSL_EMAIL:-}"
DATA_FILE="${PELLO_COMPETITIVE_STORE:-${SERVER_DIR}/data/competitive-state.json}"
REPO_APK_PATH="${PROJECT_DIR}/public/download/pello-debug.apk"
ANDROID_APK_PATH="${PROJECT_DIR}/android/app/build/outputs/apk/debug/app-debug.apk"
APK_PATH="${PELLO_APK_PATH:-${REPO_APK_PATH}}"

if [ ! -f "${APK_PATH}" ] && [ -f "${ANDROID_APK_PATH}" ]; then
  APK_PATH="${ANDROID_APK_PATH}"
fi

if [ "${EUID}" -ne 0 ]; then
  echo "Run this script with root privileges: sudo bash deploy.sh"
  exit 1
fi

if [ ! -f "${SERVER_DIR}/server.js" ]; then
  echo "server/server.js not found. Run this script from the Ring-Rush project root."
  exit 1
fi

echo "== Pello deploy =="
echo "Project: ${PROJECT_DIR}"
echo "Public URL: ${PUBLIC_BASE_URL}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Installing Node.js 20..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  elif command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
  else
    echo "Unsupported package manager. Install Node.js manually."
    exit 1
  fi
fi

echo "Node: $(node -v)"
echo "npm: $(npm -v)"

echo "Installing root dependencies..."
cd "${PROJECT_DIR}"
npm install

echo "Installing server dependencies..."
cd "${SERVER_DIR}"
npm install --omit=dev

echo "Building website and web game..."
cd "${PROJECT_DIR}"
export VITE_PELLO_SERVER_URL="${PUBLIC_BASE_URL}"
export VITE_PELLO_SERVER_LOCKED="${VITE_PELLO_SERVER_LOCKED:-true}"
npm run build

mkdir -p "$(dirname "${DATA_FILE}")"

while true; do
  if command -v ss >/dev/null 2>&1; then
    ss -tuln | grep -q ":${PORT} " || break
  elif command -v netstat >/dev/null 2>&1; then
    netstat -tuln | grep -q ":${PORT} " || break
  else
    break
  fi
  PORT=$((PORT + 1))
done

SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Pello website and game backend
After=network.target

[Service]
Type=simple
WorkingDirectory=${PROJECT_DIR}
Environment=NODE_ENV=production
Environment=HOST=${HOST}
Environment=PORT=${PORT}
Environment=PELLO_COMPETITIVE_STORE=${DATA_FILE}
Environment=PELLO_APK_PATH=${APK_PATH}
Environment=PELLO_PUBLIC_URL=${PUBLIC_BASE_URL}
ExecStart=$(command -v node) server/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

if [ "${SETUP_NGINX}" = "1" ] && [ -n "${DOMAIN_NAME}" ]; then
    if ! command -v nginx >/dev/null 2>&1; then
      if command -v apt-get >/dev/null 2>&1; then
        apt-get update
        apt-get install -y nginx
      elif command -v yum >/dev/null 2>&1; then
        yum install -y epel-release || true
        yum install -y nginx
      fi
    fi

    NGINX_CONF="/etc/nginx/conf.d/${DOMAIN_NAME}.conf"
    if [ -d "/etc/nginx/sites-available" ]; then
      NGINX_CONF="/etc/nginx/sites-available/${DOMAIN_NAME}.conf"
    fi

    cat > "${NGINX_CONF}" <<EOF
server {
    listen 80;
    server_name ${DOMAIN_NAME};

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

    if [ -d "/etc/nginx/sites-enabled" ]; then
      ln -sf "${NGINX_CONF}" "/etc/nginx/sites-enabled/${DOMAIN_NAME}.conf"
    fi

    systemctl enable nginx || true
    systemctl restart nginx

    if [ -n "${SSL_EMAIL}" ]; then
      if ! command -v certbot >/dev/null 2>&1; then
        if command -v apt-get >/dev/null 2>&1; then
          apt-get update
          apt-get install -y certbot python3-certbot-nginx
        elif command -v yum >/dev/null 2>&1; then
          yum install -y certbot python3-certbot-nginx || yum install -y certbot
        fi
      fi

      if command -v certbot >/dev/null 2>&1; then
        certbot --nginx -d "${DOMAIN_NAME}" --non-interactive --agree-tos -m "${SSL_EMAIL}" || true
      fi
    fi
fi

echo ""
echo "Deployment complete."
echo "Service: ${SERVICE_NAME}"
echo "Port: ${PORT}"
echo "Website: ${PUBLIC_BASE_URL}/"
echo "Game: ${PUBLIC_BASE_URL}/online.html"
echo "Health: ${PUBLIC_BASE_URL}/api/competitive/health"
echo "APK: ${PUBLIC_BASE_URL}/download/pello-debug.apk"
echo "Bundled app server: ${VITE_PELLO_SERVER_URL}"
echo "APK file: ${APK_PATH}"
if [ ! -f "${APK_PATH}" ]; then
  echo "Warning: APK file does not exist yet. Put the debug APK at ${REPO_APK_PATH} or set PELLO_APK_PATH."
fi
if [ -z "${SSL_EMAIL}" ]; then
  echo "HTTPS certificate: skipped. Set SSL_EMAIL=you@example.com before running the script if this server manages TLS."
fi
echo ""
echo "Useful commands:"
echo "systemctl status ${SERVICE_NAME}"
echo "systemctl restart ${SERVICE_NAME}"
echo "journalctl -u ${SERVICE_NAME} -f"
