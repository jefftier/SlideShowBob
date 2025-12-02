using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using FFMediaToolkit;
using SlideShowBob.ViewModels;

namespace SlideShowBob
{
    /// <summary>
    /// Interaction logic for App.xaml
    /// </summary>
    public partial class App : Application
    {
        // Composition root: Services (singleton instances)
        private SettingsManagerWrapper? _settingsManager;
        private MediaLoaderService? _mediaLoaderService;
        private MediaPlaylistManager? _playlistManager;
        private ThumbnailService? _thumbnailService;
        private VideoPlaybackService? _videoPlaybackService;
        private SlideshowController? _slideshowController;

        // Composition root: ViewModels
        private MainViewModel? _mainViewModel;
        private PlaylistViewModel? _playlistViewModel;
        private SettingsViewModel? _settingsViewModel;

        // Main window reference
        private MainWindow? _mainWindow;

        // Windows API to add directory to DLL search path (Windows 8+)
        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr AddDllDirectory(string lpPathName);

        // Windows API to set DLL directory (older method, replaces search path)
        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern bool SetDllDirectory(string lpPathName);

        // Windows API to load a DLL (for testing)
        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr LoadLibrary(string lpFileName);

        static App()
        {
            // Configure FFmpeg for FFMediaToolkit BEFORE any FFMediaToolkit code runs
            // This is critical - FFMediaToolkit must know where FFmpeg is before it tries to load it
            ConfigureFFmpeg();
        }

        /// <summary>
        /// Configures FFmpeg path for FFMediaToolkit. Must be called before any FFMediaToolkit code executes.
        /// Uses best practices: sets both Windows DLL search path AND FFMediaToolkit's FFmpegPath property.
        /// </summary>
        private static void ConfigureFFmpeg()
        {
            try
            {
                var appDir = AppDomain.CurrentDomain.BaseDirectory;
                var ffmpegPath = Path.Combine(appDir, "ffmpeg");
                
                if (!Directory.Exists(ffmpegPath))
                {
                    System.Diagnostics.Debug.WriteLine($"[App] FFmpeg directory not found: {ffmpegPath}. Video thumbnails will use placeholders.");
                    return;
                }

                // Step 1: Configure Windows DLL search path (for native DLL loading)
                ConfigureDllSearchPath(ffmpegPath);

                // Step 2: Configure FFMediaToolkit's FFmpegPath property
                // This must be set BEFORE any FFMediaToolkit code runs
                // Setting it here ensures FFMediaToolkit knows where to find FFmpeg DLLs
                try
                {
                    FFmpegLoader.FFmpegPath = ffmpegPath;
                    System.Diagnostics.Debug.WriteLine($"[App] Set FFMediaToolkit.FFmpegLoader.FFmpegPath = {ffmpegPath}");
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"[App] Warning: Could not set FFmpegLoader.FFmpegPath: {ex.Message}");
                    System.Diagnostics.Debug.WriteLine($"[App] FFMediaToolkit will attempt to find FFmpeg automatically.");
                }

                // Step 3: Verify DLLs are accessible
                VerifyFFmpegDlls(ffmpegPath);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[App] Error configuring FFmpeg: {ex.Message}");
            }
        }

        /// <summary>
        /// Configures Windows DLL search path to include FFmpeg directory.
        /// </summary>
        private static void ConfigureDllSearchPath(string ffmpegPath)
        {
            try
            {
                // Try AddDllDirectory first (Windows 8+, adds to search path without replacing)
                var handle = AddDllDirectory(ffmpegPath);
                if (handle != IntPtr.Zero)
                {
                    System.Diagnostics.Debug.WriteLine($"[App] Added FFmpeg directory to DLL search path (AddDllDirectory): {ffmpegPath}");
                    return;
                }

                // Fallback to SetDllDirectory (replaces search path, but works on older Windows)
                if (SetDllDirectory(ffmpegPath))
                {
                    System.Diagnostics.Debug.WriteLine($"[App] Set FFmpeg DLL directory (SetDllDirectory): {ffmpegPath}");
                }
                else
                {
                    int error = Marshal.GetLastWin32Error();
                    System.Diagnostics.Debug.WriteLine($"[App] Failed to set DLL directory. Error: {error}");
                }
            }
            catch (EntryPointNotFoundException)
            {
                // AddDllDirectory not available on older Windows - fallback already handled
                System.Diagnostics.Debug.WriteLine($"[App] AddDllDirectory not available, using SetDllDirectory fallback");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[App] Exception setting DLL directory: {ex.Message}");
            }
        }

