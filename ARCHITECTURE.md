# SlideShowBob - Refactored Architecture

## Overview

The slideshow application has been refactored from a monolithic `MainWindow.xaml.cs` into a clean, service-based architecture. This document explains the new structure and how components interact.

## Architecture Components

### 1. MediaItem (`MediaItem.cs`)
A simple data model representing a single media file (image, GIF, or video).
- **Properties**: `FilePath`, `Type`, `FileName`
- **Purpose**: Type-safe representation of media items

### 2. MediaPlaylistManager (`MediaPlaylistManager.cs`)
Manages the ordered playlist of media items and navigation.
- **Responsibilities**:
  - Loading files from folders
  - Sorting (Name A-Z, Z-A, Date, Random)
  - Index management (next/prev navigation)
  - Bounds checking and validation
- **Key Methods**:
  - `LoadFiles()` - Loads files from folders
  - `Sort()` - Sorts the playlist
  - `MoveNext()` / `MovePrevious()` - Navigation
  - `SetIndex()` - Sets current index with validation

### 3. MediaLoaderService (`MediaLoaderService.cs`)
Handles async loading and caching of images and GIFs with performance optimizations.
- **Optimizations**:
  - **GIF Loading**: Async background loading with `DecodePixelWidth` optimization
  - **Image Caching**: Small LRU cache (5 items) to avoid reloading
  - **EXIF Orientation**: Reads and caches EXIF rotation metadata
  - **Preloading**: Preloads neighbor images for smooth transitions
- **Key Methods**:
  - `LoadImageAsync()` - Async image loading with caching
  - `LoadGifAsync()` - Async GIF loading with optimized decode size
  - `PreloadNeighbors()` - Preloads adjacent images

### 4. VideoPlaybackService (`VideoPlaybackService.cs`)
Manages video playback with smooth transitions and prevents stutter.
- **Optimizations**:
  - **Smooth Loading**: Sequences Source → Visibility → Play to prevent stutter
  - **Progress Tracking**: Handles video progress bar updates
  - **State Management**: Tracks playing state and handles events
- **Key Methods**:
  - `LoadVideo()` - Loads and starts video with smooth transition
  - `Stop()` - Stops and cleans up video
  - `Replay()` - Replays current video
  - `SeekTo()` - Seeks to specific position

### 5. SlideshowController (`SlideshowController.cs`)
Centralized state machine that coordinates slideshow transitions and prevents race conditions.
- **State Management**:
  - Thread-safe transitions using locks
  - Prevents multiple simultaneous transitions
  - Coordinates timer ticks, user navigation, and video end events
- **Key Features**:
  - **Race Condition Prevention**: Uses `_transitionLock` to ensure only one transition at a time
  - **Video Handling**: Waits for videos to end before advancing
  - **Timer Management**: Handles slide timer logic
- **Key Methods**:
  - `Start()` / `Stop()` - Controls slideshow
  - `NavigateNext()` / `NavigatePrevious()` - Thread-safe navigation
  - `OnMediaDisplayed()` - Called when media starts showing
  - `OnVideoEnded()` - Called when video ends

## How Components Interact

```
User Action / Timer Tick
    ↓
SlideshowController (state machine)
    ↓
MediaPlaylistManager (get next item)
    ↓
MainWindow.ShowCurrentMediaAsync()
    ↓
    ├─→ MediaLoaderService (for images/GIFs)
    │   └─→ Loads async, applies caching, EXIF rotation
    │
    └─→ VideoPlaybackService (for videos)
        └─→ Loads video, handles events, updates progress
    ↓
SlideshowController.OnMediaDisplayed()
    ↓
SlideshowController.OnTransitionComplete()
```

## Key Improvements

### 1. Fixed Slow GIF Loading
- **Before**: GIFs loaded synchronously on UI thread with `EndInit()`
- **After**: Async loading on background thread with `DecodePixelWidth` optimization
- **Result**: GIFs load much faster, especially large ones

### 2. Fixed Video Stutter
- **Before**: `Source`, `Visibility`, and `Play()` called in quick succession on UI thread
- **After**: Sequenced operations with `DispatcherPriority.Loaded` to allow layout pass
- **Result**: Smooth video transitions without visual hiccups

### 3. Fixed "Same Video Repeating" Bug
- **Before**: Race conditions between timer ticks, manual navigation, and video end events
- **After**: Centralized state machine with thread-safe transitions
- **Result**: Index updates exactly once per transition, no duplicate plays

### 4. Better Memory Management
- **Before**: Unbounded cache, synchronous loading blocking UI
- **After**: Small LRU cache (5 items), async loading, proper disposal
- **Result**: Lower memory usage, smoother UI

## State Flow

### Slideshow States
1. **Idle** - No slideshow running
2. **LoadingMedia** - Transitioning to new media (protected by lock)
3. **ShowingImage** - Displaying image/GIF
4. **PlayingVideo** - Video is playing

### Transition Rules
- Only one transition can happen at a time (enforced by `_transitionLock`)
- Timer ticks check if enough time has passed AND video has ended (if video)
- User navigation immediately triggers transition (if not already transitioning)
- Video end events trigger auto-advance (if slideshow is running)

## Thread Safety

- **MediaPlaylistManager**: Thread-safe index operations
- **MediaLoaderService**: Thread-safe cache with locks
- **SlideshowController**: Thread-safe transitions with `_transitionLock`
- **VideoPlaybackService**: UI thread operations only (WPF requirement)

## Performance Optimizations

1. **GIF Decode Optimization**: `DecodePixelWidth` set to viewport width
2. **Image Caching**: LRU cache prevents reloading recently viewed images
3. **Preloading**: Neighbor images preloaded in background
4. **Async Loading**: All file I/O and decoding happens off UI thread
5. **Video Sequencing**: Operations sequenced to prevent layout thrash

## Migration Notes

- Old variables removed: `_allFiles`, `_orderedFiles`, `_currentIndex`, `_currentMediaType`, `_slideTimer`, `_videoProgressTimer`
- Old methods removed: `GetOrLoadImage()`, `SlideTimer_Tick()`, `VideoProgressTimer_Tick()`, `VideoElement_MediaEnded()`, `VideoElement_MediaOpened()`
- New services initialized in `MainWindow` constructor
- Event handlers wired up for service events

## Testing Recommendations

1. **GIF Loading**: Test with large GIFs (>10MB) - should load quickly
2. **Video Transitions**: Test rapid navigation between videos - should be smooth
3. **Race Conditions**: Rapidly click next/prev while slideshow is running - should not duplicate
4. **Memory**: Run slideshow for extended period - memory should remain stable
5. **Video End**: Let videos play to end - should auto-advance correctly







