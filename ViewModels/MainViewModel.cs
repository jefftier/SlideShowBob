using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;
using SlideShowBob.Commands;

namespace SlideShowBob.ViewModels
{
    /// <summary>
    /// Main ViewModel for the slideshow application.
    /// Encapsulates slideshow logic from MainWindow.xaml.cs.
    /// </summary>
    public class MainViewModel : BaseViewModel
    {
        // Services (injected via constructor)
        private readonly IAppSettingsService _settingsManager;
        private readonly MediaPlaylistManager _playlistManager;
        private readonly MediaLoaderService _mediaLoaderService;
        private readonly ThumbnailService _thumbnailService;
        private readonly VideoPlaybackService _videoPlaybackService;
        private readonly SlideshowController _slideshowController;

        // Settings cache
        private AppSettings _settings;

        // Private fields for properties
        private MediaItem? _currentMedia;
        private string? _currentFileName;
        private int _currentIndex = -1;
        private int _totalCount = 0;
        private bool _isPlaying = false;
        private bool _isShuffleEnabled = false;
        private bool _includeVideos = false;
        private int _slideDelayMs = 2000;
        private string? _statusText;

        // Events for View to subscribe to
        public event EventHandler? RequestShowMedia;
        public event EventHandler<string>? RequestShowMessage;
        public event EventHandler? RequestOpenPlaylistWindow;
        public event EventHandler? RequestOpenSettingsWindow;
        public event EventHandler? RequestAddFolder;

