# SlideShowBob

A modern, high-performance slideshow application for Windows built with WPF (.NET 8). SlideShowBob displays images, animated GIFs, and videos in a beautiful fullscreen slideshow with smooth transitions and advanced features.

## Features

### Media Support
- **Images**: JPEG, PNG, BMP, and other common image formats
- **Animated GIFs**: Full support with optimized loading
- **Videos**: MP4 and other formats supported by Windows Media Foundation
- **EXIF Orientation**: Automatically rotates images based on EXIF data

### Slideshow Features
- **Automatic Playback**: Configurable delay between slides
- **Manual Navigation**: Previous/Next controls with keyboard shortcuts
- **Multiple Sort Modes**: Name (A-Z, Z-A), Date, or Random
- **Fullscreen Mode**: Immersive viewing experience
- **Zoom & Pan**: Interactive zoom and pan controls
- **Portrait Blur Effect**: Beautiful blurred background for portrait images
- **Video Playback**: Full video support with progress tracking
- **Playlist Management**: Organize and manage your media files

### Performance Optimizations
- **Async Loading**: Non-blocking media loading for smooth UI
- **Image Caching**: LRU cache prevents reloading recently viewed images
- **GIF Optimization**: Optimized decoding for fast GIF loading
- **Preloading**: Neighbor images preloaded in background
- **Thread-Safe**: Race condition prevention for smooth transitions

### User Interface
- **Auto-Hiding Toolbar**: Toolbar dims or disappears during inactivity
- **Settings Window**: Comprehensive configuration options
- **Playlist Window**: Visual playlist management with thumbnail view
- **Keyboard Shortcuts**: Full keyboard navigation support

## Requirements

- **.NET 8.0 Runtime** (included in self-contained builds)
- **Windows 10/11** (x64)
- **FFmpeg 7.x** (shared build) - Required for video thumbnail generation
  - See [FFMPEG_SETUP.md](FFMPEG_SETUP.md) for detailed setup instructions

## Installation

### Option 1: Pre-built Release
1. Download the latest release from the releases page
2. Extract the archive
3. Run `SlideShowBob.exe`

### Option 2: Build from Source

#### Prerequisites
- Visual Studio 2022 or .NET 8 SDK
- FFmpeg 7.x shared build (see [FFMPEG_SETUP.md](FFMPEG_SETUP.md))

