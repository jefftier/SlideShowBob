# SlideShowBob

A modern, high-performance slideshow application for Windows built with WPF (.NET 8). SlideShowBob displays images, animated GIFs, and videos in a beautiful fullscreen slideshow with smooth transitions, advanced performance optimizations, and an intuitive user interface.

## Features

### Media Support
- **Images**: JPEG, PNG, BMP, TIFF, and other common image formats
- **Animated GIFs**: Full support with optimized async loading and decoding
- **Videos**: MP4 and other formats supported by Windows Media Foundation
- **EXIF Orientation**: Automatically rotates images based on EXIF metadata (90° and 270° rotations)
- **Recursive Folder Scanning**: Automatically scans subdirectories for media files

### Slideshow Features
- **Automatic Playback**: Configurable delay between slides (milliseconds)
- **Manual Navigation**: Previous/Next controls with keyboard shortcuts and mouse clicks
- **Multiple Sort Modes**: 
  - Name (A-Z, Z-A)
  - Date (Oldest First, Newest First)
  - Random
- **Fullscreen Mode**: Immersive viewing experience with F11 toggle
- **Zoom & Pan**: Interactive zoom controls with mouse wheel and smooth scrolling
- **Portrait Blur Effect**: Beautiful blurred background for portrait-oriented images
- **Video Playback**: Full video support with progress tracking and playback controls
- **Playlist Management**: Visual playlist management with thumbnail and list views
- **Video Auto-Advance**: Automatically advances to next item when video ends

### Performance Optimizations
- **Async Loading**: Non-blocking media loading for smooth UI responsiveness
- **Image Caching**: LRU cache (5 items) prevents reloading recently viewed images
- **GIF Optimization**: Optimized async decoding with `DecodePixelWidth` for fast GIF loading
- **Preloading**: Neighbor images preloaded in background for smooth transitions
- **Thread-Safe Operations**: Race condition prevention with locks for smooth transitions
- **Virtual Scrolling**: Efficient thumbnail loading in playlist window (only loads visible items)
- **Video Frame Extraction**: Efficient first/last frame capture using FFmpeg for smooth transitions
- **Memory Management**: Proper disposal of resources and bounded caches

### User Interface
- **Auto-Hiding Toolbar**: Toolbar dims or disappears during inactivity (configurable)
- **Minimized Toolbar**: Compact "notch" mode with essential controls
- **Settings Window**: Comprehensive configuration options with per-setting save controls
- **Playlist Window**: Visual playlist management with multiple view modes:
  - Thumbnail view (with virtual scrolling)
  - List view
  - Detailed view (with file metadata)
- **Keyboard Shortcuts**: Full keyboard navigation support
- **Mouse Navigation**: Click to advance, right-click to go back
- **Smooth Scrolling**: Windows 11-style smooth scrolling with easing animations
- **Dark Title Bar**: Modern dark title bar on Windows 10/11
- **Loading Overlay**: Visual feedback during media loading

### Advanced Features
- **Video Progress Bar**: Visual progress indicator for video playback
- **Video Mute Control**: Toggle audio on/off for videos
- **Video Replay**: Replay current video from beginning
- **Zoom Controls**: 
  - Auto-fit mode (default)
  - Manual zoom with percentage display
  - Mouse wheel zoom (when not in fit mode)
  - Reset zoom button
- **Folder Tree View**: Hierarchical folder navigation in playlist window
- **Thumbnail Generation**: 
  - Fast image thumbnails with aspect ratio preservation
  - Video thumbnails using FFmpeg (first frame extraction)
  - LRU cache (200 items) for thumbnail management
- **Settings Persistence**: Granular control over which settings are saved between sessions

## Requirements

- **.NET 8.0 Runtime** (included in self-contained builds)
- **Windows 10/11** (x64)
- **FFmpeg 7.x** (shared build) - Required for video thumbnail generation
  - See [FFMPEG_SETUP.md](FFMPEG_SETUP.md) for detailed setup instructions
  - **⚠️ IMPORTANT**: FFmpeg 6.x will NOT work - must be version 7.x

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
3. Optionally add multiple folders (they will be combined)
4. Click "Start Slideshow" or press `Space` to begin

### Keyboard Shortcuts

#### Navigation
- `Space` or `→` - Next media / Start slideshow
- `←` - Previous media
- `F11` - Toggle fullscreen
- `Esc` - Exit fullscreen (when in fullscreen mode)

#### Media Controls
- `M` - Toggle mute (for videos)
- `R` - Replay current video

#### Zoom Controls
- `+` / `-` - Zoom in/out (when not in auto-fit mode)
- Mouse wheel - Zoom in/out (when not in auto-fit mode) or scroll (when zoomed)

### Mouse Controls
- **Left Click** on media or empty area - Next media
- **Right Click** on media or empty area - Previous media
- **Mouse Wheel** - 
  - When zoomed: Smooth scroll
  - When in fit mode: Zoom in/out
- **Click and Drag** - Pan when zoomed in

