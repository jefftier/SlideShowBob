# MainViewModel API Summary

## Responsibilities Moving to MainViewModel

1. **Slideshow Control** - Start/stop/pause, manage state, handle delays (via `SlideshowController`)
2. **Media Navigation** - Next/previous, navigate to file, track position (via `MediaPlaylistManager`, `SlideshowController`)
3. **Media Display Coordination** - Load and display images/videos, handle transitions (via `MediaLoaderService`, `VideoPlaybackService`, `ThumbnailService`)
4. **Settings Management** - Load/save preferences, manage configuration (via `SettingsManagerWrapper`)
5. **Playlist Management** - Add/remove folders, load files, apply sorting (via `MediaPlaylistManager`)
6. **UI State Management** - Fullscreen, toolbar state, zoom, fit mode (ViewModel state)
7. **Video Controls** - Mute, replay, seek, track progress (via `VideoPlaybackService`)
8. **Window Coordination** - Open playlist/settings windows (triggers window creation)

---

## MainViewModel Class Skeleton

```csharp
public class MainViewModel : BaseViewModel
{
    // Properties
    public MediaItem? CurrentMediaItem { get; private set; }
    public bool IsSlideshowRunning { get; private set; }
    public int SlideDelayMs { get; set; }
    public bool IncludeVideos { get; set; }
    public bool IsMuted { get; set; }
    public SortMode SortMode { get; set; }
    public string StatusText { get; private set; }
    public string CurrentPositionText { get; private set; }
    public double ZoomFactor { get; set; }
    public bool IsFitMode { get; set; }
    public bool IsFullscreen { get; private set; }
    public bool ToolbarMinimized { get; private set; }
    public double VideoProgress { get; private set; }
    public bool IsVideoPlaying { get; private set; }
    public BitmapSource? CurrentImage { get; private set; }
    public bool CanNavigateNext { get; private set; }
    public bool CanNavigatePrevious { get; private set; }
    public bool CanStartSlideshow { get; private set; }
    public bool CanStopSlideshow { get; private set; }
    public bool CanReplay { get; private set; }
    public ObservableCollection<string> Folders { get; private set; }

    // Commands
    public ICommand StartSlideshowCommand { get; }
    public ICommand StopSlideshowCommand { get; }
    public ICommand NextCommand { get; }
    public ICommand PreviousCommand { get; }
    public ICommand AddFolderCommand { get; }
    public ICommand ToggleFullscreenCommand { get; }
    public ICommand ToggleMuteCommand { get; }
    public ICommand ReplayCommand { get; }
    public ICommand ZoomInCommand { get; }
    public ICommand ZoomOutCommand { get; }
    public ICommand ResetZoomCommand { get; }
    public ICommand ToggleFitCommand { get; }
    public ICommand OpenPlaylistCommand { get; }
    public ICommand OpenSettingsCommand { get; }
    public ICommand NavigateToFileCommand { get; }
    public ICommand SeekVideoCommand { get; }
    public ICommand RemoveFolderCommand { get; }
    public ICommand SetSortModeCommand { get; }
    public ICommand ToggleToolbarCommand { get; }
}
```

---

## Property Descriptions