        /// <summary>
        /// Verifies that FFmpeg DLLs are accessible by attempting to load a test DLL.
        /// </summary>
        private static void VerifyFFmpegDlls(string ffmpegPath)
        {
            // Try to find any avcodec DLL (version numbers vary)
            var dllFiles = Directory.GetFiles(ffmpegPath, "avcodec-*.dll");
            if (dllFiles.Length == 0)
            {
                System.Diagnostics.Debug.WriteLine($"[App] Warning: No avcodec DLLs found in {ffmpegPath}");
                return;
            }

            var testDll = dllFiles[0]; // Use first found avcodec DLL
            var dllName = Path.GetFileName(testDll);

            try
            {
                var libHandle = LoadLibrary(testDll);
                if (libHandle != IntPtr.Zero)
                {
                    System.Diagnostics.Debug.WriteLine($"[App] Successfully loaded test DLL: {dllName}");
                    FreeLibrary(libHandle);
                }
                else
                {
                    int error = Marshal.GetLastWin32Error();
                    System.Diagnostics.Debug.WriteLine($"[App] Failed to load test DLL {dllName}. Error code: {error}");
                    System.Diagnostics.Debug.WriteLine($"[App] Common causes: Missing Visual C++ Redistributable, wrong architecture, or missing dependencies.");
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[App] Exception loading test DLL: {ex.Message}");
            }
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool FreeLibrary(IntPtr hModule);

        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            try
            {
                // Step 1: Create service instances (composition root - singleton instances)
                _settingsManager = new SettingsManagerWrapper();
                _mediaLoaderService = new MediaLoaderService();
                _playlistManager = new MediaPlaylistManager();
                _thumbnailService = new ThumbnailService();

                // Step 2: Create MainWindow to access UI elements needed for VideoPlaybackService
                _mainWindow = new MainWindow();
                
                // Get UI elements from MainWindow
                var videoElement = _mainWindow.FindName("VideoElement") as MediaElement;
                var videoProgressBar = _mainWindow.FindName("VideoProgressBar") as ProgressBar;

                if (videoElement == null || videoProgressBar == null)
                {
                    throw new InvalidOperationException("Required UI elements (VideoElement, VideoProgressBar) not found in MainWindow.");
                }

                // Step 3: Create VideoPlaybackService with UI elements
                _videoPlaybackService = new VideoPlaybackService(videoElement, videoProgressBar);

                // Step 4: Create SlideshowController (depends on MediaPlaylistManager)
                _slideshowController = new SlideshowController(_playlistManager);

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

                // Step 7: Pass MainViewModel to MainWindow and show it
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

        private void MainViewModel_RequestOpenPlaylistWindow(object? sender, EventArgs e)
        {
            // Create PlaylistViewModel if not already created (lazy initialization)
            if (_playlistViewModel == null)
            {
                if (_thumbnailService == null || _mainViewModel == null)
                {
                    throw new InvalidOperationException("Required services not initialized.");
                }
                _playlistViewModel = new PlaylistViewModel(_thumbnailService, _mainViewModel);
            }

            // Create and show PlaylistWindow
            var playlistWindow = new PlaylistWindow(_playlistViewModel);
            playlistWindow.Owner = _mainWindow;
            playlistWindow.Show();
        }

        private void MainViewModel_RequestOpenSettingsWindow(object? sender, EventArgs e)
        {
            // Create SettingsViewModel if not already created (lazy initialization)
            if (_settingsViewModel == null)
            {
                if (_settingsManager == null)
                {
                    throw new InvalidOperationException("Required services not initialized.");
                }
                _settingsViewModel = new SettingsViewModel(_settingsManager);
            }
            else
            {
                // Reload settings in case they were changed externally
                _settingsViewModel = new SettingsViewModel(_settingsManager);
            }

            // Create and show SettingsWindow
            var settingsWindow = new SettingsWindow(_settingsViewModel);
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
