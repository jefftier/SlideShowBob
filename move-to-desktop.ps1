# Move Desktop Files to desktop/ Folder
# Run from SlideShowBob root directory

Write-Host "=== Moving Desktop Files to desktop/ Folder ===" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "SlideShowBob.csproj")) {
    Write-Host "Error: This script must be run from the SlideShowBob root directory" -ForegroundColor Red
    Write-Host "Current directory: $(Get-Location)" -ForegroundColor Yellow
    exit 1
}

# Create desktop folder if it doesn't exist
if (-not (Test-Path "desktop")) {
    New-Item -ItemType Directory -Path "desktop" | Out-Null
    Write-Host "Created desktop/ folder" -ForegroundColor Green
}

Write-Host "Moving files and folders..." -ForegroundColor Yellow
Write-Host ""

# Files to move
$filesToMove = @(
    "App.config",
    "App.xaml",
    "App.xaml.cs",
    "AppSettings.cs",
    "AssemblyInfo.cs",
    "MainWindow.xaml",
    "MainWindow.xaml.cs",
    "PlaylistWindow.xaml",
    "PlaylistWindow.xaml.cs",
    "SettingsWindow.xaml",
    "SettingsWindow.xaml.cs",
    "SlideShowBob.ico",
    "SlideShowBob.csproj",
    "SlideShowBob.csproj.user",
    "SlideShowBob.slnx",
    "IAppSettingsService.cs",
    "MediaItem.cs",
    "MediaLoader.cs",
    "MediaLoaderService.cs",
    "MediaPlaylistManager.cs",
    "SettingsManager.cs",
    "SettingsManagerWrapper.cs",
    "SlideshowController.cs",
    "SmoothScrollHelper.cs",
    "ThumbnailService.cs",
    "VideoPlaybackService.cs",
    "debug.log"
)

# Folders to move
$foldersToMove = @(
    "Commands",
    "Models",
    "ViewModels",
    "Services",
    "Views",
    "Properties",
    "Assets",
    "ffmpeg",
    "bin",
    "obj",
    "build"
)

$movedCount = 0
$skippedCount = 0

# Move files
foreach ($file in $filesToMove) {
    if (Test-Path $file) {
        $dest = Join-Path "desktop" $file
        if (-not (Test-Path $dest)) {
            Move-Item -Path $file -Destination "desktop\" -Force
            Write-Host "  ✓ Moved: $file" -ForegroundColor Green
            $movedCount++
        } else {
            Write-Host "  ⊗ Skipped (exists): $file" -ForegroundColor Yellow
            $skippedCount++
        }
    } else {
        Write-Host "  ⊗ Not found: $file" -ForegroundColor Gray
    }
}

# Move folders
foreach ($folder in $foldersToMove) {
    if (Test-Path $folder) {
        $dest = Join-Path "desktop" $folder
        if (-not (Test-Path $dest)) {
            Move-Item -Path $folder -Destination "desktop\" -Force
            Write-Host "  ✓ Moved folder: $folder" -ForegroundColor Green
            $movedCount++
        } else {
            Write-Host "  ⊗ Skipped (exists): $folder" -ForegroundColor Yellow
            $skippedCount++
        }
    } else {
        Write-Host "  ⊗ Not found: $folder" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "  Moved: $movedCount items" -ForegroundColor Green
Write-Host "  Skipped: $skippedCount items" -ForegroundColor Yellow
Write-Host ""

# Check if project file exists in desktop
if (Test-Path "desktop\SlideShowBob.csproj") {
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Test build: cd desktop && dotnet build" -ForegroundColor White
    Write-Host "2. Verify paths in desktop/SlideShowBob.csproj (should work automatically)" -ForegroundColor White
    Write-Host "3. Update workspace if needed" -ForegroundColor White
    Write-Host ""
    Write-Host "Note: Paths in .csproj are relative, so they should work automatically!" -ForegroundColor Gray
} else {
    Write-Host "Warning: SlideShowBob.csproj not found in desktop/ folder" -ForegroundColor Red
    Write-Host "You may need to move it manually" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done! Desktop files are now in desktop/ folder" -ForegroundColor Green

