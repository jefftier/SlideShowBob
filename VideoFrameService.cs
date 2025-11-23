using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using FFMediaToolkit;
using FFMediaToolkit.Decoding;
using FFMediaToolkit.Graphics;

namespace SlideShowBob
{
    /// <summary>
    /// Service for extracting frames from video files using FFMediaToolkit.
    /// Used to display first/last frames for smooth video transitions.
    /// </summary>
    public class VideoFrameService
    {
        private static bool _ffmpegAvailable = true;
        private static bool _ffmpegChecked = false;
        private static readonly object _ffmpegCheckLock = new object();

        /// <summary>
        /// Checks if FFmpeg is available for frame extraction.
        /// </summary>
        private static bool CheckFFmpegAvailability()
        {
            lock (_ffmpegCheckLock)
            {
                if (_ffmpegChecked)
                    return _ffmpegAvailable;

                // Allow one attempt - will be marked unavailable on failure
                return true;
            }
        }

        /// <summary>
        /// Marks FFmpeg as unavailable after a failure.
        /// </summary>
        private static void MarkFFmpegUnavailable()
        {
            lock (_ffmpegCheckLock)
            {
                _ffmpegAvailable = false;
                _ffmpegChecked = true;
            }
        }

        /// <summary>
        /// Extracts the first frame from a video file.
        /// Returns null if extraction fails or FFmpeg is unavailable.
        /// </summary>
        public static async Task<BitmapSource?> ExtractFirstFrameAsync(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
                return null;

            if (!CheckFFmpegAvailability())
                return null;

            return await Task.Run(() =>
            {
                MediaFile? mediaFile = null;
                ImageData frame = default;
                bool frameDisposed = false;

                try
                {
                    var mediaOptions = new MediaOptions
                    {
                        StreamsToLoad = MediaMode.Video,
                        VideoPixelFormat = ImagePixelFormat.Bgra32
                    };

                    mediaFile = MediaFile.Open(filePath, mediaOptions);

                    if (mediaFile.Video == null)
                        return null;

                    // Get the first frame at timestamp 0
                    frame = mediaFile.Video.GetFrame(TimeSpan.Zero);

                    int width = frame.ImageSize.Width;
                    int height = frame.ImageSize.Height;

                    if (width <= 0 || height <= 0)
                    {
                        frame.Dispose();
                        frameDisposed = true;
                        return null;
                    }

                    // Convert frame data to WPF BitmapSource
                    var pixelDataSpan = frame.Data;
                    var stride = width * 4; // Bgra32 = 4 bytes per pixel

                    byte[] pixelDataArray = new byte[pixelDataSpan.Length];
                    pixelDataSpan.CopyTo(pixelDataArray);

                    var bitmap = new WriteableBitmap(
                        width,
                        height,
                        96, 96, PixelFormats.Bgra32, null);

                    bitmap.WritePixels(
                        new System.Windows.Int32Rect(0, 0, width, height),
                        pixelDataArray,
                        stride,
                        0);

                    bitmap.Freeze();
                    return bitmap;
                }
                catch (DirectoryNotFoundException)
                {
                    MarkFFmpegUnavailable();
                    return null;
                }
                catch (AccessViolationException)
                {
                    MarkFFmpegUnavailable();
                    return null;
                }
                catch (DllNotFoundException)
                {
                    MarkFFmpegUnavailable();
                    return null;
                }
                catch (Exception)
                {
                    MarkFFmpegUnavailable();
                    return null;
                }
                finally
                {
                    try
                    {
                        if (!frameDisposed)
                            frame.Dispose();
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

        /// <summary>
        /// Extracts a frame from a video at a specific time position.
        /// Returns null if extraction fails or FFmpeg is unavailable.
        /// </summary>
        public static async Task<BitmapSource?> ExtractFrameAtTimeAsync(string filePath, TimeSpan timePosition)
        {
            if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
                return null;

            if (!CheckFFmpegAvailability())
                return null;

            return await Task.Run(() =>
            {
                MediaFile? mediaFile = null;
                ImageData frame = default;
                bool frameDisposed = false;

                try
                {
                    var mediaOptions = new MediaOptions
                    {
                        StreamsToLoad = MediaMode.Video,
                        VideoPixelFormat = ImagePixelFormat.Bgra32
                    };

                    mediaFile = MediaFile.Open(filePath, mediaOptions);

                    if (mediaFile.Video == null)
                        return null;

                    // Get frame at specified time
                    frame = mediaFile.Video.GetFrame(timePosition);

                    int width = frame.ImageSize.Width;
                    int height = frame.ImageSize.Height;

                    if (width <= 0 || height <= 0)
                    {
                        frame.Dispose();
                        frameDisposed = true;
                        return null;
                    }

                    // Convert frame data to WPF BitmapSource
                    var pixelDataSpan = frame.Data;
                    var stride = width * 4;

                    byte[] pixelDataArray = new byte[pixelDataSpan.Length];
                    pixelDataSpan.CopyTo(pixelDataArray);

                    var bitmap = new WriteableBitmap(
                        width,
                        height,
                        96, 96, PixelFormats.Bgra32, null);

                    bitmap.WritePixels(
                        new System.Windows.Int32Rect(0, 0, width, height),
                        pixelDataArray,
                        stride,
                        0);

                    bitmap.Freeze();
                    return bitmap;
                }
                catch
                {
                    MarkFFmpegUnavailable();
                    return null;
                }
                finally
                {
                    try
                    {
                        if (!frameDisposed)
                            frame.Dispose();
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
    }
}

