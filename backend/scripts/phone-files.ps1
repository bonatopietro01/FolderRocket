param([string]$Request)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$job = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Request)) | ConvertFrom-Json
$shell = New-Object -ComObject Shell.Application
function Read-PortableProperty($item, [string]$name) {
    try { return [string]$item.ExtendedProperty($name) } catch { return '' }
}
function PortableFileInfo($item) {
    $extension = (Read-PortableProperty $item 'System.FileExtension').Trim().TrimStart('.').ToLowerInvariant()
    $mimeType = (Read-PortableProperty $item 'System.MIMEType').Trim().ToLowerInvariant()
    $typeLabel = (Read-PortableProperty $item 'System.ItemTypeText').Trim()
    if (-not $extension -and $item.Name -match '\.([A-Za-z0-9]{1,12})$') { $extension = $Matches[1].ToLowerInvariant() }
    $actualName = (Read-PortableProperty $item 'System.FileName').Trim()
    if (-not $actualName) { $actualName = [string]$item.Name }
    if ($extension -and $actualName -notmatch ('\.' + [regex]::Escape($extension) + '$')) { $actualName = "$actualName.$extension" }
    $modifiedAt = ''
    try { $modifiedAt = ([DateTime]$item.ModifyDate).ToUniversalTime().ToString('o') } catch {}
    @{name=$actualName; size=[double]$item.Size; extension=$extension; mimeType=$mimeType; typeLabel=$typeLabel; modifiedAt=$modifiedAt}
}
try {
    $computer = $shell.NameSpace(17)
    $devices = @($computer.Items() | Where-Object { $_.IsFolder -and -not $_.IsFileSystem -and $_.Path -match '(?i)usb#|mtp|wpdbusenum' })
    if ($job.action -eq 'devices') {
        @{devices = @($devices | ForEach-Object { @{id=$_.Path; name=$_.Name} })} | ConvertTo-Json -Depth 8 -Compress
        exit
    }
    $device = $devices | Where-Object { $_.Path -eq $job.deviceId } | Select-Object -First 1
    if (-not $device) { throw 'Phone unavailable. Connect via USB, unlock it and enable File Transfer / Trust this computer.' }
    $folder = $device.GetFolder
    foreach ($segment in @($job.segments)) {
        $item = $folder.Items() | Where-Object { $_.Name -ceq $segment -and $_.IsFolder } | Select-Object -First 1
        if (-not $item) { throw 'This phone folder is no longer accessible.' }
        $folder = $item.GetFolder
    }
    if ($job.action -eq 'recent') {
        $cutoff = [DateTime]::UtcNow.AddHours(-[Math]::Max(0.1,[double]$job.hours))
        $queue = [Collections.Generic.Queue[object]]::new(); $queue.Enqueue(@{folder=$folder;segments=@($job.segments)})
        $recent = [Collections.Generic.List[object]]::new(); $inspected=0; $limit=15000; $counts=@{image=0;file=0}
        $imageExtensions=@('heic','heif','jpg','jpeg','png','gif','webp','dng','tif','tiff','bmp')
        while($queue.Count -gt 0 -and $inspected -lt $limit -and $recent.Count -lt 1200) {
            $current=$queue.Dequeue(); $items=@($current.folder.Items())
            foreach($entry in $items) {
                if($entry.IsFolder){$queue.Enqueue(@{folder=$entry.GetFolder;segments=@($current.segments)+@($entry.Name)});continue}
                $inspected++;$info=PortableFileInfo $entry;$when=[DateTime]::MinValue;try{$when=[DateTime]::Parse($info.modifiedAt).ToUniversalTime()}catch{}
                $isImage=$imageExtensions -contains $info.extension
                if($when -ge $cutoff){if($isImage){$counts.image++}else{$counts.file++}}
                $matchesKind=$job.category -eq 'all' -or ($job.category -eq 'image' -and $isImage) -or ($job.category -eq 'file' -and -not $isImage)
                if($matchesKind -and $when -ge $cutoff){$info.segments=@($current.segments);$recent.Add($info)}
                if($inspected -ge $limit -or $recent.Count -ge 1200){break}
            }
        }
        @{files=@($recent.ToArray()|Sort-Object modifiedAt -Descending);counts=$counts;inspected=$inspected;truncated=($queue.Count -gt 0 -or $recent.Count -ge 1200)}|ConvertTo-Json -Depth 10 -Compress
        exit
    }
    if ($job.action -eq 'copy') {
        $item = $folder.Items() | Where-Object { -not $_.IsFolder -and (PortableFileInfo $_).name -ceq $job.name } | Select-Object -First 1
        if (-not $item) { throw 'The selected phone file is no longer available.' }
        $info = PortableFileInfo $item
        $destination = $shell.NameSpace([string]$job.destination)
        $destination.CopyHere($item, 1556)
        $target = Join-Path $job.destination $info.name
        $stable = 0; $last = -1; $deadline = [DateTime]::UtcNow.AddSeconds(110)
        while ([DateTime]::UtcNow -lt $deadline) {
            Start-Sleep -Milliseconds 500
            if (Test-Path -LiteralPath $target -PathType Leaf) {
                $size = (Get-Item -LiteralPath $target).Length
                if ($size -eq $last) { $stable++ } else { $stable=0; $last=$size }
                if ($stable -ge 4 -and ($item.Size -le 0 -or $size -eq $item.Size)) {
                    try { $stream = [IO.File]::Open($target, 'Open', 'Read', 'None'); $stream.Dispose(); break } catch { $stable=0 }
                }
            }
        }
        if ($stable -lt 4) { throw 'Phone transfer did not finish. Keep the phone unlocked and retry.' }
        @{name=$info.name; path=$target; size=(Get-Item -LiteralPath $target).Length; extension=$info.extension; mimeType=$info.mimeType; typeLabel=$info.typeLabel; modifiedAt=$info.modifiedAt} | ConvertTo-Json -Compress
    } else {
        $items = @($folder.Items())
        @{folders=@($items | Where-Object IsFolder | ForEach-Object { @{name=$_.Name} }); files=@($items | Where-Object { -not $_.IsFolder } | ForEach-Object { PortableFileInfo $_ })} | ConvertTo-Json -Depth 8 -Compress
    }
} finally { if ($shell) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) } }
