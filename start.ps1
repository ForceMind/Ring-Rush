# Ring Rush - 本地测试启动脚本
# 用法: 右键点击此文件 -> 使用 PowerShell 运行

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Ring Rush - 夺心冲刺 本地测试" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 切换到 server 目录
Set-Location "$PSScriptRoot\server"

Write-Host "[1/2] 启动游戏服务器..." -ForegroundColor Green

# 检查是否已安装依赖
if (-not (Test-Path "node_modules")) {
    Write-Host "首次运行，正在安装依赖..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "依赖安装失败！" -ForegroundColor Red
        Read-Host "按回车键退出"
        exit 1
    }
    Write-Host ""
}

Write-Host ""
Write-Host "[2/2] 打开游戏页面..." -ForegroundColor Green
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   服务器启动中..." -ForegroundColor Yellow
Write-Host "   访问地址: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "   按 Ctrl+C 停止服务器" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 前台运行服务器
node server.js
