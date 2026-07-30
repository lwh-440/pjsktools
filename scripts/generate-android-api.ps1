$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$version = "7.12.0"
$jar = Join-Path $root "tools/openapi-generator-cli-$version.jar"
$spec = Join-Path $root "apps/api/openapi/openapi.json"
$output = Join-Path $root "android/core/api/generated"

function Remove-GeneratedTrailingWhitespace([string]$path) {
    $utf8 = [System.Text.UTF8Encoding]::new($false)
    Get-ChildItem -LiteralPath $path -File -Recurse -Filter "*.kt" |
        Where-Object { $_.Name -like "Haruki*.kt" -or $_.Name -in @("AndroidApi.kt", "PlayerBinding.kt") } |
        ForEach-Object {
        $content = [System.IO.File]::ReadAllText($_.FullName)
        $normalized = [System.Text.RegularExpressions.Regex]::Replace(
            $content,
            "[ `t]+(?=`r?$)",
            "",
            [System.Text.RegularExpressions.RegexOptions]::Multiline
        )
        [System.IO.File]::WriteAllText($_.FullName, $normalized, $utf8)
        }
}

if (-not (Test-Path $jar)) {
    throw "Missing $jar. Download OpenAPI Generator CLI $version before regenerating."
}

if (Test-Path $output) { Remove-Item -Recurse -Force $output }
Push-Location $root
try {
    & java -jar $jar generate -i "apps/api/openapi/openapi.json" -g kotlin -c "openapi-generator-config.json" -o "android/core/api/generated" --global-property models,apis=Android,supportingFiles=CollectionFormats.kt,modelDocs=false,apiDocs=false,modelTests=false,apiTests=false
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}
Remove-GeneratedTrailingWhitespace $output
