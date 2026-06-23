param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Color-Hex {
    param([string]$Hex, [int]$Alpha = 255)
    $clean = $Hex.TrimStart('#')
    return [System.Drawing.Color]::FromArgb(
        $Alpha,
        [Convert]::ToInt32($clean.Substring(0, 2), 16),
        [Convert]::ToInt32($clean.Substring(2, 2), 16),
        [Convert]::ToInt32($clean.Substring(4, 2), 16)
    )
}

function New-RoundPath {
    param([float]$X, [float]$Y, [float]$W, [float]$H, [float]$R)
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $d = [Math]::Max(1, $R * 2)
    $path.AddArc($X, $Y, $d, $d, 180, 90)
    $path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
    $path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
    $path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function Fill-PathGradient {
    param(
        [System.Drawing.Graphics]$G,
        [System.Drawing.Drawing2D.GraphicsPath]$Path,
        [float]$X,
        [float]$Y,
        [float]$W,
        [float]$H,
        [System.Drawing.Color]$Top,
        [System.Drawing.Color]$Bottom,
        [System.Drawing.Color]$Stroke,
        [float]$StrokeWidth = 2
    )
    $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.RectangleF]::new($X, $Y, $W, $H),
        $Top,
        $Bottom,
        [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
    )
    $G.FillPath($brush, $Path)
    $brush.Dispose()
    if ($StrokeWidth -gt 0) {
        $pen = [System.Drawing.Pen]::new($Stroke, $StrokeWidth)
        $G.DrawPath($pen, $Path)
        $pen.Dispose()
    }
}

