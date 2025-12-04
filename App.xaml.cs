using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
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

        // Windows API to add directory to DLL search path (Windows 8+)
        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr AddDllDirectory(string lpPathName);

        // Windows API to set DLL directory (older method, replaces search path)
        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern bool SetDllDirectory(string lpPathName);

        // Windows API to load a DLL (for testing)
        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr LoadLibrary(string lpFileName);

        // Static flag to track if FFMPEG is configured
        private static bool _ffmpegConfigured = false;
        private static string? _ffmpegPath = null;

        static App()
        {
            // Try to configure FFmpeg if it exists, but don't fail if it doesn't
            // We'll offer to download it in OnStartup if needed
            TryConfigureFFmpeg();
        }

        /// <summary>
        /// Tries to configure FFmpeg if it exists. Does not fail if FFMPEG is not found.
        /// </summary>
        private static void TryConfigureFFmpeg()
        {
            var path = FindFFmpegPath();
            if (path != null)
            {
                ConfigureFFmpegPath(path);
                _ffmpegConfigured = true;
                _ffmpegPath = path;
                
                // Reset availability check so ThumbnailService will test FFMPEG
                ThumbnailService.ResetFFmpegAvailability();
            }
        }

        /// <summary>
        /// Gets the directory where the application EXE is located.
        /// For single-file published apps, this is the actual EXE location, not the BaseDirectory.
        /// </summary>
        private static string GetExeDirectory()
        {
            try
            {
                // For single-file published apps, Location points to the actual EXE
                var exePath = Assembly.GetExecutingAssembly().Location;
                if (!string.IsNullOrEmpty(exePath))
                {
                    return Path.GetDirectoryName(exePath) ?? AppDomain.CurrentDomain.BaseDirectory;
                }
            }
            catch
            {
                // Fallback to BaseDirectory if Location is not available
            }
            
            return AppDomain.CurrentDomain.BaseDirectory;
        }

        /// <summary>
        /// Finds FFMPEG path by checking for existing files or embedded resources.
        /// </summary>
        private static string? FindFFmpegPath()
        {
            try
            {
                // Use EXE directory, not BaseDirectory (which may point to publish folder for single-file apps)
                var exeDir = GetExeDirectory();
                var ffmpegPath = Path.Combine(exeDir, "ffmpeg");
                
                System.Diagnostics.Debug.WriteLine($"[App] Looking for FFMPEG in: {ffmpegPath} (EXE dir: {exeDir}, BaseDir: {AppDomain.CurrentDomain.BaseDirectory})");
                
                // Check for separate FFMPEG files
                if (Directory.Exists(ffmpegPath))
                {
                    var dllFiles = Directory.GetFiles(ffmpegPath, "*.dll");
                    if (dllFiles.Length > 0)
                    {
                        System.Diagnostics.Debug.WriteLine($"[App] Found FFmpeg directory with {dllFiles.Length} DLLs: {ffmpegPath}");
                        return ffmpegPath;
                    }
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[App] Error finding FFmpeg: {ex.Message}");
            }
            
            return null;
        }

        /// <summary>
        /// Configures FFmpeg path for FFMediaToolkit. Must be called before any FFMediaToolkit code executes.
        /// Uses best practices: sets both Windows DLL search path AND FFMediaToolkit's FFmpegPath property.
        /// </summary>
        private static void ConfigureFFmpegPath(string ffmpegPath)
        {
            try
            {
                // Verify the path exists and has DLLs
                if (!Directory.Exists(ffmpegPath))
                {
                    System.Diagnostics.Debug.WriteLine($"[App] FFmpeg path does not exist: {ffmpegPath}");
                    return;
                }

                var dllFiles = Directory.GetFiles(ffmpegPath, "*.dll");
                if (dllFiles.Length == 0)
                {
                    System.Diagnostics.Debug.WriteLine($"[App] FFmpeg directory exists but contains no DLLs: {ffmpegPath}");
                    return;
                }

                System.Diagnostics.Debug.WriteLine($"[App] Configuring FFmpeg with {dllFiles.Length} DLLs: {ffmpegPath}");
                
                // Configure Windows DLL search path (for native DLL loading)
                ConfigureDllSearchPath(ffmpegPath);

                // Configure FFMediaToolkit's FFmpegPath property
                // This must be set BEFORE any FFMediaToolkit code runs
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

                // Verify DLLs are accessible
                VerifyFFmpegDlls(ffmpegPath);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[App] Error configuring FFmpeg: {ex.Message}");
            }
        }

        /// <summary>
        /// Extracts FFMPEG files from embedded resources to a temporary directory.
        /// Returns the path to the extracted FFMPEG directory, or null if extraction failed or no embedded resources found.
        /// </summary>
        private static string? ExtractEmbeddedFFmpeg()
        {
            try
            {
                var assembly = Assembly.GetExecutingAssembly();
                var resourceNames = assembly.GetManifestResourceNames();
                
                // Find all FFMPEG embedded resources (they start with "ffmpeg.")
                var ffmpegResources = resourceNames.Where(name => name.StartsWith("ffmpeg.", StringComparison.OrdinalIgnoreCase)).ToList();
                
                if (ffmpegResources.Count == 0)
                {
                    // No embedded resources - this is fine, might be running from development or files already exist
                    return null;
                }

                // Determine extraction location
                // Try to extract next to the EXE first, fallback to temp directory if not writable
                string extractBaseDir;
                var appDir = AppDomain.CurrentDomain.BaseDirectory;
                var exePath = Assembly.GetExecutingAssembly().Location;
                
                // Check if we can write to the app directory (might be read-only in some scenarios)
                try
                {
                    var testFile = Path.Combine(appDir, ".write_test");
                    File.WriteAllText(testFile, "test");
                    File.Delete(testFile);
                    extractBaseDir = appDir;
                }
                catch
                {
                    // Can't write to app directory, use temp directory
                    // Use a hash of the EXE path to create a unique folder per application instance
                    var exeHash = ComputeHash(exePath);
                    extractBaseDir = Path.Combine(Path.GetTempPath(), "SlideShowBob_FFmpeg", exeHash);
                }

                var ffmpegExtractPath = Path.Combine(extractBaseDir, "ffmpeg");
                
                // Check if already extracted (avoid re-extraction on every run)
                var markerFile = Path.Combine(ffmpegExtractPath, ".extracted");
                if (Directory.Exists(ffmpegExtractPath) && File.Exists(markerFile))
                {
                    // Already extracted, verify at least one DLL exists
                    var dllFiles = Directory.GetFiles(ffmpegExtractPath, "*.dll");
                    if (dllFiles.Length > 0)
                    {
                        System.Diagnostics.Debug.WriteLine($"[App] FFmpeg already extracted to: {ffmpegExtractPath}");
                        return ffmpegExtractPath;
                    }
                }

                // Extract all FFMPEG resources
                Directory.CreateDirectory(ffmpegExtractPath);
                int extractedCount = 0;

                foreach (var resourceName in ffmpegResources)
                {
                    try
                    {
                        // Resource name format: "ffmpeg.filename.ext" 
                        // Remove "ffmpeg." prefix to get the filename
                        var fileName = resourceName.Substring("ffmpeg.".Length);
                        var targetPath = Path.Combine(ffmpegExtractPath, fileName);

                        // Extract the resource
                        using (var resourceStream = assembly.GetManifestResourceStream(resourceName))
                        {
                            if (resourceStream != null)
                            {
                                using (var fileStream = new FileStream(targetPath, FileMode.Create, FileAccess.Write))
                                {
                                    resourceStream.CopyTo(fileStream);
                                }
                                extractedCount++;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        System.Diagnostics.Debug.WriteLine($"[App] Error extracting resource {resourceName}: {ex.Message}");
                    }
                }

                if (extractedCount > 0)
                {
                    // Create marker file to indicate successful extraction
                    File.WriteAllText(markerFile, DateTime.UtcNow.ToString("O"));
                    System.Diagnostics.Debug.WriteLine($"[App] Extracted {extractedCount} FFmpeg files to: {ffmpegExtractPath}");
                    return ffmpegExtractPath;
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[App] Error extracting embedded FFmpeg: {ex.Message}");
            }

            return null;
        }

        /// <summary>
        /// Computes a short hash of a string for use in directory names.
        /// </summary>
        private static string ComputeHash(string input)
        {
            using (var sha256 = SHA256.Create())
            {
                var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(input));
                return Convert.ToBase64String(hashBytes).Replace('/', '_').Replace('+', '-').Substring(0, 16);
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
                // Try loading with full path first
                var libHandle = LoadLibrary(testDll);
                if (libHandle == IntPtr.Zero)
                {
                    // Try loading with just filename (should find it via DLL search path)
                    var dllNameOnly = Path.GetFileName(testDll);
                    libHandle = LoadLibrary(dllNameOnly);
                }
                
                if (libHandle != IntPtr.Zero)
                {
                    System.Diagnostics.Debug.WriteLine($"[App] Successfully loaded test DLL: {dllName}");
                    FreeLibrary(libHandle);
                }
                else
                {
                    int error = Marshal.GetLastWin32Error();
                    var errorMsg = GetWin32ErrorMessage(error);
                    System.Diagnostics.Debug.WriteLine($"[App] Failed to load test DLL {dllName}. Error code: {error} ({errorMsg})");
                    System.Diagnostics.Debug.WriteLine($"[App] Path: {testDll}");
                    System.Diagnostics.Debug.WriteLine($"[App] Common causes:");
                    System.Diagnostics.Debug.WriteLine($"[App]   1. Missing Visual C++ Redistributable (install from Microsoft)");
                    System.Diagnostics.Debug.WriteLine($"[App]   2. Wrong architecture (need 64-bit for win-x64)");
                    System.Diagnostics.Debug.WriteLine($"[App]   3. Missing dependency DLLs (check all FFMPEG DLLs are present)");
                    
                    // Try to identify missing dependencies
                    CheckDllDependencies(testDll);
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[App] Exception loading test DLL: {ex.Message}");
                System.Diagnostics.Debug.WriteLine($"[App] Stack trace: {ex.StackTrace}");
            }
        }

        /// <summary>
        /// Gets a human-readable error message for a Win32 error code.
        /// </summary>
        private static string GetWin32ErrorMessage(int errorCode)
        {
            switch (errorCode)
            {
                case 126: return "Module not found (missing dependency)";
                case 127: return "Procedure not found";
                case 193: return "Not a valid Win32 application (wrong architecture)";
                default: return $"Win32 error {errorCode}";
            }
        }

        /// <summary>
        /// Checks for missing DLL dependencies by examining the DLL.
        /// </summary>
        private static void CheckDllDependencies(string dllPath)
        {
            try
            {
                // List all DLLs in the FFMPEG folder to help identify missing ones
                var allDlls = Directory.GetFiles(Path.GetDirectoryName(dllPath)!, "*.dll");
                System.Diagnostics.Debug.WriteLine($"[App] FFMPEG folder contains {allDlls.Length} DLL files:");
                foreach (var dll in allDlls.Take(10)) // Show first 10
                {
                    System.Diagnostics.Debug.WriteLine($"[App]   - {Path.GetFileName(dll)}");
                }
                if (allDlls.Length > 10)
                {
                    System.Diagnostics.Debug.WriteLine($"[App]   ... and {allDlls.Length - 10} more");
                }
            }
            catch
            {
                // Ignore errors in diagnostic code
            }
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool FreeLibrary(IntPtr hModule);

        /// <summary>
        /// Offers to download and install FFMPEG if it's not found.
        /// Shows a dialog to the user and handles the download if accepted.
        /// </summary>
        private void OfferFFmpegDownload()
        {
            try
            {
                var downloadWindow = new FFmpegDownloadWindow();
                downloadWindow.Owner = null; // No owner since main window isn't created yet
                downloadWindow.WindowStartupLocation = WindowStartupLocation.CenterScreen;
                
                var result = downloadWindow.ShowDialog();
                
                if (result == true && downloadWindow.InstalledFFmpegPath != null)
                {
                    // FFMPEG was successfully installed, configure it now
                    ConfigureFFmpegPath(downloadWindow.InstalledFFmpegPath);
                    _ffmpegConfigured = true;
                    _ffmpegPath = downloadWindow.InstalledFFmpegPath;
                    
                    // Reset availability check so ThumbnailService will try FFMPEG again
                    ThumbnailService.ResetFFmpegAvailability();
                    
                    System.Diagnostics.Debug.WriteLine($"[App] FFMPEG installed and configured: {downloadWindow.InstalledFFmpegPath}");
                }
                else if (downloadWindow.WasCancelled)
                {
                    System.Diagnostics.Debug.WriteLine($"[App] User skipped FFMPEG download. Video features will be limited.");
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[App] Error offering FFMPEG download: {ex.Message}");
                // Don't block startup if download dialog fails
            }
        }

        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);

            // Check if FFMPEG is configured, offer to download if not
            if (!_ffmpegConfigured)
            {
                OfferFFmpegDownload();
            }

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

