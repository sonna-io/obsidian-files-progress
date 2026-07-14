# publish.ps1 — safely start an attested Files Progress release.
#
# The script performs local preflight checks, builds once as a sanity check,
# pushes main, and pushes the bare version tag required by Obsidian. The tag
# triggers .github/workflows/release.yml, which rebuilds from the tagged source,
# attests the release assets, and creates the GitHub release.
#
# Prerequisites: gh auth login; a clean, committed main branch; and version
# metadata updated consistently in manifest.json, package.json, and versions.json.

$ErrorActionPreference = "Stop"
$PluginDir = $PSScriptRoot
Set-Location $PluginDir

function Assert-LastExitCode {
    param([string] $Message)

    if ($LASTEXITCODE -ne 0) {
        throw $Message
    }
}

# --- 0. Preconditions -------------------------------------------------------
foreach ($command in @("git", "npm", "gh")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Required command '$command' was not found on PATH."
    }
}

gh auth status *> $null
Assert-LastExitCode "Not logged in to GitHub. Run: gh auth login"

git rev-parse --is-inside-work-tree *> $null
Assert-LastExitCode "publish.ps1 must be run from a Git repository."

$branchOutput = git branch --show-current
Assert-LastExitCode "Could not determine the current Git branch."
$branch = ([string] $branchOutput).Trim()
if ($branch -ne "main") {
    throw "Releases must be published from main; current branch is '$branch'."
}

$changes = @(git status --short --untracked-files=all)
Assert-LastExitCode "Could not inspect the Git working tree."
if ($changes.Count -gt 0) {
    throw "The working tree must be clean before publishing. Commit or stash these changes:`n$($changes -join "`n")"
}

git ls-files --error-unmatch -- ".github/workflows/release.yml" *> $null
Assert-LastExitCode "The release workflow must be committed before publishing."

$manifest = Get-Content "$PluginDir\manifest.json" -Raw | ConvertFrom-Json
$packageJson = Get-Content "$PluginDir\package.json" -Raw | ConvertFrom-Json
$versions = Get-Content "$PluginDir\versions.json" -Raw | ConvertFrom-Json
$version = [string] $manifest.version

if ($version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$') {
    throw "manifest.json version '$version' is not a bare semantic version. Do not prefix release tags with 'v'."
}
if ([string] $packageJson.version -ne $version) {
    throw "package.json version '$($packageJson.version)' does not match manifest.json version '$version'."
}

$versionEntry = $versions.PSObject.Properties |
    Where-Object { $_.Name -eq $version } |
    Select-Object -First 1
if ($null -eq $versionEntry -or [string] $versionEntry.Value -ne [string] $manifest.minAppVersion) {
    throw "versions.json must map '$version' to minAppVersion '$($manifest.minAppVersion)'."
}

git remote get-url origin *> $null
Assert-LastExitCode "An 'origin' Git remote is required before publishing."

$repoJson = gh repo view --json nameWithOwner,visibility,defaultBranchRef,url
Assert-LastExitCode "Could not resolve the GitHub repository from the origin remote."
$repo = $repoJson | ConvertFrom-Json
$repoSlug = [string] $repo.nameWithOwner
if ([string] $repo.visibility -ne "PUBLIC") {
    throw "The Obsidian plugin repository must be public before publishing."
}
if ([string] $repo.defaultBranchRef.name -ne "main") {
    throw "The GitHub repository default branch must be 'main'."
}

$login = (gh api user -q .login).Trim()
Assert-LastExitCode "Could not determine the authenticated GitHub user."

Write-Host "Preparing $($manifest.name) $version for $repoSlug (user: $login)" -ForegroundColor Cyan

# Fetch first so stale or conflicting local state cannot be released.
git fetch origin main --tags
Assert-LastExitCode "Could not fetch origin/main and release tags."

$localHead = (git rev-parse HEAD).Trim()
Assert-LastExitCode "Could not resolve local HEAD."
$remoteHead = (git rev-parse refs/remotes/origin/main).Trim()
Assert-LastExitCode "Could not resolve origin/main."
if ($localHead -ne $remoteHead) {
    $mergeBase = (git merge-base HEAD refs/remotes/origin/main).Trim()
    Assert-LastExitCode "Could not compare local main with origin/main."
    if ($mergeBase -ne $remoteHead) {
        throw "Local main is behind or has diverged from origin/main. Synchronize it before publishing."
    }
}

git show-ref --verify --quiet "refs/tags/$version"
if ($LASTEXITCODE -eq 0) {
    throw "Local tag '$version' already exists. Version tags are immutable; bump the version before publishing."
}
if ($LASTEXITCODE -ne 1) {
    throw "Could not check whether local tag '$version' exists."
}

git ls-remote --exit-code --tags origin "refs/tags/$version" *> $null
if ($LASTEXITCODE -eq 0) {
    throw "Remote tag '$version' already exists. Version tags are immutable; bump the version before publishing."
}
if ($LASTEXITCODE -ne 2) {
    throw "Could not check whether remote tag '$version' exists."
}

gh release view $version --repo $repoSlug *> $null
if ($LASTEXITCODE -eq 0) {
    throw "GitHub release '$version' already exists. Bump the version before publishing."
}

# --- 1. Local build preflight -----------------------------------------------
npm run build
Assert-LastExitCode "Local build failed; no commits or tags were pushed."

$postBuildChanges = @(git status --short --untracked-files=all)
Assert-LastExitCode "Could not inspect the Git working tree after the build."
if ($postBuildChanges.Count -gt 0) {
    throw "The build changed tracked or untracked source files. Review them before publishing:`n$($postBuildChanges -join "`n")"
}

