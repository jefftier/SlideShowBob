# FFmpeg DLL Location - Exact Paths

## Current Configuration

**Source Location (in project):**
```
C:\Users\LocalJeff\source\repos\SlideShowBob\ffmpeg\
```

**Debug Build Output Location (where DLLs must be at runtime):**
```
C:\Users\LocalJeff\source\repos\SlideShowBob\bin\Debug\net8.0-windows\win-x64\ffmpeg\
```

## What FFMediaToolkit Expects

FFMediaToolkit reads `FFmpegLoader.FFmpegPath` which is set in `App.xaml.cs` to:
```csharp
FFmpegLoader.FFmpegPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ffmpeg");
```

Where `AppDomain.CurrentDomain.BaseDirectory` = `bin\Debug\net8.0-windows\win-x64\`

So FFMediaToolkit looks for DLLs in:
```
[BaseDirectory]\ffmpeg\
= bin\Debug\net8.0-windows\win-x64\ffmpeg\
```

## Required DLLs (FFmpeg 7.x)

The following DLLs **MUST** be present in the `ffmpeg\` folder:

**Core DLLs (Required):**
- `avcodec-70.dll` (or `avcodec-7*.dll` - version 7.x)
- `avformat-70.dll` (or `avformat-7*.dll` - version 7.x)
- `avutil-70.dll` (or `avutil-7*.dll` - version 7.x)
- `swscale-9.dll` (or `swscale-9*.dll`)
- `swresample-5.dll` (or `swresample-5*.dll`)

**Additional DLLs (usually included):**
- `avfilter-10.dll` (or similar)
- `avdevice-70.dll` (or similar)
- `postproc-58.dll` (or similar)
- Plus 20-30+ other DLLs

## Verification Commands

**Check if DLLs are in the right place:**
```powershell
Get-ChildItem "bin\Debug\net8.0-windows\win-x64\ffmpeg" -File | Where-Object { $_.Extension -eq ".dll" } | Select-Object Name
```

**Check FFmpeg version (should be 7.x):**
```powershell
Get-ChildItem "bin\Debug\net8.0-windows\win-x64\ffmpeg\avcodec-*.dll" | Select-Object Name
```

Should show: `avcodec-70.dll` or `avcodec-7*.dll` (NOT `avcodec-62.dll` which is version 6.x)

## Current Issue

You currently have:
- `avcodec-62.dll` (FFmpeg 6.2) ❌
- `avutil-60.dll` (FFmpeg 6.0) ❌

But FFMediaToolkit 4.8.1 requires:
- `avcodec-70.dll` (FFmpeg 7.0) ✅
- `avutil-70.dll` (FFmpeg 7.0) ✅

## Solution

1. Download FFmpeg 7.x shared build from: https://github.com/BtbN/FFmpeg-Builds/releases
   - Look for: `ffmpeg-n7.0-latest-win64-lgpl-shared-7.0.zip` (or similar 7.x version)

2. Extract the ZIP and navigate to the `bin` folder

3. Copy ALL DLLs from `bin` folder to:
   ```
   C:\Users\LocalJeff\source\repos\SlideShowBob\ffmpeg\
   ```

4. Rebuild the project - DLLs will be copied to:
   ```
   C:\Users\LocalJeff\source\repos\SlideShowBob\bin\Debug\net8.0-windows\win-x64\ffmpeg\
   ```

5. Verify the DLLs are there and are version 7.x



