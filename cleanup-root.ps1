# Cleanup Root Build Artifacts
# Removes leftover bin/ and obj/ folders from root

Write-Host "=== Cleaning Up Root Build Artifacts ===" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "SlideShowBob.csproj") -and -not (Test-Path "desktop\SlideShowBob.csproj")) {
    Write-Host "Error: This script must be run from the SlideShowBob root directory" -ForegroundColor Red
    exit 1
}

$removed = @()

# Remove root bin/ folder
if (Test-Path "bin") {
    Remove-Item -Recurse -Force "bin"
    Write-Host "  ✓ Removed: bin/" -ForegroundColor Green
    $removed += "bin/"
} else {
    Write-Host "  ⊗ Not found: bin/" -ForegroundColor Gray
}

# Remove root obj/ folder
if (Test-Path "obj") {
    Remove-Item -Recurse -Force "obj"
    Write-Host "  ✓ Removed: obj/" -ForegroundColor Green
    $removed += "obj/"
} else {
    Write-Host "  ⊗ Not found: obj/" -ForegroundColor Gray
}

Write-Host ""
if ($removed.Count -gt 0) {
    Write-Host "=== Cleanup Complete ===" -ForegroundColor Green
    Write-Host "Removed $($removed.Count) folder(s) from root" -ForegroundColor White
    Write-Host ""
    Write-Host "Note: Build artifacts should only exist in desktop/bin/ and desktop/obj/" -ForegroundColor Cyan
} else {
    Write-Host "=== Nothing to Clean ===" -ForegroundColor Yellow
    Write-Host "Root is already clean!" -ForegroundColor White
}

Write-Host ""
Write-Host "Next: Verify desktop app builds correctly" -ForegroundColor Cyan
Write-Host "  cd desktop && dotnet build" -ForegroundColor White

