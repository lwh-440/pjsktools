$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$tempName = ".openapi-check-" + [guid]::NewGuid().ToString("N")
$temp = Join-Path $root $tempName
$spec = Join-Path $temp "openapi.json"
$generated = Join-Path $temp "generated"

function Normalize-GeneratedKotlin([string]$path) {
    $utf8 = [System.Text.UTF8Encoding]::new($false)
    Get-ChildItem -LiteralPath $path -File -Recurse -Filter "*.kt" |
        Where-Object { $_.Name -like "Haruki*.kt" -or $_.Name -in @("AndroidApi.kt", "PlayerBinding.kt", "QqWebHandoffRequest.kt", "AuthResponse.kt", "LoginRequest.kt", "RegisterRequest.kt", "AccountDeletionConfirmRequest.kt", "AccountDeletionIntentRequest.kt", "AccountDeletionIntentResponse.kt", "LegalAcceptanceRequest.kt", "QqAccountDeletionExchangeRequest.kt", "QqAccountDeletionStartResponse.kt", "WebAuthResponse.kt") } |
        ForEach-Object {
        $content = [System.IO.File]::ReadAllText($_.FullName)
        $normalized = [System.Text.RegularExpressions.Regex]::Replace(
            $content,
            "[ `t]+(?=`r?$)",
            "",
            [System.Text.RegularExpressions.RegexOptions]::Multiline
        )
        if ($_.Name -in @("QqWebHandoffRequest.kt", "AccountDeletionConfirmRequest.kt", "AccountDeletionIntentRequest.kt", "AccountDeletionIntentResponse.kt", "LegalAcceptanceRequest.kt", "QqAccountDeletionExchangeRequest.kt", "QqAccountDeletionStartResponse.kt", "WebAuthResponse.kt")) {
            $normalized = $normalized.Replace("`r`n", "`n").Replace("`r", "`n")
            $normalized = $normalized.TrimEnd([char[]]"`r`n") + "`n"
        }
        [System.IO.File]::WriteAllText($_.FullName, $normalized, $utf8)
    }
}

New-Item -ItemType Directory -Path $temp | Out-Null
try {
npm run build -w apps/api
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$env:OPENAPI_OUTPUT = $spec
node apps/api/dist/exportOpenApi.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$env:OPENAPI_OUTPUT = $null
Push-Location $root
try {
    & java -jar (Join-Path $root "tools/openapi-generator-cli-7.12.0.jar") generate -i "$tempName/openapi.json" -g kotlin -c "openapi-generator-config.json" -o "$tempName/generated" --global-property models,apis=Android,supportingFiles=CollectionFormats.kt,modelDocs=false,apiDocs=false,modelTests=false,apiTests=false
} finally {
    Pop-Location
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Normalize-GeneratedKotlin $generated
$currentSpec = [System.IO.File]::ReadAllBytes((Join-Path $root "apps/api/openapi/openapi.json"))
$exportedSpec = [System.IO.File]::ReadAllBytes($spec)
if (-not [System.Linq.Enumerable]::SequenceEqual($currentSpec, $exportedSpec)) { throw "Committed OpenAPI file differs from runtime export." }
$currentRoot = Join-Path $root "android/core/api/generated"
$currentFiles = Get-ChildItem -LiteralPath $currentRoot -File -Recurse | ForEach-Object { $_.FullName.Substring($currentRoot.Length).TrimStart('\') }
$generatedFiles = Get-ChildItem -LiteralPath $generated -File -Recurse | ForEach-Object { $_.FullName.Substring($generated.Length).TrimStart('\') }
$allFiles = @($currentFiles + $generatedFiles | Sort-Object -Unique)
foreach ($relative in $allFiles) {
    $left = Join-Path $currentRoot $relative
    $right = Join-Path $generated $relative
    if (-not (Test-Path -LiteralPath $left) -or -not (Test-Path -LiteralPath $right)) { throw "Generated API file set differs: $relative" }
    if (-not [System.Linq.Enumerable]::SequenceEqual([System.IO.File]::ReadAllBytes($left), [System.IO.File]::ReadAllBytes($right))) { throw "Generated API file differs: $relative" }
}
Write-Host "OpenAPI export and generated Android client are in sync."
} finally {
    $env:OPENAPI_OUTPUT = $null
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
