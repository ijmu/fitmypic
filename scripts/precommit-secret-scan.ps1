$ErrorActionPreference = "Stop"

$patterns = @(
  "OPENAI_API_KEY",
  "api[_-]?key\s*[:=]",
  "secret\s*[:=]",
  "password\s*[:=]",
  "private[_-]?key",
  "BEGIN .*PRIVATE KEY",
  "sk-[A-Za-z0-9_-]{20,}",
  "ghp_[A-Za-z0-9_]{20,}",
  "github_pat_[A-Za-z0-9_]{20,}"
)

$files = git diff --cached --name-only --diff-filter=ACM
if (-not $files) {
  exit 0
}

$blocked = @()
foreach ($file in $files) {
  if ($file -eq "scripts/precommit-secret-scan.ps1") {
    continue
  }

  if (-not (Test-Path $file -PathType Leaf)) {
    continue
  }

  foreach ($pattern in $patterns) {
    $matches = Select-String -Path $file -Pattern $pattern -CaseSensitive:$false -ErrorAction SilentlyContinue
    if ($matches) {
      $blocked += "$file matches pattern: $pattern"
    }
  }
}

if ($blocked.Count -gt 0) {
  Write-Host "Commit blocked: possible secret detected." -ForegroundColor Red
  $blocked | Sort-Object -Unique | ForEach-Object { Write-Host " - $_" -ForegroundColor Yellow }
  Write-Host "If this is a false positive, remove it from the staged diff or commit with --no-verify after reviewing carefully." -ForegroundColor Cyan
  exit 1
}
