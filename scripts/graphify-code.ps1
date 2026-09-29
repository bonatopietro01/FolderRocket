param()

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$graphifyCommand = Get-Command graphify -ErrorAction SilentlyContinue
$graphifyPath = if ($graphifyCommand) { $graphifyCommand.Source } else { $null }

if (-not $graphifyPath) {
    $uvToolPath = Join-Path $env:USERPROFILE ".local\bin\graphify.exe"
    if (Test-Path -LiteralPath $uvToolPath) { $graphifyPath = $uvToolPath }
}

if (-not $graphifyPath) {
    Write-Host "Graphify non e installato. Installa il pacchetto ufficiale con 'uv tool install graphifyy', poi riprova. Vedi docs/GRAPHIFY.md."
    exit 1
}

Push-Location -LiteralPath $projectRoot
try {
    # Code-only: no semantic extraction of local documents and no AI provider.
    & $graphifyPath extract . --code-only --timing
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    $graphPath = Join-Path $projectRoot "graphify-out\graph.json"
    if (-not (Test-Path -LiteralPath $graphPath)) {
        Write-Host "Graphify non ha generato graph.json. Controlla l'output dell'estrazione."
        exit 1
    }
    & $graphifyPath export html --graph $graphPath
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    $htmlPath = Join-Path $projectRoot "graphify-out\graph.html"
    if (-not (Test-Path -LiteralPath $htmlPath)) {
        Write-Host "Graphify non ha generato graph.html. Prova 'graphify export html --graph graphify-out/graph.json'."
        exit 1
    }
    Write-Host "Grafo pronto: $htmlPath (cartella locale esclusa da Git)."
} finally {
    Pop-Location
}
