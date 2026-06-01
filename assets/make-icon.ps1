# Generates assets/icon.ico — a micro SD card icon — plus a 256px preview PNG.
# Pure System.Drawing, no external tools. Run:  powershell -File assets\make-icon.ps1
Add-Type -AssemblyName System.Drawing

function New-CardPng([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = [double]$size

  # Card geometry (tall rounded-ish rectangle, microSD aspect ~11:15)
  $cardH = $s * 0.84
  $cardW = $cardH * 0.70
  $left   = ($s - $cardW) / 2.0
  $top    = ($s - $cardH) / 2.0
  $right  = $left + $cardW
  $bottom = $top + $cardH
  $cham   = $cardW * 0.30          # chamfered top-right corner (the microSD notch)

  # Card outline as a polygon with the chamfer.
  $pts = New-Object 'System.Drawing.PointF[]' 5
  $pts[0] = New-Object System.Drawing.PointF([single]$left,           [single]$top)
  $pts[1] = New-Object System.Drawing.PointF([single]($right-$cham),  [single]$top)
  $pts[2] = New-Object System.Drawing.PointF([single]$right,          [single]($top+$cham))
  $pts[3] = New-Object System.Drawing.PointF([single]$right,          [single]$bottom)
  $pts[4] = New-Object System.Drawing.PointF([single]$left,           [single]$bottom)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddPolygon($pts)
  $path.CloseFigure()

  # Body gradient (deep blue card).
  $rect = New-Object System.Drawing.RectangleF([single]$left, [single]$top, [single]$cardW, [single]$cardH)
  $c1 = [System.Drawing.Color]::FromArgb(255, 42, 96, 170)
  $c2 = [System.Drawing.Color]::FromArgb(255, 16, 38, 80)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, [single]90.0)
  $g.FillPath($brush, $path)

  # Outline.
  $penW = [single]([Math]::Max(1.0, $s * 0.012))
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 8, 20, 44), $penW)
  $g.DrawPath($pen, $path)

  # Cyan label stripe near the top (matches the app accent).
  $labRect = New-Object System.Drawing.RectangleF([single]($left + $cardW*0.16), [single]($top + $cardH*0.15), [single]($cardW*0.46), [single]($cardH*0.055))
  $accent = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 0, 229, 255))
  $g.FillRectangle($accent, $labRect)

  # Gold contact pads near the bottom.
  $contactsTop    = $bottom - $cardH * 0.30
  $contactsBottom = $bottom - $cardH * 0.07
  $contactH = $contactsBottom - $contactsTop
  $areaLeft  = $left  + $cardW * 0.12
  $areaRight = $right - $cardW * 0.12
  $n = 6
  $gap  = ($areaRight - $areaLeft) * 0.16 / $n
  $barW = (($areaRight - $areaLeft) - $gap * ($n - 1)) / $n
  $gold = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 226, 184, 78))
  for ($i = 0; $i -lt $n; $i++) {
    $bx = $areaLeft + $i * ($barW + $gap)
    $g.FillRectangle($gold, [single]$bx, [single]$contactsTop, [single]$barW, [single]$contactH)
  }

  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  return ,$ms.ToArray()
}

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngs = @{}
foreach ($sz in $sizes) { $pngs[$sz] = New-CardPng $sz }

# Save a preview of the 256px image.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
[System.IO.File]::WriteAllBytes((Join-Path $here 'icon_preview.png'), $pngs[256])

# PWA / home-screen icons (PNG, square) for the mobile dashboard.
[System.IO.File]::WriteAllBytes((Join-Path $here 'icon-192.png'), (New-CardPng 192))
[System.IO.File]::WriteAllBytes((Join-Path $here 'icon-512.png'), (New-CardPng 512))

# Assemble a multi-size .ico (PNG-compressed entries).
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
foreach ($sz in $sizes) {
  $data = $pngs[$sz]
  $dim = if ($sz -ge 256) { 0 } else { $sz }
  $bw.Write([Byte]$dim); $bw.Write([Byte]$dim); $bw.Write([Byte]0); $bw.Write([Byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32)
  $bw.Write([UInt32]$data.Length); $bw.Write([UInt32]$offset)
  $offset += $data.Length
}
foreach ($sz in $sizes) { $bw.Write($pngs[$sz]) }
$bw.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $here 'icon.ico'), $ms.ToArray())
"Wrote $((Join-Path $here 'icon.ico'))  ($($ms.Length) bytes)"
