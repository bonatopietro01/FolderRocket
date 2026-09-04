param([string]$Directory, [switch]$WithWord)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
foreach($spec in @(@('mother.png',320,240),@('child.png',100,100),@('child.jpg',100,100))) {
    $image=[Drawing.Bitmap]::new([int]$spec[1],[int]$spec[2]);$image.SetResolution(144,144)
    $canvas=[Drawing.Graphics]::FromImage($image);$canvas.Clear([Drawing.Color]::CornflowerBlue)
    $image.Save((Join-Path $Directory $spec[0]),$(if($spec[0] -like '*.jpg'){[Drawing.Imaging.ImageFormat]::Jpeg}else{[Drawing.Imaging.ImageFormat]::Png}))
    $canvas.Dispose();$image.Dispose()
}
if (-not $WithWord) { exit }
$word=$null;$document=$null
try {
    $word=New-Object -ComObject Word.Application;$word.Visible=$false;$word.DisplayAlerts=0;$word.AutomationSecurity=3
    foreach($name in @('mother','child')) {
        $document=$word.Documents.Add()
        $document.Content.Text="Example heading`rChild content preserved`r"
        $document.Paragraphs.Item(1).Style=$document.Styles.Item(-2)
        if($name -eq 'mother') {
            $document.Styles.Item(-1).Font.Name='Arial';$document.Styles.Item(-1).Font.Size=14
            $document.Styles.Item(-2).Font.Size=22
            $document.Sections.Item(1).Headers.Item(1).Range.Text='Example project'
            $document.PageSetup.LeftMargin=72
        }
        $document.SaveAs2((Join-Path $Directory "$name.docx"),16)
        if ($name -eq 'child') {
            $document.ExportAsFixedFormat((Join-Path $Directory 'child.pdf'),17)
            $document.SaveAs2((Join-Path $Directory 'child.rtf'),6)
            $document.SaveAs2((Join-Path $Directory 'child.doc'),0)
        }
        $document.Close(0);$document=$null
    }
} finally {if($document){$document.Close(0)};if($word){$word.Quit()}}
