# Files to Move to `desktop/` Folder

## Quick Answer

**Move all desktop-specific files** (C# code, XAML, project files, build outputs) to `desktop/`.  
**Keep shared files** (docs, README, workspace files) in root.

---

## Files to Move to `desktop/`

### ✅ Core Application Files

```
desktop/
├── App.config
├── App.xaml
├── App.xaml.cs
├── AppSettings.cs
├── AssemblyInfo.cs
├── MainWindow.xaml
├── MainWindow.xaml.cs
├── PlaylistWindow.xaml
├── PlaylistWindow.xaml.cs
├── SettingsWindow.xaml
├── SettingsWindow.xaml.cs
├── SlideShowBob.ico
├── SlideShowBob.csproj
├── SlideShowBob.csproj.user
└── SlideShowBob.slnx
```

### ✅ Source Code Files

```
desktop/
├── Commands/
│   └── RelayCommand.cs
├── Models/
│   ├── FolderNode.cs
│   └── PlaylistMediaItem.cs
├── Services/          # (if it has files)
├── ViewModels/
│   ├── BaseViewModel.cs
│   ├── MainViewModel.cs
│   ├── PlaylistViewModel.cs
│   └── SettingsViewModel.cs
└── Views/            # (if it has files)
```

### ✅ Business Logic Files

```
desktop/
├── IAppSettingsService.cs
├── MediaItem.cs
├── MediaLoader.cs
├── MediaLoaderService.cs
├── MediaPlaylistManager.cs
├── SettingsManager.cs
├── SettingsManagerWrapper.cs
├── SlideshowController.cs
├── SmoothScrollHelper.cs
├── ThumbnailService.cs
└── VideoPlaybackService.cs
```

### ✅ Build & Output Folders

```
desktop/
├── bin/              # Build outputs
├── obj/              # Build intermediates
└── Properties/
    ├── PublishProfiles/
    ├── Settings.Designer.cs
    └── Settings.settings
```

### ✅ Assets & Resources

```
desktop/
├── Assets/           # Icons, images
│   ├── 128x128.png
│   ├── 16x16.png
│   ├── 256x256.png
│   ├── 32x32.png
│   ├── 512x512.png
│   ├── 64x64.png
│   └── SlideShowBob.ico
└── ffmpeg/           # FFmpeg binaries (desktop-only)
    ├── avcodec-62.dll
    ├── avdevice-62.dll
    ├── avfilter-11.dll
    ├── avformat-62.dll
    ├── avutil-60.dll
    ├── ffmpeg.exe
    ├── ffplay.exe
    ├── ffprobe.exe
    ├── swresample-6.dll
    └── swscale-9.dll
```

### ✅ Build Scripts

```
desktop/
└── build/
    └── publish.ps1
```

### ✅ Desktop-Specific Logs

```
desktop/
└── debug.log
```

---

## Files to Keep in Root

### 📄 Documentation (Shared)

```
(root)/
├── README.md                    # Main README
├── ARCHITECTURE.md              # Architecture docs
├── CRASH_ANALYSIS.md
├── DEPLOYMENT_BEST_PRACTICES.md
├── MAINVIEWMODEL_API_SUMMARY.md
├── MAINVIEWMODEL_DESIGN.md
├── PRODUCT_ANALYSIS_AND_ROADMAP.md
├── ROADMAP_SUMMARY.md
├── VIDEO_PLAYBACK_ANALYSIS.md
├── VIDEO_THUMBNAIL_OPTIONS.md
├── VLC_VS_CURRENT_APPROACH.md
├── WEB_APP_RECOMMENDATION.md
├── WEB_VS_DESKTOP_ANALYSIS.md
├── MIGRATION_SETUP_GUIDE.md
├── QUICK_START_WEB.md
└── MOVE_TO_DESKTOP.md          # This file
```

### 🔧 Workspace & Config Files

```
(root)/
├── .git/                        # Git repository
├── .gitignore
├── SlideShowBob.code-workspace  # Cursor workspace
└── setup-web-app.ps1            # Setup script
```

### 📁 Project Folders (Keep in Root)

```
(root)/
├── desktop/                     # Desktop app (after moving files)
├── web/                         # Web app
└── shared/                      # Shared resources
    ├── docs/                    # Move docs here later (optional)
    ├── assets/                  # Shared assets
    └── scripts/                 # Shared scripts
```

---

## PowerShell Script to Move Files

Here's a script to automate the move:

```powershell
# Move Desktop Files Script
# Run from SlideShowBob root directory

Write-Host "Moving desktop files..." -ForegroundColor Cyan

# Create desktop folder if it doesn't exist
if (-not (Test-Path "desktop")) {
    New-Item -ItemType Directory -Path "desktop" | Out-Null
}

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

# Move files
foreach ($file in $filesToMove) {
    if (Test-Path $file) {
        Move-Item -Path $file -Destination "desktop\" -Force
        Write-Host "  Moved: $file" -ForegroundColor Green
    } else {
        Write-Host "  Not found: $file" -ForegroundColor Yellow
    }
}

# Move folders
foreach ($folder in $foldersToMove) {
    if (Test-Path $folder) {
        Move-Item -Path $folder -Destination "desktop\" -Force
        Write-Host "  Moved folder: $folder" -ForegroundColor Green
    } else {
        Write-Host "  Not found: $folder" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Done! Don't forget to update paths in SlideShowBob.csproj" -ForegroundColor Cyan
```

---

## After Moving: Update Project File

After moving files, you'll need to update `desktop/SlideShowBob.csproj` paths:

### Update Icon Path
```xml
<!-- Change from: -->
<ApplicationIcon>SlideShowBob.ico</ApplicationIcon>

<!-- To: -->
<ApplicationIcon>SlideShowBob.ico</ApplicationIcon>
<!-- (Should still work, but verify) -->
```

### Update Asset Paths
```xml
<!-- Change from: -->
<Resource Include="Assets\128x128.png">

<!-- To: -->
<Resource Include="Assets\128x128.png">
<!-- (Should still work, paths are relative) -->
```

### Update Content Paths
```xml
<!-- Change from: -->
<Content Include="SlideShowBob.ico" />

<!-- To: -->
<Content Include="SlideShowBob.ico" />
<!-- (Should still work) -->
```

**Note:** Since paths in `.csproj` are relative to the project file location, they should work automatically after moving. But test to be sure!

---

## Manual Move Checklist

If you prefer to move manually:

- [ ] Create `desktop/` folder
- [ ] Move all `.cs` files (except in `web/` or `shared/`)
- [ ] Move all `.xaml` files
- [ ] Move all `.csproj` files
- [ ] Move `bin/` folder
- [ ] Move `obj/` folder
- [ ] Move `Properties/` folder
- [ ] Move `Assets/` folder
- [ ] Move `ffmpeg/` folder
- [ ] Move `build/` folder
- [ ] Move `Commands/` folder
- [ ] Move `Models/` folder
- [ ] Move `ViewModels/` folder
- [ ] Move `Services/` folder (if has files)
- [ ] Move `Views/` folder (if has files)
- [ ] Move `debug.log`
- [ ] Test that desktop app still builds: `cd desktop && dotnet build`

---

## Alternative: Don't Move (Simpler)

**You don't have to move files at all!**

You can:
- ✅ Keep desktop files in root
- ✅ Put web app in `web/` folder
- ✅ Both work side-by-side

**Only move if:**
- You want cleaner organization
- You plan to maintain both long-term
- You want separate build outputs

**For now, you can skip moving and just start building the web app!**

---

## Summary

**Move to `desktop/`:**
- All `.cs` files (source code)
- All `.xaml` files (UI)
- All `.csproj` files (project files)
- `bin/`, `obj/` (build outputs)
- `Assets/`, `ffmpeg/` (resources)
- `Properties/`, `Commands/`, `Models/`, `ViewModels/`, etc.

**Keep in root:**
- `README.md` and all `.md` docs
- `.git/`, `.gitignore`
- `SlideShowBob.code-workspace`
- `web/`, `shared/` folders

**Or just don't move anything and start building web app!** 🚀

