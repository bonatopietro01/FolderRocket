param(
    [string]$Source = (Join-Path $PSScriptRoot "..\src\assets\folderrocket-mark.png"),
    [string]$Output = (Join-Path $PSScriptRoot "..\build\icon.ico")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function Convert-BitmapToPngBytes {
    param([System.Drawing.Bitmap]$Bitmap)

    $stream = New-Object System.IO.MemoryStream
    try {
        $Bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        return $stream.ToArray()
    }
    finally {
        $stream.Dispose()
    }
}

$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$outputPath = [System.IO.Path]::GetFullPath($Output)
$outputDirectory = Split-Path -Parent $outputPath
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = @()

try {
    foreach ($size in $sizes) {
        $canvas = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($canvas)
        try {
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

            $safeArea = $size * 0.94
            $scale = [Math]::Min($safeArea / $sourceImage.Width, $safeArea / $sourceImage.Height)
            $drawWidth = [Math]::Max(1, [int][Math]::Round($sourceImage.Width * $scale))
            $drawHeight = [Math]::Max(1, [int][Math]::Round($sourceImage.Height * $scale))
            $drawX = [int][Math]::Round(($size - $drawWidth) / 2)
            $drawY = [int][Math]::Round(($size - $drawHeight) / 2)
            $target = New-Object System.Drawing.Rectangle($drawX, $drawY, $drawWidth, $drawHeight)

            $graphics.DrawImage(
                $sourceImage,
                $target,
                0,
                0,
                $sourceImage.Width,
                $sourceImage.Height,
                [System.Drawing.GraphicsUnit]::Pixel
            )

            $images += [PSCustomObject]@{
                Size = $size
                Bytes = Convert-BitmapToPngBytes -Bitmap $canvas
            }
        }
        finally {
            $graphics.Dispose()
            $canvas.Dispose()
        }
    }
}
finally {
    $sourceImage.Dispose()
}

$stream = New-Object System.IO.FileStream($outputPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
$writer = New-Object System.IO.BinaryWriter($stream)
try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$images.Count)

    $offset = 6 + (16 * $images.Count)
    foreach ($image in $images) {
        $dimension = if ($image.Size -ge 256) { 0 } else { $image.Size }
        $writer.Write([byte]$dimension)
        $writer.Write([byte]$dimension)
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]32)
        $writer.Write([UInt32]$image.Bytes.Length)
        $writer.Write([UInt32]$offset)
        $offset += $image.Bytes.Length
    }

    foreach ($image in $images) {
        $writer.Write([byte[]]$image.Bytes)
    }
}
finally {
    $writer.Dispose()
    $stream.Dispose()
}

Write-Output "Generated $outputPath from $sourcePath"
