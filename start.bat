@echo off
chcp 65001 >nul
title Ring Rush - 本地测试服务器

echo ========================================
echo    Ring Rush - 夺心冲刺 本地测试
echo ========================================
echo.

:: 检查 Node.js
echo [检查] Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Node.js！
    echo 请先安装 Node.js: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js 已安装

:: 切换到 server 目录
cd /d "%~dp0server"
if errorlevel 1 (
    echo [错误] 无法进入 server 目录！
    pause
    exit /b 1
)

:: 检查依赖
if not exist "node_modules" (
    echo.
    echo [安装] 正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败！
        pause
        exit /b 1
    )
    echo [OK] 依赖安装完成
)

echo.
echo [启动] 正在启动服务器...
echo.
echo ========================================
echo    访问地址: http://localhost:3000
echo    按 Ctrl+C 停止服务器
echo ========================================
echo.

:: 打开浏览器
start http://localhost:3000

:: 运行服务器
node server.js

echo.
echo 服务器已停止
pause
