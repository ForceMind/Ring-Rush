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
# - APK download at /download/Pello.apk

SERVICE_NAME="${SERVICE_NAME:-pello}"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="${PROJECT_DIR}/server"
REQUESTED_PORT="${PORT:-3003}"
PORT="${REQUESTED_PORT}"
HOST="${HOST:-0.0.0.0}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://pello.xincreates.com}"
DOMAIN_NAME="${DOMAIN_NAME:-pello.xincreates.com}"
SETUP_NGINX="${SETUP_NGINX:-0}"
SSL_EMAIL="${SSL_EMAIL:-}"
DATA_FILE="${PELLO_COMPETITIVE_STORE:-${SERVER_DIR}/data/competitive-state.json}"
ADMIN_TOKEN_FILE="${PELLO_ADMIN_TOKEN_FILE:-${SERVER_DIR}/data/admin-token.txt}"
ADMIN_TOKEN="${PELLO_ADMIN_TOKEN:-}"
REPO_APK_PATH="${PROJECT_DIR}/public/download/Pello.apk"
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
echo "Requested port: ${REQUESTED_PORT}"

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -tuln | grep -qE "[:.]${port}[[:space:]]"
  elif command -v netstat >/dev/null 2>&1; then
    netstat -tuln | grep -qE "[:.]${port}[[:space:]]"
  else
    return 1
  fi
}

pids_for_port() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -H -ltnp 2>/dev/null | awk -v port=":${port}" '$4 ~ port "$" { print $0 }' | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u
  elif command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null | sort -u
  fi
}

is_project_pello_pid() {
  local pid="$1"
  local cwd=""
  local cmdline=""
  [ -d "/proc/${pid}" ] || return 1
  cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)"
  cmdline="$(tr '\0' ' ' < "/proc/${pid}/cmdline" 2>/dev/null || true)"

  case "${cwd}" in
    "${PROJECT_DIR}"|"${PROJECT_DIR}"/*) return 0 ;;
  esac

  if [[ "${cmdline}" == *"server/server.js"* && "${cmdline}" == *"${PROJECT_DIR}"* ]]; then
    return 0
  fi

  return 1
}

stop_pid_gracefully() {
  local pid="$1"
  if ! kill -0 "${pid}" 2>/dev/null; then
    return
  fi
  echo "Stopping old Pello process PID ${pid}"
  kill "${pid}" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    if ! kill -0 "${pid}" 2>/dev/null; then
      return
    fi
    sleep 0.2
  done
  kill -9 "${pid}" 2>/dev/null || true
}

stop_previous_pello() {
  echo "Stopping previous Pello service if present..."
  systemctl stop "${SERVICE_NAME}" 2>/dev/null || true

  local pids=""
  if command -v pgrep >/dev/null 2>&1; then
    pids="$(pgrep -f 'server/server.js' 2>/dev/null || true)"
  fi

  for pid in ${pids}; do
    if is_project_pello_pid "${pid}"; then
      stop_pid_gracefully "${pid}"
    fi
  done
}

choose_single_port() {
  local candidate="${REQUESTED_PORT}"

  while port_in_use "${candidate}"; do
    local pids
    pids="$(pids_for_port "${candidate}" || true)"
    local has_foreign=0

    if [ -n "${pids}" ]; then
      for pid in ${pids}; do
        if is_project_pello_pid "${pid}"; then
          stop_pid_gracefully "${pid}"
        else
          has_foreign=1
        fi
      done
    else
      has_foreign=1
    fi

    if ! port_in_use "${candidate}"; then
      break
    fi

    if [ "${has_foreign}" -eq 1 ]; then
      echo "Port ${candidate} is occupied by another service; trying next port."
    else
      echo "Port ${candidate} is still busy after stopping old Pello; trying next port."
    fi
    candidate=$((candidate + 1))
  done

  PORT="${candidate}"
}

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
mkdir -p "$(dirname "${ADMIN_TOKEN_FILE}")"

if [ -z "${ADMIN_TOKEN}" ]; then
  if [ -f "${ADMIN_TOKEN_FILE}" ]; then
    ADMIN_TOKEN="$(cat "${ADMIN_TOKEN_FILE}")"
  else
    ADMIN_TOKEN="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
    printf "%s" "${ADMIN_TOKEN}" > "${ADMIN_TOKEN_FILE}"
    chmod 600 "${ADMIN_TOKEN_FILE}"
  fi
fi

stop_previous_pello
choose_single_port

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
Environment=PELLO_ADMIN_TOKEN=${ADMIN_TOKEN}
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
echo "Cloudflare tunnel target: http://127.0.0.1:${PORT}"
echo "Website: ${PUBLIC_BASE_URL}/"
echo "Game: ${PUBLIC_BASE_URL}/online.html"
echo "Admin: ${PUBLIC_BASE_URL}/admin.html"
echo "Admin token: ${ADMIN_TOKEN}"
echo "Admin token file: ${ADMIN_TOKEN_FILE}"
echo "Health: ${PUBLIC_BASE_URL}/api/competitive/health"
echo "APK: ${PUBLIC_BASE_URL}/download/Pello.apk"
echo "Bundled app server: ${VITE_PELLO_SERVER_URL}"
echo "APK file: ${APK_PATH}"
if [ ! -f "${APK_PATH}" ]; then
  echo "Warning: APK file does not exist yet. Put the APK at ${REPO_APK_PATH} or set PELLO_APK_PATH."
fi
if [ "${SETUP_NGINX}" = "0" ]; then
  echo "Nginx: skipped. Cloudflare Tunnel should point to http://127.0.0.1:${PORT}."
elif [ -z "${SSL_EMAIL}" ]; then
  echo "HTTPS certificate: skipped. Set SSL_EMAIL=you@example.com before running the script if this server manages TLS."
fi
echo ""
echo "Useful commands:"
echo "systemctl status ${SERVICE_NAME}"
echo "systemctl restart ${SERVICE_NAME}"
echo "journalctl -u ${SERVICE_NAME} -f"
