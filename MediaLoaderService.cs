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
        private const int MaxCacheSize = 5; // Small LRU cache
        private readonly object _cacheLock = new();

        /// <summary>
        /// Loads an image asynchronously with caching and optimized decoding.
        /// Also reads EXIF orientation metadata.
        /// </summary>
        public async Task<BitmapImage?> LoadImageAsync(string filePath, double? maxDecodeWidth = null)
        {
            if (!File.Exists(filePath))
                return null;

            // Check cache first
            lock (_cacheLock)
            {
                if (_imageCache.TryGetValue(filePath, out var cached))
                {
                    // Move to end (LRU)
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

                    // Optimize decode size if specified
                    if (maxDecodeWidth.HasValue && maxDecodeWidth.Value > 0)
                    {
                        bitmap.DecodePixelWidth = (int)maxDecodeWidth.Value;
                    }

                    bitmap.EndInit();
                    bitmap.Freeze(); // Freeze for thread safety

                    // Cache it
                    lock (_cacheLock)
                    {
                        // Remove oldest if cache is full
                        if (_imageCache.Count >= MaxCacheSize && _imageCache.Count > 0)
                        {
                            var firstKey = _imageCache.Keys.First();
                            _imageCache.Remove(firstKey);
                            _imageOrientation.Remove(firstKey);
                        }

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

                    // Optimize decode size
                    if (maxDecodeWidth.HasValue && maxDecodeWidth.Value > 0)
                    {
                        bitmap.DecodePixelWidth = (int)maxDecodeWidth.Value;
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
                    // Fire and forget - preload in background
                    _ = LoadImageAsync(item.FilePath, maxDecodeWidth).ConfigureAwait(false);
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

