using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using FFMediaToolkit;
using FFMediaToolkit.Decoding;
using FFMediaToolkit.Graphics;
using SlideShowBob.Models;

namespace SlideShowBob
{
    /// <summary>
    /// Service for loading and caching thumbnails for media items.
    /// Uses LRU cache to manage memory usage.
    /// </summary>
    public class ThumbnailService
    {
        // Windows API to load/unload DLLs for testing
        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr LoadLibrary(string lpFileName);
        
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool FreeLibrary(IntPtr hModule);
        private static bool _ffmpegAvailable = false;
        private static bool _ffmpegChecked = false;
        private static string? _ffmpegFailureReason = null;
        private static readonly object _ffmpegCheckLock = new object();

        // Note: FFmpeg configuration is handled in App.xaml.cs static constructor
        // to ensure it happens before any FFMediaToolkit code runs.
        // This static constructor is intentionally minimal to avoid early FFMediaToolkit initialization.

        /// <summary>
        /// Resets the FFMPEG availability check. Call this when FFMPEG is reconfigured or reinstalled.
        /// </summary>
        public static void ResetFFmpegAvailability()
        {
            lock (_ffmpegCheckLock)
            {
                _ffmpegAvailable = false;
                _ffmpegChecked = false;
                _ffmpegFailureReason = null;
                System.Diagnostics.Debug.WriteLine("[ThumbnailService] FFMPEG availability check reset");
            }
        }

        /// <summary>
        /// Checks if FFmpeg is available. Returns true if available, false if unavailable.
        /// If not yet checked, returns true to allow one attempt (will be marked unavailable on failure).
        /// </summary>
        private static bool CheckFFmpegAvailability()
        {
            lock (_ffmpegCheckLock)
            {
                // If already checked, return cached result
                if (_ffmpegChecked)
                    return _ffmpegAvailable;

                // Not checked yet - allow one attempt
                // If it fails, ExtractVideoFrameAsync will mark it as unavailable
                return true;
            }
        }

