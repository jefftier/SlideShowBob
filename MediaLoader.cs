using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Media.Imaging;
using WpfAnimatedGif;

namespace SlideShowBob
{
    /// <summary>
    /// Handles async loading of images, GIFs, and videos.
    /// Provides caching for images and GIFs to improve performance.
    /// </summary>
    public class MediaLoader
    {
        private readonly Dictionary<string, BitmapImage> _imageCache = new();
        private readonly Dictionary<string, BitmapImage> _gifCache = new();
        private readonly Dictionary<string, ExifOrientation> _imageOrientation = new();
        private const int MaxImageCache = 5;
        private const int MaxGifCache = 3;

        public enum ExifOrientation
        {
            Normal = 1,
            Rotate90 = 6,      // 90° CCW (270° CW)
            Rotate270 = 8      // 270° CCW (90° CW)
        }

        /// <summary>
        /// Loads an image asynchronously, using cache if available.
        /// </summary>
        public async Task<ImageLoadResult> LoadImageAsync(string filePath, double? viewportWidth = null)
        {
            if (!File.Exists(filePath))
                return new ImageLoadResult { Success = false };

            // Check cache first
            if (_imageCache.TryGetValue(filePath, out var cached))
            {
                return new ImageLoadResult
                {
                    Success = true,
                    Image = cached,
                    Orientation = _imageOrientation.TryGetValue(filePath, out var orient) ? orient : ExifOrientation.Normal
                };
            }

            return await Task.Run(() =>
            {
                try
                {
                    // Read EXIF orientation
                    ExifOrientation orientation = ExifOrientation.Normal;
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

                    // Load image
                    var bmp = new BitmapImage();
                    bmp.BeginInit();
                    bmp.CacheOption = BitmapCacheOption.OnLoad;
                    bmp.UriSource = new Uri(filePath);
                    bmp.EndInit();
                    bmp.Freeze();

                    // Cache it
                    _imageCache[filePath] = bmp;
                    _imageOrientation[filePath] = orientation;

                    // Prune cache if too large
                    if (_imageCache.Count > MaxImageCache)
                    {
                        var firstKey = _imageCache.Keys.First();
                        _imageCache.Remove(firstKey);
                        _imageOrientation.Remove(firstKey);
                    }

                    return new ImageLoadResult
                    {
                        Success = true,
                        Image = bmp,
                        Orientation = orientation
                    };
                }
                catch
                {
                    return new ImageLoadResult { Success = false };
                }
            });
        }

        /// <summary>
        /// Loads a GIF asynchronously, using cache if available.
        /// Decodes at an appropriate size for the viewport to improve performance.
        /// </summary>
        public async Task<GifLoadResult> LoadGifAsync(string filePath, double? viewportWidth = null)
        {
            if (!File.Exists(filePath))
                return new GifLoadResult { Success = false };

            // Check cache first
            if (_gifCache.TryGetValue(filePath, out var cached))
            {
                return new GifLoadResult
                {
                    Success = true,
                    GifImage = cached
                };
            }

            return await Task.Run(() =>
            {
                try
                {
                    var uri = new Uri(filePath);
                    var gifImage = new BitmapImage();
                    gifImage.BeginInit();
                    gifImage.UriSource = uri;

                    // Use OnDemand to stream data instead of loading everything up front
                    gifImage.CacheOption = BitmapCacheOption.OnDemand;

                    // Downscale at decode time to roughly the viewport width
                    // This significantly improves performance for large GIFs
                    if (viewportWidth.HasValue && viewportWidth.Value > 0)
                    {
                        gifImage.DecodePixelWidth = (int)viewportWidth.Value;
                    }

                    gifImage.EndInit();

                    // Cache it (don't freeze GIFs as they need to animate)
                    _gifCache[filePath] = gifImage;

                    // Prune cache if too large
                    if (_gifCache.Count > MaxGifCache)
                    {
                        var firstKey = _gifCache.Keys.First();
                        _gifCache.Remove(firstKey);
                    }

                    return new GifLoadResult
                    {
                        Success = true,
                        GifImage = gifImage
                    };
                }
                catch
                {
                    return new GifLoadResult { Success = false };
                }
            });
        }

        /// <summary>
        /// Preloads an image in the background (for neighbor preloading).
        /// </summary>
        public void PreloadImage(string filePath)
        {
            if (File.Exists(filePath) && !_imageCache.ContainsKey(filePath))
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await LoadImageAsync(filePath);
                    }
                    catch
                    {
                        // Ignore preload errors
                    }
                });
            }
        }

        /// <summary>
        /// Clears all caches.
        /// </summary>
        public void ClearCache()
        {
            _imageCache.Clear();
            _gifCache.Clear();
            _imageOrientation.Clear();
        }

        /// <summary>
        /// Removes a specific file from the cache.
        /// </summary>
        public void RemoveFromCache(string filePath)
        {
            _imageCache.Remove(filePath);
            _gifCache.Remove(filePath);
            _imageOrientation.Remove(filePath);
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

                foreach (var query in orientationQueries)
                {
                    try
                    {
                        var orientation = metadata.GetQuery(query);
                        if (orientation != null)
                        {
                            var value = Convert.ToUInt16(orientation);
                            if (value == 6) return ExifOrientation.Rotate90;
                            if (value == 8) return ExifOrientation.Rotate270;
                        }
                    }
                    catch
                    {
                        // Try next query
                    }
                }
            }
            catch
            {
                // Ignore metadata errors
            }

            return ExifOrientation.Normal;
        }
    }

    /// <summary>
    /// Result of loading an image.
    /// </summary>
    public class ImageLoadResult
    {
        public bool Success { get; set; }
        public BitmapImage? Image { get; set; }
        public MediaLoader.ExifOrientation Orientation { get; set; } = MediaLoader.ExifOrientation.Normal;
    }

    /// <summary>
    /// Result of loading a GIF.
    /// </summary>
    public class GifLoadResult
    {
        public bool Success { get; set; }
        public BitmapImage? GifImage { get; set; }
    }
}

