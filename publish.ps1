# publish.ps1 — one-shot publication of the Files Progress plugin.
#
# Does, in order:
#   1. Builds the plugin (type-check + bundle)
#   2. Creates the public GitHub repo (if missing) and pushes the code
#   3. Creates the GitHub release <version> with main.js / manifest.json / styles.css
#      -> from this moment the plugin is installable via BRAT or manual download
#   4. Opens the Obsidian community portal for the directory submission.
#      NOTE: Obsidian no longer accepts pull requests to obsidianmd/obsidian-releases
#      (the repo's PR-creation policy is collaborators-only). New plugins are
#      submitted through a web form that requires signing in with your Obsidian
#      account and linking your GitHub account — a manual, one-time browser step.
#      See https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin
#
# Prerequisite: gh auth login

$ErrorActionPreference = "Stop"
$PluginDir = $PSScriptRoot
Set-Location $PluginDir

# --- 0. Preconditions -------------------------------------------------------
gh auth status *> $null
if ($LASTEXITCODE -ne 0) { throw "Not logged in to GitHub. Run: gh auth login" }
$login = (gh api user -q .login).Trim()
$manifest = Get-Content "$PluginDir\manifest.json" -Raw | ConvertFrom-Json
$version = $manifest.version
$repoName = "obsidian-files-progress"
$repoSlug = "$login/$repoName"
Write-Host "Publishing $($manifest.name) v$version as $repoSlug (user: $login)" -ForegroundColor Cyan

# --- 1. Build ---------------------------------------------------------------
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

# --- 2. Repo + push ---------------------------------------------------------
$hasOrigin = (git remote) -contains "origin"
if (-not $hasOrigin) {
    gh repo view $repoSlug *> $null
    if ($LASTEXITCODE -eq 0) {
        git remote add origin "https://github.com/$repoSlug.git"
        git push -u origin main
    } else {
        gh repo create $repoSlug --public --source . --push `
            --description "Obsidian plugin: tiny fullness progress bars in the file explorer"
        if ($LASTEXITCODE -ne 0) { throw "Repo creation failed" }
    }
} else {
    git push -u origin main
}

# --- 3. Release (makes the plugin installable via BRAT immediately) ---------
gh release view $version --repo $repoSlug *> $null
if ($LASTEXITCODE -ne 0) {
    $notes = @'
Initial release.

- Tiny progress bar under every markdown file in the file explorer
- Fullness relative to a configurable target character count (default 3600)
- Color shifts red -> yellow -> green with fullness; purple on overflow
- Settings: target count, exclude frontmatter, bar thickness, overflow highlight
- Install now via BRAT: add this repo as a beta plugin
'@
    $notesFile = New-TemporaryFile
    Set-Content $notesFile $notes
    # Tag and title must be the bare version number (no "v" prefix) per Obsidian's rules.
    gh release create $version main.js manifest.json styles.css `
        --repo $repoSlug --title $version --notes-file $notesFile
    if ($LASTEXITCODE -ne 0) { throw "Release creation failed" }
    Remove-Item $notesFile -Force
    Write-Host "Release $version published - plugin is installable via BRAT right now." -ForegroundColor Green
} else {
    Write-Host "Release $version already exists - skipping." -ForegroundColor Yellow
}

# --- 4. Community directory submission (manual web form) --------------------
Write-Host ""
Write-Host "Everything the submission form requires is now published:" -ForegroundColor Green
Write-Host "  - Public repo:            https://github.com/$repoSlug"
Write-Host "  - Release $version with:  main.js, manifest.json, styles.css"
Write-Host "  - README.md and LICENSE present, manifest id 'files-progress'"
Write-Host ""
Write-Host "Final step (browser, one time - Obsidian retired PR submissions):" -ForegroundColor Cyan
Write-Host "  1. Sign in at https://community.obsidian.md with your Obsidian account"
Write-Host "  2. Link your GitHub account ($login) to verify repo ownership"
Write-Host "  3. Plugins -> New plugin -> enter https://github.com/$repoSlug"
Write-Host "  4. Accept the developer policies and Submit"
Write-Host ""
Write-Host "Until approval, users can already install via BRAT with: $repoSlug"
Start-Process "https://community.obsidian.md"
