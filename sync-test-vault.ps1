param(
    [Parameter(Mandatory = $true)]
    [string] $VaultPath
)

$ErrorActionPreference = "Stop"
$PluginDir = $PSScriptRoot
$PluginId = "files-progress"

function Assert-LastExitCode {
    param([string] $Message)
    if ($LASTEXITCODE -ne 0) { throw $Message }
}

$resolvedVault = (Resolve-Path -LiteralPath $VaultPath).Path
$obsidianDir = Join-Path $resolvedVault ".obsidian"
if (-not (Test-Path -LiteralPath $obsidianDir -PathType Container)) {
    throw "Vault '$resolvedVault' does not contain a .obsidian directory."
}

$pluginsDir = Join-Path $obsidianDir "plugins"
$targetDir = Join-Path $pluginsDir $PluginId
if (Test-Path -LiteralPath $targetDir) {
    $target = Get-Item -LiteralPath $targetDir -Force
    if ($target.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "The target plugin directory is a junction or symlink. Replace it with a normal directory before syncing."
    }
} else {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

Push-Location $PluginDir
try {
    npm run check
    Assert-LastExitCode "Checks failed; the TestVault was not updated."

    $assets = @("main.js", "manifest.json", "styles.css")
    foreach ($asset in $assets) {
        $source = Join-Path $PluginDir $asset
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            throw "Required built asset '$asset' is missing."
        }
        Copy-Item -LiteralPath $source -Destination (Join-Path $targetDir $asset) -Force
    }

    foreach ($asset in $assets) {
        $sourceHash = (Get-FileHash -LiteralPath (Join-Path $PluginDir $asset) -Algorithm SHA256).Hash
        $targetHash = (Get-FileHash -LiteralPath (Join-Path $targetDir $asset) -Algorithm SHA256).Hash
        if ($sourceHash -ne $targetHash) {
            throw "Hash verification failed for '$asset'."
        }
    }

    $sourceManifest = Get-Content (Join-Path $PluginDir "manifest.json") -Raw | ConvertFrom-Json
    $targetManifest = Get-Content (Join-Path $targetDir "manifest.json") -Raw | ConvertFrom-Json
    if ($targetManifest.id -ne $PluginId -or $targetManifest.version -ne $sourceManifest.version) {
        throw "The synced manifest does not match plugin '$PluginId' version '$($sourceManifest.version)'."
    }

    Write-Host "TestVault plugin synchronized and verified." -ForegroundColor Green
    Write-Host "  Vault:   $resolvedVault"
    Write-Host "  Plugin:  $targetDir"
    Write-Host "  Version: $($targetManifest.version)"
    Write-Host "Reload Obsidian or disable and re-enable Files Progress before testing."
} finally {
    Pop-Location
}
