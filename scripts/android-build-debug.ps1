$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

function Resolve-FirstDirectory($path) {
    if (-not (Test-Path $path)) {
        return $null
    }
    $dir = Get-ChildItem -Path $path -Directory | Select-Object -First 1
    if ($dir) {
        return $dir.FullName
    }
    return $null
}

$javaHome = $env:JAVA_HOME
if (-not $javaHome) {
    $javaHome = Resolve-FirstDirectory (Join-Path $root ".tools\jdk21")
}
if (-not $javaHome -or -not (Test-Path (Join-Path $javaHome "bin\java.exe"))) {
    throw "JDK 21 not found. Set JAVA_HOME or place a JDK under .tools\jdk21."
}

$androidHome = $env:ANDROID_HOME
if (-not $androidHome) {
    $androidHome = $env:ANDROID_SDK_ROOT
}
if (-not $androidHome) {
    $androidHome = Join-Path $root ".tools\android-sdk"
}
if (-not (Test-Path (Join-Path $androidHome "platforms\android-36"))) {
    throw "Android SDK android-36 not found. Set ANDROID_HOME or install the SDK under .tools\android-sdk."
}

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidHome
$env:ANDROID_SDK_ROOT = $androidHome
$env:Path = "$javaHome\bin;$androidHome\platform-tools;$androidHome\cmdline-tools\latest\bin;$env:Path"

if (-not $env:VITE_PELLO_SERVER_URL) {
    $env:VITE_PELLO_SERVER_URL = "https://pello.xincreates.com"
}
if (-not $env:VITE_PELLO_SERVER_LOCKED) {
    $env:VITE_PELLO_SERVER_LOCKED = "true"
}
Write-Host "Android app server: $env:VITE_PELLO_SERVER_URL"
Write-Host "Android app server locked: $env:VITE_PELLO_SERVER_LOCKED"

$downloadDir = Join-Path $root "public\download"
$downloadApk = Join-Path $downloadDir "Pello.apk"

Push-Location $root
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    $distDownloadDir = Join-Path $root "dist\download"
    if (Test-Path -LiteralPath $distDownloadDir) {
        Get-ChildItem -LiteralPath $distDownloadDir -Filter "*.apk" -File | ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Force
        }
    }

    npx cap sync android
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Push-Location (Join-Path $root "android")
    try {
        .\gradlew.bat :app:assembleDebug
    } finally {
        Pop-Location
    }
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    $builtApk = Join-Path $root "android\app\build\outputs\apk\debug\app-debug.apk"
    if (-not (Test-Path -LiteralPath $builtApk)) {
        throw "Gradle did not produce $builtApk"
    }

    & (Join-Path $root "scripts\check-apk-size.ps1") -ApkPath $builtApk

    if (-not (Test-Path -LiteralPath $downloadDir)) {
        New-Item -ItemType Directory -Path $downloadDir | Out-Null
    }
    Copy-Item -LiteralPath $builtApk -Destination $downloadApk -Force
    & (Join-Path $root "scripts\check-apk-size.ps1") -ApkPath $downloadApk
} finally {
    Pop-Location
}