# --- 2. Push source and immutable version tag -------------------------------
git push --set-upstream origin main
Assert-LastExitCode "Could not push main; no release tag was created."

git tag --annotate $version --message "Release $version" HEAD
Assert-LastExitCode "Could not create annotated tag '$version'."

git push origin "refs/tags/$version"
Assert-LastExitCode "Could not push tag '$version'. Inspect local and remote tag state before retrying."

Write-Host "Tag $version pushed. GitHub Actions will now build, attest, and publish the release." -ForegroundColor Cyan

# --- 3. Wait for the release workflow and verify its assets -----------------
$runId = $null
for ($attempt = 0; $attempt -lt 30 -and -not $runId; $attempt++) {
    $runOutput = gh run list `
        --repo $repoSlug `
        --workflow release.yml `
        --event push `
        --commit $localHead `
        --limit 1 `
        --json databaseId `
        --jq '.[0].databaseId' 2>$null

    if ($LASTEXITCODE -eq 0 -and $runOutput) {
        $runId = [string] ($runOutput | Select-Object -First 1)
    } else {
        Start-Sleep -Seconds 2
    }
}

$actionsUrl = "$($repo.url)/actions/workflows/release.yml"
if (-not $runId) {
    throw "Tag '$version' was pushed, but its release workflow was not found within 60 seconds. Check $actionsUrl"
}

gh run watch $runId --repo $repoSlug --exit-status
Assert-LastExitCode "The release workflow failed. Inspect $actionsUrl and rerun the failed workflow after fixing it; do not move the tag."

$releaseJson = gh release view $version --repo $repoSlug --json url,assets
Assert-LastExitCode "The workflow succeeded, but release '$version' could not be read."
$release = $releaseJson | ConvertFrom-Json
$assetNames = @($release.assets | ForEach-Object { $_.name })
foreach ($asset in @("main.js", "manifest.json", "styles.css")) {
    if ($assetNames -notcontains $asset) {
        throw "Release '$version' is missing required asset '$asset'. Inspect $($release.url)"
    }
}

Write-Host "Release $version published with GitHub build-provenance attestations." -ForegroundColor Green
Write-Host "  Release:      $($release.url)"
Write-Host "  Attestations: $($repo.url)/attestations"
Write-Host "  Verify:       gh attestation verify <downloaded-asset> --repo $repoSlug"
Write-Host ""
Write-Host "For the one-time Obsidian directory submission, visit https://community.obsidian.md" -ForegroundColor Cyan
Write-Host "Until approval, users can install via BRAT with: $repoSlug"
