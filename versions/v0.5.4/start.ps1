$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Show-Menu {
    Clear-Host
    Write-Host ""
    Write-Host "  ========================================" -ForegroundColor Cyan
    Write-Host "        Ring Rush - Game Manager" -ForegroundColor Yellow
    Write-Host "  ========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   [1] Start Server" -ForegroundColor Green
    Write-Host "   [2] Start Background" -ForegroundColor Green
    Write-Host "   [3] Install Dependencies" -ForegroundColor Green
    Write-Host "   [4] Check Environment" -ForegroundColor Green
    Write-Host "   [5] Open Browser" -ForegroundColor Green
    Write-Host "   [6] Check Port" -ForegroundColor Green
    Write-Host "   [0] Exit" -ForegroundColor Red
    Write-Host ""
    Write-Host "  ========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Start-GameServer {
    Clear-Host
    Write-Host "Starting server..."
    Set-Location "$PSScriptRoot\server"
    if (-not (Test-Path "node_modules")) { npm install }
    Start-Process "http://localhost:3000"
    node server.js
    Read-Host "Press Enter"
}

function Start-BackgroundServer {
    Clear-Host
    Write-Host "Starting background..."
    Set-Location "$PSScriptRoot\server"
    if (-not (Test-Path "node_modules")) { npm install }
    Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:3000"
    Write-Host "Server started"
    Read-Host "Press Enter"
}

function Install-Dependencies {
    Clear-Host
    Set-Location "$PSScriptRoot\server"
    npm install
    Write-Host "Done"
    Read-Host "Press Enter"
}

function Test-Environment {
    Clear-Host
    Write-Host "Environment Check"
    node --version 2>$null
    npm --version 2>$null
    if (Test-Path "$PSScriptRoot\server\node_modules") { Write-Host "Deps OK" }
    Read-Host "Press Enter"
}

function Open-Browser { Start-Process "http://localhost:3000" }

function Show-PortStatus {
    Clear-Host
    netstat -ano | Select-String ":3000"
    Read-Host "Press Enter"
}

do {
    Show-Menu
    $choice = Read-Host "Select [0-6]"
    switch ($choice) {
        "1" { Start-GameServer }
        "2" { Start-BackgroundServer }
        "3" { Install-Dependencies }
        "4" { Test-Environment }
        "5" { Open-Browser }
        "6" { Show-PortStatus }
        "0" { Write-Host "Bye!" }
        default { Write-Host "Invalid" }
    }
} while ($choice -ne "0")