#### Build Steps
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/SlideShowBob.git
   cd SlideShowBob
   ```

2. Set up FFmpeg:
   - Download FFmpeg 7.x shared build from [BtbN's FFmpeg Builds](https://github.com/BtbN/FFmpeg-Builds/releases)
   - Extract and copy all files from the `bin` folder to `SlideShowBob/ffmpeg/`
   - See [FFMPEG_SETUP.md](FFMPEG_SETUP.md) for detailed instructions

3. Build the project:
   ```bash
   dotnet build -c Release
   ```

4. Publish (optional - creates single-file executable):
   ```bash
   dotnet publish -c Release
   ```

The executable will be in `bin/Release/net8.0-windows/win-x64/publish/`

## Usage

### Getting Started
1. Launch `SlideShowBob.exe`
2. Click "Add Folder" to select a folder containing your media files
3. Optionally add multiple folders
4. Click "Start Slideshow" or press `Space` to begin

### Keyboard Shortcuts
- `Space` - Start/Pause slideshow
- `←` / `→` - Previous/Next media
- `F` - Toggle fullscreen
- `+` / `-` - Zoom in/out
- `M` - Toggle mute (for videos)
- `R` - Replay current video
- `Esc` - Exit fullscreen or close application

### Settings
Access settings via the Settings button in the toolbar:
- **Slide Delay**: Time between slides (milliseconds)
- **Include Videos**: Toggle video inclusion in slideshow
- **Sort Mode**: Choose how files are sorted
- **Mute Videos**: Enable/disable video audio
- **Toolbar Behavior**: Control toolbar auto-hide behavior
- **Portrait Blur Effect**: Enable blurred background for portrait images
- **Persistence Options**: Control which settings are saved

### Playlist Window
- Open the Playlist window to see all media files
- Switch between list and thumbnail views
- Navigate directly to any item by clicking it
- Videos show thumbnails when FFmpeg is properly configured

## Architecture

SlideShowBob uses a clean, service-based architecture:

- **MediaPlaylistManager**: Manages the ordered playlist and navigation
- **MediaLoaderService**: Handles async loading and caching of images/GIFs
- **VideoPlaybackService**: Manages video playback with smooth transitions
- **SlideshowController**: Centralized state machine for slideshow coordination
- **ThumbnailService**: Generates thumbnails for videos using FFmpeg

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed architecture documentation.

## Dependencies

### NuGet Packages
- **FFMediaToolkit** (4.8.1) - Video frame extraction and thumbnail generation
- **Microsoft-WindowsAPICodePack-Shell** (1.1.5) - Windows shell integration
- **WpfAnimatedGif** (2.0.2) - Animated GIF support

### External Dependencies
- **FFmpeg 7.x** (shared build) - Required for video thumbnails
  - Must be placed in `ffmpeg/` directory or available in system PATH
  - See [FFMPEG_SETUP.md](FFMPEG_SETUP.md) for setup

## Configuration

Settings are stored in `AppSettings.json` (location varies by installation). The application supports:
- Persistent settings (saved between sessions)
- Session-only settings (reset on restart)
- Per-setting persistence control

## Troubleshooting

### Video Thumbnails Not Showing
- Ensure FFmpeg 7.x shared build is installed
- Verify FFmpeg DLLs are in the `ffmpeg/` directory
- Check [FFMPEG_SETUP.md](FFMPEG_SETUP.md) for detailed troubleshooting

### Videos Not Playing
- Ensure Windows Media Foundation supports your video format
- Check that video codecs are installed
- Try converting videos to MP4 (H.264)

### Performance Issues
- Large GIFs may take a moment to load (optimized async loading)
- Videos may have a 2-3 second delay before playback starts
- See [VIDEO_PLAYBACK_ANALYSIS.md](VIDEO_PLAYBACK_ANALYSIS.md) for details

### Build Issues
- Ensure you have .NET 8 SDK installed
- Verify FFmpeg files are in the correct location
- Check that all NuGet packages are restored

## Project Structure

```
SlideShowBob/
├── MainWindow.xaml/cs          # Main application window
├── PlaylistWindow.xaml/cs      # Playlist management window
├── SettingsWindow.xaml/cs      # Settings configuration window
├── MediaItem.cs                # Media file data model
├── MediaPlaylistManager.cs     # Playlist management
├── MediaLoaderService.cs       # Image/GIF loading service
├── VideoPlaybackService.cs     # Video playback service
├── SlideshowController.cs      # Slideshow state machine
├── ThumbnailService.cs         # Video thumbnail generation
├── VideoFrameService.cs        # Video frame extraction
├── PlaylistService.cs          # Playlist operations
├── SettingsManager.cs          # Settings persistence
├── AppSettings.cs              # Settings data model
├── Models/                      # Additional data models
├── Assets/                      # Application icons
└── ffmpeg/                     # FFmpeg binaries (not in repo)
```

## Development

### Building
```bash
dotnet build
```

### Running
```bash
dotnet run
```

### Publishing
```bash
dotnet publish -c Release
```

The project is configured to create a single-file, self-contained executable for Windows x64.

## Known Limitations

- Video playback requires Windows Media Foundation supported formats
- FFmpeg 7.x is required (6.x will not work)
- Some video formats may not be supported by MediaElement
- Large media files may take time to load

## Future Enhancements

See [VIDEO_PLAYBACK_ANALYSIS.md](VIDEO_PLAYBACK_ANALYSIS.md) for planned video playback improvements:
- Instant first frame display using FFmpeg
- Last frame capture when videos end
- Fade transitions between media
- Preloading of next video frames

## License

[Add your license information here]

## Contributing

[Add contribution guidelines here]

## Acknowledgments

- FFmpeg project for video processing capabilities
- WpfAnimatedGif for GIF support
- FFMediaToolkit for .NET FFmpeg integration




