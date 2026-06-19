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

Push-Location $root
try {
    npm run android:build:debug
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}