| Property | Type | Description | Service Interaction |
|----------|------|-------------|---------------------|
| `CurrentMediaItem` | `MediaItem?` | Current item being displayed | `MediaPlaylistManager.CurrentItem` |
| `IsSlideshowRunning` | `bool` | Whether slideshow is auto-advancing | `SlideshowController.IsRunning` |
| `SlideDelayMs` | `int` | Delay between transitions (ms) | `SlideshowController.SlideDelayMs` |
| `IncludeVideos` | `bool` | Include .mp4 files in playlist | `MediaPlaylistManager.LoadFiles()`, `SettingsManagerWrapper` |
| `IsMuted` | `bool` | Video mute state | `VideoPlaybackService.IsMuted`, `SettingsManagerWrapper` |
| `SortMode` | `SortMode` | Playlist sort mode | `MediaPlaylistManager` (sorting), `SettingsManagerWrapper` |
| `StatusText` | `string` | Status message for user | ViewModel state |
| `CurrentPositionText` | `string` | Position display (e.g., "5 / 100") | `MediaPlaylistManager` (CurrentIndex, Count) |
| `ZoomFactor` | `double` | Zoom level (1.0 = 100%) | ViewModel state |
| `IsFitMode` | `bool` | Fit-to-window mode enabled | ViewModel state |
| `IsFullscreen` | `bool` | Window fullscreen state | ViewModel state (Window-level) |
| `ToolbarMinimized` | `bool` | Toolbar in notch mode | ViewModel state |
| `VideoProgress` | `double` | Video progress (0.0-1.0) | `VideoPlaybackService.ProgressUpdated` event |
| `IsVideoPlaying` | `bool` | Video currently playing | `VideoPlaybackService.IsPlaying` |
| `CurrentImage` | `BitmapSource?` | Currently displayed image/GIF | `MediaLoaderService.LoadImageAsync()` |
| `CanNavigateNext` | `bool` | Can navigate to next | `MediaPlaylistManager` (has next) |
| `CanNavigatePrevious` | `bool` | Can navigate to previous | `MediaPlaylistManager` (has previous) |
| `CanStartSlideshow` | `bool` | Can start slideshow | `MediaPlaylistManager.HasItems`, delay validation |
| `CanStopSlideshow` | `bool` | Can stop slideshow | `SlideshowController.IsRunning` |
| `CanReplay` | `bool` | Can replay video | Current item is video, slideshow not running |
| `Folders` | `ObservableCollection<string>` | Folder paths in playlist | `MediaPlaylistManager` (tracks folders) |

---

## Command Descriptions

| Command | Parameter | Description | Service Interaction | CanExecute |
|---------|----------|-------------|---------------------|------------|
| `StartSlideshowCommand` | - | Start auto-advancing slideshow | `SlideshowController.Start()` | `CanStartSlideshow` |
| `StopSlideshowCommand` | - | Stop slideshow | `SlideshowController.Stop()` | `CanStopSlideshow` |
| `NextCommand` | - | Navigate to next item | `SlideshowController.NavigateNext()` or `MediaPlaylistManager.Next()` | `CanNavigateNext` |
| `PreviousCommand` | - | Navigate to previous item | `SlideshowController.NavigatePrevious()` or `MediaPlaylistManager.Previous()` | `CanNavigatePrevious` |
| `AddFolderCommand` | - | Open folder dialog and add folder(s) | `MediaPlaylistManager.LoadFiles()` | Always |
| `ToggleFullscreenCommand` | - | Toggle fullscreen mode | Window-level (state tracked in ViewModel) | Always |
| `ToggleMuteCommand` | - | Toggle video mute | `VideoPlaybackService.IsMuted`, `SettingsManagerWrapper` | Always |
| `ReplayCommand` | - | Replay current video | `VideoPlaybackService.Replay()` | `CanReplay` |
| `ZoomInCommand` | - | Increase zoom factor | Updates `ZoomFactor` property | Not in fit mode, not video |
| `ZoomOutCommand` | - | Decrease zoom factor | Updates `ZoomFactor` property | Not in fit mode, not video |
| `ResetZoomCommand` | - | Reset zoom to 1.0, disable fit | Updates `ZoomFactor`, `IsFitMode` | Not video |
| `ToggleFitCommand` | - | Toggle fit-to-window mode | Updates `IsFitMode` property | Always |
| `OpenPlaylistCommand` | - | Open playlist window | Creates `PlaylistWindow` | Always |
| `OpenSettingsCommand` | - | Open settings window | `SettingsManagerWrapper` (loads settings) | Always |
| `NavigateToFileCommand` | `string filePath` | Navigate to specific file | `MediaPlaylistManager.SetIndex()`, then show media | File exists in playlist |
| `SeekVideoCommand` | `double progress` | Seek video to position (0.0-1.0) | `VideoPlaybackService.SeekTo(progress)` | Current item is video |
| `RemoveFolderCommand` | `string folderPath` | Remove folder from playlist | `MediaPlaylistManager` (remove, reload) | Always |
| `SetSortModeCommand` | `SortMode mode` | Change sort mode | `MediaPlaylistManager` (apply sort), `SettingsManagerWrapper` | Always |
| `ToggleToolbarCommand` | - | Toggle toolbar minimized/expanded | Updates `ToolbarMinimized` property | Always |

---

## Mapping to MainWindow.xaml.cs

