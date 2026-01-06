using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.WindowsAPICodePack.Shell;
using SlideShowBob.Models;

namespace SlideShowBob
{
    /// <summary>
    /// Service for loading and caching thumbnails for media items.
    /// Uses LRU cache to manage memory usage.
    /// Uses Windows Shell for video thumbnails (no external dependencies).
    /// </summary>
    public class ThumbnailService
    {
        private readonly Dictionary<string, CachedThumbnail> _cache = new();
        private readonly object _cacheLock = new();
        private readonly object _shellFileLock = new(); // Prevent concurrent ShellFile operations (not thread-safe)
        
        // Cache configuration:
        // - MaxCacheSize: 200 thumbnails (reasonable for playlist views)
        // - LRU eviction: Uses LastAccessed timestamp to remove least recently used items
        // - ThumbnailSize: 200px (small enough for fast loading, large enough for recognition)
        private const int MaxCacheSize = 200;
        private const int ThumbnailSize = 200;

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

                // Handle videos - use Windows Shell thumbnail extraction
                // Supports common video formats: MP4, AVI, MOV, MKV, WMV, etc.
                if (IsVideoFile(extension))
                {
                    return await ExtractVideoThumbnailAsync(filePath);
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

        /// <summary>
        /// Checks if the file extension is a video format.
        /// </summary>
        private static bool IsVideoFile(string extension)
        {
            return extension is ".mp4" or ".avi" or ".mov" or ".mkv" or ".wmv" or ".flv" or ".webm" or ".m4v" or ".mpg" or ".mpeg" or ".3gp" or ".asf";
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
        /// Extracts a thumbnail from a video file using Windows Shell.
        /// Uses Windows' built-in thumbnail extraction - no external dependencies required.
        /// Note: Windows Shell requires video codecs to be installed to generate thumbnails.
        /// If thumbnails aren't showing, ensure codecs are installed (e.g., K-Lite Codec Pack).
        /// Thread-safe: Uses lock to prevent concurrent ShellFile operations which can crash.
        /// </summary>
        private async Task<BitmapSource?> ExtractVideoThumbnailAsync(string filePath)
        {
            return await Task.Run(() =>
            {
                // ShellFile operations are not thread-safe and can crash if called concurrently
                // Use lock to serialize access
                lock (_shellFileLock)
                {
                    try
                    {
                        // Use Windows Shell to get video thumbnail
                        var shellFile = ShellFile.FromFilePath(filePath);
                    
                        if (shellFile == null)
                    {
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] ShellFile is null for: {Path.GetFileName(filePath)}");
                        return CreateVideoPlaceholder();
                    }
                    
                    // Get thumbnail with specific size - request a larger size for better quality
                    // Windows Shell will generate thumbnails for videos if codecs are installed
                    var shellThumbnail = shellFile.Thumbnail;
                    
                    if (shellThumbnail == null)
                    {
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] ShellThumbnail is null for: {Path.GetFileName(filePath)}. Windows may not have codecs installed for this video format.");
                        return CreateVideoPlaceholder();
                    }

                    // Try to get the bitmap - use LargeBitmap for better quality
                    System.Drawing.Bitmap? bitmap = null;
                    try
                    {
                        // Try LargeBitmap first (better quality, typically 256x256 or larger)
                        bitmap = shellThumbnail.LargeBitmap;
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Successfully got LargeBitmap for: {Path.GetFileName(filePath)}");
                    }
                    catch (Exception largeEx)
                    {
                        // Fallback to regular Bitmap if LargeBitmap fails
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] LargeBitmap failed for {Path.GetFileName(filePath)}: {largeEx.Message}, trying Bitmap...");
                        try
                        {
                            bitmap = shellThumbnail.Bitmap;
                            System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Successfully got Bitmap for: {Path.GetFileName(filePath)}");
                        }
                        catch (Exception bitmapEx)
                        {
                            System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Both LargeBitmap and Bitmap failed for: {Path.GetFileName(filePath)}");
                            System.Diagnostics.Debug.WriteLine($"[ThumbnailService] LargeBitmap error: {largeEx.Message}");
                            System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Bitmap error: {bitmapEx.Message}");
                            return CreateVideoPlaceholder();
                        }
                    }

                    if (bitmap == null)
                    {
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Bitmap is null for: {Path.GetFileName(filePath)}");
                        return CreateVideoPlaceholder();
                    }

                    // Convert System.Drawing.Bitmap to WPF BitmapSource
                    var bitmapSource = ConvertToBitmapSource(bitmap);
                    
                    // Scale to thumbnail size if needed
                    if (bitmapSource.PixelWidth > ThumbnailSize || bitmapSource.PixelHeight > ThumbnailSize)
                    {
                        double scaleX = (double)ThumbnailSize / bitmapSource.PixelWidth;
                        double scaleY = (double)ThumbnailSize / bitmapSource.PixelHeight;
                        double scale = Math.Min(scaleX, scaleY);
                        
                        var scaledBitmap = new TransformedBitmap(
                            bitmapSource,
                            new ScaleTransform(scale, scale));
                        scaledBitmap.Freeze();
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Successfully created scaled thumbnail ({scaledBitmap.PixelWidth}x{scaledBitmap.PixelHeight}) for: {Path.GetFileName(filePath)}");
                        return scaledBitmap;
                    }
                    
                        bitmapSource.Freeze();
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Successfully created thumbnail ({bitmapSource.PixelWidth}x{bitmapSource.PixelHeight}) for: {Path.GetFileName(filePath)}");
                        return bitmapSource;
                    }
                    catch (Exception ex)
                    {
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Error extracting video thumbnail using Windows Shell for {Path.GetFileName(filePath)}: {ex.GetType().Name}: {ex.Message}");
                        if (ex.InnerException != null)
                        {
                            System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Inner exception: {ex.InnerException.GetType().Name}: {ex.InnerException.Message}");
                        }
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Stack trace: {ex.StackTrace}");
                        return CreateVideoPlaceholder();
                    }
                }
            });
        }

