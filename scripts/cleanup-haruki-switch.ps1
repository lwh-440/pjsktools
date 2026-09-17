param(
  [switch]$Execute
)

$ErrorActionPreference = "Stop"
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..")).TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
)

function Resolve-WorkspacePath([string]$RelativePath) {
  $target = [System.IO.Path]::GetFullPath((Join-Path $workspace $RelativePath))
  $prefix = $workspace + [System.IO.Path]::DirectorySeparatorChar
  if (-not $target.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to touch a path outside the workspace: $target"
  }
  return $target
}

$targets = @(
  ".runtime/asset-acceptance-20260917",
  ".runtime/chart-renderer"
)

foreach ($relativePath in $targets) {
  $target = Resolve-WorkspacePath $relativePath
  if (-not (Test-Path -LiteralPath $target)) {
    Write-Host "not present $target"
    continue
  }
  if ($Execute) {
    Remove-Item -LiteralPath $target -Recurse -Force
    Write-Host "removed $target"
  } else {
    Write-Host "[preview] would remove $target"
  }
}

if ($Execute) {
  $self = [System.IO.Path]::GetFullPath($MyInvocation.MyCommand.Path)
  Remove-Item -LiteralPath $self -Force
  Write-Host "removed cleanup script itself: $self"
}
