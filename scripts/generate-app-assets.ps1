param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Convert-HexColor {
    param([string]$Hex, [int]$Alpha = 255)
    $clean = $Hex.TrimStart('#')
    return [System.Drawing.Color]::FromArgb(
        $Alpha,
        [Convert]::ToInt32($clean.Substring(0, 2), 16),
        [Convert]::ToInt32($clean.Substring(2, 2), 16),
        [Convert]::ToInt32($clean.Substring(4, 2), 16)
    )
}

function New-RoundRectPath {
    param([float]$X, [float]$Y, [float]$W, [float]$H, [float]$R)
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $d = $R * 2
    $path.AddArc($X, $Y, $d, $d, 180, 90)
    $path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
    $path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
    $path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function Fill-Circle {
    param(
        [System.Drawing.Graphics]$Graphics,
        [float]$X,
        [float]$Y,
        [float]$Radius,
        [System.Drawing.Color]$Color
    )
    $brush = [System.Drawing.SolidBrush]::new($Color)
    $Graphics.FillEllipse($brush, $X - $Radius, $Y - $Radius, $Radius * 2, $Radius * 2)
    $brush.Dispose()
}

function Draw-TextCentered {
    param(
        [System.Drawing.Graphics]$Graphics,
        [string]$Text,
        [float]$CenterX,
        [float]$Y,
        [float]$Size,
        [System.Drawing.Color]$Color,
        [switch]$Bold
    )
    $style = if ($Bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $font = [System.Drawing.Font]::new([System.Drawing.FontFamily]::GenericSansSerif, $Size, $style, [System.Drawing.GraphicsUnit]::Pixel)
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $brush = [System.Drawing.SolidBrush]::new($Color)
    $Graphics.DrawString($Text, $font, $brush, [System.Drawing.PointF]::new($CenterX, $Y), $format)
    $brush.Dispose()
    $format.Dispose()
    $font.Dispose()
}

function Draw-Splash {
    param(
        [string]$OutputPath,
        [int]$Width,
        [int]$Height,
        [System.Drawing.Image]$Icon
    )

    $bitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $rect = [System.Drawing.Rectangle]::new(0, 0, $Width, $Height)
    $bg = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        $rect,
        (Convert-HexColor '#8edff0'),
        (Convert-HexColor '#62d98f'),
        [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
    )
    $graphics.FillRectangle($bg, $rect)
    $bg.Dispose()

    $minSide = [Math]::Min($Width, $Height)
    $maxSide = [Math]::Max($Width, $Height)

    $waveBrush = [System.Drawing.SolidBrush]::new((Convert-HexColor '#ffffff' 42))
    $graphics.FillEllipse($waveBrush, -$minSide * 0.18, $Height * 0.04, $minSide * 0.78, $minSide * 0.42)
    $graphics.FillEllipse($waveBrush, $Width * 0.62, $Height * 0.1, $minSide * 0.52, $minSide * 0.42)
    $graphics.FillEllipse($waveBrush, $Width * 0.08, $Height * 0.74, $minSide * 0.82, $minSide * 0.38)
    $waveBrush.Dispose()

    Fill-Circle $graphics ($Width * 0.18) ($Height * 0.24) ($minSide * 0.055) (Convert-HexColor '#fff4a6' 185)
    Fill-Circle $graphics ($Width * 0.79) ($Height * 0.22) ($minSide * 0.036) (Convert-HexColor '#ffffff' 128)
    Fill-Circle $graphics ($Width * 0.75) ($Height * 0.72) ($minSide * 0.045) (Convert-HexColor '#ffffff' 92)

    $panelW = if ($Width -gt $Height) { $Width * 0.48 } else { $Width * 0.68 }
    $panelH = if ($Width -gt $Height) { $Height * 0.5 } else { $Height * 0.28 }
    $panelX = ($Width - $panelW) / 2
    $panelY = if ($Width -gt $Height) { $Height * 0.2 } else { $Height * 0.29 }
    $panelPath = New-RoundRectPath $panelX $panelY $panelW $panelH ($minSide * 0.045)
    $panelBrush = [System.Drawing.SolidBrush]::new((Convert-HexColor '#143642' 45))
    $graphics.FillPath($panelBrush, $panelPath)
    $panelBrush.Dispose()
    $panelPath.Dispose()

    $iconSize = if ($Width -gt $Height) { $minSide * 0.46 } else { $minSide * 0.42 }
    $iconX = ($Width - $iconSize) / 2
    $iconY = if ($Width -gt $Height) { $Height * 0.19 } else { $Height * 0.25 }
    $graphics.DrawImage($Icon, [System.Drawing.RectangleF]::new($iconX, $iconY, $iconSize, $iconSize))

    $titleY = $iconY + $iconSize + ($minSide * 0.11)
    Draw-TextCentered $graphics 'PELLO' ($Width / 2) $titleY ($minSide * 0.09) (Convert-HexColor '#143642') -Bold
    Draw-TextCentered $graphics 'Ring Rush' ($Width / 2) ($titleY + $minSide * 0.075) ($minSide * 0.038) (Convert-HexColor '#47707c')

    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
}

$iconPath = Join-Path $Root 'assets\app-icon\pello-icon-master.png'
if (!(Test-Path $iconPath)) {
    throw "Missing icon master: $iconPath"
}

$icon = [System.Drawing.Image]::FromFile($iconPath)

$targets = @(
    @{ Path = 'android\app\src\main\res\drawable\splash.png'; Width = 480; Height = 320 },
    @{ Path = 'android\app\src\main\res\drawable-land-mdpi\splash.png'; Width = 480; Height = 320 },
    @{ Path = 'android\app\src\main\res\drawable-land-hdpi\splash.png'; Width = 800; Height = 480 },
    @{ Path = 'android\app\src\main\res\drawable-land-xhdpi\splash.png'; Width = 1280; Height = 720 },
    @{ Path = 'android\app\src\main\res\drawable-land-xxhdpi\splash.png'; Width = 1600; Height = 960 },
    @{ Path = 'android\app\src\main\res\drawable-land-xxxhdpi\splash.png'; Width = 1920; Height = 1280 },
    @{ Path = 'android\app\src\main\res\drawable-port-mdpi\splash.png'; Width = 320; Height = 480 },
    @{ Path = 'android\app\src\main\res\drawable-port-hdpi\splash.png'; Width = 480; Height = 800 },
    @{ Path = 'android\app\src\main\res\drawable-port-xhdpi\splash.png'; Width = 720; Height = 1280 },
    @{ Path = 'android\app\src\main\res\drawable-port-xxhdpi\splash.png'; Width = 960; Height = 1600 },
    @{ Path = 'android\app\src\main\res\drawable-port-xxxhdpi\splash.png'; Width = 1280; Height = 1920 },
    @{ Path = 'assets\app-icon\pello-splash-preview.png'; Width = 450; Height = 960 }
)

foreach ($target in $targets) {
    $out = Join-Path $Root $target.Path
    $dir = Split-Path $out -Parent
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
    Draw-Splash -OutputPath $out -Width $target.Width -Height $target.Height -Icon $icon
    Write-Host "generated $($target.Path) $($target.Width)x$($target.Height)"
}

$icon.Dispose()
