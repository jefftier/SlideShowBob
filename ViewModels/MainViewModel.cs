using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using SlideShowBob.Commands;
using SlideShowBob.Models;

namespace SlideShowBob.ViewModels
{
    /// <summary>
    /// Main ViewModel for the slideshow application.
    /// Orchestrates services and exposes properties/commands for the UI.
    /// </summary>
    public class MainViewModel : BaseViewModel
    {
        // Services (injected via constructor)
        private readonly SettingsManagerWrapper _settingsManager;
        private readonly MediaPlaylistManager _playlistManager;
        private readonly MediaLoaderService _mediaLoaderService;
        private readonly ThumbnailService _thumbnailService;
        private readonly VideoPlaybackService _videoPlaybackService;
        private readonly SlideshowController _slideshowController;

        // Settings cache
        private AppSettings _settings;

        // Private fields for properties
        private MediaItem? _currentMediaItem;
        private bool _isSlideshowRunning;
        private int _slideDelayMs = 2000;
        private bool _includeVideos;
        private bool _isMuted = true;
        private SortMode _sortMode = SortMode.NameAZ;
        private string _statusText = string.Empty;
        private string _currentPositionText = "0 / 0";
        private double _zoomFactor = 1.0;
        private bool _isFitMode;
        private bool _isFullscreen;
        private bool _toolbarMinimized;
        private double _videoProgress = 0.0;
        private bool _isVideoPlaying;
        private BitmapSource? _currentImage;
        private bool _canNavigateNext;
        private bool _canNavigatePrevious;
        private bool _canStartSlideshow;
        private bool _canStopSlideshow;
        private bool _canReplay;

        // Events for View to subscribe to
        public event EventHandler? MediaChanged;
        public event EventHandler? RequestShowMedia;
        public event EventHandler? RequestOpenPlaylistWindow;
        public event EventHandler? RequestOpenSettingsWindow;
        public event EventHandler<string>? RequestShowMessage;

