using System.IO;

namespace SlideShowBob
{
    /// <summary>
    /// Represents a single media item (image, GIF, or video) in the slideshow.
    /// </summary>
    public class MediaItem
    {
        public string FilePath { get; }
        public MediaType Type { get; }
        public string FileName => Path.GetFileName(FilePath);

        public MediaItem(string filePath)
        {
            FilePath = filePath;
            Type = DetermineMediaType(filePath);
        }

        private static MediaType DetermineMediaType(string filePath)
        {
            string ext = Path.GetExtension(filePath).ToLowerInvariant();
            return ext switch
            {
                ".mp4" => MediaType.Video,
                ".gif" => MediaType.Gif,
                _ => MediaType.Image
            };
        }
    }

    public enum MediaType
    {
        Image,
        Gif,
        Video
    }
}



