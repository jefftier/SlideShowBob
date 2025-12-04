# FFMPEG Path Diagnostics

When you get a `DllNotFoundException`, the app is looking for FFMPEG DLLs in a specific path. Here's how to check what path it's using:

## Quick Check

1. **Open Settings** in the app
2. Look at the **FFMPEG Status** - it will now show the path being checked
3. Check the **Debug Output** (Visual Studio Output window) for detailed path information

## Paths Being Checked

The app checks FFMPEG in this order:

1. **Configured Path**: `FFmpegLoader.FFmpegPath` (set by the app)
2. **Expected Path**: `[AppDirectory]\ffmpeg\`
   - Where `AppDirectory` = `AppDomain.CurrentDomain.BaseDirectory`

## For Published Apps (Single-File)

When published as a single-file EXE:
- `AppDomain.CurrentDomain.BaseDirectory` = **Directory containing the EXE**
- FFMPEG should be in: `[EXE Directory]\ffmpeg\`

Example:
```
C:\MyApp\SlideShowBob.exe
C:\MyApp\ffmpeg\avcodec-62.dll
C:\MyApp\ffmpeg\avformat-62.dll
... (all other DLLs)
```

## For Debug Builds

When running from Visual Studio:
- `AppDomain.CurrentDomain.BaseDirectory` = `bin\Debug\net8.0-windows\win-x64\`
- FFMPEG should be in: `bin\Debug\net8.0-windows\win-x64\ffmpeg\`

## Debug Output

When FFMPEG fails, check the debug output for:
```
[ThumbnailService] FFmpeg DllNotFoundException: ...
[ThumbnailService] AppDomain.CurrentDomain.BaseDirectory = ...
[ThumbnailService] Expected FFMPEG path = ...
[ThumbnailService] FFmpegLoader.FFmpegPath = ...
[ThumbnailService] Directory exists: True/False
[ThumbnailService] DLLs found in path: X
```

## Common Issues

1. **Path Mismatch**: FFMPEG is in a different location than expected
2. **Missing DLLs**: Some DLLs are missing (need all FFMPEG DLLs, not just avcodec)
3. **Dependencies**: Missing Visual C++ Redistributable
4. **Architecture Mismatch**: Wrong architecture (need 64-bit for win-x64)

## Fix

1. Check the path shown in Settings → FFMPEG Status
2. Verify FFMPEG DLLs are in that exact path
3. Make sure ALL DLLs are present (not just a few)
4. Check debug output for the exact error

