@echo off
chcp 65001 >nul
title Ring Rush - 环境检查

echo ========================================
echo    Ring Rush - 环境检查
echo ========================================
echo.

echo [1/4] 检查 Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Node.js！
    echo 请先安装 Node.js: https://nodejs.org/
    echo.
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node --version') do echo [OK] Node.js 版本: %%i
)

echo.
echo [2/4] 检查 npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 npm！
) else (
    for /f "tokens=*" %%i in ('npm --version') do echo [OK] npm 版本: %%i
)

echo.
echo [3/4] 检查服务器目录...
if exist "%~dp0server\server.js" (
    echo [OK] server.js 存在
) else (
    echo [错误] server.js 不存在！
    pause
    exit /b 1
)

echo.
echo [4/4] 检查依赖...
if exist "%~dp0server\node_modules" (
    echo [OK] 依赖已安装
) else (
    echo [警告] 依赖未安装，将自动安装...
    cd /d "%~dp0server"
    call npm install
)

echo.
echo ========================================
echo    环境检查完成！
echo ========================================
echo.
pause
