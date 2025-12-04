# How to Download FFMPEG 7.x for SlideShowBob

## Problem
The "master-latest" builds from BtbN may still be FFMPEG 6.x. You need FFMPEG 7.0 or higher for FFMediaToolkit 4.8.1.

## Solution Options

### Option 1: Gyan.dev (Recommended - Most Reliable)

1. Go to: **https://www.gyan.dev/ffmpeg/builds/**
2. Download: **ffmpeg-release-essentials-shared.zip** (or latest shared build)
3. Extract the ZIP file
4. Copy **ALL DLLs** from the `bin` folder to your `SlideShowBob\ffmpeg\` folder
5. Replace all existing files
6. Restart the app

**Direct Link (if available):**
- https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials-shared.zip

### Option 2: BtbN FFMPEG 7.0 Specific Build

1. Go to: **https://github.com/BtbN/FFmpeg-Builds/releases**
2. Look for a release with **"n7.0"** or **"7.0"** in the name
3. Download the file: **ffmpeg-n7.0-latest-win64-lgpl-shared-7.0.zip** (or similar)
4. Extract the ZIP file
5. Copy **ALL DLLs** from the `bin` folder to your `SlideShowBob\ffmpeg\` folder
6. Replace all existing files
7. Restart the app

**Example URL format:**
- `https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-YYYY-MM-DD-XX-XX/ffmpeg-n7.0-latest-win64-lgpl-shared-7.0.zip`

### Option 3: Use the App's Download Feature (After Fix)

The app's download feature has been updated to try FFMPEG 7.0 first. If that doesn't work, you can:

1. Delete your `ffmpeg` folder
2. Restart the app
3. Click "Download & Install" when prompted
4. If it still downloads 6.x, use Option 1 or 2 above

## Verification

After installing, verify you have FFMPEG 7.x:

```powershell
Get-ChildItem "ffmpeg" -Filter "avcodec-*.dll" | Select-Object Name
```

Should show: `avcodec-70.dll` or `avcodec-7*.dll` (NOT `avcodec-62.dll`)

## What Files to Copy

From the extracted ZIP's `bin` folder, copy:
- All `.dll` files (especially `avcodec-70.dll`, `avformat-70.dll`, `avutil-70.dll`, etc.)
- You can skip `.exe` files (ffmpeg.exe, ffplay.exe, ffprobe.exe) - they're not needed

## Troubleshooting

If you still get errors after installing FFMPEG 7.x:

1. **Check version**: Make sure DLLs are version 7.x (70+)
2. **Visual C++ Redistributable**: Install the latest from Microsoft
3. **Architecture**: Make sure you downloaded the 64-bit (win64) version
4. **Shared vs Static**: Make sure you downloaded the **shared** build (lgpl-shared), not static

