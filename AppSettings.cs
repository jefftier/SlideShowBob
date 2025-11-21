using System.Collections.Generic;

public class AppSettings
{
    public int SlideDelayMs { get; set; } = 2000;
    public bool IncludeVideos { get; set; } = false;
    public string SortMode { get; set; } = "NameAZ";
	public bool IsMuted { get; set; } = true;
    public List<string> FolderPaths { get; set; } = new List<string>();

    // Persistence flags - control whether each setting is saved
    public bool PersistSlideDelay { get; set; } = true;
    public bool PersistIncludeVideos { get; set; } = true;
    public bool PersistSortMode { get; set; } = true;
    public bool PersistIsMuted { get; set; } = true;
    public bool PersistFolderPaths { get; set; } = true;
}