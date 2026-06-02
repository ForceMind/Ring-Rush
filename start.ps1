$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::Title = "Ring Rush - 游戏管理器"

function Show-Menu {
    Clear-Host
    Write-Host ""
    Write-Host "  ========================================" -ForegroundColor Cyan
    Write-Host "        Ring Rush - 游戏管理器" -ForegroundColor Yellow
    Write-Host "  ========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   [1] 启动游戏服务器" -ForegroundColor Green
    Write-Host "   [2] 后台启动服务器" -ForegroundColor Green
    Write-Host "   [3] 安装/更新依赖" -ForegroundColor Green
    Write-Host "   [4] 检查运行环境" -ForegroundColor Green
    Write-Host "   [5] 打开游戏页面" -ForegroundColor Green
    Write-Host "   [6] 查看端口占用" -ForegroundColor Green
    Write-Host "   [0] 退出" -ForegroundColor Red
    Write-Host ""
    Write-Host "  ========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Start-GameServer {
    Clear-Host
    Write-Host "正在启动服务器..."
    Write-Host "访问地址: http://localhost:3000"
    Write-Host "按 Ctrl+C 可停止服务器"
    Set-Location "$PSScriptRoot\server"
    if (-not (Test-Path "node_modules")) {
        Write-Host "正在安装依赖..."
        npm install
    }
    Start-Process "http://localhost:3000"
    node server.js
    Write-Host "服务器已停止"
    Read-Host "按 Enter 返回菜单"
}

function Start-BackgroundServer {
    Clear-Host
    Write-Host "正在后台启动服务器..."
    Set-Location "$PSScriptRoot\server"
    if (-not (Test-Path "node_modules")) {
        Write-Host "正在安装依赖..."
        npm install
    }
    Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:3000"
    Write-Host "服务器已在后台启动"
    Write-Host "访问地址: http://localhost:3000"
    Write-Host "提示: 如需停止服务，可通过 [6] 查看端口占用后结束对应 node 进程"
    Read-Host "按 Enter 返回菜单"
}

function Install-Dependencies {
    Clear-Host
    Write-Host "正在安装/更新依赖..."
    Set-Location "$PSScriptRoot\server"
    npm install
    Write-Host "依赖安装完成"
    Read-Host "按 Enter 返回菜单"
}

function Test-Environment {
    Clear-Host
    Write-Host "运行环境检查"
    Write-Host ""
    Write-Host "[1/3] Node.js:"
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $nodeVersion = node --version
        Write-Host "  已安装: $nodeVersion" -ForegroundColor Green
    } else {
        Write-Host "  未安装，请访问 https://nodejs.org/ 安装" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "[2/3] npm:"
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        $npmVersion = npm --version
        Write-Host "  已安装: $npmVersion" -ForegroundColor Green
    } else {
        Write-Host "  未安装，请先安装 Node.js" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "[3/3] 依赖:"
    if (Test-Path "$PSScriptRoot\server\node_modules") {
        Write-Host "  已安装" -ForegroundColor Green
    } else {
        Write-Host "  未安装，请选择 [3] 安装/更新依赖" -ForegroundColor Red
    }
    Read-Host "按 Enter 返回菜单"
}

function Open-Browser {
    Start-Process "http://localhost:3000"
    Write-Host "已打开游戏页面"
    Start-Sleep -Seconds 1
}

function Show-PortStatus {
    Clear-Host
    Write-Host "正在检查端口 3000 占用情况..."
    Write-Host ""
    $portStatus = netstat -ano | Select-String ":3000"
    if ($portStatus) {
        Write-Host $portStatus
    } else {
        Write-Host "端口 3000 未被占用"
    }
    Read-Host "按 Enter 返回菜单"
}

do {
    Show-Menu
    $choice = Read-Host "请选择操作 [0-6]"
    switch ($choice) {
        "1" { Start-GameServer }
        "2" { Start-BackgroundServer }
        "3" { Install-Dependencies }
        "4" { Test-Environment }
        "5" { Open-Browser }
        "6" { Show-PortStatus }
        "0" { Write-Host "再见！" }
        default { Write-Host "无效选择，请重试" }
    }
} while ($choice -ne "0")
