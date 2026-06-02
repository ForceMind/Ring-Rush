chcp 65001 >$null

function Show-Menu {
    Clear-Host
    Write-Host ""
    Write-Host "  ========================================" -ForegroundColor Cyan
    Write-Host "        Ring Rush - 夺心冲刺 管理工具" -ForegroundColor Yellow
    Write-Host "  ========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   [1] 启动游戏服务器" -ForegroundColor Green
    Write-Host "   [2] 后台启动服务器" -ForegroundColor Green
    Write-Host "   [3] 安装/更新依赖" -ForegroundColor Green
    Write-Host "   [4] 环境检查" -ForegroundColor Green
    Write-Host "   [5] 打开游戏页面" -ForegroundColor Green
    Write-Host "   [6] 查看端口占用" -ForegroundColor Green
    Write-Host "   [0] 退出" -ForegroundColor Red
    Write-Host ""
    Write-Host "  ========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Start-GameServer {
    Clear-Host
    Write-Host ""
    Write-Host "正在启动服务器..." -ForegroundColor Yellow
    Write-Host "访问地址: http://localhost:3000" -ForegroundColor White
    Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Gray
    Write-Host ""

    Set-Location "$PSScriptRoot\server"

    if (-not (Test-Path "node_modules")) {
        Write-Host "正在安装依赖..." -ForegroundColor Yellow
        npm install
        Write-Host ""
    }

    Start-Process "http://localhost:3000"
    node server.js

    Write-Host ""
    Write-Host "服务器已停止" -ForegroundColor Red
    Read-Host "按回车键返回菜单"
}

function Start-BackgroundServer {
    Clear-Host
    Write-Host ""
    Write-Host "后台启动服务器..." -ForegroundColor Yellow

    Set-Location "$PSScriptRoot\server"

    if (-not (Test-Path "node_modules")) {
        Write-Host "正在安装依赖..." -ForegroundColor Yellow
        npm install
    }

    Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden
    Start-Sleep -Seconds 2

    Write-Host "服务器已在后台启动" -ForegroundColor Green
    Write-Host "访问地址: http://localhost:3000" -ForegroundColor White
    Start-Process "http://localhost:3000"
    Write-Host ""
    Write-Host "提示: 使用 [6] 查看端口占用，手动结束node进程可停止" -ForegroundColor Gray
    Read-Host "按回车键返回菜单"
}

function Install-Dependencies {
    Clear-Host
    Write-Host ""
    Write-Host "安装/更新依赖..." -ForegroundColor Yellow

    Set-Location "$PSScriptRoot\server"
    npm install

    Write-Host ""
    Write-Host "完成" -ForegroundColor Green
    Read-Host "按回车键返回菜单"
}

function Test-Environment {
    Clear-Host
    Write-Host ""
    Write-Host "环境检查..." -ForegroundColor Yellow
    Write-Host ""

    Write-Host "[1/3] Node.js:" -ForegroundColor Cyan
    try {
        $nodeVer = node --version 2>$null
        Write-Host "  已安装: $nodeVer" -ForegroundColor Green
    } catch {
        Write-Host "  未安装！请访问 https://nodejs.org/" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "[2/3] npm:" -ForegroundColor Cyan
    try {
        $npmVer = npm --version 2>$null
        Write-Host "  已安装: $npmVer" -ForegroundColor Green
    } catch {
        Write-Host "  未安装" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "[3/3] 依赖:" -ForegroundColor Cyan
    if (Test-Path "$PSScriptRoot\server\node_modules") {
        Write-Host "  已安装" -ForegroundColor Green
    } else {
        Write-Host "  未安装，请选择 [3] 安装" -ForegroundColor Red
    }

    Write-Host ""
    Read-Host "按回车键返回菜单"
}

function Open-Browser {
    Start-Process "http://localhost:3000"
    Write-Host "已打开游戏页面" -ForegroundColor Green
    Start-Sleep -Seconds 1
}

function Show-PortStatus {
    Clear-Host
    Write-Host ""
    Write-Host "检查端口 3000..." -ForegroundColor Yellow
    Write-Host ""

    $result = netstat -ano | Select-String ":3000"
    if ($result) {
        Write-Host $result -ForegroundColor White
    } else {
        Write-Host "端口 3000 未被占用" -ForegroundColor Green
    }

    Write-Host ""
    Read-Host "按回车键返回菜单"
}

# 主循环
do {
    Show-Menu
    $choice = Read-Host "请选择 [0-6]"

    switch ($choice) {
        "1" { Start-GameServer }
        "2" { Start-BackgroundServer }
        "3" { Install-Dependencies }
        "4" { Test-Environment }
        "5" { Open-Browser }
        "6" { Show-PortStatus }
        "0" {
            Write-Host ""
            Write-Host "再见！" -ForegroundColor Cyan
        }
        default {
            Write-Host "无效选择，请重试" -ForegroundColor Red
            Start-Sleep -Seconds 1
        }
    }
} while ($choice -ne "0")
