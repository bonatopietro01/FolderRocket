param([string]$Document,[string]$Image)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$bitmap=[Drawing.Image]::FromFile($Image)
try {if($bitmap.Width -ne 320 -or $bitmap.Height -ne 240 -or [Math]::Abs($bitmap.HorizontalResolution-144) -gt 1){throw 'Image size or DPI mismatch'}} finally {$bitmap.Dispose()}
if (-not $Document) { 'Image dimensions and DPI verified.'; exit }
$word=$null;$doc=$null
try {
    $word=New-Object -ComObject Word.Application;$word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3
    $doc=$word.Documents.Open($Document,$false,$true)
    if($doc.Content.Text -notmatch 'Child content preserved'){throw 'Child text lost'}
    if($doc.Sections.Item(1).Headers.Item(1).Range.Text -notmatch 'Example project'){throw 'Header not transferred'}
    if($doc.Paragraphs.Item(2).Range.Font.Size -ne 14){throw 'Body font size mismatch'}
    if($doc.Paragraphs.Item(1).Range.Font.Size -ne 22){throw 'Heading size mismatch'}
    'Document text, header, heading, body font and image dimensions/DPI verified.'
} finally {if($doc){$doc.Close(0)};if($word){$word.Quit()}}
