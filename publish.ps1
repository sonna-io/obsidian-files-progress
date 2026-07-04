# publish.ps1 — one-shot publication of the Files Progress plugin.
#
# Does, in order:
#   1. Builds the plugin (type-check + bundle)
#   2. Creates the public GitHub repo (if missing) and pushes the code
#   3. Creates the GitHub release <version> with main.js / manifest.json / styles.css
#      -> from this moment the plugin is installable via BRAT or manual download
#   4. Forks obsidianmd/obsidian-releases, appends the plugin to community-plugins.json
#      and opens the submission PR (official listing then awaits Obsidian's review)
#
# Prerequisite: gh auth login (scopes: repo, workflow is not needed)

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

# --- 4. Submission PR to obsidianmd/obsidian-releases -----------------------
$existing = gh pr list --repo obsidianmd/obsidian-releases --author $login `
    --search "Files Progress" --state open --json number -q ".[0].number" 2>$null
if ($existing) {
    Write-Host "Submission PR #$existing already open - nothing to do." -ForegroundColor Yellow
    exit 0
}

gh repo fork obsidianmd/obsidian-releases --remote=false 2>&1 | Out-Null
gh repo sync "$login/obsidian-releases" --source obsidianmd/obsidian-releases 2>&1 | Out-Null

$work = Join-Path ([IO.Path]::GetTempPath()) "obsidian-releases-$(Get-Random)"
git clone --depth 1 "https://github.com/$login/obsidian-releases.git" $work
Set-Location $work
$branch = "add-plugin-files-progress"
git checkout -b $branch

# Append the entry with minimal-diff string surgery (no full-file reformat).
$env:OFP_REPO = $repoSlug
node -e @'
const fs = require("fs");
const p = "community-plugins.json";
const raw = fs.readFileSync(p, "utf8");
const arr = JSON.parse(raw);
if (arr.some(e => e.id === "files-progress")) { console.log("entry already present"); process.exit(0); }
const entryIndent = (raw.match(/\n([\t ]+)\{/) || [,"\t"])[1];
const propIndent = (raw.match(/\n([\t ]+)"id"/) || [,"\t\t"])[1];
const fields = [
  ["id", "files-progress"],
  ["name", "Files Progress"],
  ["author", "Walter"],
  ["description", "Tiny progress bars in the file explorer showing how full each note is, relative to a target character count."],
  ["repo", process.env.OFP_REPO],
];
const body = fields.map(([k, v]) => `${propIndent}${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n");
const entry = `,\n${entryIndent}{\n${body}\n${entryIndent}}`;
const closing = raw.lastIndexOf("]");
const before = raw.slice(0, closing).replace(/\s+$/, "");
fs.writeFileSync(p, `${before}${entry}\n]\n`);
console.log("entry appended");
'@
if ($LASTEXITCODE -ne 0) { throw "Failed to update community-plugins.json" }

git add community-plugins.json
git commit -m "Add plugin: Files Progress" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin $branch

$prBody = @"
# I am submitting a new Community Plugin

## Repo URL

Link to my plugin: https://github.com/$repoSlug

## Release Checklist
- [x] I have tested the plugin on
  - [x]  Windows
  - [ ]  macOS
  - [ ]  Linux
  - [ ]  Android _(if applicable)_
  - [ ]  iOS _(if applicable)_
- [x] My GitHub release contains all required files
  - [x] ``main.js``
  - [x] ``manifest.json``
  - [x] ``styles.css`` _(optional)_
- [x] GitHub release name matches the exact version number specified in my manifest.json (_**Note:** Use the exact version number, don't include a prefix ``v``_)
- [x] The ``id`` in my ``manifest.json`` matches the ``id`` in the ``community-plugins.json`` file.
- [x] My README.md describes the plugin's purpose and provides clear usage instructions.
- [x] I have read the developer policies at https://docs.obsidian.md/Developer+policies, and have assessed my plugin's adherence to these policies.
- [x] I have read the tips in https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines and have self-reviewed my plugin to comply with these guidelines.
- [x] I have added a license in the ``LICENSE`` file.
- [x] My project respects and is compatible with the original license of any code from other plugins that I'm using.
  I have given proper attribution to these other projects in my ``README.md``.
"@

$prBodyFile = New-TemporaryFile
Set-Content $prBodyFile $prBody
$prUrl = gh pr create --repo obsidianmd/obsidian-releases `
    --title "Add plugin: Files Progress" `
    --body-file $prBodyFile `
    --head "${login}:$branch"
Remove-Item $prBodyFile -Force
Set-Location $PluginDir

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "  Repo:     https://github.com/$repoSlug"
Write-Host "  Release:  https://github.com/$repoSlug/releases/tag/$version  (BRAT-installable NOW)"
Write-Host "  Sub. PR:  $prUrl  (awaits Obsidian team review)"
