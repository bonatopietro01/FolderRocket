param([Parameter(Mandatory=$true)][string]$Request)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$job = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Request)) | ConvertFrom-Json

function Get-ApplicationIconDataUrl([string]$IconLocation, [string]$TargetPath) {
    $icon = $null
    $sourceImage = $null
    $bitmap = $null
    $graphics = $null
    $stream = $null
    try {
        Add-Type -AssemblyName System.Drawing -ErrorAction Stop
        $iconPath = [Environment]::ExpandEnvironmentVariables(([string]$IconLocation).Trim().Trim('"'))
        if ($iconPath -match '^(.*),\s*-?\d+$') { $iconPath = $matches[1].Trim().Trim('"') }
        if ($iconPath -and (Test-Path -LiteralPath $iconPath -PathType Leaf)) {
            $extension = [IO.Path]::GetExtension($iconPath)
            if ($extension -match '^\.(png|jpe?g|bmp)$') {
                $sourceImage = [System.Drawing.Image]::FromFile($iconPath)
            } elseif ($extension -ieq '.ico') {
                $icon = New-Object System.Drawing.Icon($iconPath, 40, 40)
            } else {
                $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($iconPath)
            }
        }
        $target = [Environment]::ExpandEnvironmentVariables(([string]$TargetPath).Trim().Trim('"'))
        if (!$icon -and $target -and [IO.Path]::GetExtension($target) -ieq '.exe' -and (Test-Path -LiteralPath $target -PathType Leaf)) {
            $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($target)
        }
        if (!$icon -and !$sourceImage) { return $null }

        $bitmap = New-Object System.Drawing.Bitmap(40, 40)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.Clear([System.Drawing.Color]::Transparent)
        if ($sourceImage) { $graphics.DrawImage($sourceImage, 0, 0, 40, 40) }
        else { $graphics.DrawIcon($icon, 0, 0) }
        $stream = New-Object IO.MemoryStream
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        return 'data:image/png;base64,' + [Convert]::ToBase64String($stream.ToArray())
    } catch {
        return $null
    } finally {
        if ($stream) { $stream.Dispose() }
        if ($graphics) { $graphics.Dispose() }
        if ($bitmap) { $bitmap.Dispose() }
        if ($sourceImage) { $sourceImage.Dispose() }
        if ($icon) { $icon.Dispose() }
    }
}

function Get-PackagedApplicationIconPath([string]$AppId, $PackageLookup) {
    try {
        $parts = $AppId.Split('!', 2)
        if ($parts.Count -ne 2) { return $null }
        $package = $PackageLookup[$parts[0]]
        if (!$package -or !$package.InstallLocation) { return $null }
        $manifestPath = Join-Path $package.InstallLocation 'AppxManifest.xml'
        if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) { return $null }
        [xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
        $application = $manifest.SelectNodes("//*[local-name()='Application']") | Where-Object { $_.GetAttribute('Id') -eq $parts[1] } | Select-Object -First 1
        if (!$application) { return $null }
        $visualElements = $application.SelectSingleNode("./*[local-name()='VisualElements']")
        if (!$visualElements) { return $null }

        foreach ($attributeName in @('Square44x44Logo', 'Square30x30Logo', 'Square150x150Logo', 'Logo', 'SmallLogo', 'StoreLogo')) {
            $attribute = $visualElements.Attributes | Where-Object { $_.LocalName -eq $attributeName } | Select-Object -First 1
            if (!$attribute -or $attribute.Value -match '^ms-resource:') { continue }
            $relativePath = [Environment]::ExpandEnvironmentVariables($attribute.Value)
            $candidate = Join-Path $package.InstallLocation $relativePath
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
            $directory = Join-Path $package.InstallLocation (Split-Path $relativePath -Parent)
            $basename = [IO.Path]::GetFileNameWithoutExtension($relativePath)
            if (Test-Path -LiteralPath $directory -PathType Container) {
                $variant = Get-ChildItem -LiteralPath $directory -Filter "$basename*.png" -File -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($variant) { return $variant.FullName }
            }
        }
    } catch { }
    return $null
}

if ($job.list -eq $true) {
    $shortcutLookup = @{}
    $packageLookup = @{}
    try {
        $shell = New-Object -ComObject WScript.Shell
        $shortcutRoots = @(
            (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),
            (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs')
        )
        foreach ($root in $shortcutRoots) {
            if (!(Test-Path -LiteralPath $root -PathType Container)) { continue }
            foreach ($shortcutFile in Get-ChildItem -LiteralPath $root -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue) {
                try {
                    $shortcut = $shell.CreateShortcut($shortcutFile.FullName)
                    $shortcutLookup[[IO.Path]::GetFileNameWithoutExtension($shortcutFile.Name)] = @{
                        iconLocation = [string]$shortcut.IconLocation
                        targetPath = [string]$shortcut.TargetPath
                    }
                } catch { }
            }
        }
    } catch { }
    try {
        foreach ($package in Get-AppxPackage -ErrorAction Stop) {
            if ($package.PackageFamilyName) { $packageLookup[[string]$package.PackageFamilyName] = $package }
        }
    } catch { }

    $applications = @(Get-StartApps | Where-Object { $_.Name -and $_.AppID } | Group-Object AppID | ForEach-Object {
        $name = [string]$_.Group[0].Name
        $application = [ordered]@{name=$name; appId=[string]$_.Name}
        $shortcut = $shortcutLookup[$name]
        $packageIconPath = Get-PackagedApplicationIconPath ([string]$application.appId) $packageLookup
        $iconLocation = if ($packageIconPath) { $packageIconPath } elseif ($shortcut) { [string]$shortcut.iconLocation } else { '' }
        $targetPath = if ($shortcut) { [string]$shortcut.targetPath } else { '' }
        $iconDataUrl = Get-ApplicationIconDataUrl $iconLocation $targetPath
        if ($iconDataUrl) { $application['iconDataUrl'] = $iconDataUrl }
        $application
    } | Sort-Object name)
    @{applications=$applications; source='Windows Start menu'} | ConvertTo-Json -Depth 3 -Compress
    exit 0
}
$requestedAppId = ([string]$job.appId).Trim()
if ($requestedAppId) {
    if ($requestedAppId.Length -gt 512) { throw 'Invalid application identifier.' }
    $match = @(Get-StartApps | Where-Object { $_.AppID -ceq $requestedAppId })
    if ($match.Count -ne 1) { throw 'This application is no longer available in the Windows Start menu. Refresh the catalog.' }
    Start-Process -FilePath explorer.exe -ArgumentList ('shell:AppsFolder\{0}' -f $match[0].AppID) -WindowStyle Normal
    @{name=[string]$match[0].Name; appId=$requestedAppId; launched=$true} | ConvertTo-Json -Compress
    exit 0
}
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
