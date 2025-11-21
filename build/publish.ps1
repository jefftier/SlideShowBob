# build/publish.ps1
param(
    [string]$Runtime = "win-x64",
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Slide Show Bob - Publish Script ===" -ForegroundColor Cyan
Write-Host "Runtime:       $Runtime"
Write-Host "Configuration: $Configuration"
Write-Host ""

$projectPath = "SlideShowBob.csproj"   # <-- adjust if needed
$outDir      = "publish/$Runtime"

if (!(Test-Path $projectPath)) {
    Write-Error "Project file not found at '$projectPath'. Update projectPath in publish.ps1."
    exit 1
}

Write-Host "Restoring..." -ForegroundColor Yellow
dotnet restore $projectPath

Write-Host "Publishing self-contained single-file build..." -ForegroundColor Yellow
dotnet publish $projectPath `
    -c $Configuration `
    -r $Runtime `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:PublishTrimmed=false `
    -o $outDir

Write-Host ""
Write-Host "Publish complete. Output:" -ForegroundColor Green
Write-Host "  $((Resolve-Path $outDir).Path)"