### Settings

Access settings via the Settings button in the toolbar:

#### Slideshow Settings
- **Slide Delay**: Time between slides (milliseconds)
- **Include Videos**: Toggle video inclusion in slideshow
- **Sort Mode**: Choose how files are sorted (Name A-Z, Name Z-A, Date Oldest, Date Newest, Random)
- **Mute Videos**: Enable/disable video audio by default

#### Display Settings
- **Toolbar Behavior**: Control toolbar auto-hide behavior
  - Dim: Toolbar dims after inactivity
  - Disappear: Toolbar hides completely after inactivity
  - Nothing: Toolbar always visible
- **Portrait Blur Effect**: Enable blurred background for portrait images

#### Advanced Settings
- **Use FFmpeg for Playback**: Enable FFmpeg for video processing (thumbnails and future features)

#### Save Options
Control which settings are saved between sessions:
- Save Slide Delay
- Save Include Videos
- Save Sort Mode
- Save Mute Setting
- Save Folder Paths
- Save Portrait Blur Effect

### Playlist Window

The Playlist window provides comprehensive media management:

#### View Modes
- **Thumbnail View**: Grid of thumbnails with virtual scrolling (only loads visible items)
- **List View**: Simple list of file names
- **Detailed View**: List with file metadata (name, type, date, size)

#### Features
- **Folder Tree**: Navigate folders hierarchically
- **Direct Navigation**: Click any item to jump to it in the slideshow
- **Thumbnail Loading**: 
  - Images: Fast thumbnail generation
  - Videos: First frame extraction using FFmpeg (if available)
  - Placeholder: Gray box if thumbnail unavailable
- **Virtual Scrolling**: Efficiently loads only visible thumbnails for large playlists
- **Sorting**: Sort by name, date, or type

### Toolbar

The toolbar provides quick access to essential controls:

#### Expanded Toolbar
- **Previous/Next**: Navigate media
- **Start/Stop**: Control slideshow playback
- **Add Folder**: Add folders to playlist
- **Playlist**: Open playlist window
- **Settings**: Open settings window
- **Zoom Controls**: Zoom in, zoom out, reset zoom
- **Video Controls**: Mute, replay (when video is playing)
- **Fullscreen**: Toggle fullscreen mode
- **Status**: Current position (e.g., "5 / 100")

#### Minimized Toolbar (Notch)
Compact mode showing only:
- Previous/Next buttons
- Play/Pause button
- Expand button

The toolbar automatically minimizes or dims based on inactivity settings.

## Architecture

SlideShowBob uses a clean, service-based architecture with clear separation of concerns:

### Core Services

- **MediaPlaylistManager**: Manages the ordered playlist and navigation
  - File loading from folders
  - Sorting (Name, Date, Random)
  - Index management (next/prev navigation)
  - Bounds checking and validation

- **MediaLoaderService**: Handles async loading and caching of images/GIFs
  - Async background loading
  - LRU cache (5 items)
  - EXIF orientation reading
  - Preloading of neighbor images
  - Optimized GIF decoding

- **VideoPlaybackService**: Manages video playback with smooth transitions
  - Smooth loading sequences
  - Progress tracking
  - State management
  - Last frame capture

- **SlideshowController**: Centralized state machine for slideshow coordination
  - Thread-safe transitions
  - Race condition prevention
  - Timer management
  - Video end handling

- **ThumbnailService**: Generates thumbnails for videos using FFmpeg
  - Video frame extraction
  - Image thumbnail generation
  - LRU cache (200 items)
  - Virtual scrolling support

- **VideoFrameService**: Extracts frames from videos using FFmpeg
  - First frame extraction
  - Frame extraction at specific times

- **SettingsManager**: Handles settings persistence
  - JSON-based storage
  - Per-setting save control

### Data Models

- **MediaItem**: Represents a single media file (image, GIF, or video)
- **PlaylistMediaItem**: UI model for playlist display with thumbnails
- **FolderNode**: Hierarchical folder tree structure
- **AppSettings**: Application settings with save flags

### UI Components

- **MainWindow**: Main slideshow window with media display
- **PlaylistWindow**: Playlist management window with multiple views
- **SettingsWindow**: Settings configuration window

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
  - **⚠️ CRITICAL**: Must be version 7.x (6.x will NOT work)

## Configuration

Settings are stored in `AppSettings.json` located at:
```
%APPDATA%\SlideShowBob\settings.json
```

The application supports:
- Saved settings (persisted between sessions)
- Session-only settings (reset on restart)
- Per-setting save control (granular persistence)

## Troubleshooting

### Video Thumbnails Not Showing
- Ensure FFmpeg 7.x shared build is installed
- Verify FFmpeg DLLs are in the `ffmpeg/` directory (not just .exe files)
- Check that you have the **shared** build (contains .dll files), not the static build
- Verify FFmpeg version is 7.x (not 6.x)
- Check [FFMPEG_SETUP.md](FFMPEG_SETUP.md) for detailed troubleshooting

