@echo off
chcp 65001 >nul
title Ring Rush - 管理工具

:menu
cls
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║        Ring Rush - 夺心冲刺 管理工具       ║
echo  ╠══════════════════════════════════════════╣
echo  ║                                          ║
echo  ║   [1] 启动游戏服务器                      ║
echo  ║   [2] 启动服务器（后台运行）               ║
echo  ║   [3] 安装/更新依赖                       ║
echo  ║   [4] 环境检查                            ║
echo  ║   [5] 打开游戏页面                        ║
echo  ║   [6] 查看端口占用                        ║
echo  ║   [0] 退出                                ║
echo  ║                                          ║
echo  ╚══════════════════════════════════════════╝
echo.

set /p choice=请选择操作 [0-6]:

if "%choice%"=="1" goto start_server
if "%choice%"=="2" goto start_background
if "%choice%"=="3" goto install_deps
if "%choice%"=="4" goto check_env
if "%choice%"=="5" goto open_browser
if "%choice%"=="6" goto check_port
if "%choice%"=="0" goto exit
echo 无效选择，请重试
timeout /t 2 >nul
goto menu

:start_server
cls
echo.
echo  启动游戏服务器...
echo  访问地址: http://localhost:3000
echo  按 Ctrl+C 停止服务器
echo.
cd /d "%~dp0server"
if not exist "node_modules" (
    echo  正在安装依赖...
    call npm install
    echo.
)
start http://localhost:3000
node server.js
echo.
echo  服务器已停止
pause
goto menu

:start_background
cls
echo.
echo  后台启动服务器...
cd /d "%~dp0server"
if not exist "node_modules" (
    echo  正在安装依赖...
    call npm install
)
start /B node server.js
timeout /t 2 >nul
echo  服务器已在后台启动
echo  访问地址: http://localhost:3000
start http://localhost:3000
echo.
echo  提示: 使用 [6] 查看端口占用，手动结束 node 进程可停止服务器
pause
goto menu

:install_deps
cls
echo.
echo  安装/更新依赖...
cd /d "%~dp0server"
call npm install
echo.
echo  依赖安装完成
pause
goto menu

:check_env
cls
echo.
echo  环境检查...
echo.
echo  [1/3] Node.js:
node --version 2>nul && echo     已安装 || echo     未安装！请访问 https://nodejs.org/
echo.
echo  [2/3] npm:
npm --version 2>nul && echo     已安装 || echo     未安装
echo.
echo  [3/3] 依赖:
if exist "%~dp0server\node_modules" (
    echo     已安装
) else (
    echo     未安装，请选择 [3] 安装依赖
)
echo.
pause
goto menu

:open_browser
cls
echo.
echo  打开游戏页面...
start http://localhost:3000
echo  已打开
timeout /t 2 >nul
goto menu

:check_port
cls
echo.
echo  检查端口 3000 占用情况...
echo.
netstat -ano | findstr :3000
if errorlevel 1 (
    echo  端口 3000 未被占用
)
echo.
pause
goto menu

:exit
echo.
echo  再见！
exit
