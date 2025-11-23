# FFmpeg Setup for SlideShowBob

## Overview
SlideShowBob now uses **FFMediaToolkit** (which requires FFmpeg) for efficient video thumbnail generation. This provides much better memory efficiency and performance compared to the previous MediaPlayer-based approach.

**⚠️ IMPORTANT: FFMediaToolkit 4.8.1 requires FFmpeg 7.x (shared build). FFmpeg 6.x will NOT work.**

## FFmpeg Installation Options

### Option 1: System-Wide Installation (Recommended for Development)
1. Download FFmpeg from https://ffmpeg.org/download.html
2. Extract to a location (e.g., `C:\ffmpeg`)
3. Add `C:\ffmpeg\bin` to your system PATH
4. The app will automatically find FFmpeg using the system PATH

### Option 2: Bundle with Application (Recommended for Distribution)

**Recommended Source: BtbN's FFmpeg Builds (Has Shared Builds)**

1. **Download from BtbN's GitHub** (most reliable for shared builds):
   - **Direct link to latest shared build**: https://github.com/BtbN/FFmpeg-Builds/releases/latest
   - Look for a file with **"lgpl-shared"** in the name (NOT "static" or "gpl-shared")
   - **⚠️ CRITICAL: Must be FFmpeg 7.x** - Look for version 7.x in the filename (e.g., `ffmpeg-n7.0-latest-win64-lgpl-shared-7.0.zip`)
   - Example filename: `ffmpeg-n7.0-latest-win64-lgpl-shared-7.0.zip` (version 7.x)
   - **DO NOT use version 6.x** - FFMediaToolkit 4.8.1 requires FFmpeg 7.x
   - **Quick download**: Search the releases page for files containing **"lgpl-shared"** and **"7"** (for version 7.x) and download the `win64` version
   
