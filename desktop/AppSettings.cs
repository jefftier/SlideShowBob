using System.Collections.Generic;

public class AppSettings
{
    public int SlideDelayMs { get; set; } = 2000;
    public bool IncludeVideos { get; set; } = false;
    public string SortMode { get; set; } = "NameAZ";
	public bool IsMuted { get; set; } = true;
    public List<string> FolderPaths { get; set; } = new List<string>();

    public string ToolbarInactivityBehavior { get; set; } = "Dim"; // "Dim", "Disappear", "Nothing"
    public bool PortraitBlurEffect { get; set; } = true; // Enable blurred background for portrait images

    // Save flags - control whether each setting is saved
    public bool SaveSlideDelay { get; set; } = true;
    public bool SaveIncludeVideos { get; set; } = true;
    public bool SaveSortMode { get; set; } = true;
    public bool SaveIsMuted { get; set; } = true;
    public bool SaveFolderPaths { get; set; } = true;
    public bool SavePortraitBlurEffect { get; set; } = true;

    // Multi-monitor support
    public string? PreferredFullscreenMonitorDeviceName { get; set; } = null;
    public string? LastFullscreenMonitorDeviceName { get; set; } = null;
    public bool SavePreferredFullscreenMonitorDeviceName { get; set; } = true;
}