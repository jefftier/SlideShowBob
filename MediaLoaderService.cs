using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using WpfAnimatedGif;

namespace SlideShowBob
{
    /// <summary>
    /// Handles async loading and caching of images and GIFs.
    /// Optimized for performance with background decoding and smart caching.
    /// </summary>
    public class MediaLoaderService
    {
        private readonly Dictionary<string, CachedImage> _imageCache = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, ExifOrientation> _imageOrientation = new(StringComparer.OrdinalIgnoreCase);
        
        // Cache size limit: Small cache to balance memory usage vs. performance
        // LRU eviction: Moves accessed items to end, removes oldest (first) when full
        private const int MaxCacheSize = 5;
        private readonly object _cacheLock = new();
        
        // Maximum decode dimensions: Safety guardrail to prevent decoding extremely large images
        // 4K resolution (3840px) is a reasonable maximum for display purposes
        // This prevents memory issues with very high-resolution images (e.g., 8K, 16K)
        private const int MaxDecodeWidth = 3840;
        private const int MaxDecodeHeight = 3840;

        /// <summary>
        /// Loads an image asynchronously with caching and optimized decoding.
        /// Also reads EXIF orientation metadata.
        /// </summary>
        public async Task<BitmapImage?> LoadImageAsync(string filePath, double? maxDecodeWidth = null)
        {
            if (!File.Exists(filePath))
                return null;

            // Check cache first (LRU: move accessed item to end to mark as recently used)
            lock (_cacheLock)
            {
                if (_imageCache.TryGetValue(filePath, out var cached))
                {
                    // Update access time and move to end (LRU: most recently used items stay at end)
                    cached.LoadTime = DateTime.UtcNow;
                    _imageCache.Remove(filePath);
                    _imageCache.Add(filePath, cached);
                    return cached.Bitmap;
                }
            }

            // Read EXIF orientation on background thread
            ExifOrientation orientation = ExifOrientation.Normal;
            await Task.Run(() =>
            {
                try
                {
                    using (var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read))
                    {
                        var decoder = BitmapDecoder.Create(fileStream, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.None);
                        var frame = decoder.Frames[0];
                        orientation = GetExifOrientation(frame.Metadata as BitmapMetadata);
                    }
                }
                catch
                {
                    orientation = ExifOrientation.Normal;
                }
            });

            // Store orientation
            lock (_cacheLock)
            {
                _imageOrientation[filePath] = orientation;
            }

            // Load image on background thread
            return await Task.Run(() =>
            {
                try
                {
                    var bitmap = new BitmapImage();
                    bitmap.BeginInit();
                    bitmap.UriSource = new Uri(filePath);
                    bitmap.CacheOption = BitmapCacheOption.OnLoad; // Cache in memory for performance

                    // Optimize decode size with safety guardrails:
                    // - If maxDecodeWidth is provided, use it (but cap at MaxDecodeWidth)
                    // - If not provided, cap at MaxDecodeWidth to prevent decoding huge images
                    if (maxDecodeWidth.HasValue && maxDecodeWidth.Value > 0)
                    {
                        bitmap.DecodePixelWidth = Math.Min((int)maxDecodeWidth.Value, MaxDecodeWidth);
                    }
                    else
                    {
                        // No max width specified - use maximum safe decode size
                        bitmap.DecodePixelWidth = MaxDecodeWidth;
                    }

                    bitmap.EndInit();
                    bitmap.Freeze(); // Freeze for thread safety

                    // Cache it (LRU: new items added at end, oldest removed from front when full)
                    lock (_cacheLock)
                    {
                        // Remove oldest (least recently used) if cache is full
                        // LRU strategy: items at the beginning are least recently used
                        if (_imageCache.Count >= MaxCacheSize && _imageCache.Count > 0)
                        {
                            var firstKey = _imageCache.Keys.First();
                            _imageCache.Remove(firstKey);
                            _imageOrientation.Remove(firstKey);
                        }

                        // Add new item at end (most recently used position)
                        _imageCache[filePath] = new CachedImage { Bitmap = bitmap, LoadTime = DateTime.UtcNow };
                    }

                    return bitmap;
                }
                catch
                {
                    return null;
                }
            });
        }

