using System;
using System.Configuration;
using System.Data;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using FFMediaToolkit;

namespace SlideShowBob
{
    /// <summary>
    /// Interaction logic for App.xaml
    /// </summary>
    public partial class App : Application
    {
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
    }

}
