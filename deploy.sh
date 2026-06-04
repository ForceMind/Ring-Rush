#!/bin/bash

# Ring Rush 一键部署脚本
# 支持 Ubuntu/Debian/CentOS/RHEL 等常见发行版

echo "======================================"
echo "    Ring Rush 游戏服务器一键部署"
echo "======================================"

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
  echo "请使用 root 权限运行此脚本 (sudo ./deploy.sh)"
  exit 1
fi

# 检测包管理器
if command -v apt-get >/dev/null; then
    PKG_MANAGER="apt-get"
    $PKG_MANAGER update -y
elif command -v yum >/dev/null; then
    PKG_MANAGER="yum"
else
    echo "不支持的 Linux 发行版，无法自动安装依赖。请手动安装 Node.js 和 PM2。"
    exit 1
fi

# 安装 Node.js
if ! command -v node >/dev/null; then
    echo "未检测到 Node.js，正在为您安装..."
    if [ "$PKG_MANAGER" = "apt-get" ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        $PKG_MANAGER install -y nodejs
    elif [ "$PKG_MANAGER" = "yum" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
        $PKG_MANAGER install -y nodejs
    fi
else
    echo "Node.js 已安装: $(node -v)"
fi

# 安装 PM2 (用于后台守护进程管理)
if ! command -v pm2 >/dev/null; then
    echo "未检测到 pm2，正在通过 npm 全局安装..."
    npm install -g pm2
else
    echo "pm2 已安装: $(pm2 -v)"
fi

# 检查当前目录是否为项目根目录
if [ ! -d "server" ] || [ ! -f "server/server.js" ]; then
    echo "错误：请在项目根目录运行此脚本（该目录下应包含 server 文件夹）。"
    exit 1
fi

echo "正在安装后端依赖..."
cd server
npm install
cd ..

# 端口回避：寻找一个空闲端口，默认从 3000 开始
TARGET_PORT=3000

# 检测端口占用 (使用 ss 或 netstat，如果都没有则尝试使用 nc 或 bash 伪设备)
check_port() {
    local port=$1
    if command -v ss >/dev/null; then
        ss -tuln | grep ":$port " > /dev/null
    elif command -v netstat >/dev/null; then
        netstat -tuln | grep ":$port " > /dev/null
    else
        # 兼容方法
        (echo >/dev/tcp/127.0.0.1/$port) >/dev/null 2>&1
    fi
}

echo "正在检查端口占用情况..."
while check_port $TARGET_PORT; do
    echo "端口 $TARGET_PORT 已被占用，尝试端口 $((TARGET_PORT+1))..."
    TARGET_PORT=$((TARGET_PORT+1))
done

echo "找到可用端口: $TARGET_PORT"

# 启动服务器
echo "正在使用 pm2 启动游戏服务器..."

# 停止已有的同名服务
pm2 delete "ring-rush" >/dev/null 2>&1

# 传入指定的端口并启动
PORT=$TARGET_PORT pm2 start server/server.js --name "ring-rush"

# 保存 pm2 状态
pm2 save
pm2 startup

echo "======================================"
echo "    部署成功！"
echo "======================================"
echo "您的游戏服务器正在后台运行。"
echo "请在浏览器访问: http://您的服务器IP:$TARGET_PORT"
echo ""
echo "常用 PM2 命令："
echo "查看日志: pm2 logs ring-rush"
echo "重启服务: pm2 restart ring-rush"
echo "停止服务: pm2 stop ring-rush"
echo "======================================"