        public MainViewModel(
            SettingsManagerWrapper settingsManager,
            MediaPlaylistManager playlistManager,
            MediaLoaderService mediaLoaderService,
            ThumbnailService thumbnailService,
            VideoPlaybackService videoPlaybackService,
            SlideshowController slideshowController)
        {
            _settingsManager = settingsManager ?? throw new ArgumentNullException(nameof(settingsManager));
            _playlistManager = playlistManager ?? throw new ArgumentNullException(nameof(playlistManager));
            _mediaLoaderService = mediaLoaderService ?? throw new ArgumentNullException(nameof(mediaLoaderService));
            _thumbnailService = thumbnailService ?? throw new ArgumentNullException(nameof(thumbnailService));
            _videoPlaybackService = videoPlaybackService ?? throw new ArgumentNullException(nameof(videoPlaybackService));
            _slideshowController = slideshowController ?? throw new ArgumentNullException(nameof(slideshowController));

            // Load settings
            _settings = _settingsManager.Load();

            // Apply settings only if saving is enabled, otherwise use defaults
            if (_settings.SaveSlideDelay)
            {
                _slideDelayMs = _settings.SlideDelayMs;
            }
            else
            {
                _slideDelayMs = 2000; // default
            }

            if (_settings.SaveIncludeVideos)
            {
                _includeVideos = _settings.IncludeVideos;
            }
            else
            {
                _includeVideos = false; // default
            }

            if (_settings.SaveIsMuted)
            {
                _isMuted = _settings.IsMuted;
            }
            else
            {
                _isMuted = true; // default
            }

            // Convert stored string ("NameAZ", etc.) to enum
            if (_settings.SaveSortMode)
            {
                _sortMode = ParseSortMode(_settings.SortMode);
            }
            else
            {
                _sortMode = SortMode.NameAZ; // default
            }

            // Load previously used folders from settings only if saving is enabled
            if (_settings.SaveFolderPaths)
            {
                if (_settings.FolderPaths != null && _settings.FolderPaths.Count > 0)
                {
                    Folders = new ObservableCollection<string>();
                    foreach (var folderPath in _settings.FolderPaths)
                    {
                        if (Directory.Exists(folderPath) && !Folders.Contains(folderPath, StringComparer.OrdinalIgnoreCase))
                        {
                            Folders.Add(folderPath);
                        }
                    }

                    if (Folders.Count > 0)
                    {
                        StatusText = "Folders: " + string.Join("; ", Folders);
                        // Load folders asynchronously (fire-and-forget)
                        _ = LoadFoldersAsync();
                    }
                }
            }
            else
            {
                Folders = new ObservableCollection<string>();
            }

            // Initialize video service mute state
            _videoPlaybackService.IsMuted = _isMuted;

            // Set slideshow controller delay
            _slideshowController.SlideDelayMs = _slideDelayMs;

            // Initialize commands
            StartSlideshowCommand = new RelayCommand(StartSlideshow, () => CanStartSlideshow);
            StopSlideshowCommand = new RelayCommand(StopSlideshow, () => CanStopSlideshow);
            NextCommand = new RelayCommand(Next, () => CanNavigateNext);
            PreviousCommand = new RelayCommand(Previous, () => CanNavigatePrevious);
            AddFolderCommand = new RelayCommand(AddFolder);
            ToggleFullscreenCommand = new RelayCommand(ToggleFullscreen);
            ToggleMuteCommand = new RelayCommand(ToggleMute);
            ReplayCommand = new RelayCommand(Replay, () => CanReplay);
            ZoomInCommand = new RelayCommand(ZoomIn);
            ZoomOutCommand = new RelayCommand(ZoomOut);
            ResetZoomCommand = new RelayCommand(ResetZoom);
            ToggleFitCommand = new RelayCommand(ToggleFit);
            OpenPlaylistCommand = new RelayCommand(OpenPlaylist);
            OpenSettingsCommand = new RelayCommand(OpenSettings);
            NavigateToFileCommand = new RelayCommand<string>(NavigateToFile);
            SeekVideoCommand = new RelayCommand<double>(SeekVideo);
            RemoveFolderCommand = new RelayCommand<string>(RemoveFolder);
            RemoveFileCommand = new RelayCommand<string>(RemoveFile);
            SetSortModeCommand = new RelayCommand<SortMode>(SetSortMode);
            ToggleToolbarCommand = new RelayCommand(ToggleToolbar);

            // Subscribe to service events
            _playlistManager.PlaylistChanged += OnPlaylistChanged;
            _slideshowController.NavigateToIndex += OnNavigateToIndex;
            _slideshowController.SlideshowStarted += OnSlideshowStarted;
            _slideshowController.SlideshowStopped += OnSlideshowStopped;
            _videoPlaybackService.ProgressUpdated += OnVideoProgressUpdated;
            _videoPlaybackService.MediaEnded += OnVideoMediaEnded;
            _videoPlaybackService.MediaOpened += OnVideoMediaOpened;

            // Initialize state
            UpdateNavigationState();
            UpdateSlideshowState();
            UpdatePositionText();
        }

        #region Properties

        /// <summary>
        /// Current media item being displayed. Null if no media is loaded.
        /// </summary>
        public MediaItem? CurrentMediaItem
        {
            get => _currentMediaItem;
            private set
            {
                if (SetProperty(ref _currentMediaItem, value))
                {
                    UpdateNavigationState();
                    UpdateReplayState();
                    MediaChanged?.Invoke(this, EventArgs.Empty);
                }
            }
        }

        /// <summary>
        /// Whether the slideshow is currently running (auto-advancing).
        /// </summary>
        public bool IsSlideshowRunning
        {
            get => _isSlideshowRunning;
            private set
            {
                if (SetProperty(ref _isSlideshowRunning, value))
                {
                    UpdateSlideshowState();
                    UpdateReplayState();
                }
            }
        }

        /// <summary>
        /// Slide delay in milliseconds between slideshow transitions.
        /// </summary>
        public int SlideDelayMs
        {
            get => _slideDelayMs;
            set
            {
                if (SetProperty(ref _slideDelayMs, value))
                {
                    _slideshowController.SlideDelayMs = value;
                    UpdateSlideshowState();

                    // Save to settings if enabled
                    if (_settings.SaveSlideDelay)
                    {
                        _settings.SlideDelayMs = value;
                        _settingsManager.Save(_settings);
                    }
                }
            }
        }

        /// <summary>
        /// Whether to include video files (.mp4) in the playlist.
        /// </summary>
        public bool IncludeVideos
        {
            get => _includeVideos;
            set
            {
                if (SetProperty(ref _includeVideos, value))
                {
                    // Save to settings if enabled
                    if (_settings.SaveIncludeVideos)
                    {
                        _settings.IncludeVideos = value;
                        _settingsManager.Save(_settings);
                    }

                    // Reload playlist if we already have folders
                    if (Folders.Count > 0)
                    {
                        _ = LoadFoldersAsync();
                    }
                }
            }
        }

