param([string]$Request)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$job = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Request)) | ConvertFrom-Json
$converted = [Collections.Generic.List[object]]::new()
$failures = [Collections.Generic.List[object]]::new()
$warnings = [Collections.Generic.List[string]]::new()
$motherAnalysis = @{}

function Get-ParagraphRole($paragraph, [int]$index, [bool]$inReferences) {
    $text = ([string]$paragraph.Range.Text).Trim()
    $styleName = ([string]$paragraph.Style.NameLocal).ToLowerInvariant()
    if ($text -match '^(references|bibliography|works cited|reference list)$') { return 'referencesHeading' }
    if ($styleName -match 'subtitle') { return 'subtitle' }
    if ($styleName -match '(^|\W)title($|\W)') { return 'title' }
    $outline = [int]$paragraph.OutlineLevel
    if ($outline -ge 1 -and $outline -le 6) { return "heading$outline" }
    if ($inReferences -and $text) { return 'reference' }
    if ($styleName -match 'caption|didascalia|légende') { return 'caption' }
    if ($styleName -match 'quote|quotation|citazione') { return 'quote' }
    if ($index -eq 1 -and $text.Length -lt 180) { return 'title' }
    return 'body'
}

if ($job.kind -eq 'image') {
    Add-Type -AssemblyName System.Drawing
    $mother = [Drawing.Image]::FromFile($job.mother)
    try {
        if ([long]$mother.Width * $mother.Height -gt 60000000) { throw 'Mother image exceeds 60 megapixels.' }
        if ($mother.GetFrameCount([Drawing.Imaging.FrameDimension]::Page) -gt 1) { throw 'Multi-page mother images are not supported.' }
        foreach ($source in $job.children) {
            $outputFormat = [IO.Path]::GetExtension($source).TrimStart('.').ToLowerInvariant()
            $image = $null; $bitmap = $null; $graphics = $null; $parameters = $null
            try {
                $image = [Drawing.Image]::FromFile($source)
                if ([long]$image.Width * $image.Height -gt 60000000) { throw 'Child image exceeds 60 megapixels.' }
                if ($image.GetFrameCount([Drawing.Imaging.FrameDimension]::Page) -gt 1) { throw 'Multi-page images are not supported; no pages have been discarded.' }
                if ($image.PropertyIdList -contains 274) {
                    $orientation = [BitConverter]::ToUInt16($image.GetPropertyItem(274).Value, 0)
                    $rotation = switch ($orientation) { 2 {4} 3 {2} 4 {6} 5 {5} 6 {1} 7 {7} 8 {3} default {0} }
                    if ($rotation) { $image.RotateFlip([Drawing.RotateFlipType]$rotation) }
                }
                $bitmap = [Drawing.Bitmap]::new($mother.Width, $mother.Height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
                $bitmap.SetResolution([Math]::Max(1, $mother.HorizontalResolution), [Math]::Max(1, $mother.VerticalResolution))
                $graphics = [Drawing.Graphics]::FromImage($bitmap)
                $graphics.Clear($(if ($outputFormat -in @('jpg','jpeg','bmp')) { [Drawing.Color]::White } else { [Drawing.Color]::Transparent }))
                $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
                $ratio = [Math]::Min($mother.Width / $image.Width, $mother.Height / $image.Height)
                $width = [int][Math]::Max(1, [Math]::Round($image.Width * $ratio)); $height = [int][Math]::Max(1, [Math]::Round($image.Height * $ratio))
                $graphics.DrawImage($image, [int](($mother.Width-$width)/2), [int](($mother.Height-$height)/2), $width, $height)
                $target = Join-Path $job.destination (([IO.Path]::GetFileNameWithoutExtension($source)) + '_' + [Guid]::NewGuid().ToString('N').Substring(0,6) + '_formatted.' + $outputFormat)
                $mime = switch ($outputFormat) { {$_ -in 'jpg','jpeg'} {'image/jpeg'} {$_ -in 'tif','tiff'} {'image/tiff'} 'bmp' {'image/bmp'} default {'image/png'} }
                $encoder = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq $mime | Select-Object -First 1
                $parameters = [Drawing.Imaging.EncoderParameters]::new(1)
                $parameters.Param[0] = [Drawing.Imaging.EncoderParameter]::new([Drawing.Imaging.Encoder]::Quality, [long]$job.quality)
                $bitmap.Save($target, $encoder, $parameters)
                $converted.Add(@{name=[IO.Path]::GetFileName($target); path=$target; sourceName=[IO.Path]::GetFileName($source); size=(Get-Item -LiteralPath $target).Length})
            } catch { $failures.Add(@{name=[IO.Path]::GetFileName($source); message=$_.Exception.Message}) }
            finally { if($parameters){$parameters.Dispose()}; if($graphics){$graphics.Dispose()}; if($bitmap){$bitmap.Dispose()}; if($image){$image.Dispose()} }
        }
        $warnings.Add('Dimensions and DPI match the mother; each child keeps its original file type. Aspect ratio is preserved with padding; upscaling cannot restore lost detail. JPEG quality uses your setting, not an inferred original quality. Metadata is not copied.')
    } finally { $mother.Dispose() }
} else {
    $word = $null; $mother = $null
    try {
        $word = New-Object -ComObject Word.Application
        $word.Visible = $false; $word.DisplayAlerts = 0; $word.AutomationSecurity = 3
        $word.Options.UpdateLinksAtOpen = $false
        $mother = $word.Documents.Open([string]$job.mother, $false, $true, $false)
        $template = Join-Path $job.destination '_mother-style.dotx'
        $mother.SaveAs2($template, 14)
        foreach ($source in $job.children) {
            $outputFormat = [IO.Path]::GetExtension($source).TrimStart('.').ToLowerInvariant()
            $child = $null
            try {
                $child = $word.Documents.Open([string]$source, $false, $true, $false)
                $child.CopyStylesFromTemplate($template)
                # Match style definitions and the mother's direct font/paragraph settings
                # for each corresponding paragraph style. Child text/fields stay in place.
                $examples = @{}; $motherInReferences = $false; $motherIndex = 0
                foreach ($paragraph in $mother.Paragraphs) {
                    $motherIndex++
                    $role = Get-ParagraphRole $paragraph $motherIndex $motherInReferences
                    if ($role -eq 'referencesHeading') { $motherInReferences = $true }
                    elseif ($motherInReferences -and $role -match '^heading') { $motherInReferences = $false }
                    if ($paragraph.Range.Text.Trim()) {
                        if (-not $examples.ContainsKey($role)) { $examples[$role] = $paragraph }
                        if (-not $motherAnalysis.ContainsKey($role)) { $motherAnalysis[$role] = 0 }
                        $motherAnalysis[$role]++
                    }
                }
                $childInReferences = $false; $childIndex = 0
                foreach ($paragraph in $child.Paragraphs) {
                    $childIndex++
                    $role = Get-ParagraphRole $paragraph $childIndex $childInReferences
                    if ($role -eq 'referencesHeading') { $childInReferences = $true }
                    elseif ($childInReferences -and $role -match '^heading') { $childInReferences = $false }
                    $reference = if ($examples.ContainsKey($role)) { $examples[$role] } elseif ($role -match '^heading' -and $examples.ContainsKey('heading1')) { $examples['heading1'] } else { $examples['body'] }
                    if ($reference) {
                        # Copy typography and paragraph geometry by semantic role; fields and text remain untouched.
                        foreach ($property in @('Name','NameAscii','NameFarEast','NameOther','Size','SizeBi','Color','ColorIndex','HighlightColorIndex','Bold','BoldBi','Italic','ItalicBi','Underline','StrikeThrough','DoubleStrikeThrough','SmallCaps','AllCaps','Superscript','Subscript','Hidden','Emboss','Engrave','Shadow','Outline','Spacing','Scaling','Position','Kerning')) {
                            try { $value = $reference.Range.Font.$property; if ($null -ne $value -and $value -ne 9999999) { $paragraph.Range.Font.$property = $value } } catch {}
                        }
                        $paragraph.Format = $reference.Format.Duplicate
                    }
                }
                foreach ($section in $child.Sections) {
                    $reference = $mother.Sections.Item([Math]::Min($section.Index, $mother.Sections.Count))
                    foreach ($property in @('PageWidth','PageHeight','TopMargin','BottomMargin','LeftMargin','RightMargin','HeaderDistance','FooterDistance','Orientation','Gutter','GutterPos','MirrorMargins','SectionStart','VerticalAlignment','OddAndEvenPagesHeaderFooter','DifferentFirstPageHeaderFooter')) { try { $section.PageSetup.$property = $reference.PageSetup.$property } catch {} }
                    if ($job.headers) {
                        $section.PageSetup.DifferentFirstPageHeaderFooter = $reference.PageSetup.DifferentFirstPageHeaderFooter
                        $section.PageSetup.OddAndEvenPagesHeaderFooter = $reference.PageSetup.OddAndEvenPagesHeaderFooter
                        for ($i=1; $i -le 3; $i++) {
                            $section.Headers.Item($i).LinkToPrevious = $false
                            $section.Footers.Item($i).LinkToPrevious = $false
                            $section.Headers.Item($i).Range.FormattedText = $reference.Headers.Item($i).Range.FormattedText
                            $section.Footers.Item($i).Range.FormattedText = $reference.Footers.Item($i).Range.FormattedText
                        }
                    }
                }
                if ($job.pictures -and $mother.InlineShapes.Count -gt 0) {
                    $maxWidth = $mother.InlineShapes.Item(1).Width; $maxHeight = $mother.InlineShapes.Item(1).Height
                    foreach ($picture in $child.InlineShapes) {
                        if ($picture.Type -in @(3,4)) {
                            $ratio = [Math]::Min($maxWidth/$picture.Width, $maxHeight/$picture.Height)
                            $picture.LockAspectRatio = -1; $picture.Width = $picture.Width * $ratio
                        }
                    }
                }
                $target = Join-Path $job.destination (([IO.Path]::GetFileNameWithoutExtension($source)) + '_' + [Guid]::NewGuid().ToString('N').Substring(0,6) + '_formatted.' + $outputFormat)
                switch ($outputFormat) {
                    'pdf' { $child.ExportAsFixedFormat($target,17) }
                    'docx' { $child.SaveAs2($target,16) }
                    'doc' { $child.SaveAs2($target,0) }
                    'rtf' { $child.SaveAs2($target,6) }
                    default { throw "Unsupported source format: $outputFormat" }
                }
                $converted.Add(@{name=[IO.Path]::GetFileName($target); path=$target; sourceName=[IO.Path]::GetFileName($source); size=(Get-Item -LiteralPath $target).Length})
            } catch { $failures.Add(@{name=[IO.Path]::GetFileName($source); message=$_.Exception.Message}) }
            finally { if($child){$child.Close(0);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($child)} }
        }
        $warnings.Add('Mother structure was analyzed by semantic role: title, subtitle, heading levels, body, quotations, captions and references. Font families, size, color, emphasis, alignment, indentation, spacing, tabs and page behavior were transferred while preserving child text and citation fields. Complex tables, floating images and managed bibliography systems require review. PDF reflow can change layout; scanned PDFs need OCR first.')
    } finally {
        if($mother){$mother.Close(0);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($mother)}
        if($word){$word.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)}
    }
}
@{converted=@($converted.ToArray()); failures=@($failures.ToArray()); warnings=@($warnings.ToArray()); motherAnalysis=$motherAnalysis} | ConvertTo-Json -Depth 8 -Compress
