You are refactoring this WPF app (SlideShowBob) to MVVM.

Task: Create a PlaylistViewModel and connect it to the existing playlist functionality.

Please:
1. Inspect `PlaylistWindow.xaml` and `PlaylistWindow.xaml.cs` in this workspace.
2. Identify all playlist-related state and logic in `PlaylistWindow.xaml.cs` that does NOT need direct Window/UI access (list of items, add/remove, reorder, selection, etc.).
3. Create a new file `ViewModels/PlaylistViewModel.cs` in namespace `SlideShowBob.ViewModels` that:
   - Inherits from `BaseViewModel`.
   - Exposes observable collections / properties representing the playlist items (likely wrapping existing playlist/media types).
   - Exposes RelayCommand-based commands for:
     - Adding/removing items.
     - Moving items up/down.
     - Any other playlist operations currently handled in the window code-behind.
   - Uses existing services (like MediaPlaylistManager or whatever is currently used in PlaylistWindow) via constructor injection.

Important:
- Do NOT reference specific window types or controls from PlaylistViewModel.
- Do NOT change behavior; just move logic out of PlaylistWindow.xaml.cs into PlaylistViewModel.

Implement `PlaylistViewModel.cs` and show me the full file.
# MainViewModel API Design

## Responsibilities Moving from MainWindow to MainViewModel

### 1. Slideshow Control
- Start/stop/pause slideshow
- Manage slideshow state and transitions
- Handle slide delay configuration
- **Services**: `SlideshowController`

### 2. Media Navigation
- Navigate to next/previous media item
- Navigate to specific file
- Track current position in playlist
- **Services**: `MediaPlaylistManager`, `SlideshowController`

### 3. Media Display Coordination
- Coordinate loading and display of current media (image/GIF/video)
- Manage media transitions
- Handle video playback state
- **Services**: `MediaLoaderService`, `VideoPlaybackService`, `ThumbnailService`

### 4. Settings Management
- Load and save application settings
- Manage slide delay, include videos, sort mode, mute preferences
- Persist folder paths
- **Services**: `SettingsManagerWrapper`

### 5. Playlist Management
- Add/remove folders
- Load files from folders
- Apply sorting
- Track folder list
- **Services**: `MediaPlaylistManager`

### 6. UI State Management
- Fullscreen mode
- Toolbar minimized/expanded state
- Zoom level and fit mode
- Status messages
- **Services**: None (pure ViewModel state)

### 7. Video Controls
- Mute/unmute
- Replay video
- Seek to position
- Track video progress
- **Services**: `VideoPlaybackService`

### 8. Window Coordination
- Open playlist window
- Open settings window
- **Services**: None (triggers window creation, handled in View)

---

## Properties

### Current Media State
- **`CurrentMediaItem`** (MediaItem?)
  - Current item being displayed
  - **Service**: `MediaPlaylistManager.CurrentItem`
  - **Updates**: When navigation occurs or playlist changes

- **`CurrentImage`** (BitmapSource?)
  - Currently displayed image/GIF bitmap
  - **Service**: `MediaLoaderService` (loads image)
  - **Updates**: When showing image/GIF media

- **`IsVideoPlaying`** (bool)
  - Whether video is currently playing
  - **Service**: `VideoPlaybackService.IsPlaying`
  - **Updates**: On video play/pause events

- **`VideoProgress`** (double, 0.0-1.0)
  - Video playback progress
  - **Service**: `VideoPlaybackService.ProgressUpdated` event
  - **Updates**: Every 200ms during video playback

### Slideshow State
- **`IsSlideshowRunning`** (bool)
  - Whether slideshow is auto-advancing
  - **Service**: `SlideshowController.IsRunning`
  - **Updates**: On slideshow start/stop events

- **`SlideDelayMs`** (int)
  - Delay between slideshow transitions
  - **Service**: `SlideshowController.SlideDelayMs`
  - **Updates**: User input or settings load

### Settings/Configuration
- **`IncludeVideos`** (bool)
  - Whether to include .mp4 files in playlist
  - **Service**: `SettingsManagerWrapper`, `MediaPlaylistManager.LoadFiles()`
  - **Updates**: User toggle, settings load

- **`IsMuted`** (bool)
  - Whether video is muted
  - **Service**: `VideoPlaybackService.IsMuted`, `SettingsManagerWrapper`
  - **Updates**: User toggle, settings load

