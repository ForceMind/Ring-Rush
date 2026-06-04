#!/bin/bash
# Ring Rush Linux 一键部署脚本 (Systemd版 + 自动迁移)
# 适用系统: Ubuntu / Debian / CentOS / RHEL

set -e

echo "================================================="
echo "   Ring Rush - 智能一键部署脚本 (迁移到 Systemd) "
echo "================================================="

# 1. 检查 root 权限
if [ "$EUID" -ne 0 ]; then
  echo "❌ 错误: 请使用 root 权限运行此脚本 (例如: sudo bash deploy.sh)"
  exit 1
fi

PROJECT_DIR=$(pwd)
SERVER_DIR="${PROJECT_DIR}/server"

if [ ! -d "$SERVER_DIR" ] || [ ! -f "${SERVER_DIR}/server.js" ]; then
  echo "❌ 错误: 当前目录下找不到 server/server.js，请在 Ring-Rush 项目根目录下执行此脚本！"
  exit 1
fi

# 2. 清理旧的 PM2 进程
if command -v pm2 > /dev/null; then
  echo "🧹 检测到服务器安装了 PM2，准备迁移..."
  # 查找并删除可能冲突的 pm2 进程 (容错处理)
  pm2 delete ring-rush >/dev/null 2>&1 || true
  pm2 delete server >/dev/null 2>&1 || true
  pm2 save --force >/dev/null 2>&1 || true
  echo "✅ 旧的 PM2 游戏进程已安全清理（如果有的话）。"
fi

# 3. 检查并安装 Node.js
if ! command -v node > /dev/null; then
  echo "📦 未检测到 Node.js，准备开始安装..."
  if command -v apt-get > /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
  elif command -v yum > /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    yum install -y nodejs
  else
    echo "❌ 错误: 未知的包管理器，请手动安装 Node.js 后重试"
    exit 1
  fi
  echo "✅ Node.js 安装完成: $(node -v)"
fi

# 4. 安装游戏依赖
echo "📦 正在安装依赖..."
cd "$SERVER_DIR"
npm install --production

# 5. 自动分配不冲突的端口
echo "🔍 正在扫描可用端口..."
PORT=3000
while true; do
  # 检查端口是否被占用 (同时适配 ss 和 netstat)
  if command -v ss > /dev/null; then
    if ! ss -tuln | grep -q ":$PORT "; then break; fi
  elif command -v netstat > /dev/null; then
    if ! netstat -tuln | grep -q ":$PORT "; then break; fi
  else
    break
  fi
  ((PORT++))
done
echo "✅ 自动分配空闲端口: $PORT"

# 6. 配置 Systemd
SERVICE_NAME="ring-rush"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "⚙️  生成底层服务配置..."
cat > $SERVICE_FILE <<EOF
[Unit]
Description=Ring Rush Node.js Game Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${SERVER_DIR}
Environment="PORT=${PORT}"
Environment="NODE_ENV=production"
ExecStart=$(command -v node) server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 7. 重启并拉起服务
echo "🚀 启动系统原生服务..."
systemctl daemon-reload
systemctl stop $SERVICE_NAME >/dev/null 2>&1 || true
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME

# 8. 配置 Nginx 域名反向代理
echo ""
read -p "🌐 是否需要配置域名访问？(如果需要，脚本将自动配置 Nginx 反向代理) [y/N]: " NEED_DOMAIN
if [[ "$NEED_DOMAIN" =~ ^[Yy]$ ]]; then
  read -p "✏️  请输入你的域名 (例如: game.yourdomain.com): " DOMAIN_NAME
  
  if [ -n "$DOMAIN_NAME" ]; then
    echo "📦 正在检查并安装 Nginx..."
    if ! command -v nginx > /dev/null; then
      if command -v apt-get > /dev/null; then
        apt-get update > /dev/null
        apt-get install -y nginx
      elif command -v yum > /dev/null; then
        yum install -y epel-release || true
        yum install -y nginx
      fi
    fi
    
    NGINX_CONF="/etc/nginx/conf.d/${DOMAIN_NAME}.conf"
    if [ -d "/etc/nginx/sites-available" ]; then
      NGINX_CONF="/etc/nginx/sites-available/${DOMAIN_NAME}.conf"
    fi
    
    echo "⚙️  正在生成 Nginx 配置文件: $NGINX_CONF"
    cat > $NGINX_CONF <<EOF
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
    }
}
EOF

    if [ -d "/etc/nginx/sites-available" ]; then
      ln -sf $NGINX_CONF /etc/nginx/sites-enabled/ || true
    fi

    echo "🚀 重启 Nginx 使配置生效..."
    systemctl enable nginx || true
    systemctl restart nginx || true
    
    echo "✅ Nginx 域名反向代理配置完毕！(已开启 WebSocket 支持)"
    echo "⚠️  请确保你的域名 ${DOMAIN_NAME} 已经解析到这台服务器的公网 IP。"
  else
    echo "⚠️ 域名为空，跳过 Nginx 配置。"
  fi
fi

echo "================================================="
echo "🎉 终极一键部署大功告成！"
echo ""
echo "🌐 你现在可以直接通过浏览器访问："
if [ -n "$DOMAIN_NAME" ]; then
  echo "👉 http://${DOMAIN_NAME}"
  echo "(注意: 首次访问如果报错，请检查域名解析是否已生效)"
else
  echo "👉 http://你的服务器公网IP:${PORT}"
fi
echo ""
echo "🛠️ 常用管理命令："
echo "重启游戏: systemctl restart $SERVICE_NAME"
echo "停止游戏: systemctl stop $SERVICE_NAME"
echo "查看日志: journalctl -u $SERVICE_NAME -f"
echo "================================================="