### Videos Not Playing
- Ensure Windows Media Foundation supports your video format
- Check that video codecs are installed
- Try converting videos to MP4 (H.264)
- Some video formats may not be supported by MediaElement

### Performance Issues
- Large GIFs may take a moment to load (optimized async loading)
- Videos may have a 2-3 second delay before playback starts
- Large playlists may take time to scan initially
- See [VIDEO_PLAYBACK_ANALYSIS.md](VIDEO_PLAYBACK_ANALYSIS.md) for details

### Build Issues
- Ensure you have .NET 8 SDK installed
- Verify FFmpeg files are in the correct location (`ffmpeg/` directory)
- Check that all NuGet packages are restored
- Verify FFmpeg version is 7.x (not 6.x)

### Settings Not Saving
- Check that save flags are enabled in Settings window
- Verify write permissions to `%APPDATA%\SlideShowBob\`
- Settings file location: `%APPDATA%\SlideShowBob\settings.json`

## Project Structure

```
SlideShowBob/
├── MainWindow.xaml/cs          # Main application window
├── PlaylistWindow.xaml/cs      # Playlist management window
├── SettingsWindow.xaml/cs      # Settings configuration window
├── App.xaml.cs                 # Application initialization (FFmpeg setup)
├── MediaItem.cs                # Media file data model
├── MediaPlaylistManager.cs     # Playlist management
├── MediaLoaderService.cs       # Image/GIF loading service
├── VideoPlaybackService.cs     # Video playback service
├── SlideshowController.cs      # Slideshow state machine
├── ThumbnailService.cs         # Video thumbnail generation
├── VideoFrameService.cs        # Video frame extraction
├── SettingsManager.cs          # Settings saving
├── AppSettings.cs              # Settings data model
├── SmoothScrollHelper.cs       # Smooth scrolling utilities
├── Models/                      # Additional data models
│   ├── FolderNode.cs          # Folder tree structure
│   └── PlaylistMediaItem.cs   # Playlist UI model
├── Assets/                      # Application icons
├── ffmpeg/                     # FFmpeg binaries (not in repo)
└── Properties/                 # Project properties
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

### Debugging
- Check Visual Studio Output window for debug messages
- FFmpeg initialization messages appear on startup
- Thumbnail loading status is logged to debug output

## Known Limitations

- Video playback requires Windows Media Foundation supported formats
- FFmpeg 7.x is required (6.x will not work)
- Some video formats may not be supported by MediaElement
- Large media files may take time to load
- Very large playlists (>10,000 items) may have slower initial loading
- Video thumbnails require FFmpeg - placeholders shown if unavailable

## Future Enhancements

See [VIDEO_PLAYBACK_ANALYSIS.md](VIDEO_PLAYBACK_ANALYSIS.md) for planned video playback improvements:
- Instant first frame display using FFmpeg
- Last frame capture when videos end
- Fade transitions between media
- Preloading of next video frames
- Additional video format support

## Technical Details

### Performance Optimizations
1. **GIF Decode Optimization**: `DecodePixelWidth` set to viewport width
2. **Image Caching**: LRU cache prevents reloading recently viewed images
3. **Preloading**: Neighbor images preloaded in background
4. **Async Loading**: All file I/O and decoding happens off UI thread
5. **Video Sequencing**: Operations sequenced to prevent layout thrash
6. **Virtual Scrolling**: Only loads visible thumbnails in playlist
7. **Thread Safety**: Locks prevent race conditions in transitions

### Thread Safety
- **MediaPlaylistManager**: Thread-safe index operations
- **MediaLoaderService**: Thread-safe cache with locks
- **SlideshowController**: Thread-safe transitions with `_transitionLock`
- **VideoPlaybackService**: UI thread operations only (WPF requirement)
- **ThumbnailService**: Thread-safe cache and FFmpeg availability checks

### Memory Management
- Bounded caches (5 items for images, 200 for thumbnails)
- Proper disposal of resources
- Freeze bitmaps for thread safety
- Async loading prevents UI blocking

## License

[Add your license information here]

## Contributing

[Add contribution guidelines here]

## Acknowledgments

- **FFmpeg** project for video processing capabilities
- **WpfAnimatedGif** for GIF support
- **FFMediaToolkit** for .NET FFmpeg integration
- **BtbN's FFmpeg Builds** for reliable shared builds

## Additional Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Detailed architecture documentation
- [FFMPEG_SETUP.md](FFMPEG_SETUP.md) - FFmpeg installation and setup guide
- [VIDEO_PLAYBACK_ANALYSIS.md](VIDEO_PLAYBACK_ANALYSIS.md) - Video playback implementation details
- [VIDEO_THUMBNAIL_OPTIONS.md](VIDEO_THUMBNAIL_OPTIONS.md) - Video thumbnail generation options
- [VLC_VS_CURRENT_APPROACH.md](VLC_VS_CURRENT_APPROACH.md) - Video playback approach comparison