- **`SortMode`** (SortMode)
  - Current sort mode (NameAZ, NameZA, DateOldest, DateNewest, Random)
  - **Service**: `MediaPlaylistManager` (sorting), `SettingsManagerWrapper`
  - **Updates**: User selection, settings load

### UI State
- **`IsFullscreen`** (bool)
  - Whether window is in fullscreen mode
  - **Service**: None (Window-level, but state tracked in ViewModel)
  - **Updates**: User toggle (F11 or button)

- **`ToolbarMinimized`** (bool)
  - Whether toolbar is in minimized (notch) mode
  - **Service**: None (UI state)
  - **Updates**: User action, auto-minimize on slideshow start

- **`ZoomFactor`** (double)
  - Current zoom level (1.0 = 100%)
  - **Service**: None (UI state)
  - **Updates**: Zoom in/out/reset commands

- **`IsFitMode`** (bool)
  - Whether fit-to-window mode is enabled
  - **Service**: None (UI state)
  - **Updates**: User toggle

### Status/Information
- **`StatusText`** (string)
  - Status message for user
  - **Service**: None (ViewModel state)
  - **Updates**: Various operations (loading, errors, etc.)

- **`CurrentPositionText`** (string)
  - Position display (e.g., "5 / 100")
  - **Service**: `MediaPlaylistManager` (CurrentIndex, Count)
  - **Updates**: On navigation or playlist change

### Command Enablement
- **`CanNavigateNext`** (bool)
  - Whether next navigation is possible
  - **Service**: `MediaPlaylistManager` (has next item)
  - **Updates**: On navigation or playlist change

- **`CanNavigatePrevious`** (bool)
  - Whether previous navigation is possible
  - **Service**: `MediaPlaylistManager` (has previous item)
  - **Updates**: On navigation or playlist change

- **`CanStartSlideshow`** (bool)
  - Whether slideshow can start (has items, valid delay)
  - **Service**: `MediaPlaylistManager.HasItems`, delay validation
  - **Updates**: On playlist change, delay change

- **`CanStopSlideshow`** (bool)
  - Whether slideshow can stop (is running)
  - **Service**: `SlideshowController.IsRunning`
  - **Updates**: On slideshow start/stop

- **`CanReplay`** (bool)
  - Whether video replay is available
  - **Service**: Current item is video, slideshow not running
  - **Updates**: On media change, slideshow state change

### Collections
- **`Folders`** (ObservableCollection<string>)
  - List of folder paths in playlist
  - **Service**: `MediaPlaylistManager` (tracks folders)
  - **Updates**: On folder add/remove

---

## Commands

### Slideshow Control
- **`StartSlideshowCommand`**
  - Starts auto-advancing slideshow
  - **Service**: `SlideshowController.Start()`
  - **CanExecute**: `CanStartSlideshow` (has items, valid delay)
  - **Side effects**: Auto-minimizes toolbar, updates UI state

- **`StopSlideshowCommand`**
  - Stops slideshow
  - **Service**: `SlideshowController.Stop()`
  - **CanExecute**: `CanStopSlideshow` (is running)

### Navigation
- **`NextCommand`**
  - Navigate to next media item
  - **Service**: `SlideshowController.NavigateNext()` or `MediaPlaylistManager.Next()`
  - **CanExecute**: `CanNavigateNext`

- **`PreviousCommand`**
  - Navigate to previous media item
  - **Service**: `SlideshowController.NavigatePrevious()` or `MediaPlaylistManager.Previous()`
  - **CanExecute**: `CanNavigatePrevious`

- **`NavigateToFileCommand`** (string filePath)
  - Navigate to specific file
  - **Service**: `MediaPlaylistManager.SetIndex()`, then show media
  - **CanExecute**: File exists in playlist

### Folder Management
- **`AddFolderCommand`**
  - Open folder dialog and add folder(s) to playlist
  - **Service**: `MediaPlaylistManager.LoadFiles()`
  - **Side effects**: Reloads playlist, updates position text

- **`RemoveFolderCommand`** (string folderPath)
  - Remove folder from playlist
  - **Service**: `MediaPlaylistManager` (remove folder, reload)
  - **Side effects**: Reloads playlist

### Video Controls
- **`ToggleMuteCommand`**
  - Toggle video mute state
  - **Service**: `VideoPlaybackService.IsMuted`, `SettingsManagerWrapper`
  - **Side effects**: Saves to settings if enabled