        /// <summary>
        /// Converts a System.Drawing.Bitmap to a WPF BitmapSource.
        /// Handles large bitmaps safely to avoid overflow exceptions.
        /// </summary>
        private static BitmapSource ConvertToBitmapSource(System.Drawing.Bitmap bitmap)
        {
            if (bitmap == null)
                throw new ArgumentNullException(nameof(bitmap));

            // For very large bitmaps, convert to a more manageable format first
            // This prevents overflow when calculating buffer sizes
            const int maxDimension = 4096; // Maximum dimension before we need to scale down
            
            if (bitmap.Width > maxDimension || bitmap.Height > maxDimension)
            {
                // Scale down very large bitmaps to prevent overflow
                double scaleX = (double)maxDimension / bitmap.Width;
                double scaleY = (double)maxDimension / bitmap.Height;
                double scale = Math.Min(scaleX, scaleY);
                
                int newWidth = (int)(bitmap.Width * scale);
                int newHeight = (int)(bitmap.Height * scale);
                
                using (var scaled = new System.Drawing.Bitmap(newWidth, newHeight, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
                {
                    using (var g = System.Drawing.Graphics.FromImage(scaled))
                    {
                        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                        g.DrawImage(bitmap, 0, 0, newWidth, newHeight);
                    }
                    return ConvertToBitmapSource(scaled);
                }
            }

            // Ensure we're working with a format we can handle
            System.Drawing.Bitmap? bitmapToUse = null;
            bool needsDisposal = false;
            
            try
            {
                if (bitmap.PixelFormat != System.Drawing.Imaging.PixelFormat.Format32bppArgb &&
                    bitmap.PixelFormat != System.Drawing.Imaging.PixelFormat.Format24bppRgb)
                {
                    // Convert to a format we can handle
                    bitmapToUse = new System.Drawing.Bitmap(bitmap.Width, bitmap.Height, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
                    needsDisposal = true;
                    using (var g = System.Drawing.Graphics.FromImage(bitmapToUse))
                    {
                        g.DrawImage(bitmap, 0, 0);
                    }
                }
                else
                {
                    bitmapToUse = bitmap;
                }

                var bitmapData = bitmapToUse.LockBits(
                    new System.Drawing.Rectangle(0, 0, bitmapToUse.Width, bitmapToUse.Height),
                    System.Drawing.Imaging.ImageLockMode.ReadOnly,
                    bitmapToUse.PixelFormat);

                try
                {
                    int stride = bitmapData.Stride;
                    IntPtr scan0 = bitmapData.Scan0;
                    
                    // Use long to prevent overflow, then check if it fits in int
                    long totalSize = (long)stride * bitmapToUse.Height;
                    if (totalSize > int.MaxValue)
                    {
                        throw new InvalidOperationException($"Bitmap is too large to convert: {bitmapToUse.Width}x{bitmapToUse.Height} (stride: {stride})");
                    }
                    
                    int size = (int)totalSize;

                    // Create byte array and copy pixel data
                    byte[] pixels = new byte[size];
                    System.Runtime.InteropServices.Marshal.Copy(scan0, pixels, 0, size);

                    // Determine pixel format based on bitmap format
                    PixelFormat pixelFormat;
                    if (bitmapToUse.PixelFormat == System.Drawing.Imaging.PixelFormat.Format32bppArgb)
                    {
                        pixelFormat = PixelFormats.Bgra32;
                    }
                    else if (bitmapToUse.PixelFormat == System.Drawing.Imaging.PixelFormat.Format24bppRgb)
                    {
                        pixelFormat = PixelFormats.Bgr24;
                    }
                    else
                    {
                        // Should not happen since we converted above, but fallback to Bgra32
                        pixelFormat = PixelFormats.Bgra32;
                    }

                    var bitmapSource = BitmapSource.Create(
                        bitmapToUse.Width,
                        bitmapToUse.Height,
                        bitmapToUse.HorizontalResolution,
                        bitmapToUse.VerticalResolution,
                        pixelFormat,
                        null,
                        pixels,
                        stride);

                    return bitmapSource;
                }
                finally
                {
                    bitmapToUse.UnlockBits(bitmapData);
                }
            }
            finally
            {
                if (needsDisposal && bitmapToUse != null)
                {
                    bitmapToUse.Dispose();
                }
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
        /// Extracts the first frame from a video file for display purposes.
        /// Uses Windows Shell thumbnail extraction - same as thumbnail generation but returns full-size frame.
        /// Thread-safe: Uses lock to prevent concurrent ShellFile operations.
        /// </summary>
        public async Task<BitmapSource?> ExtractFirstFrameAsync(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
                return null;

            string extension = Path.GetExtension(filePath).ToLowerInvariant();
            if (!IsVideoFile(extension))
                return null;

            return await Task.Run(() =>
            {
                // ShellFile operations are not thread-safe and can crash if called concurrently
                // Use lock to serialize access
                lock (_shellFileLock)
                {
                    try
                    {
                        // Use Windows Shell to get video thumbnail
                        var shellFile = ShellFile.FromFilePath(filePath);
                    var shellThumbnail = shellFile.Thumbnail;
                    
                    if (shellThumbnail == null)
                    {
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] ShellThumbnail is null for: {Path.GetFileName(filePath)}");
                        return null;
                    }

                    // Try to get the bitmap - use LargeBitmap for better quality
                    System.Drawing.Bitmap? bitmap = null;
                    try
                    {
                        bitmap = shellThumbnail.LargeBitmap;
                    }
                    catch
                    {
                        try
                        {
                            bitmap = shellThumbnail.Bitmap;
                        }
                        catch
                        {
                            System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Both LargeBitmap and Bitmap are null for: {Path.GetFileName(filePath)}");
                            return null;
                        }
                    }

                    if (bitmap == null)
                    {
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Bitmap is null for: {Path.GetFileName(filePath)}");
                        return null;
                    }

                        // Convert System.Drawing.Bitmap to WPF BitmapSource
                        // For first frame display, we want larger size (not thumbnail size)
                        var bitmapSource = ConvertToBitmapSource(bitmap);
                        bitmapSource.Freeze();
                        return bitmapSource;
                    }
                    catch (Exception ex)
                    {
                        System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Error extracting first frame using Windows Shell for {Path.GetFileName(filePath)}: {ex.GetType().Name}: {ex.Message}");
                        if (ex.InnerException != null)
                        {
                            System.Diagnostics.Debug.WriteLine($"[ThumbnailService] Inner exception: {ex.InnerException.GetType().Name}: {ex.InnerException.Message}");
                        }
                        return null;
                    }
                }
            });
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
