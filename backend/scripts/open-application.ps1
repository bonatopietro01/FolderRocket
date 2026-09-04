param([Parameter(Mandatory=$true)][string]$Request)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$job = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Request)) | ConvertFrom-Json
$appName = ([string]$job.name).Trim()
if (!$appName -or $appName.Length -gt 120) { throw 'Invalid application name.' }
$aliases = switch ($appName.ToLowerInvariant()) {
    'vs code' { @('Visual Studio Code', 'Visual Studio Code (User)', 'VS Code') }
    'word' { @('Word', 'Microsoft Word', 'Word 2016') }
    'excel' { @('Excel', 'Microsoft Excel', 'Excel 2016') }
    'powerpoint' { @('PowerPoint', 'Microsoft PowerPoint', 'PowerPoint 2016') }
    default { @($appName) }
}
$executableName = switch ($appName.ToLowerInvariant()) {
    'word' { 'WINWORD.EXE' }
    'excel' { 'EXCEL.EXE' }
    'powerpoint' { 'POWERPNT.EXE' }
    'vs code' { 'Code.exe' }
    'inkscape' { 'inkscape.exe' }
    'solidworks' { 'SLDWORKS.exe' }
    default { $null }
}
$executable = $null
if ($executableName) {
    foreach ($registryRoot in @('HKCU:\SOFTWARE', 'HKLM:\SOFTWARE', 'HKLM:\SOFTWARE\WOW6432Node')) {
        $key = Get-ItemProperty -LiteralPath "$registryRoot\Microsoft\Windows\CurrentVersion\App Paths\$executableName" -ErrorAction SilentlyContinue
        $candidate = ([string]$key.'(default)').Trim('"')
        if ($candidate -and [IO.Path]::IsPathRooted($candidate) -and $candidate.EndsWith('.exe', [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            $executable = $candidate
            break
        }
    }
}
if ($executable) {
    $target = $executable
} elseif ($appName -ieq 'Downloads') {
    $target = 'shell:Downloads'
} else {
    $matches = @(Get-StartApps | Where-Object { $_.Name -in $aliases })
    if ($matches.Count -eq 0) { throw "Application '$appName' was not found in the Windows Start menu. Use its installed application name." }
    if ($matches.Count -gt 1) {
        $matches = @($matches | Where-Object { $_.Name -ieq $appName })
        if ($matches.Count -ne 1) { throw 'More than one application matches. Use the exact Windows Start menu name.' }
    }
    $target = 'shell:AppsFolder\' + $matches[0].AppID
}
# ResolveOnly is used by local checks; the HTTP endpoint never forwards it.
if (!$job.resolveOnly) {
    if ($executable) { Start-Process -FilePath $executable -WindowStyle Normal }
    else { Start-Process -FilePath explorer.exe -ArgumentList ('"{0}"' -f $target) -WindowStyle Normal }
}
@{name=$appName; target=$target; launched=(!$job.resolveOnly)} | ConvertTo-Json -Compress
