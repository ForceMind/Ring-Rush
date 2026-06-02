@echo off
chcp 65001 >nul
title Ring Rush Server

echo Ring Rush 服务器启动中...
echo.

:: 检查依赖
if not exist "node_modules" (
    echo 正在安装依赖...
    call npm install
    echo.
)

:: 打开浏览器
start http://localhost:3000

:: 运行服务器
echo 访问地址: http://localhost:3000
echo 按 Ctrl+C 停止服务器
echo.
node server.js