- **`ReplayCommand`**
  - Replay current video
  - **Service**: `VideoPlaybackService.Replay()`
  - **CanExecute**: `CanReplay` (video is current, slideshow not running)

- **`SeekVideoCommand`** (double progress)
  - Seek video to specific position (0.0-1.0)
  - **Service**: `VideoPlaybackService.SeekTo(progress)`
  - **CanExecute**: Current item is video

### Zoom/Fit Controls
- **`ZoomInCommand`**
  - Increase zoom factor
  - **Service**: None (updates `ZoomFactor` property)
  - **CanExecute**: Not in fit mode, not video

- **`ZoomOutCommand`**
  - Decrease zoom factor
  - **Service**: None (updates `ZoomFactor` property)
  - **CanExecute**: Not in fit mode, not video

- **`ResetZoomCommand`**
  - Reset zoom to 1.0 and disable fit mode
  - **Service**: None (updates `ZoomFactor`, `IsFitMode`)
  - **CanExecute**: Not video

- **`ToggleFitCommand`**
  - Toggle fit-to-window mode
  - **Service**: None (updates `IsFitMode` property)
  - **Side effects**: Adjusts zoom/scale for current media

### Window/UI Controls
- **`ToggleFullscreenCommand`**
  - Toggle fullscreen mode
  - **Service**: None (Window-level, but state tracked in ViewModel)
  - **Side effects**: Changes window style, auto-minimizes toolbar

- **`ToggleToolbarCommand`**
  - Toggle toolbar minimized/expanded state
  - **Service**: None (UI state)
  - **Side effects**: Updates `ToolbarMinimized` property

- **`OpenPlaylistCommand`**
  - Open playlist management window
  - **Service**: None (creates `PlaylistWindow`)
  - **Side effects**: Opens modal window

- **`OpenSettingsCommand`**
  - Open settings window
  - **Service**: `SettingsManagerWrapper` (loads settings)
  - **Side effects**: Opens modal window, may reload settings

### Sorting
- **`SetSortModeCommand`** (SortMode mode)
  - Change playlist sort mode
  - **Service**: `MediaPlaylistManager` (apply sort), `SettingsManagerWrapper`
  - **Side effects**: Reloads playlist, saves to settings if enabled

---

## Mapping to Current MainWindow.xaml.cs Logic

### Slideshow Control
- `StartButton_Click()` → `StartSlideshowCommand`
  - Validates playlist has items
  - Validates delay > 0
  - Sets `_slideshowController.SlideDelayMs`
  - Calls `_slideshowController.Start()`
  - Auto-minimizes toolbar
  - Saves delay to settings if enabled

- `StopButton_Click()` → `StopSlideshowCommand`
  - Calls `_slideshowController.Stop()`

- `SetSlideshowState(bool)` → `IsSlideshowRunning` property + event handlers
  - Updates button visibility/enablement
  - Updates window title
  - Updates replay button enablement

### Navigation
- `ShowNext()` → `NextCommand`
  - Calls `_slideshowController.NavigateNext()`

- `ShowPrevious()` → `PreviousCommand`
  - Calls `_slideshowController.NavigatePrevious()`

- `NavigateToFile(string)` → `NavigateToFileCommand`
  - Normalizes path
  - Finds index in playlist
  - Calls `_playlist.SetIndex(index)`
  - Calls `ShowCurrentMedia()`

### Media Display
- `ShowCurrentMedia()` → Triggered by navigation events
  - Determines media type
  - Loads image via `_mediaLoaderService`
  - Loads video via `_videoPlaybackService`
  - Updates UI elements
  - Applies portrait blur effects

### Settings Management
- Constructor settings load → ViewModel initialization
  - Loads settings via `SettingsManagerWrapper`
  - Applies `SlideDelayMs`, `IncludeVideos`, `IsMuted`, `SortMode`
  - Only applies if save flags are enabled

- `SettingsButton_Click()` → `OpenSettingsCommand`
  - Opens `SettingsWindow`
  - Reloads settings on close
  - Re-applies settings based on save flags

### Folder Management
- `ChooseFolderAsync()` → `AddFolderCommand`
  - Opens folder dialog
  - Adds folders to `_folders` list
  - Calls `LoadFoldersAsync()`
  - Saves folders to settings if enabled

- `LoadFoldersAsync()` → Internal method
  - Calls `_playlist.LoadFiles(_folders, IncludeVideos)`
  - Applies sort
  - Updates position text

