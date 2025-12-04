using System;
using System.Windows;
using System.Windows.Controls;
using SlideShowBob.ViewModels;

namespace SlideShowBob
{
    /// <summary>
    /// Interaction logic for App.xaml
    /// </summary>
    public partial class App : Application
    {
        // Composition root: Services (singleton instances)
        private IAppSettingsService? _settingsManager;
        private MediaLoaderService? _mediaLoaderService;
        private MediaPlaylistManager? _playlistManager;
        private ThumbnailService? _thumbnailService;
        private VideoPlaybackService? _videoPlaybackService;
        private SlideshowController? _slideshowController;

        // Composition root: ViewModels
        private MainViewModel? _mainViewModel;

        // Main window reference
        private MainWindow? _mainWindow;

        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            try
            {
                // ============================================
                // COMPOSITION ROOT: Create all services
                // ============================================
                
                // Step 1: Create stateless services (no dependencies on UI)
                _settingsManager = new SettingsManagerWrapper();
                _mediaLoaderService = new MediaLoaderService();
                _playlistManager = new MediaPlaylistManager();
                _thumbnailService = new ThumbnailService();

                // Step 2: Create MainWindow (parameterless) to access UI elements
                // Note: We need UI elements before we can create VideoPlaybackService
                _mainWindow = new MainWindow();
                
                // Get UI elements from MainWindow (required for VideoPlaybackService)
                var videoElement = _mainWindow.FindName("VideoElement") as MediaElement;
                var videoProgressBar = _mainWindow.FindName("VideoProgressBar") as ProgressBar;

                if (videoElement == null || videoProgressBar == null)
                {
                    throw new InvalidOperationException(
                        "Required UI elements (VideoElement, VideoProgressBar) not found in MainWindow.");
                }

                // Step 3: Create VideoPlaybackService with UI elements
                _videoPlaybackService = new VideoPlaybackService(videoElement, videoProgressBar);

                // Step 4: Create SlideshowController (depends on MediaPlaylistManager)
                _slideshowController = new SlideshowController(_playlistManager);

                // ============================================
                // COMPOSITION ROOT: Create ViewModels
                // ============================================
                
                // Step 5: Create MainViewModel with all services
                _mainViewModel = new MainViewModel(
                    settingsManager: _settingsManager,
                    playlistManager: _playlistManager,
                    mediaLoaderService: _mediaLoaderService,
                    thumbnailService: _thumbnailService,
                    videoPlaybackService: _videoPlaybackService,
                    slideshowController: _slideshowController);

                // Step 6: Subscribe to MainViewModel events for window creation
                _mainViewModel.RequestOpenPlaylistWindow += MainViewModel_RequestOpenPlaylistWindow;
                _mainViewModel.RequestOpenSettingsWindow += MainViewModel_RequestOpenSettingsWindow;

                // ============================================
                // COMPOSITION ROOT: Initialize and show MainWindow
                // ============================================
                
                // Step 7: Initialize MainWindow with ViewModel and show it
                _mainWindow.InitializeWithViewModel(_mainViewModel);
                _mainWindow.Show();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[App] Error during startup: {ex.Message}");
                System.Diagnostics.Debug.WriteLine($"[App] Stack trace: {ex.StackTrace}");
                
                // Show error to user
                MessageBox.Show(
                    $"Failed to start application: {ex.Message}",
                    "Startup Error",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
                
                Shutdown();
            }
        }

        /// <summary>
        /// Handles request to open PlaylistWindow. Creates PlaylistViewModel and window.
        /// </summary>
        private void MainViewModel_RequestOpenPlaylistWindow(object? sender, EventArgs e)
        {
            if (_thumbnailService == null || _mainViewModel == null)
            {
                throw new InvalidOperationException("Required services not initialized.");
            }

            // Create PlaylistViewModel with required services
            // Note: PlaylistViewModel is created fresh each time (not cached) to ensure it reflects current playlist state
            var playlistViewModel = new PlaylistViewModel(_thumbnailService, _mainViewModel);

            // Create and show PlaylistWindow
            var playlistWindow = new PlaylistWindow(playlistViewModel);
            playlistWindow.Owner = _mainWindow;
            playlistWindow.Show();
        }

        /// <summary>
        /// Handles request to open SettingsWindow. Creates SettingsViewModel and window.
        /// </summary>
        private void MainViewModel_RequestOpenSettingsWindow(object? sender, EventArgs e)
        {
            if (_settingsManager == null)
            {
                throw new InvalidOperationException("Required services not initialized.");
            }

            // Create SettingsViewModel with SettingsManager
            // Note: SettingsViewModel is created fresh each time to load current settings
            var settingsViewModel = new SettingsViewModel(_settingsManager);

            // Create and show SettingsWindow
            var settingsWindow = new SettingsWindow(settingsViewModel);
            settingsWindow.Owner = _mainWindow;
            
            if (settingsWindow.ShowDialog() == true)
            {
                // Settings were saved, notify MainViewModel to reload
                if (_mainViewModel != null)
                {
                    _mainViewModel.ReloadSettings();
                }
            }
        }
    }
}
