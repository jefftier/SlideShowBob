# FFMPEG Auto-Download Feature

## Overview

The application now offers to automatically download and install FFMPEG if it's not found on the system. This provides a better user experience while keeping the application size small.

## How It Works

1. **On Startup**: The app checks if FFMPEG is available
2. **If Missing**: A dialog appears offering to download and install FFMPEG
3. **User Choice**: User can choose to:
   - Download and install FFMPEG (recommended)
   - Skip (app will work but video features will be limited)
4. **Automatic Installation**: If accepted, FFMPEG is downloaded, extracted, and configured automatically

## Benefits

- ✅ **Smaller EXE**: No need to embed FFMPEG (~50-100MB saved)
- ✅ **Always Latest**: Downloads the latest compatible version
- ✅ **User Control**: User decides when/if to download
- ✅ **Better UX**: Clear dialog with progress indication
- ✅ **No Antivirus Issues**: No self-extracting executable concerns
- ✅ **Easy Updates**: Can update FFMPEG independently

## Implementation Details

### Files Created

1. **`Services/FFmpegDownloadService.cs`**
   - Handles downloading FFMPEG from BtbN's FFmpeg Builds
   - Extracts ZIP file to application directory
   - Verifies installation
   - Reports download progress

2. **`FFmpegDownloadWindow.xaml`** & **`FFmpegDownloadWindow.xaml.cs`**
   - User-friendly dialog for download consent
   - Progress bar and status updates
   - Cancel/retry functionality

3. **Updated `App.xaml.cs`**
   - Checks for FFMPEG on startup
   - Shows download dialog if missing
   - Configures FFMPEG after successful download

### Download Source

- **Primary**: BtbN's FFmpeg Builds (GitHub)
- **URL**: Latest shared build for Windows x64
- **Format**: LGPL shared build (compatible with FFMediaToolkit 4.8.1)
- **Size**: ~50-100 MB

### Installation Location

FFMPEG is installed to:
```
[Application Directory]\ffmpeg\
```

This is the same location the app checks for FFMPEG, so it works seamlessly after installation.

## User Experience

### First Launch (No FFMPEG)

1. App starts normally
2. Dialog appears: "FFMPEG Required"
3. User clicks "Download & Install"
4. Progress bar shows download/extraction progress
5. Installation completes automatically
6. App continues with full functionality

### Subsequent Launches

- FFMPEG is already installed
- No dialog appears
- App starts immediately with full functionality

### If User Skips

- App continues to work
- Video thumbnails use placeholders
- Video playback may be limited
- User can manually install FFMPEG later (just place files in `ffmpeg\` folder)

## Fallback Options

The app still supports:

1. **Manual Installation**: User can manually download FFMPEG and place it in the `ffmpeg\` folder
2. **Existing Installation**: If FFMPEG is already present, it's used automatically
3. **Development**: During development, FFMPEG files in the project folder are used

## Configuration

### Download URL

The download URL can be updated in `Services/FFmpegDownloadService.cs`:

```csharp
private const string FFmpegDownloadUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/...";
```

### Customization

- **Dialog Text**: Edit `FFmpegDownloadWindow.xaml`
- **Download Source**: Modify `FFmpegDownloadService.cs`
- **Installation Path**: Change in `App.xaml.cs` (ConfigureFFmpegPath)

## Error Handling

- **Network Errors**: User-friendly error message, app continues
- **Download Cancellation**: User can cancel, app continues
- **Extraction Errors**: Clear error message with instructions
- **Verification Failures**: Installation is verified before completion

## Security Considerations

- Downloads from official GitHub repository (BtbN's FFmpeg Builds)
- ZIP file is extracted to application directory (user-controlled location)
- No elevated permissions required
- User consent required before download

## Future Enhancements

Possible improvements:
- Check for FFMPEG updates periodically
- Allow user to choose FFMPEG version
- Cache downloaded ZIP for offline installation
- Support for system-wide FFMPEG installation
- Verify download with checksums