### Slideshow Control
- `StartButton_Click()` → `StartSlideshowCommand`
  - Validates playlist has items and delay > 0
  - Sets `SlideshowController.SlideDelayMs` and calls `Start()`
  - Auto-minimizes toolbar, saves delay to settings

- `StopButton_Click()` → `StopSlideshowCommand`
  - Calls `SlideshowController.Stop()`

- `SetSlideshowState(bool)` → `IsSlideshowRunning` property + event handlers
  - Updates button visibility/enablement, window title, replay button

### Navigation
- `ShowNext()` → `NextCommand`
  - Calls `SlideshowController.NavigateNext()`

- `ShowPrevious()` → `PreviousCommand`
  - Calls `SlideshowController.NavigatePrevious()`

- `NavigateToFile(string)` → `NavigateToFileCommand`
  - Normalizes path, finds index, calls `PlaylistManager.SetIndex()`, shows media

### Media Display
- `ShowCurrentMedia()` → Triggered by navigation events
  - Determines media type, loads via services, updates UI, applies effects

### Settings Management
- Constructor settings load → ViewModel initialization
  - Loads via `SettingsManagerWrapper`, applies only if save flags enabled

- `SettingsButton_Click()` → `OpenSettingsCommand`
  - Opens `SettingsWindow`, reloads settings on close

### Folder Management
- `ChooseFolderAsync()` → `AddFolderCommand`
  - Opens dialog, adds folders, calls `LoadFoldersAsync()`, saves to settings

- `LoadFoldersAsync()` → Internal method
  - Calls `PlaylistManager.LoadFiles()`, applies sort, updates position

- `RemoveFolderFromPlaylist()` → `RemoveFolderCommand`
  - Removes folder, reloads playlist

### Video Controls
- `MuteButton_Click()` → `ToggleMuteCommand`
  - Toggles `IsMuted`, sets `VideoPlaybackService.IsMuted`, saves to settings

- `ReplayButton_Click()` → `ReplayCommand`
  - Checks video and slideshow state, calls `VideoPlaybackService.Replay()`

- `VideoProgressBar_MouseLeftButtonDown()` → `SeekVideoCommand`
  - Calculates progress from mouse position, calls `VideoPlaybackService.SeekTo()`

### Zoom/Fit
- `SetZoom(double)` → `ZoomFactor` property
  - Updates zoom transform and label

- `SetZoomFit()` → `IsFitMode` property + `ToggleFitCommand`
  - Calculates fit scale, applies to media, disables scrolling

- `FitToggle_Checked/Unchecked` → `ToggleFitCommand`
  - Updates `IsFitMode`, applies fit or resets

- `ZoomResetButton_Click()` → `ResetZoomCommand`
  - Sets `IsFitMode = false`, `ZoomFactor = 1.0`

### Fullscreen
- `ToggleFullscreen()` → `ToggleFullscreenCommand`
  - Saves/restores window state, changes style/bounds, auto-minimizes toolbar

### Toolbar
- `MinimizeToolbar()` → `ToolbarMinimized = true`
  - Hides expanded panel, shows notch with animation

- `ToolbarExpandButton_Click()` → `ToolbarMinimized = false`
  - Shows expanded panel, hides notch

### Sorting
- `SortMenuItem_Click()` → `SetSortModeCommand`
  - Sets `SortMode`, calls `ApplySort()`, updates visuals, saves to settings

- `ApplySort()` → Internal method
  - Calls `PlaylistManager.Sort()`, updates index, shows media

### Status Updates
- `SetStatus(string)` → `StatusText` property
  - Sets message, auto-clears after delay

- `UpdateItemCount()` → `CurrentPositionText` property
  - Formats "current / total", updates on navigation/playlist change

### Event Handlers
- `SlideshowController_NavigateToIndex` → `OnNavigateToIndex`
  - Shows current media

- `VideoService_MediaOpened` → `OnVideoMediaOpened`
  - Updates video state, applies portrait blur

- `VideoService_MediaEnded` → `OnVideoMediaEnded`
  - Advances to next if slideshow running

- `VideoService_FrameCaptured` → `OnVideoFrameCaptured`
  - Shows video frame for blur effect

- `VideoService_ProgressUpdated` → `OnVideoProgressUpdated`
  - Updates `VideoProgress` property

