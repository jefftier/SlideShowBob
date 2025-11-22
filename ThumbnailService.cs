using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using SlideShowBob.Models;

namespace SlideShowBob
{
    /// <summary>
    /// Service for loading and caching thumbnails for media items.
    /// Uses LRU cache to manage memory usage.
    /// </summary>
    public class ThumbnailService
    {
        private readonly Dictionary<string, CachedThumbnail> _cache = new();
        private readonly object _cacheLock = new();
        private const int MaxCacheSize = 200; // Maximum number of thumbnails to cache
        private const int ThumbnailSize = 200; // Thumbnail size in pixels

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
                BitmapSource? thumbnail = await Task.Run(() => GenerateThumbnail(normalizedPath));

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

        private BitmapSource? GenerateThumbnail(string filePath)
        {
            try
            {
                string extension = Path.GetExtension(filePath).ToLowerInvariant();

                // Handle images
                if (extension is ".jpg" or ".jpeg" or ".png" or ".bmp" or ".tif" or ".tiff" or ".gif")
                {
                    return LoadImageThumbnail(filePath);
                }

                // Handle videos - use placeholder for now
                if (extension == ".mp4")
                {
                    return CreateVideoPlaceholder();
                }

                return null;
            }
            catch
            {
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

        private void EnforceCacheSize()
        {
            if (_cache.Count <= MaxCacheSize)
                return;

            // Remove least recently used items
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

