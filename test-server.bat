@echo off
cd /d "%~dp0server"
echo 当前目录: %CD%
echo.
echo 检查文件...
if exist server.js (echo [OK] server.js) else (echo [ERROR] server.js not found)
if exist node_modules (echo [OK] node_modules) else (echo [ERROR] node_modules not found)
if exist ..\index.html (echo [OK] ..\index.html) else (echo [ERROR] ..\index.html not found)
echo.
echo 启动服务器...
node server.js