2. **Alternative: Gyan.dev** (if BtbN doesn't work):
   - Go to: https://www.gyan.dev/ffmpeg/builds/
   - Look for **"release-full-shared"** or **"release-essentials-shared"**
   - The filename should contain the word **"shared"**
   - Avoid any builds labeled "static"

3. **Extract and Copy**:
   - Extract the ZIP file
   - Navigate to the `bin` folder inside the extracted directory
   - **Copy ALL files** from the `bin` folder (both `.exe` AND `.dll` files)
   - Paste them into your application's `ffmpeg` subdirectory:
     ```
     SlideShowBob/
     ├── SlideShowBob.exe
     └── ffmpeg/
         ├── ffmpeg.exe
         ├── ffplay.exe
         ├── ffprobe.exe
         ├── avcodec-*.dll      ← These DLLs are REQUIRED (you should see 20-30+ DLL files)
         ├── avformat-*.dll     ← These DLLs are REQUIRED
         ├── avutil-*.dll       ← These DLLs are REQUIRED
         ├── swscale-*.dll      ← These DLLs are REQUIRED
         ├── swresample-*.dll   ← These DLLs are REQUIRED
         └── [many other DLLs]  ← Include ALL DLLs from the bin folder
     ```

4. The app will automatically detect and use these binaries

**Important**: If the `bin` folder only contains `.exe` files (ffmpeg.exe, ffplay.exe, ffprobe.exe) and NO `.dll` files, you downloaded the wrong build. You MUST download a build that says **"shared"** in the filename.

### Option 3: Chocolatey (Windows)
```powershell
choco install ffmpeg -y
```

## Required FFmpeg Files
For thumbnail generation, you need:
- `avcodec-*.dll`
- `avformat-*.dll`
- `avutil-*.dll`
- `swscale-*.dll`
- `swresample-*.dll` (optional but recommended)

## Verification

### Step 1: Check if you have the correct files
Run this PowerShell command in your project directory:
```powershell
Get-ChildItem "ffmpeg" -File | Where-Object { $_.Extension -eq ".dll" } | Measure-Object | Select-Object Count
```

**Expected result**: You should see `Count: 7` or more. If you see `Count: 0`, you have the wrong build type.

**What you should see:**
- ✅ **Correct (Shared Build)**: Multiple `.dll` files (avcodec, avformat, avutil, swscale, swresample, etc.) + 3 `.exe` files
- ❌ **Wrong (Static Build)**: Only 3 `.exe` files, NO `.dll` files

### Step 2: Test FFmpeg from command line (Optional)
You can verify FFmpeg works by running:
```powershell
.\ffmpeg\ffmpeg.exe -version
```

You should see version information. If you get an error about missing DLLs, the build might be incomplete.

### Step 3: Test in SlideShowBob
1. **Build and run** your application
2. **Open the Playlist window** (if not already open)
3. **Switch to Thumbnail view** (click the "Thumbnail" button)
4. **Select a folder** that contains video files (`.mp4` files)
5. **Watch the Visual Studio Output window** (Debug → Windows → Output) or check the Debug console

**What to look for:**
- ✅ **Working**: You'll see video thumbnails appear (actual frames from videos, not gray placeholders)
- ✅ **Working**: In the debug output, you should see messages like:
  - `FFmpeg found at: [path]` (on startup)
  - `Loaded thumbnail for: [video filename]` (when thumbnails load)
- ❌ **Not working**: You'll see gray placeholder boxes for videos
- ❌ **Not working**: Debug messages like:
  - `FFmpeg not available, using placeholder for: [filename]`
  - `FFmpeg DirectoryNotFoundException`

### Step 4: Verify DLLs are in the right location

**EXACT LOCATION REQUIRED:**

The FFmpeg DLLs **MUST** be in this exact location relative to your project root:

```
SlideShowBob/
└── ffmpeg/                    ← Source location (in project root)
    ├── avcodec-*.dll
    ├── avformat-*.dll
    ├── avutil-*.dll
    └── [other DLLs]
```

When you build, they will be copied to:

```
bin\Debug\net8.0-windows\win-x64\ffmpeg\    ← Debug build output location
```

**Absolute path for Debug builds:**
```
C:\Users\LocalJeff\source\repos\SlideShowBob\bin\Debug\net8.0-windows\win-x64\ffmpeg\
```

**What FFMediaToolkit looks for:**
- FFMediaToolkit reads `FFmpegLoader.FFmpegPath` which we set to: `[BaseDirectory]\ffmpeg`
- `BaseDirectory` = `bin\Debug\net8.0-windows\win-x64\` (for Debug builds)
- So it looks in: `bin\Debug\net8.0-windows\win-x64\ffmpeg\`

**To verify the location:**
1. Build your project
2. Check that `bin\Debug\net8.0-windows\win-x64\ffmpeg\` exists
3. Verify it contains DLL files (not just .exe files)
4. The DLLs should have version 7.x in their names (e.g., `avcodec-70.dll`, `avutil-70.dll`)

**If DLLs are missing from output directory:**
- The project file (`SlideShowBob.csproj`) should automatically copy the `ffmpeg` folder
- If not, manually copy `ffmpeg\` folder to `bin\Debug\net8.0-windows\win-x64\`

The app will automatically detect FFmpeg. If FFmpeg is not found, video thumbnails will fall back to placeholder images.

## Benefits
- **Memory Efficient**: Only loads the specific frame needed (~200KB vs full video decode)
- **Fast**: Direct frame extraction without loading entire video
- **Background Processing**: Can run on background threads (no UI thread dependency)
- **Wide Format Support**: Supports virtually all video formats

## Troubleshooting

### "No DLLs found" or "FFmpeg not available"
If you only see `.exe` files (ffmpeg.exe, ffplay.exe, ffprobe.exe) but no `.dll` files:
- **Problem**: You downloaded the "static" build instead of the "shared" build
- **Solution**: 
  1. Try **BtbN's builds** first: https://github.com/BtbN/FFmpeg-Builds/releases
     - Look for files with **"shared"** in the name (e.g., `ffmpeg-*-win64-lgpl-shared-*.zip`)
     - **⚠️ MUST be version 7.x** - Look for "7" in the filename
  2. If that doesn't work, try **Gyan.dev**: https://www.gyan.dev/ffmpeg/builds/
     - Look for **"release-full-shared"** or **"release-essentials-shared"**
     - **⚠️ MUST be version 7.x**
  3. The shared build will have **20-30+ `.dll` files** in the `bin` folder
  4. Make sure you're looking in the `bin` folder inside the extracted ZIP, not the root folder

### "Required FFmpeg version: 7.x" error
If you see this error in the debug output:
- **Problem**: You have FFmpeg 6.x, but FFMediaToolkit 4.8.1 requires FFmpeg 7.x
- **Solution**:
  1. Download FFmpeg 7.x shared build from BtbN's GitHub
  2. Look for files with **"7"** in the version number (e.g., `ffmpeg-n7.0-latest-win64-lgpl-shared-7.0.zip`)
  3. Extract and copy ALL DLLs from the `bin` folder to your `ffmpeg\` directory
  4. Delete old FFmpeg 6.x DLLs first
  5. Rebuild the project
  6. Verify DLLs are in: `bin\Debug\net8.0-windows\win-x64\ffmpeg\`

### Other Issues
If video thumbnails aren't working:
1. Verify FFmpeg is installed and accessible
2. Check that FFmpeg DLLs are in the correct location (should be in `ffmpeg/` subdirectory next to your .exe)
3. Ensure the app has read permissions to FFmpeg files
4. Check application logs for FFmpeg-related errors
5. Make sure you copied ALL files from the `bin` folder, not just the .exe files