        /// <summary>
        /// Whether video playback is muted.
        /// </summary>
        public bool IsMuted
        {
            get => _isMuted;
            set
            {
                if (SetProperty(ref _isMuted, value))
                {
                    _videoPlaybackService.IsMuted = value;

                    // Save to settings if enabled
                    if (_settings.SaveIsMuted)
                    {
                        _settings.IsMuted = value;
                        _settingsManager.Save(_settings);
                    }
                }
            }
        }

        /// <summary>
        /// Current sort mode for the playlist.
        /// </summary>
        public SortMode SortMode
        {
            get => _sortMode;
            set
            {
                if (SetProperty(ref _sortMode, value))
                {
                    ApplySort();

                    // Save to settings if enabled
                    if (_settings.SaveSortMode)
                    {
                        _settings.SortMode = value.ToString();
                        _settingsManager.Save(_settings);
                    }
                }
            }
        }

        /// <summary>
        /// Status message text displayed to the user.
        /// </summary>
        public string StatusText
        {
            get => _statusText;
            private set => SetProperty(ref _statusText, value);
        }

        /// <summary>
        /// Current position text (e.g., "5 / 100").
        /// </summary>
        public string CurrentPositionText
        {
            get => _currentPositionText;
            private set => SetProperty(ref _currentPositionText, value);
        }

        /// <summary>
        /// Current zoom factor (1.0 = 100%, 2.0 = 200%, etc.).
        /// </summary>
        public double ZoomFactor
        {
            get => _zoomFactor;
            set => SetProperty(ref _zoomFactor, value);
        }

        /// <summary>
        /// Whether fit-to-window mode is enabled.
        /// </summary>
        public bool IsFitMode
        {
            get => _isFitMode;
            set => SetProperty(ref _isFitMode, value);
        }

        /// <summary>
        /// Whether the window is in fullscreen mode.
        /// </summary>
        public bool IsFullscreen
        {
            get => _isFullscreen;
            private set => SetProperty(ref _isFullscreen, value);
        }

        /// <summary>
        /// Whether the toolbar is minimized (notch mode).
        /// </summary>
        public bool ToolbarMinimized
        {
            get => _toolbarMinimized;
            private set => SetProperty(ref _toolbarMinimized, value);
        }

        /// <summary>
        /// Video playback progress (0.0 to 1.0).
        /// </summary>
        public double VideoProgress
        {
            get => _videoProgress;
            private set => SetProperty(ref _videoProgress, value);
        }

        /// <summary>
        /// Whether a video is currently playing.
        /// </summary>
        public bool IsVideoPlaying
        {
            get => _isVideoPlaying;
            private set => SetProperty(ref _isVideoPlaying, value);
        }

        /// <summary>
        /// Currently displayed image (for images and GIFs).
        /// </summary>
        public BitmapSource? CurrentImage
        {
            get => _currentImage;
            private set => SetProperty(ref _currentImage, value);
        }

        /// <summary>
        /// Whether navigation to next item is possible.
        /// </summary>
        public bool CanNavigateNext
        {
            get => _canNavigateNext;
            private set => SetProperty(ref _canNavigateNext, value);
        }

        /// <summary>
        /// Whether navigation to previous item is possible.
        /// </summary>
        public bool CanNavigatePrevious
        {
            get => _canNavigatePrevious;
            private set => SetProperty(ref _canNavigatePrevious, value);
        }

        /// <summary>
        /// Whether slideshow can be started (has items and valid delay).
        /// </summary>
        public bool CanStartSlideshow
        {
            get => _canStartSlideshow;
            private set => SetProperty(ref _canStartSlideshow, value);
        }

        /// <summary>
        /// Whether slideshow can be stopped (is currently running).
        /// </summary>
        public bool CanStopSlideshow
        {
            get => _canStopSlideshow;
            private set => SetProperty(ref _canStopSlideshow, value);
        }

        /// <summary>
        /// Whether video replay is available (video is current item and slideshow not running).
        /// </summary>
        public bool CanReplay
        {
            get => _canReplay;
            private set => SetProperty(ref _canReplay, value);
        }

