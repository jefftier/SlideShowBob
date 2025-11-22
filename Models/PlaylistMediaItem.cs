using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.CompilerServices;
using System.Windows.Media;
using SlideShowBob;

namespace SlideShowBob.Models
{
    /// <summary>
    /// Represents a media item (image, GIF, or video) in the playlist UI.
    /// Supports MVVM binding with property change notifications.
    /// </summary>
    public class PlaylistMediaItem : INotifyPropertyChanged
    {
        private ImageSource? _thumbnail;

        /// <summary>
        /// Gets or sets the display name of the file (without path).
        /// </summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// Gets or sets the full path to the media file.
        /// </summary>
        public string FullPath { get; set; } = string.Empty;

        /// <summary>
        /// Gets or sets the file type (extension or friendly type name).
        /// Examples: ".jpg", ".mp4", "Image", "Video"
        /// </summary>
        public string FileType { get; set; } = string.Empty;

        /// <summary>
        /// Gets or sets the duration of the media (for videos/GIFs), or null for static images.
        /// </summary>
        public TimeSpan? Duration { get; set; }

        /// <summary>
        /// Gets or sets the file date (last write time or creation time).
        /// </summary>
        public DateTime FileDate { get; set; }

        /// <summary>
        /// Gets or sets the thumbnail image source for this media item.
        /// Can be null if thumbnail hasn't been loaded yet.
        /// </summary>
        public ImageSource? Thumbnail
        {
            get => _thumbnail;
            set
            {
                if (_thumbnail != value)
                {
                    _thumbnail = value;
                    OnPropertyChanged();
                }
            }
        }

        /// <summary>
        /// Gets the file size in bytes.
        /// </summary>
        public long FileSize { get; set; }

        /// <summary>
        /// Gets a value indicating whether a thumbnail is available.
        /// </summary>
        public bool HasThumbnail => Thumbnail != null;

        public event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }

        /// <summary>
        /// Creates a PlaylistMediaItem from a file path.
        /// </summary>
        public static PlaylistMediaItem FromFilePath(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                throw new ArgumentException("File path cannot be null or empty.", nameof(filePath));

            if (!File.Exists(filePath))
                throw new FileNotFoundException("File not found.", filePath);

            var fileInfo = new FileInfo(filePath);
            string extension = fileInfo.Extension.ToLowerInvariant();
            
            // Determine friendly file type
            string fileType = extension switch
            {
                ".jpg" or ".jpeg" => "JPEG Image",
                ".png" => "PNG Image",
                ".bmp" => "Bitmap Image",
                ".tif" or ".tiff" => "TIFF Image",
                ".gif" => "Animated GIF",
                ".mp4" => "MP4 Video",
                _ => extension.Length > 0 ? extension.Substring(1).ToUpperInvariant() + " File" : "Unknown"
            };

            return new PlaylistMediaItem
            {
                Name = fileInfo.Name,
                FullPath = Path.GetFullPath(filePath),
                FileType = fileType,
                FileDate = fileInfo.LastWriteTime,
                FileSize = fileInfo.Length,
                Duration = null // Will be populated later for videos/GIFs if needed
            };
        }

        /// <summary>
        /// Creates a PlaylistMediaItem from an existing MediaItem (from MediaPlaylistManager).
        /// </summary>
        public static PlaylistMediaItem FromMediaItem(MediaItem mediaItem)
        {
            if (mediaItem == null)
                throw new ArgumentNullException(nameof(mediaItem));

            return FromFilePath(mediaItem.FilePath);
        }
    }
}