        /// <summary>
        /// Public method to check if FFmpeg is enabled and available.
        /// Checks both the setting flag and actual FFmpeg availability.
        /// </summary>
        public static bool IsFfmpegEnabled(bool useFfmpegSetting)
        {
            // First check if the setting allows FFmpeg usage
            if (!useFfmpegSetting)
                return false;

            // Check if FFmpeg directory exists (use EXE directory, not BaseDirectory)
            var exeDir = GetExeDirectory();
            var ffmpegPath = Path.Combine(exeDir, "ffmpeg");
            
            if (!Directory.Exists(ffmpegPath))
                return false;

            // Check if FFmpeg DLLs are present
            var dllFiles = Directory.GetFiles(ffmpegPath, "avcodec-*.dll");
            if (dllFiles.Length == 0)
                return false;

            // If we've already checked and marked it as unavailable, return that result
            lock (_ffmpegCheckLock)
            {
                if (_ffmpegChecked)
                    return _ffmpegAvailable;
            }

            // If not yet checked, assume available (will be marked unavailable on first failure)
            return true;
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
        /// Gets the FFMPEG path being used. Useful for diagnostics.
        /// </summary>
        public static string GetFfmpegPath()
        {
            var configuredPath = FFmpegLoader.FFmpegPath;
            if (!string.IsNullOrEmpty(configuredPath))
                return configuredPath;
            
            // Use EXE directory, not BaseDirectory (which may point to publish folder for single-file apps)
            var exeDir = GetExeDirectory();
            return Path.Combine(exeDir, "ffmpeg");
        }

        /// <summary>
        /// Gets the detailed FFMPEG status for display purposes.
        /// Returns: "Available", "Not Available", or "Not Tested"
        /// </summary>
        public static string GetFfmpegStatusText(bool useFfmpegSetting)
        {
            if (!useFfmpegSetting)
                return "Not Available (disabled in settings)";

            var configuredPath = FFmpegLoader.FFmpegPath;
            var exeDir = GetExeDirectory();
            var ffmpegPath = Path.Combine(exeDir, "ffmpeg");
            
            // Check both expected path and configured path
            var checkPath = configuredPath ?? ffmpegPath;
            
            // Log path info for debugging
            System.Diagnostics.Debug.WriteLine($"[ThumbnailService] GetFfmpegStatusText - ExeDir: {exeDir}, BaseDir: {AppDomain.CurrentDomain.BaseDirectory}, ConfiguredPath: {configuredPath ?? "null"}, CheckPath: {checkPath}");
            
            if (!Directory.Exists(checkPath))
            {
                return $"Not Available (path not found: {checkPath})";
            }

            var dllFiles = Directory.GetFiles(checkPath, "avcodec-*.dll");
            if (dllFiles.Length == 0)
                return $"Not Available (no DLLs in: {checkPath})";

            // Check FFMPEG version (informational only - we'll test compatibility at runtime)
            var versionInfo = CheckFFmpegVersion(ffmpegPath);
            if (versionInfo.HasValue)
            {
                // Version 62 could be FFmpeg 6.2 or 8.0.1 - we'll test at runtime
                // Don't block based on version number alone
                System.Diagnostics.Debug.WriteLine($"[ThumbnailService] FFMPEG version detected: {versionInfo.Value.Version} (compatible: {versionInfo.Value.IsCompatible})");
            }

            lock (_ffmpegCheckLock)
            {
                if (_ffmpegChecked)
                {
                    if (_ffmpegAvailable)
                        return $"Active (path: {checkPath})";
                    
                    // Show failure reason if available, always include path
                    if (!string.IsNullOrEmpty(_ffmpegFailureReason))
                        return $"Not Available - {_ffmpegFailureReason} (path: {checkPath})";
                    
                    return $"Not Available - test failed (path: {checkPath})";
                }
            }

            return $"Available (path: {checkPath}, will be tested on first use)";
        }

        /// <summary>
        /// Checks the FFMPEG version from DLL filenames.
        /// </summary>
        private static (string Version, bool IsCompatible)? CheckFFmpegVersion(string ffmpegPath)
        {
            try
            {
                var avcodecFiles = Directory.GetFiles(ffmpegPath, "avcodec-*.dll");
                if (avcodecFiles.Length == 0)
                    return null;

                var fileName = Path.GetFileName(avcodecFiles[0]);
                // Extract version number: avcodec-70.dll -> 70, avcodec-62.dll -> 62
                var parts = fileName.Split('-');
                if (parts.Length >= 2)
                {
                    var versionPart = parts[1].Split('.')[0];
                    if (int.TryParse(versionPart, out int version))
                    {
                        // FFMediaToolkit 4.8.1 requires FFMPEG 7.x (version 70+)
                        bool isCompatible = version >= 70;
                        return (versionPart, isCompatible);
                    }
                }
            }
            catch
            {
                // Ignore errors in version checking
            }
            return null;
        }

        /// <summary>
        /// Marks FFmpeg as unavailable after a failure. Thread-safe.
        /// </summary>
        private static void MarkFFmpegUnavailable(string? reason = null)
        {
            lock (_ffmpegCheckLock)
            {
                _ffmpegAvailable = false;
                _ffmpegChecked = true;
                _ffmpegFailureReason = reason;
            }
        }

        private readonly Dictionary<string, CachedThumbnail> _cache = new();
        private readonly object _cacheLock = new();
        private readonly SemaphoreSlim _videoExtractionSemaphore = new SemaphoreSlim(1, 1); // Limit concurrent video extractions
        
        // Cache configuration:
        // - MaxCacheSize: 200 thumbnails (reasonable for playlist views)
        // - LRU eviction: Uses LastAccessed timestamp to remove least recently used items
        // - ThumbnailSize: 200px (small enough for fast loading, large enough for recognition)
        private const int MaxCacheSize = 200;
        private const int ThumbnailSize = 200;
        
        // Maximum video frame dimensions: Safety guardrail for video frame extraction
        // Prevents memory issues when extracting frames from extremely high-resolution videos
        // (e.g., 8K videos would create huge bitmaps before scaling)
        private const int MaxVideoFrameWidth = 4096;
        private const int MaxVideoFrameHeight = 4096;

        private class CachedThumbnail
        {
            public BitmapSource? Thumbnail { get; set; }
            public DateTime LastAccessed { get; set; }
            public bool IsLoading { get; set; }
        }

        /// <summary>
        /// Loads a thumbnail for the given media item asynchronously.
        /// Returns null if the file doesn't exist or can't be loaded.
        /// </summary>
        public async Task<BitmapSource?> LoadThumbnailAsync(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
                return null;

            string normalizedPath = Path.GetFullPath(filePath);

            // Check cache first
            lock (_cacheLock)
            {
                if (_cache.TryGetValue(normalizedPath, out var cached) && cached.Thumbnail != null)
                {
                    cached.LastAccessed = DateTime.UtcNow;
                    return cached.Thumbnail;
                }

                // If already loading, return null (will be updated when loading completes)
                if (cached?.IsLoading == true)
                    return null;

                // Mark as loading
                if (cached == null)
                {
                    cached = new CachedThumbnail { IsLoading = true };
                    _cache[normalizedPath] = cached;
                }
                else
                {
                    cached.IsLoading = true;
                }
            }

            try
            {
                BitmapSource? thumbnail = await GenerateThumbnailAsync(normalizedPath);

                lock (_cacheLock)
                {
                    if (_cache.TryGetValue(normalizedPath, out var cached))
                    {
                        cached.Thumbnail = thumbnail;
                        cached.IsLoading = false;
                        cached.LastAccessed = DateTime.UtcNow;
                    }

                    // Enforce cache size limit
                    EnforceCacheSize();
                }

                return thumbnail;
            }
            catch
            {
                lock (_cacheLock)
                {
                    if (_cache.TryGetValue(normalizedPath, out var cached))
                    {
                        cached.IsLoading = false;
                    }
                }
                return null;
            }
        }

        private async Task<BitmapSource?> GenerateThumbnailAsync(string filePath)
        {
            try
            {
                string extension = Path.GetExtension(filePath).ToLowerInvariant();

                // Handle images (including GIFs - they're treated as images for thumbnails)
                if (extension is ".jpg" or ".jpeg" or ".png" or ".bmp" or ".tif" or ".tiff" or ".gif")
                {
                    return LoadImageThumbnail(filePath);
                }

                // Handle videos - extract a frame from the video
                if (extension == ".mp4")
                {
                    return await ExtractVideoFrameAsync(filePath);
                }

                // Unknown format - return null
                return null;
            }
            catch (Exception ex)
            {
                // Log error for debugging
                System.Diagnostics.Debug.WriteLine($"Error generating thumbnail for {filePath}: {ex.Message}");
                return null;
            }
        }

        private BitmapSource LoadImageThumbnail(string filePath)
        {
            // First, load image metadata to get dimensions without full decode
            var tempBitmap = new BitmapImage();
            tempBitmap.BeginInit();
            tempBitmap.CacheOption = BitmapCacheOption.OnLoad;
            tempBitmap.UriSource = new Uri(filePath);
            tempBitmap.DecodePixelWidth = 1; // Minimal decode to get dimensions
            tempBitmap.EndInit();
            tempBitmap.Freeze();

            // Get actual dimensions
            double originalWidth = tempBitmap.PixelWidth;
            double originalHeight = tempBitmap.PixelHeight;
            
            if (originalWidth <= 0 || originalHeight <= 0)
            {
                // Fallback: decode as square
                var fallback = new BitmapImage();
                fallback.BeginInit();
                fallback.CacheOption = BitmapCacheOption.OnLoad;
                fallback.DecodePixelWidth = ThumbnailSize;
                fallback.UriSource = new Uri(filePath);
                fallback.EndInit();
                fallback.Freeze();
                return fallback;
            }

            // Calculate which dimension to constrain to maintain aspect ratio
            double aspectRatio = originalWidth / originalHeight;
            var bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            
            // Set only one dimension - WPF will maintain aspect ratio automatically
            if (originalWidth >= originalHeight)
            {
                // Landscape or square: constrain width
                bitmap.DecodePixelWidth = ThumbnailSize;
            }
            else
            {
                // Portrait: constrain height
                bitmap.DecodePixelHeight = ThumbnailSize;
            }
            
            bitmap.UriSource = new Uri(filePath);
            bitmap.EndInit();
            bitmap.Freeze();
            return bitmap;
        }

        /// <summary>
        /// Extracts a frame from a video file using FFMediaToolkit (FFmpeg-based).
        /// Much more memory-efficient than MediaPlayer - only loads the specific frame needed.
        /// Can run on background threads without UI thread dependency.
        /// Handles AccessViolationException which can occur if FFmpeg binaries are missing.
        /// </summary>
        private async Task<BitmapSource?> ExtractVideoFrameAsync(string filePath)
        {
            // Check FFmpeg availability first (only checks once)
            if (!CheckFFmpegAvailability())
            {
                // FFmpeg not available - return placeholder immediately without attempting extraction
                System.Diagnostics.Debug.WriteLine($"FFmpeg not available, using placeholder for: {Path.GetFileName(filePath)}");
                return CreateVideoPlaceholder();
            }

            // Limit concurrent video extractions to avoid overwhelming the system
            await _videoExtractionSemaphore.WaitAsync();
            try
            {
                // FFMediaToolkit can run on background threads - much better than MediaPlayer
                return await Task.Run(() =>
                {
                    MediaFile? mediaFile = null;
                    ImageData frame = default;
                    bool frameDisposed = false;
                    
                    try
                    {
                        // Configure media options for video-only decoding
                        var mediaOptions = new MediaOptions
                        {
                            StreamsToLoad = MediaMode.Video,
                            VideoPixelFormat = ImagePixelFormat.Bgra32 // Match WPF format
                        };

                        // Open video file with FFMediaToolkit
                        // This can throw DirectoryNotFoundException if FFmpeg binaries are missing
                        mediaFile = MediaFile.Open(filePath, mediaOptions);
                        
                        if (mediaFile.Video == null)
                        {
                            return CreateVideoPlaceholder();
                        }

                        // Get the first frame at timestamp 0 (FFMediaToolkit 4.8.1 API)
                        frame = mediaFile.Video.GetFrame(TimeSpan.Zero);
                        
                        // Get video dimensions from frame (ImageData is a struct, so check dimensions)
                        int originalWidth = frame.ImageSize.Width;
                        int originalHeight = frame.ImageSize.Height;

                        if (originalWidth <= 0 || originalHeight <= 0)
                        {
                            frame.Dispose();
                            frameDisposed = true;
                            return CreateVideoPlaceholder();
                        }

                        // Apply maximum dimension guardrails to prevent memory issues with extremely high-resolution videos
                        // Calculate scale factor if video exceeds maximum dimensions
                        double scaleFactor = 1.0;
                        int targetWidth = originalWidth;
                        int targetHeight = originalHeight;
                        
                        if (originalWidth > MaxVideoFrameWidth || originalHeight > MaxVideoFrameHeight)
                        {
                            double scaleX = (double)MaxVideoFrameWidth / originalWidth;
                            double scaleY = (double)MaxVideoFrameHeight / originalHeight;
                            scaleFactor = Math.Min(scaleX, scaleY);
                            targetWidth = (int)(originalWidth * scaleFactor);
                            targetHeight = (int)(originalHeight * scaleFactor);
                        }

                        // Calculate thumbnail dimensions maintaining aspect ratio (use original dimensions for aspect ratio)
                        int thumbWidth, thumbHeight;
                        if (originalWidth >= originalHeight)
                        {
                            thumbWidth = ThumbnailSize;
                            thumbHeight = (int)(ThumbnailSize * originalHeight / (double)originalWidth);
                        }
                        else
                        {
                            thumbHeight = ThumbnailSize;
                            thumbWidth = (int)(ThumbnailSize * originalWidth / (double)originalHeight);
                        }

                        // Convert FFMediaToolkit frame data to WPF BitmapSource
                        var pixelDataSpan = frame.Data;
                        var originalStride = originalWidth * 4; // Bgra32 = 4 bytes per pixel
                        
                        // Convert Span<byte> to byte array for WritePixels
                        byte[] pixelDataArray = new byte[pixelDataSpan.Length];
                        pixelDataSpan.CopyTo(pixelDataArray);
                        
                        // Create bitmap - scale down if necessary to prevent memory issues
                        WriteableBitmap fullBitmap;
                        
                        if (scaleFactor < 1.0)
                        {
                            // Scale down during pixel copy (simple nearest-neighbor for performance)
                            // This prevents creating huge bitmaps for 8K+ videos
                            int scaledStride = targetWidth * 4;
                            byte[] scaledData = new byte[scaledStride * targetHeight];
                            
                            for (int y = 0; y < targetHeight; y++)
                            {
                                int srcY = (int)(y / scaleFactor);
                                for (int x = 0; x < targetWidth; x++)
                                {
                                    int srcX = (int)(x / scaleFactor);
                                    int srcIndex = (srcY * originalStride) + (srcX * 4);
                                    int dstIndex = (y * scaledStride) + (x * 4);
                                    
                                    if (srcIndex + 3 < pixelDataArray.Length && dstIndex + 3 < scaledData.Length)
                                    {
                                        scaledData[dstIndex] = pixelDataArray[srcIndex];     // B
                                        scaledData[dstIndex + 1] = pixelDataArray[srcIndex + 1]; // G
                                        scaledData[dstIndex + 2] = pixelDataArray[srcIndex + 2]; // R
                                        scaledData[dstIndex + 3] = pixelDataArray[srcIndex + 3]; // A
                                    }
                                }
                            }
                            
                            fullBitmap = new WriteableBitmap(
                                targetWidth,
                                targetHeight,
                                96, 96, PixelFormats.Bgra32, null);
                            
                            fullBitmap.WritePixels(
                                new Int32Rect(0, 0, targetWidth, targetHeight),
                                scaledData,
                                scaledStride,
                                0);
                        }
                        else
                        {
                            // No scaling needed - use original dimensions
                            fullBitmap = new WriteableBitmap(
                                originalWidth,
                                originalHeight,
                                96, 96, PixelFormats.Bgra32, null);
                            
                            fullBitmap.WritePixels(
                                new Int32Rect(0, 0, originalWidth, originalHeight),
                                pixelDataArray,
                                originalStride,
                                0);
                        }

                        // Scale down to thumbnail size efficiently using TransformedBitmap
                        var scaledBitmap = new TransformedBitmap(
                            fullBitmap,
                            new ScaleTransform(
                                (double)thumbWidth / fullBitmap.PixelWidth,
                                (double)thumbHeight / fullBitmap.PixelHeight));

                        scaledBitmap.Freeze();
                        
                        // Mark FFMPEG as available since we successfully extracted a frame
                        lock (_ffmpegCheckLock)
                        {
                            if (!_ffmpegChecked || !_ffmpegAvailable)
                            {
                                _ffmpegAvailable = true;
                                _ffmpegChecked = true;
                                System.Diagnostics.Debug.WriteLine("[ThumbnailService] FFMPEG marked as available after successful frame extraction");
                            }
                        }
                        
                        // Dispose frame before returning
                        frame.Dispose();
                        frameDisposed = true;
                        
                        return scaledBitmap;
                    }
                    catch (DirectoryNotFoundException ex)
                    {
                        // FFmpeg binaries not found - mark as unavailable for future attempts
                        var reason = "FFMPEG path not found";
                        MarkFFmpegUnavailable(reason);
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] FFmpeg DirectoryNotFoundException for {Path.GetFileName(filePath)}: {ex.Message}");
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] FFmpegLoader.FFmpegPath = {FFmpegLoader.FFmpegPath ?? "null"}");
                        return CreateVideoPlaceholder();
                    }
                    catch (AccessViolationException ex)
                    {
                        // FFmpeg not properly initialized or memory issue
                        // This often happens when FFmpeg binaries are missing or incompatible
                        var reason = "Access violation (may need Visual C++ Redistributable)";
                        MarkFFmpegUnavailable(reason);
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] FFmpeg AccessViolationException for {Path.GetFileName(filePath)}: {ex.Message}");
                        return CreateVideoPlaceholder();
                    }
                    catch (DllNotFoundException ex)
                    {
                        // FFmpeg DLLs not found - mark as unavailable
                        var exeDir = GetExeDirectory();
                        var expectedPath = Path.Combine(exeDir, "ffmpeg");
                        var configuredPath = FFmpegLoader.FFmpegPath ?? "null";
                        var reason = $"DLL not found. Path: {configuredPath}. May need Visual C++ Redistributable.";
                        MarkFFmpegUnavailable(reason);
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] FFmpeg DllNotFoundException for {Path.GetFileName(filePath)}: {ex.Message}");
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Exception details: {ex}");
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Exe directory: {exeDir}");
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] AppDomain.CurrentDomain.BaseDirectory = {AppDomain.CurrentDomain.BaseDirectory}");
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Expected FFMPEG path = {expectedPath}");
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] FFmpegLoader.FFmpegPath = {configuredPath}");
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Directory exists: {Directory.Exists(configuredPath)}");
                        if (Directory.Exists(configuredPath))
                        {
                            var dlls = Directory.GetFiles(configuredPath, "*.dll");
                            System.Diagnostics.Debug.WriteLine($"[ThumbnailService] DLLs found in path: {dlls.Length}");
                            if (dlls.Length > 0)
                            {
                                System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Sample DLLs:");
                                foreach (var dll in dlls.Take(5))
                                {
                                    System.Diagnostics.Debug.WriteLine($"[ThumbnailService]   - {Path.GetFileName(dll)}");
                                }
                                
                                // Try to load a DLL directly to see what error we get
                                try
                                {
                                    var testDll = dlls.FirstOrDefault(f => f.Contains("avcodec"));
                                    if (testDll != null)
                                    {
                                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Attempting to load: {testDll}");
                                        var handle = LoadLibrary(testDll);
                                        if (handle == IntPtr.Zero)
                                        {
                                            int error = Marshal.GetLastWin32Error();
                                            System.Diagnostics.Debug.WriteLine($"[ThumbnailService] LoadLibrary failed with error code: {error}");
                                        }
                                        else
                                        {
                                            System.Diagnostics.Debug.WriteLine($"[ThumbnailService] LoadLibrary succeeded!");
                                            FreeLibrary(handle);
                                        }
                                    }
                                }
                                catch (Exception loadEx)
                                {
                                    System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Error testing DLL load: {loadEx.Message}");
                                }
                            }
                        }
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] SOLUTION: Install Visual C++ Redistributable from Microsoft if not already installed.");
                        return CreateVideoPlaceholder();
                    }
                    catch (Exception ex)
                    {
                        // Any other error - return placeholder
                        var reason = $"{ex.GetType().Name}";
                        if (!string.IsNullOrEmpty(ex.Message))
                        {
                            // Truncate long messages
                            var shortMessage = ex.Message.Length > 50 ? ex.Message.Substring(0, 50) + "..." : ex.Message;
                            reason += $": {shortMessage}";
                        }
                        if (ex.InnerException != null)
                        {
                            reason += $" ({ex.InnerException.GetType().Name})";
                        }
                        MarkFFmpegUnavailable(reason);
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] FFmpeg error for {Path.GetFileName(filePath)}: {ex.GetType().Name}: {ex.Message}");
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] FFmpegLoader.FFmpegPath = {FFmpegLoader.FFmpegPath ?? "null"}");
                        if (ex.InnerException != null)
                        {
                            System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Inner exception: {ex.InnerException.GetType().Name}: {ex.InnerException.Message}");
                        }
                        // Log stack trace for debugging
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Stack trace: {ex.StackTrace}");
                        return CreateVideoPlaceholder();
                    }
                    finally
                    {
                        // Always dispose resources safely
                        try
                        {
                            if (!frameDisposed)
                            {
                                frame.Dispose();
                            }
                        }
                        catch { }
                        
                        try
                        {
                            mediaFile?.Dispose();
                        }
                        catch { }
                    }
                });
            }
            finally
            {
                _videoExtractionSemaphore.Release();
            }
        }

        private BitmapSource CreateVideoPlaceholder()
        {
            // Create a simple video icon placeholder
            // Use a RenderTargetBitmap to create a simple colored rectangle
            var renderTarget = new RenderTargetBitmap(ThumbnailSize, ThumbnailSize, 96, 96, PixelFormats.Pbgra32);
            var visual = new DrawingVisual();
            
            using (var drawingContext = visual.RenderOpen())
            {
                drawingContext.DrawRectangle(
                    new SolidColorBrush(Color.FromRgb(60, 60, 60)),
                    new Pen(new SolidColorBrush(Color.FromRgb(100, 100, 100)), 1),
                    new Rect(0, 0, ThumbnailSize, ThumbnailSize));
            }
            
            renderTarget.Render(visual);
            renderTarget.Freeze();
            return renderTarget;
        }

        /// <summary>
        /// Enforces cache size limit using LRU (Least Recently Used) eviction policy.
        /// Removes items with the oldest LastAccessed timestamp until cache is within limit.
        /// </summary>
        private void EnforceCacheSize()
        {
            if (_cache.Count <= MaxCacheSize)
                return;

            // LRU eviction: Remove least recently used items (oldest LastAccessed)
            var itemsToRemove = _cache
                .OrderBy(kvp => kvp.Value.LastAccessed)
                .Take(_cache.Count - MaxCacheSize)
                .Select(kvp => kvp.Key)
                .ToList();

            foreach (var key in itemsToRemove)
            {
                _cache.Remove(key);
            }
        }

        /// <summary>
        /// Clears the thumbnail cache.
        /// </summary>
        public void ClearCache()
        {
            lock (_cacheLock)
            {
                _cache.Clear();
            }
        }

        /// <summary>
        /// Preloads thumbnails for the given file paths (up to a limit).
        /// </summary>
        public async Task PreloadThumbnailsAsync(IEnumerable<string> filePaths, int maxCount = 50)
        {
            var paths = filePaths.Take(maxCount).ToList();
            var tasks = paths.Select(path => LoadThumbnailAsync(path));
            await Task.WhenAll(tasks);
        }
    }
}