        /// <summary>
        /// Collection of folder paths currently in the playlist.
        /// </summary>
        public ObservableCollection<string> Folders { get; private set; } = new();

        /// <summary>
        /// Gets the current playlist file paths. Used by PlaylistWindow to check if files are in the playlist.
        /// </summary>
        public IReadOnlyList<string> GetCurrentPlaylist()
        {
            return _playlistManager.GetAllItems().Select(i => i.FilePath).ToList();
        }

        // Temporary bridge properties to expose services for MainWindow during transition
        // TODO: Complete MVVM refactoring to remove these direct service accesses
        internal MediaPlaylistManager PlaylistManager => _playlistManager;
        internal VideoPlaybackService VideoPlaybackService => _videoPlaybackService;
        internal SlideshowController SlideshowController => _slideshowController;
        internal MediaLoaderService MediaLoaderService => _mediaLoaderService;
        internal AppSettings Settings => _settings;

        #endregion

        #region Commands

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
        public ICommand RemoveFileCommand { get; }
        public ICommand SetSortModeCommand { get; }
        public ICommand ToggleToolbarCommand { get; }

        #endregion

        #region Command Implementations

        private void StartSlideshow()
        {
            if (!_playlistManager.HasItems)
            {
                RequestShowMessage?.Invoke(this, "Please select a folder with images or videos first.");
                return;
            }

            if (_slideDelayMs <= 0)
            {
                RequestShowMessage?.Invoke(this, "Please enter a valid delay in milliseconds (greater than 0).");
                return;
            }

            _slideshowController.SlideDelayMs = _slideDelayMs;
            _slideshowController.Start();

            // Auto-minimize toolbar when slideshow starts
            ToolbarMinimized = true;

            // Save delay to settings if enabled
            if (_settings.SaveSlideDelay)
            {
                _settings.SlideDelayMs = _slideDelayMs;
                _settingsManager.Save(_settings);
            }
        }

        private void StopSlideshow()
        {
            _slideshowController.Stop();
        }

        private void Next()
        {
            _slideshowController.NavigateNext();
        }

        private void Previous()
        {
            _slideshowController.NavigatePrevious();
        }

        private void AddFolder()
        {
            // This will be handled by the View (opens folder dialog)
            // The View should call AddFolders() method after getting folder paths
        }

        /// <summary>
        /// Adds folders to the playlist. Called by View after folder dialog returns paths.
        /// </summary>
        public async Task AddFoldersAsync(IEnumerable<string> folderPaths)
        {
            bool addedAny = false;

            foreach (var folderPath in folderPaths)
            {
                if (!Folders.Contains(folderPath, StringComparer.OrdinalIgnoreCase))
                {
                    Folders.Add(folderPath);
                    addedAny = true;
                }
            }

            if (addedAny)
            {
                StatusText = "Folders: " + string.Join("; ", Folders);
                SaveFoldersToSettings();
                await LoadFoldersAsync();
            }
        }

        private void ToggleFullscreen()
        {
            IsFullscreen = !IsFullscreen;
            // View will handle actual window state changes
        }

        private void ToggleMute()
        {
            IsMuted = !IsMuted;
        }

        private void Replay()
        {
            if (CurrentMediaItem?.Type != MediaType.Video) return;
            if (_slideshowController.IsRunning) return;
            _videoPlaybackService.Replay();
        }

        private void ZoomIn()
        {
            if (CurrentMediaItem?.Type == MediaType.Video) return;
            ZoomFactor = Math.Min(ZoomFactor * 1.2, 10.0);
        }

        private void ZoomOut()
        {
            if (CurrentMediaItem?.Type == MediaType.Video) return;
            ZoomFactor = Math.Max(ZoomFactor / 1.2, 0.1);
        }

        private void ResetZoom()
        {
            if (CurrentMediaItem?.Type == MediaType.Video) return;
            IsFitMode = false;
            ZoomFactor = 1.0;
        }

        private void ToggleFit()
        {
            IsFitMode = !IsFitMode;
        }

        private void OpenPlaylist()
        {
            RequestOpenPlaylistWindow?.Invoke(this, EventArgs.Empty);
        }

