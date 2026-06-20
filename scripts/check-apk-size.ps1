param(
    [string]$ApkPath = "public\download\Pello.apk",
    [int64]$MaxBytes = 8MB
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$resolvedApk = $ApkPath
if (-not [System.IO.Path]::IsPathRooted($resolvedApk)) {
    $resolvedApk = Join-Path $root $resolvedApk
}

if (-not (Test-Path -LiteralPath $resolvedApk)) {
    throw "APK not found: $resolvedApk"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

$apk = Get-Item -LiteralPath $resolvedApk
$zip = [System.IO.Compression.ZipFile]::OpenRead($apk.FullName)
try {
    $nestedApks = @($zip.Entries | Where-Object {
        $_.FullName -match '\.apk$'
    } | Select-Object -ExpandProperty FullName)

    if ($nestedApks.Count -gt 0) {
        throw "Nested APK entries found: $($nestedApks -join ', ')"
    }
} finally {
    $zip.Dispose()
}

if ($apk.Length -gt $MaxBytes) {
    $sizeMb = [math]::Round($apk.Length / 1MB, 2)
    $maxMb = [math]::Round($MaxBytes / 1MB, 2)
    throw "APK is too large: ${sizeMb}MB > ${maxMb}MB"
}

$okSizeMb = [math]::Round($apk.Length / 1MB, 2)
Write-Host "APK size OK: ${okSizeMb}MB"