        /// <summary>
        /// Loads a GIF asynchronously with optimized decoding.
        /// Returns the BitmapImage ready for WpfAnimatedGif.
        /// </summary>
        public async Task<BitmapImage?> LoadGifAsync(string filePath, double? maxDecodeWidth = null)
        {
            if (!File.Exists(filePath))
                return null;

            // GIFs are loaded similarly but with OnDemand caching for streaming
            return await Task.Run(() =>
            {
                try
                {
                    var bitmap = new BitmapImage();
                    bitmap.BeginInit();
                    bitmap.UriSource = new Uri(filePath);
                    bitmap.CacheOption = BitmapCacheOption.OnDemand; // Stream for GIFs

                    // Optimize decode size with safety guardrails
                    if (maxDecodeWidth.HasValue && maxDecodeWidth.Value > 0)
                    {
                        bitmap.DecodePixelWidth = Math.Min((int)maxDecodeWidth.Value, MaxDecodeWidth);
                    }
                    else
                    {
                        // No max width specified - use maximum safe decode size
                        bitmap.DecodePixelWidth = MaxDecodeWidth;
                    }

                    bitmap.EndInit();
                    // Don't freeze GIFs - they need to animate
                    return bitmap;
                }
                catch
                {
                    return null;
                }
            });
        }

        /// <summary>
        /// Preloads images for neighbors (for smooth transitions).
        /// </summary>
        public void PreloadNeighbors(IReadOnlyList<MediaItem> items, int currentIndex, double? maxDecodeWidth = null)
        {
            if (items.Count <= 1) return;

            int next = (currentIndex + 1) % items.Count;
            int prev = (currentIndex - 1 + items.Count) % items.Count;

            foreach (int idx in new[] { next, prev })
            {
                var item = items[idx];
                if (item.Type == MediaType.Image)
                {
                    // Fire-and-forget: Safe because this is a performance optimization for preloading neighbors.
                    // Errors are handled internally by LoadImageAsync (returns null on failure).
                    // The result is cached for future use, and ConfigureAwait(false) prevents unnecessary context capture.
#pragma warning disable CS4014 // Fire-and-forget async call
                    _ = LoadImageAsync(item.FilePath, maxDecodeWidth).ConfigureAwait(false);
#pragma warning restore CS4014
                }
            }
        }

        /// <summary>
        /// Clears the image cache to free memory.
        /// </summary>
        public void ClearCache()
        {
            lock (_cacheLock)
            {
                _imageCache.Clear();
            }
        }

        /// <summary>
        /// Gets or sets EXIF orientation for an image file.
        /// </summary>
        public ExifOrientation GetOrientation(string filePath)
        {
            return _imageOrientation.TryGetValue(filePath, out var orientation) ? orientation : ExifOrientation.Normal;
        }

        public void SetOrientation(string filePath, ExifOrientation orientation)
        {
            _imageOrientation[filePath] = orientation;
        }

        private ExifOrientation GetExifOrientation(BitmapMetadata? metadata)
        {
            if (metadata == null)
                return ExifOrientation.Normal;

            try
            {
                string[] orientationQueries = 
                {
                    "/ifd/exif:{uint=274}",
                    "/app1/ifd/{ushort=274}",
                    "/app1/ifd/exif/{ushort=274}"
                };

                foreach (string query in orientationQueries)
                {
                    try
                    {
                        if (metadata.ContainsQuery(query))
                        {
                            object? orientationObj = metadata.GetQuery(query);
                            if (orientationObj != null)
                            {
                                if (ushort.TryParse(orientationObj.ToString(), out ushort orientation))
                                {
                                    if (orientation == 6)
                                        return ExifOrientation.Rotate90;
                                    if (orientation == 8)
                                        return ExifOrientation.Rotate270;
                                }
                            }
                        }
                    }
                    catch
                    {
                        continue;
                    }
                }
            }
            catch
            {
                // Ignore metadata errors
            }

            return ExifOrientation.Normal;
        }

        private class CachedImage
        {
            public BitmapImage Bitmap { get; set; } = null!;
            public DateTime LoadTime { get; set; }
        }
    }

    public enum ExifOrientation
    {
        Normal,
        Rotate90,
        Rotate270
    }
}