        private void OpenSettings()
        {
            RequestOpenSettingsWindow?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Called by View after settings window closes to reload settings.
        /// </summary>
        public void ReloadSettings()
        {
            _settings = _settingsManager.Load();

            // Re-apply settings based on updated save flags
            if (_settings.SaveSlideDelay)
            {
                SlideDelayMs = _settings.SlideDelayMs;
            }
            else
            {
                SlideDelayMs = 2000; // default
            }

            if (_settings.SaveIncludeVideos)
            {
                IncludeVideos = _settings.IncludeVideos;
            }
            else
            {
                IncludeVideos = false; // default
            }

            if (_settings.SaveIsMuted)
            {
                IsMuted = _settings.IsMuted;
            }
            else
            {
                IsMuted = true; // default
            }

            if (_settings.SaveSortMode)
            {
                SortMode = ParseSortMode(_settings.SortMode);
            }
            else
            {
                SortMode = SortMode.NameAZ; // default
            }
        }

        private void NavigateToFile(string? filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                return;

            string normalized = Path.GetFullPath(filePath);
            var items = _playlistManager.GetAllItems().ToList();
            int index = items.FindIndex(i =>
                string.Equals(Path.GetFullPath(i.FilePath), normalized, StringComparison.OrdinalIgnoreCase));

            if (index >= 0)
            {
                // Single source of truth: only _playlistManager.SetIndex() updates the current media position
                _playlistManager.SetIndex(index);
                CurrentMediaItem = _playlistManager.CurrentItem;
                RequestShowMedia?.Invoke(this, EventArgs.Empty);
            }
        }

        private void SeekVideo(double progress)
        {
            if (CurrentMediaItem?.Type != MediaType.Video) return;

            double ratio = Math.Max(0.0, Math.Min(1.0, progress));
            _videoPlaybackService.SeekTo(ratio);
        }

        private void RemoveFolder(string? folderPath)
        {
            if (string.IsNullOrWhiteSpace(folderPath))
                return;

            // Remove folder from folder list
            var toRemove = Folders.Where(f =>
                string.Equals(Path.GetFullPath(f),
                              Path.GetFullPath(folderPath),
                              StringComparison.OrdinalIgnoreCase)).ToList();

            foreach (var folder in toRemove)
            {
                Folders.Remove(folder);
            }

            if (toRemove.Count > 0)
            {
                // Save folders to settings after removal
                SaveFoldersToSettings();

                // Reload playlist
                _ = LoadFoldersAsync();
            }
        }

        private void RemoveFile(string? filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                return;

            // Preserve current item if it's not being removed
            var currentItem = _playlistManager.CurrentItem;
            string? currentFilePath = currentItem?.FilePath;
            string normalized = Path.GetFullPath(filePath);
            bool isRemovingCurrent = currentFilePath != null &&
                string.Equals(Path.GetFullPath(currentFilePath), normalized, StringComparison.OrdinalIgnoreCase);

            // Remove the file directly from the playlist
            bool removed = _playlistManager.RemoveFile(filePath);

            if (!removed)
                return;

            if (!_playlistManager.HasItems)
            {
                CurrentMediaItem = null;
                _videoPlaybackService.Stop();
                UpdatePositionText();
                return;
            }

            // If we removed the current item, move to the next available item
            if (isRemovingCurrent)
            {
                // If current index is now out of bounds, adjust it
                if (_playlistManager.CurrentIndex >= _playlistManager.Count)
                    _playlistManager.SetIndex(_playlistManager.Count - 1);
                else if (_playlistManager.CurrentIndex < 0 && _playlistManager.Count > 0)
                    _playlistManager.SetIndex(0);
            }
            // Otherwise, try to restore position to the same file
            else if (currentFilePath != null)
            {
                var itemsAfter = _playlistManager.GetAllItems();
                var itemsAfterList = itemsAfter.ToList();
                int foundIndex = itemsAfterList.FindIndex(i =>
                    string.Equals(Path.GetFullPath(i.FilePath), Path.GetFullPath(currentFilePath), StringComparison.OrdinalIgnoreCase));
                if (foundIndex >= 0)
                    _playlistManager.SetIndex(foundIndex);
            }

            CurrentMediaItem = _playlistManager.CurrentItem;
            RequestShowMedia?.Invoke(this, EventArgs.Empty);
        }

        private void SetSortMode(SortMode mode)
        {
            SortMode = mode;
        }

        private void ToggleToolbar()
        {
            ToolbarMinimized = !ToolbarMinimized;
        }

        #endregion

        #region Helper Methods

        private async Task LoadFoldersAsync()
        {
            StatusText = "Loading...";

            // Stop any current playback
            _videoPlaybackService.Stop();
            _slideshowController.Stop();

            if (Folders.Count == 0)
            {
                StatusText = "No folders selected.";
                UpdatePositionText();
                return;
            }

            try
            {
                // Load files using MediaPlaylistManager
                _playlistManager.LoadFiles(Folders, IncludeVideos);
                ApplySort();
                UpdatePositionText();

                if (_playlistManager.HasItems)
                {
                    _playlistManager.SetIndex(0);
                    CurrentMediaItem = _playlistManager.CurrentItem;
                    RequestShowMedia?.Invoke(this, EventArgs.Empty);
                    StatusText = "";
                }
                else
                {
                    StatusText = "No media found";
                    CurrentMediaItem = null;
                }
            }
            catch (Exception ex)
            {
                StatusText = "Error: " + ex.Message;
                CurrentMediaItem = null;
            }
        }

        private void ApplySort()
        {
            if (!_playlistManager.HasItems) return;

            // Preserve current item if possible
            var currentItem = _playlistManager.CurrentItem;
            string? currentFilePath = currentItem?.FilePath;

            _playlistManager.Sort(_sortMode);

            // Try to restore position
            if (currentFilePath != null)
            {
                var items = _playlistManager.GetAllItems().ToList();
                int foundIndex = items.FindIndex(i => i.FilePath == currentFilePath);
                if (foundIndex >= 0)
                    _playlistManager.SetIndex(foundIndex);
                else
                    _playlistManager.SetIndex(0);
            }
            else
            {
                _playlistManager.SetIndex(0);
            }

            CurrentMediaItem = _playlistManager.CurrentItem;
            UpdatePositionText();
        }

        private void SaveFoldersToSettings()
        {
            if (_settings.SaveFolderPaths)
            {
                _settings.FolderPaths = new List<string>(Folders);
                _settingsManager.Save(_settings);
            }
        }

        private void UpdateNavigationState()
        {
            CanNavigateNext = _playlistManager.HasItems;
            CanNavigatePrevious = _playlistManager.HasItems;
        }

        private void UpdateSlideshowState()
        {
            CanStartSlideshow = _playlistManager.HasItems && _slideDelayMs > 0 && !_isSlideshowRunning;
            CanStopSlideshow = _isSlideshowRunning;
        }

        private void UpdateReplayState()
        {
            CanReplay = CurrentMediaItem?.Type == MediaType.Video && !_isSlideshowRunning;
        }

        private void UpdatePositionText()
        {
            int current = _playlistManager.CurrentIndex >= 0 ? _playlistManager.CurrentIndex + 1 : 0;
            int total = _playlistManager.Count;
            CurrentPositionText = $"{current} / {total}";
        }

        private SortMode ParseSortMode(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return SortMode.NameAZ;

            return value switch
            {
                "NameAZ" => SortMode.NameAZ,
                "NameZA" => SortMode.NameZA,
                "DateOldest" => SortMode.DateOldest,
                "DateNewest" => SortMode.DateNewest,
                "Random" => SortMode.Random,
                _ => SortMode.NameAZ
            };
        }

        #endregion

        #region Event Handlers

        private void OnPlaylistChanged(object? sender, EventArgs e)
        {
            UpdateNavigationState();
            UpdateSlideshowState();
            UpdatePositionText();
        }

        private void OnNavigateToIndex(object? sender, int index)
        {
            _playlistManager.SetIndex(index);
            CurrentMediaItem = _playlistManager.CurrentItem;
            RequestShowMedia?.Invoke(this, EventArgs.Empty);
        }

        private void OnSlideshowStarted(object? sender, EventArgs e)
        {
            IsSlideshowRunning = true;
        }

        private void OnSlideshowStopped(object? sender, EventArgs e)
        {
            IsSlideshowRunning = false;
        }

        private void OnVideoProgressUpdated(object? sender, double progress)
        {
            VideoProgress = progress;
        }

        private void OnVideoMediaEnded(object? sender, EventArgs e)
        {
            // If slideshow is running, it will handle advancing
            // Otherwise, just update state
            IsVideoPlaying = false;
        }

        private void OnVideoMediaOpened(object? sender, EventArgs e)
        {
            IsVideoPlaying = _videoPlaybackService.IsPlaying;
        }

        #endregion
    }
}