function Draw-Text {
    param(
        [System.Drawing.Graphics]$G,
        [string]$Text,
        [float]$X,
        [float]$Y,
        [float]$Size,
        [string]$Color = '#123842',
        [switch]$Bold,
        [string]$Align = 'Center'
    )
    $style = if ($Bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
    $font = [System.Drawing.Font]::new([System.Drawing.FontFamily]::GenericSansSerif, $Size, $style, [System.Drawing.GraphicsUnit]::Pixel)
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = if ($Align -eq 'Left') { [System.Drawing.StringAlignment]::Near } elseif ($Align -eq 'Right') { [System.Drawing.StringAlignment]::Far } else { [System.Drawing.StringAlignment]::Center }
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $brush = [System.Drawing.SolidBrush]::new((Color-Hex $Color))
    $G.DrawString($Text, $font, $brush, [System.Drawing.PointF]::new($X, $Y), $format)
    $brush.Dispose()
    $format.Dispose()
    $font.Dispose()
}

function Draw-Panel {
    param(
        [System.Drawing.Graphics]$G,
        [float]$X,
        [float]$Y,
        [float]$W,
        [float]$H,
        [float]$R,
        [string]$Top = '#ffffff',
        [string]$Bottom = '#e7fbf7',
        [string]$Stroke = '#ffffff'
    )
    $shadow = [System.Drawing.SolidBrush]::new((Color-Hex '#0f5660' 30))
    $shadowPath = New-RoundPath ($X + 4) ($Y + 8) $W $H $R
    $G.FillPath($shadow, $shadowPath)
    $shadow.Dispose()
    $shadowPath.Dispose()

    $path = New-RoundPath $X $Y $W $H $R
    Fill-PathGradient $G $path $X $Y $W $H (Color-Hex $Top) (Color-Hex $Bottom) (Color-Hex $Stroke 210) 2
    $path.Dispose()
}

function Draw-ButtonSprite {
    param([System.Drawing.Graphics]$G, [float]$X, [float]$Y, [float]$W, [float]$H, [string]$Top, [string]$Bottom)
    $path = New-RoundPath $X $Y $W $H 24
    Fill-PathGradient $G $path $X $Y $W $H (Color-Hex $Top) (Color-Hex $Bottom) (Color-Hex '#ffffff' 190) 3
    $shine = [System.Drawing.SolidBrush]::new((Color-Hex '#ffffff' 50))
    $shinePath = New-RoundPath ($X + 14) ($Y + 8) ($W - 28) ($H * 0.34) 16
    $G.FillPath($shine, $shinePath)
    $shine.Dispose()
    $shinePath.Dispose()
    $path.Dispose()
}

function Draw-Coin {
    param([System.Drawing.Graphics]$G, [float]$X, [float]$Y, [float]$Size)
    $rect = [System.Drawing.RectangleF]::new($X, $Y, $Size, $Size)
    $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, (Color-Hex '#fff5a8'), (Color-Hex '#f08a16'), [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal)
    $G.FillEllipse($brush, $rect)
    $brush.Dispose()
    $pen = [System.Drawing.Pen]::new((Color-Hex '#ffffff' 230), [Math]::Max(2, $Size * 0.07))
    $G.DrawEllipse($pen, $rect)
    $pen.Dispose()
    $inner = [System.Drawing.Pen]::new((Color-Hex '#9a6100' 80), [Math]::Max(1, $Size * 0.04))
    $G.DrawEllipse($inner, $X + $Size * 0.2, $Y + $Size * 0.2, $Size * 0.6, $Size * 0.6)
    $inner.Dispose()
    $glow = [System.Drawing.SolidBrush]::new((Color-Hex '#ffffff' 180))
    $G.FillEllipse($glow, $X + $Size * 0.22, $Y + $Size * 0.18, $Size * 0.22, $Size * 0.16)
    $glow.Dispose()
}

function Draw-Puck {
    param([System.Drawing.Graphics]$G, [float]$X, [float]$Y, [float]$Size, [string]$Top, [string]$Bottom)
    $rect = [System.Drawing.RectangleF]::new($X, $Y, $Size, $Size)
    $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, (Color-Hex $Top), (Color-Hex $Bottom), [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal)
    $G.FillEllipse($brush, $rect)
    $brush.Dispose()
    $pen = [System.Drawing.Pen]::new((Color-Hex '#ffffff' 130), [Math]::Max(1, $Size * 0.026))
    $G.DrawEllipse($pen, $rect)
    $pen.Dispose()
    $innerBrush = [System.Drawing.SolidBrush]::new((Color-Hex $Bottom 210))
    $G.FillEllipse($innerBrush, $X + $Size * 0.24, $Y + $Size * 0.24, $Size * 0.52, $Size * 0.52)
    $innerBrush.Dispose()
    $shine = [System.Drawing.SolidBrush]::new((Color-Hex '#ffffff' 115))
    $G.FillEllipse($shine, $X + $Size * 0.26, $Y + $Size * 0.21, $Size * 0.14, $Size * 0.10)
    $shine.Dispose()
}

function Draw-Robot {
    param([System.Drawing.Graphics]$G, [float]$X, [float]$Y, [float]$W, [float]$H)
    Draw-Panel $G ($X + $W * 0.18) ($Y + $H * 0.2) ($W * 0.64) ($H * 0.52) 32 '#ffffff' '#d9fbff' '#ffffff'
    $eyeBrush = [System.Drawing.SolidBrush]::new((Color-Hex '#25a9e7'))
    $G.FillEllipse($eyeBrush, $X + $W * 0.35, $Y + $H * 0.42, $W * 0.10, $H * 0.10)
    $G.FillEllipse($eyeBrush, $X + $W * 0.55, $Y + $H * 0.42, $W * 0.10, $H * 0.10)
    $eyeBrush.Dispose()
    $mouthPen = [System.Drawing.Pen]::new((Color-Hex '#123842' 160), 4)
    $G.DrawArc($mouthPen, $X + $W * 0.39, $Y + $H * 0.50, $W * 0.22, $H * 0.12, 10, 160)
    $mouthPen.Dispose()
    $antenna = [System.Drawing.Pen]::new((Color-Hex '#123842' 150), 4)
    $G.DrawLine($antenna, $X + $W * 0.5, $Y + $H * 0.2, $X + $W * 0.5, $Y + $H * 0.08)
    $antenna.Dispose()
    Draw-Coin $G ($X + $W * 0.43) ($Y + $H * 0.02) ($W * 0.14)
    Draw-Puck $G ($X + $W * 0.06) ($Y + $H * 0.64) ($W * 0.22) '#5ec5ff' '#2b78d6'
    Draw-Puck $G ($X + $W * 0.72) ($Y + $H * 0.64) ($W * 0.22) '#ff8a78' '#d94a4a'
}

function Draw-BoardSkin {
    param([System.Drawing.Graphics]$G, [float]$X, [float]$Y, [float]$W, [float]$H)
    Draw-Panel $G $X $Y $W $H 30 '#fff9c8' '#9fe9d5' '#ffffff'
    $rim = [System.Drawing.Pen]::new((Color-Hex '#123842' 45), 5)
    $G.DrawRectangle($rim, $X + 17, $Y + 17, $W - 34, $H - 34)
    $rim.Dispose()
    $surface = New-RoundPath ($X + 20) ($Y + 20) ($W - 40) ($H - 40) 18
    Fill-PathGradient $G $surface ($X + 20) ($Y + 20) ($W - 40) ($H - 40) (Color-Hex '#f7fffb') (Color-Hex '#d7f6ff') (Color-Hex '#ffffff' 180) 2
    $surface.Dispose()
}

function Add-Sprite {
    param([string]$Name, [int]$X, [int]$Y, [int]$W, [int]$H, [scriptblock]$Draw, [hashtable]$Slice = $null)
    $entry = [ordered]@{ x = $X; y = $Y; w = $W; h = $H }
    if ($Slice) { $entry.slice = [ordered]@{ left = $Slice.left; top = $Slice.top; right = $Slice.right; bottom = $Slice.bottom } }
    $script:frames[$Name] = $entry
    & $Draw $script:g $X $Y $W $H
}

function Add-ImageSprite {
    param([string]$Name, [int]$X, [int]$Y, [int]$W, [int]$H, [string]$Path, [float]$Radius = 0)
    $entry = [ordered]@{ x = $X; y = $Y; w = $W; h = $H }
    $script:frames[$Name] = $entry
    if (!(Test-Path -LiteralPath $Path)) { return }

    $image = [System.Drawing.Image]::FromFile($Path)
    $srcRatio = $image.Width / $image.Height
    $dstRatio = $W / $H
    if ($srcRatio -gt $dstRatio) {
        $srcH = $image.Height
        $srcW = [int]($srcH * $dstRatio)
        $srcX = [int](($image.Width - $srcW) / 2)
        $srcY = 0
    } else {
        $srcW = $image.Width
        $srcH = [int]($srcW / $dstRatio)
        $srcX = 0
        $srcY = [int](($image.Height - $srcH) / 2)
    }

    $state = $null
    $clipPath = $null
    if ($Radius -gt 0) {
        $state = $script:g.Save()
        $clipPath = New-RoundPath $X $Y $W $H $Radius
        $script:g.SetClip($clipPath)
    }
    $script:g.DrawImage(
        $image,
        [System.Drawing.Rectangle]::new($X, $Y, $W, $H),
        [System.Drawing.Rectangle]::new($srcX, $srcY, $srcW, $srcH),
        [System.Drawing.GraphicsUnit]::Pixel
    )
    if ($state) {
        $script:g.Restore($state)
        $clipPath.Dispose()
    }
    $image.Dispose()
}

$outDir = Join-Path $Root 'public\assets\app-ui'
$mockDir = Join-Path $Root 'design\app-ui\mockups'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
New-Item -ItemType Directory -Path $mockDir -Force | Out-Null

$atlasW = 2048
$atlasH = 2048
$bitmap = [System.Drawing.Bitmap]::new($atlasW, $atlasH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$script:g = [System.Drawing.Graphics]::FromImage($bitmap)
$script:g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$script:g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$script:g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$script:g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$script:g.Clear([System.Drawing.Color]::Transparent)
$script:frames = [ordered]@{}

Add-Sprite 'background' 0 0 450 960 { param($g,$x,$y,$w,$h)
    $rect = [System.Drawing.RectangleF]::new($x, $y, $w, $h)
    $bg = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, (Color-Hex '#8be9d6'), (Color-Hex '#8bdc9f'), [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $g.FillRectangle($bg, $rect)
    $bg.Dispose()
    $sun = [System.Drawing.SolidBrush]::new((Color-Hex '#fff3a2' 175))
    $g.FillEllipse($sun, $x + 30, $y + 92, 150, 150)
    $g.FillEllipse($sun, $x + 304, $y + 116, 112, 112)
    $sun.Dispose()
    $cloud = [System.Drawing.SolidBrush]::new((Color-Hex '#ffffff' 60))
    $g.FillEllipse($cloud, $x - 45, $y + 210, 180, 80)
    $g.FillEllipse($cloud, $x + 310, $y + 510, 170, 80)
    $g.FillEllipse($cloud, $x + 34, $y + 752, 220, 86)
    $cloud.Dispose()
}
Add-Sprite 'topbar' 480 0 420 92 { param($g,$x,$y,$w,$h) Draw-Panel $g $x $y $w $h 28 '#ffffff' '#e6fbf6' '#ffffff' } @{ left=48; top=36; right=48; bottom=36 }
Add-Sprite 'panel' 920 0 380 180 { param($g,$x,$y,$w,$h) Draw-Panel $g $x $y $w $h 26 '#ffffff' '#e4fbf8' '#ffffff' } @{ left=44; top=44; right=44; bottom=44 }
Add-Sprite 'modal' 920 210 380 360 { param($g,$x,$y,$w,$h) Draw-Panel $g $x $y $w $h 32 '#ffffff' '#eefefa' '#ffffff' } @{ left=56; top=56; right=56; bottom=56 }
Add-Sprite 'playerCard' 920 600 344 76 { param($g,$x,$y,$w,$h) Draw-Panel $g $x $y $w $h 24 '#ffffff' '#e5fbff' '#ffffff' } @{ left=40; top=30; right=40; bottom=30 }
Add-Sprite 'coinPill' 920 706 180 58 { param($g,$x,$y,$w,$h) Draw-Panel $g $x $y $w $h 29 '#fff6b8' '#ffc857' '#ffffff' } @{ left=32; top=24; right=32; bottom=24 }
Add-Sprite 'buttonPrimary' 0 1000 330 76 { param($g,$x,$y,$w,$h) Draw-ButtonSprite $g $x $y $w $h '#ff9b63' '#ef6745' } @{ left=38; top=30; right=38; bottom=30 }
Add-Sprite 'buttonGreen' 340 1000 330 76 { param($g,$x,$y,$w,$h) Draw-ButtonSprite $g $x $y $w $h '#42d48a' '#15955d' } @{ left=38; top=30; right=38; bottom=30 }
Add-Sprite 'buttonBlue' 680 1000 330 76 { param($g,$x,$y,$w,$h) Draw-ButtonSprite $g $x $y $w $h '#49c5ff' '#177fc3' } @{ left=38; top=30; right=38; bottom=30 }
Add-Sprite 'buttonPurple' 1020 1000 330 76 { param($g,$x,$y,$w,$h) Draw-ButtonSprite $g $x $y $w $h '#9b82ff' '#6653c8' } @{ left=38; top=30; right=38; bottom=30 }
Add-Sprite 'buttonGray' 1360 1000 330 76 { param($g,$x,$y,$w,$h) Draw-ButtonSprite $g $x $y $w $h '#90a0a8' '#5c6870' } @{ left=38; top=30; right=38; bottom=30 }
Add-Sprite 'buttonRed' 1700 1000 330 76 { param($g,$x,$y,$w,$h) Draw-ButtonSprite $g $x $y $w $h '#ff817b' '#d9423f' } @{ left=38; top=30; right=38; bottom=30 }
$homeHeroSource = Join-Path $Root 'design\app-ui\source\home-hero.png'
Add-ImageSprite 'homeHero' 0 1120 390 226 $homeHeroSource 28
Add-Sprite 'boardSkin' 480 120 356 396 { param($g,$x,$y,$w,$h) Draw-BoardSkin $g $x $y $w $h }
Add-Sprite 'coin' 480 550 96 96 { param($g,$x,$y,$w,$h) Draw-Coin $g $x $y $w }
Add-Sprite 'puckBlue' 600 550 76 76 { param($g,$x,$y,$w,$h) Draw-Puck $g $x $y $w '#64cfff' '#2377d4' }
Add-Sprite 'puckRed' 700 550 76 76 { param($g,$x,$y,$w,$h) Draw-Puck $g $x $y $w '#ff8d7a' '#d94a4a' }
Add-Sprite 'puckGold' 800 550 76 76 { param($g,$x,$y,$w,$h) Draw-Puck $g $x $y $w '#fff2a7' '#e09313' }
Add-Sprite 'robot' 1320 0 190 190 { param($g,$x,$y,$w,$h) Draw-Robot $g $x $y $w $h }
Add-Sprite 'runner' 1540 0 64 64 { param($g,$x,$y,$w,$h) Draw-Coin $g $x $y $w }
Add-Sprite 'badgeWin' 1620 0 104 104 { param($g,$x,$y,$w,$h) Draw-Coin $g ($x + 4) ($y + 4) ($w - 8); Draw-Text $g 'W' ($x + $w/2) ($y + $h/2 + 2) 42 '#7b4a00' -Bold }
Add-Sprite 'badgeLose' 1740 0 104 104 { param($g,$x,$y,$w,$h) Draw-Puck $g ($x + 6) ($y + 6) ($w - 12) '#a7b5bd' '#68737b'; Draw-Text $g 'L' ($x + $w/2) ($y + $h/2 + 2) 42 '#ffffff' -Bold }
Add-Sprite 'sliderTrack' 1320 230 380 40 { param($g,$x,$y,$w,$h) Draw-Panel $g $x $y $w $h 20 '#ffffff' '#d7f6ff' '#ffffff' } @{ left=28; top=18; right=28; bottom=18 }
Add-Sprite 'sliderThumb' 1720 220 72 72 { param($g,$x,$y,$w,$h) Draw-Puck $g $x $y $w '#ffffff' '#42d2ff' }
Add-Sprite 'launchLane' 1320 310 230 72 { param($g,$x,$y,$w,$h) Draw-Panel $g $x $y $w $h 18 '#ffffff' '#dff7ff' '#ffffff' } @{ left=24; top=24; right=24; bottom=24 }
Add-Sprite 'aimArrow' 1580 310 64 64 { param($g,$x,$y,$w,$h)
    $brush = [System.Drawing.SolidBrush]::new((Color-Hex '#ffffff' 235))
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddPolygon(@(
        [System.Drawing.PointF]::new($x + $w * 0.88, $y + $h * 0.50),
        [System.Drawing.PointF]::new($x + $w * 0.18, $y + $h * 0.18),
        [System.Drawing.PointF]::new($x + $w * 0.34, $y + $h * 0.50),
        [System.Drawing.PointF]::new($x + $w * 0.18, $y + $h * 0.82)
    ))
    $g.FillPath($brush, $path)
    $brush.Dispose()
    $path.Dispose()
}

$collisionNames = @()
for ($i = 0; $i -lt 6; $i++) {
    $name = "spark$i"
    $collisionNames += $name
    Add-Sprite $name (1320 + $i * 72) 420 64 64 { param($g,$x,$y,$w,$h)
        $idx = [int](($x - 1320) / 72)
        $alpha = [Math]::Max(40, 230 - $idx * 28)
        $pen = [System.Drawing.Pen]::new((Color-Hex '#fff4a6' $alpha), [Math]::Max(2, 8 - $idx))
        for ($j = 0; $j -lt 10; $j++) {
            $angle = [Math]::PI * 2 * $j / 10
            $cx = $x + $w / 2
            $cy = $y + $h / 2
            $r1 = 7 + $idx * 2
            $r2 = 28 - $idx
            $g.DrawLine($pen, $cx + [Math]::Cos($angle) * $r1, $cy + [Math]::Sin($angle) * $r1, $cx + [Math]::Cos($angle) * $r2, $cy + [Math]::Sin($angle) * $r2)
        }
        $pen.Dispose()
    }
}

$pulseNames = @()
for ($i = 0; $i -lt 5; $i++) {
    $name = "pulse$i"
    $pulseNames += $name
    Add-Sprite $name (1320 + $i * 124) 520 112 112 { param($g,$x,$y,$w,$h)
        $idx = [int](($x - 1320) / 124)
        $alpha = [Math]::Max(24, 160 - $idx * 26)
        $pen = [System.Drawing.Pen]::new((Color-Hex '#ffc936' $alpha), 8)
        $g.DrawEllipse($pen, $x + 12 + $idx * 4, $y + 12 + $idx * 4, $w - 24 - $idx * 8, $h - 24 - $idx * 8)
        $pen.Dispose()
    }
}

$atlasPath = Join-Path $outDir 'atlas.png'
$bitmap.Save($atlasPath, [System.Drawing.Imaging.ImageFormat]::Png)
$script:g.Dispose()
$bitmap.Dispose()

$manifest = [ordered]@{
    image = 'atlas.png'
    width = $atlasW
    height = $atlasH
    version = '0.12.0'
    frames = $script:frames
    animations = [ordered]@{
        collisionSpark = $collisionNames
        scorePulse = $pulseNames
    }
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outDir 'manifest.json') -Encoding UTF8

function New-Mockup {
    param([string]$Name, [string]$Title, [string]$Mode)
    $bmp = [System.Drawing.Bitmap]::new(450, 960, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $mg = [System.Drawing.Graphics]::FromImage($bmp)
    $mg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $mg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $mg.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $bg = [System.Drawing.Drawing2D.LinearGradientBrush]::new([System.Drawing.RectangleF]::new(0,0,450,960), (Color-Hex '#8be9d6'), (Color-Hex '#8bdc9f'), [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $mg.FillRectangle($bg, 0, 0, 450, 960)
    $bg.Dispose()
    Draw-Panel $mg 18 24 414 70 28 '#ffffff' '#e6fbf6' '#ffffff'
    Draw-Text $mg 'PELLO' 40 58 26 '#123842' -Bold 'Left'
    Draw-Coin $mg 356 40 38
    Draw-Text $mg $Title 225 132 30 '#123842' -Bold
    if ($Mode -eq 'home') {
        Draw-Panel $mg 30 190 390 236 30 '#ffffff' '#e8fbf8' '#ffffff'
        Draw-BoardSkin $mg 76 218 180 200
        Draw-Puck $mg 274 270 62 '#64cfff' '#2377d4'
        Draw-Puck $mg 316 326 62 '#ff8d7a' '#d94a4a'
        Draw-ButtonSprite $mg 34 504 382 64 '#ff9b63' '#ef6745'
        Draw-Text $mg 'PLAY 1V1' 225 537 22 '#ffffff' -Bold
        Draw-ButtonSprite $mg 34 588 182 54 '#42d48a' '#15955d'
        Draw-ButtonSprite $mg 234 588 182 54 '#49c5ff' '#177fc3'
    } elseif ($Mode -eq 'ai') {
        Draw-Panel $mg 38 220 374 460 32 '#ffffff' '#eefefa' '#ffffff'
        Draw-Robot $mg 140 250 170 170
        Draw-ButtonSprite $mg 66 440 318 56 '#42d48a' '#15955d'
        Draw-ButtonSprite $mg 66 520 318 56 '#49c5ff' '#177fc3'
        Draw-ButtonSprite $mg 66 600 318 56 '#ff9b63' '#ef6745'
    } elseif ($Mode -eq 'game') {
        Draw-Panel $mg 58 92 334 58 22 '#ffffff' '#e5fbff' '#ffffff'
        Draw-BoardSkin $mg 48 266 356 396
        Draw-Puck $mg 202 602 42 '#64cfff' '#2377d4'
        Draw-Puck $mg 244 412 42 '#ff8d7a' '#d94a4a'
        Draw-Panel $mg 34 792 382 40 20 '#ffffff' '#d7f6ff' '#ffffff'
    } elseif ($Mode -eq 'score') {
        Draw-BoardSkin $mg 48 266 356 396
        Draw-Puck $mg 210 454 48 '#64cfff' '#2377d4'
        Draw-Coin $mg 184 370 82
        Draw-Text $mg '+5' 225 412 38 '#ffffff' -Bold
    } elseif ($Mode -eq 'win') {
        Draw-Panel $mg 38 202 374 350 32 '#ffffff' '#eefefa' '#ffffff'
        Draw-Coin $mg 176 232 98
        Draw-Text $mg 'VICTORY' 225 366 44 '#9b6400' -Bold
        Draw-ButtonSprite $mg 108 462 234 58 '#42d48a' '#15955d'
    } else {
        Draw-Panel $mg 36 180 378 386 32 '#ffffff' '#eefefa' '#ffffff'
        Draw-Robot $mg 146 220 160 160
        Draw-Text $mg 'Finding Rival' 225 406 30 '#123842' -Bold
    }
    $path = Join-Path $mockDir $Name
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $mg.Dispose()
    $bmp.Dispose()
}

New-Mockup '01-home.png' 'Home' 'home'
New-Mockup '02-ai-difficulty.png' 'AI Training' 'ai'
New-Mockup '03-matchmaking.png' 'Matchmaking' 'match'
New-Mockup '04-player-turn.png' 'Your Turn' 'game'
New-Mockup '05-score-feedback.png' 'Score Feedback' 'score'
New-Mockup '06-victory.png' 'Victory' 'win'

Write-Host "generated public/assets/app-ui/atlas.png"
Write-Host "generated public/assets/app-ui/manifest.json"
Write-Host "generated design/app-ui/mockups/*.png"