        public MainViewModel(
            IAppSettingsService settingsManager,
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

            // Apply settings
            if (_settings.SaveSlideDelay)
            {
                _slideDelayMs = _settings.SlideDelayMs;
            }
            _slideshowController.SlideDelayMs = _slideDelayMs;

            if (_settings.SaveIncludeVideos)
            {
                _includeVideos = _settings.IncludeVideos;
            }

            // Initialize video service mute state
            if (_settings.SaveIsMuted)
            {
                _videoPlaybackService.IsMuted = _settings.IsMuted;
            }
            else
            {
                _videoPlaybackService.IsMuted = true; // default
            }

            // Load previously used folders from settings
            Folders = new ObservableCollection<string>();
            if (_settings.SaveFolderPaths && _settings.FolderPaths != null && _settings.FolderPaths.Count > 0)
            {
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

            // Initialize commands
            PlayPauseCommand = new RelayCommand(PlayPause, () => _playlistManager.HasItems);
            NextCommand = new RelayCommand(Next, () => _playlistManager.HasItems);
            PreviousCommand = new RelayCommand(Previous, () => _playlistManager.HasItems);
            StartSlideshowCommand = new RelayCommand(StartSlideshow, () => _playlistManager.HasItems && _slideDelayMs > 0 && !_isPlaying);
            StopSlideshowCommand = new RelayCommand(StopSlideshow, () => _isPlaying);
            AddFolderCommand = new RelayCommand(AddFolder);
            ClearPlaylistCommand = new RelayCommand(ClearPlaylist, () => _playlistManager.HasItems);
            OpenSettingsCommand = new RelayCommand(OpenSettings);
            OpenPlaylistCommand = new RelayCommand(OpenPlaylist);
            RemoveFolderCommand = new RelayCommand<string>(RemoveFolder);
            RemoveFileCommand = new RelayCommand<string>(RemoveFile);
            NavigateToFileCommand = new RelayCommand<string>(NavigateToFile);

            // Subscribe to service events
            _playlistManager.PlaylistChanged += OnPlaylistChanged;
            _slideshowController.NavigateToIndex += OnNavigateToIndex;
            _slideshowController.SlideshowStarted += OnSlideshowStarted;
            _slideshowController.SlideshowStopped += OnSlideshowStopped;
            _videoPlaybackService.MediaEnded += OnVideoMediaEnded;
            _videoPlaybackService.MediaOpened += OnVideoMediaOpened;

            // Initialize state
            UpdateState();
        }

        #region Properties

        /// <summary>
        /// Current media item being displayed. Null if no media is loaded.
        /// </summary>
        public MediaItem? CurrentMedia
        {
            get => _currentMedia;
            private set
            {
                if (SetProperty(ref _currentMedia, value))
                {
                    CurrentFileName = value?.FileName;
                    UpdateState();
                }
            }
        }

        /// <summary>
        /// Current file name being displayed.
        /// </summary>
        public string? CurrentFileName
        {
            get => _currentFileName;
            private set => SetProperty(ref _currentFileName, value);
        }

        /// <summary>
        /// Current index in the playlist (0-based).
        /// </summary>
        public int CurrentIndex
        {
            get => _currentIndex;
            private set
            {
                if (SetProperty(ref _currentIndex, value))
                {
                    // Update display index when current index changes
                    OnPropertyChanged(nameof(DisplayIndex));
                }
            }
        }

        /// <summary>
        /// Current index for display (1-based). Returns 0 if no item is selected.
        /// </summary>
        public int DisplayIndex => _currentIndex >= 0 ? _currentIndex + 1 : 0;

        /// <summary>
        /// Total count of items in the playlist.
        /// </summary>
        public int TotalCount
        {
            get => _totalCount;
            private set => SetProperty(ref _totalCount, value);
        }

        /// <summary>
        /// Whether the slideshow is currently playing (auto-advancing).
        /// </summary>
        public bool IsPlaying
        {
            get => _isPlaying;
            private set
            {
                if (SetProperty(ref _isPlaying, value))
                {
                    UpdateCommandStates();
                }
            }
        }

        /// <summary>
        /// Whether shuffle mode is enabled (for future implementation).
        /// </summary>
        public bool IsShuffleEnabled
        {
            get => _isShuffleEnabled;
            set => SetProperty(ref _isShuffleEnabled, value);
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
                    UpdateCommandStates();

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
        /// Status message text displayed to the user.
        /// </summary>
        public string? StatusText
        {
            get => _statusText;
            private set => SetProperty(ref _statusText, value);
        }

        /// <summary>
        /// Collection of folder paths currently in the playlist.
        /// </summary>
        public ObservableCollection<string> Folders { get; private set; } = new();

        // Internal properties to expose services for UI-specific rendering (temporary during MVVM transition)
        internal VideoPlaybackService VideoPlaybackService => _videoPlaybackService;
        internal SlideshowController SlideshowController => _slideshowController;
        internal MediaLoaderService MediaLoaderService => _mediaLoaderService;
        internal MediaPlaylistManager PlaylistManager => _playlistManager;
        internal AppSettings Settings => _settings;
        internal IAppSettingsService SettingsService => _settingsManager;

        #endregion

        #region Commands

        public ICommand PlayPauseCommand { get; }
        public ICommand NextCommand { get; }
        public ICommand PreviousCommand { get; }
        public ICommand StartSlideshowCommand { get; }
        public ICommand StopSlideshowCommand { get; }
        public ICommand AddFolderCommand { get; }
        public ICommand ClearPlaylistCommand { get; }
        public ICommand OpenSettingsCommand { get; }
        public ICommand OpenPlaylistCommand { get; }
        public ICommand RemoveFolderCommand { get; }
        public ICommand RemoveFileCommand { get; }
        public ICommand NavigateToFileCommand { get; }

        #endregion

        #region Command Implementations

        private void PlayPause()
        {
            if (_isPlaying)
            {
                StopSlideshow();
            }
            else
            {
                StartSlideshow();
            }
        }

        private void Next()
        {
            _slideshowController.NavigateNext();
        }

        private void Previous()
        {
            _slideshowController.NavigatePrevious();
        }

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

        private void AddFolder()
        {
            // Raise event for View to handle (opens folder dialog)
            RequestAddFolder?.Invoke(this, EventArgs.Empty);
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

        private void ClearPlaylist()
        {
            Folders.Clear();
            _playlistManager.LoadFiles(Enumerable.Empty<string>(), IncludeVideos);
            SaveFoldersToSettings();
            UpdateState();
            StatusText = "Playlist cleared";
        }

        private void OpenSettings()
        {
            RequestOpenSettingsWindow?.Invoke(this, EventArgs.Empty);
        }

        private void OpenPlaylist()
        {
            RequestOpenPlaylistWindow?.Invoke(this, EventArgs.Empty);
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
        }

        /// <summary>
        /// Removes a folder from the playlist. Called by View or other ViewModels.
        /// </summary>
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

        /// <summary>
        /// Removes a file from the playlist. Called by View or other ViewModels.
        /// </summary>
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
                CurrentMedia = null;
                _videoPlaybackService.Stop();
                UpdateState();
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

            CurrentMedia = _playlistManager.CurrentItem;
            UpdateState();
            RequestShowMedia?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Navigates to a specific file in the playlist. Called by View (e.g., PlaylistWindow).
        /// </summary>
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
                _playlistManager.SetIndex(index);
                CurrentMedia = _playlistManager.CurrentItem;
                RequestShowMedia?.Invoke(this, EventArgs.Empty);
            }
        }

        /// <summary>
        /// Gets the current playlist file paths. Used by PlaylistWindow to check if files are in the playlist.
        /// </summary>
        public IReadOnlyList<string> GetCurrentPlaylist()
        {
            return _playlistManager.GetAllItems().Select(i => i.FilePath).ToList();
        }

        #endregion

        #region Helper Methods

        private async Task LoadFoldersAsync()
        {
            StatusText = "Loading...";

            // Stop any current playback
            _videoPlaybackService?.Stop();
            _slideshowController?.Stop();

            if (Folders.Count == 0)
            {
                StatusText = "No folders selected.";
                UpdateState();
                return;
            }

            try
            {
                // Load files on background thread to avoid blocking UI
                await Task.Run(() =>
                {
                    _playlistManager.LoadFiles(Folders, IncludeVideos);
                });
                
                // Apply sort if needed (using saved sort mode) - also on background thread
                if (_settings.SaveSortMode)
                {
                    var sortMode = ParseSortMode(_settings.SortMode);
                    await Task.Run(() =>
                    {
                        _playlistManager.Sort(sortMode);
                    });
                }

                // All UI-bound property updates must happen on UI thread
                if (Application.Current?.Dispatcher != null)
                {
                    await Application.Current.Dispatcher.InvokeAsync(() =>
                    {
                        UpdateState();

                        if (_playlistManager.HasItems)
                        {
                            _playlistManager.SetIndex(0);
                            CurrentMedia = _playlistManager.CurrentItem;
                            RequestShowMedia?.Invoke(this, EventArgs.Empty);
                            StatusText = "";
                        }
                        else
                        {
                            StatusText = "No media found";
                            CurrentMedia = null;
                        }
                    }, DispatcherPriority.Normal);
                }
                else
                {
                    // Fallback if dispatcher not available
                    UpdateState();

                    if (_playlistManager.HasItems)
                    {
                        _playlistManager.SetIndex(0);
                        CurrentMedia = _playlistManager.CurrentItem;
                        RequestShowMedia?.Invoke(this, EventArgs.Empty);
                        StatusText = "";
                    }
                    else
                    {
                        StatusText = "No media found";
                        CurrentMedia = null;
                    }
                }
            }
            catch (Exception ex)
            {
                StatusText = "Error: " + ex.Message;
                CurrentMedia = null;
                UpdateState();
            }
        }

        private void SaveFoldersToSettings()
        {
            if (_settings.SaveFolderPaths)
            {
                _settings.FolderPaths = new List<string>(Folders);
                _settingsManager.Save(_settings);
            }
        }

        private void UpdateState()
        {
            CurrentIndex = _playlistManager.CurrentIndex >= 0 ? _playlistManager.CurrentIndex : -1;
            TotalCount = _playlistManager.Count;
            UpdateCommandStates();
        }

        private void UpdateCommandStates()
        {
            // Only update command states if commands are initialized
            if (PlayPauseCommand is RelayCommand playPause)
                playPause.RaiseCanExecuteChanged();
            
            if (NextCommand is RelayCommand next)
                next.RaiseCanExecuteChanged();
            
            if (PreviousCommand is RelayCommand previous)
                previous.RaiseCanExecuteChanged();
            
            if (StartSlideshowCommand is RelayCommand start)
                start.RaiseCanExecuteChanged();
            
            if (StopSlideshowCommand is RelayCommand stop)
                stop.RaiseCanExecuteChanged();
            
            if (ClearPlaylistCommand is RelayCommand clear)
                clear.RaiseCanExecuteChanged();
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
            // Ensure UpdateState runs on UI thread since it updates UI-bound properties
            if (Application.Current?.Dispatcher != null && !Application.Current.Dispatcher.CheckAccess())
            {
                Application.Current.Dispatcher.InvokeAsync(() =>
                {
                    UpdateState();
                }, DispatcherPriority.Normal);
            }
            else
            {
                UpdateState();
            }
        }

        private void OnNavigateToIndex(object? sender, int index)
        {
            _playlistManager.SetIndex(index);
            CurrentMedia = _playlistManager.CurrentItem;
            RequestShowMedia?.Invoke(this, EventArgs.Empty);
        }

        private void OnSlideshowStarted(object? sender, EventArgs e)
        {
            IsPlaying = true;
        }

        private void OnSlideshowStopped(object? sender, EventArgs e)
        {
            IsPlaying = false;
        }

        private void OnVideoMediaEnded(object? sender, EventArgs e)
        {
            // If slideshow is running, it will handle advancing
        }

        private void OnVideoMediaOpened(object? sender, EventArgs e)
        {
            // Video playback state is managed by VideoPlaybackService
        }

        #endregion
    }
}
