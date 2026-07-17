$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$version = "7.12.0"
$jar = Join-Path $root "tools/openapi-generator-cli-$version.jar"
$spec = Join-Path $root "apps/api/openapi/openapi.json"
$output = Join-Path $root "android/core/api/generated"

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