- `RemoveFolderFromPlaylist()` → `RemoveFolderCommand`
  - Removes folder from `_folders`
  - Reloads playlist

### Video Controls
- `MuteButton_Click()` → `ToggleMuteCommand`
  - Toggles `_isMuted`
  - Sets `_videoService.IsMuted`
  - Updates button content
  - Saves to settings if enabled

- `ReplayButton_Click()` → `ReplayCommand`
  - Checks current item is video
  - Checks slideshow not running
  - Calls `_videoService.Replay()`

- `VideoProgressBar_MouseLeftButtonDown()` → `SeekVideoCommand`
  - Calculates progress ratio from mouse position
  - Calls `_videoService.SeekTo(ratio)`

### Zoom/Fit
- `SetZoom(double)` → `ZoomFactor` property
  - Updates zoom transform
  - Updates zoom label

- `SetZoomFit()` → `IsFitMode` property + `ToggleFitCommand`
  - Calculates fit scale
  - Applies to image/video
  - Disables scrolling

- `FitToggle_Checked/Unchecked` → `ToggleFitCommand`
  - Updates `IsFitMode`
  - Applies fit or resets

- `ZoomResetButton_Click()` → `ResetZoomCommand`
  - Sets `IsFitMode = false`
  - Sets `ZoomFactor = 1.0`

### Fullscreen
- `ToggleFullscreen()` → `ToggleFullscreenCommand`
  - Saves/restores window state
  - Changes window style/resize mode
  - Adjusts window bounds
  - Auto-minimizes toolbar
  - Re-applies fit if enabled

### Toolbar
- `MinimizeToolbar()` → `ToolbarMinimized = true`
  - Hides expanded panel
  - Shows notch panel with animation

- `ToolbarExpandButton_Click()` → `ToolbarMinimized = false`
  - Shows expanded panel
  - Hides notch panel

### Sorting
- `SortMenuItem_Click()` → `SetSortModeCommand`
  - Sets `_sortMode`
  - Calls `ApplySort()`
  - Updates menu visuals
  - Saves to settings if enabled

- `ApplySort()` → Internal method
  - Calls `_playlist.Sort(_sortMode)`
  - Updates current index if needed
  - Calls `ShowCurrentMedia()`

### Status Updates
- `SetStatus(string)` → `StatusText` property
  - Sets status message
  - Auto-clears after delay

- `UpdateItemCount()` → `CurrentPositionText` property
  - Formats "current / total"
  - Updates on navigation/playlist change

### Event Handlers
- `SlideshowController_NavigateToIndex` → `OnNavigateToIndex`
  - Calls `ShowCurrentMedia()`

- `VideoService_MediaOpened` → `OnVideoMediaOpened`
  - Updates video state
  - Applies portrait blur

- `VideoService_MediaEnded` → `OnVideoMediaEnded`
  - Advances to next if slideshow running

- `VideoService_FrameCaptured` → `OnVideoFrameCaptured`
  - Shows video frame for blur effect

- `VideoService_ProgressUpdated` → `OnVideoProgressUpdated`
  - Updates `VideoProgress` property

---

## Service Interaction Summary

### MediaPlaylistManager
- **Properties**: `CurrentItem`, `CurrentIndex`, `Count`, `HasItems`
- **Methods**: `LoadFiles()`, `Next()`, `Previous()`, `SetIndex()`, `Sort()`, `GetAllItems()`
- **Events**: `PlaylistChanged`

### SlideshowController
- **Properties**: `IsRunning`, `SlideDelayMs`
- **Methods**: `Start()`, `Stop()`, `NavigateNext()`, `NavigatePrevious()`
- **Events**: `NavigateToIndex`, `SlideshowStarted`, `SlideshowStopped`

### MediaLoaderService
- **Methods**: `LoadImageAsync()` (returns BitmapImage)
- **Used for**: Loading images and GIFs

### VideoPlaybackService
- **Properties**: `IsMuted`, `IsPlaying`
- **Methods**: `LoadVideo()`, `Replay()`, `SeekTo()`
- **Events**: `MediaOpened`, `MediaEnded`, `ProgressUpdated`, `FrameCaptured`

### ThumbnailService
- **Methods**: `GetThumbnailAsync()` (for playlist thumbnails)
- **Used for**: Generating thumbnails for video items

### SettingsManagerWrapper
- **Methods**: `Load()`, `Save(AppSettings)`
- **Used for**: Persisting user preferences



