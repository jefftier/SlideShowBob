using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Interop;
using SlideShowBob.Models;

namespace SlideShowBob
{
    public enum PlaylistViewMode
    {
        Thumbnail,
        List,
        Detailed
    }

    public partial class PlaylistWindow : Window
    {
        private readonly MainWindow _owner;
        private readonly List<string> _folders;
        private readonly List<string> _allFiles;
        private readonly ObservableCollection<FolderNode> _folderTreeRoots = new ObservableCollection<FolderNode>();
        private readonly ObservableCollection<PlaylistMediaItem> _mediaItems = new ObservableCollection<PlaylistMediaItem>();
        private CollectionViewSource? _mediaItemsViewSource;
        private PlaylistViewMode _currentViewMode = PlaylistViewMode.Detailed;
        private PlaylistMediaItem? _selectedItem;
        private readonly ThumbnailService _thumbnailService = new ThumbnailService();

        // Dark title bar constants (same pattern as MainWindow)
        private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
        private const int DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1 = 19;

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(
            IntPtr hwnd,
            int dwAttribute,
            ref int pvAttribute,
            int cbAttribute);

        public PlaylistWindow(MainWindow owner, List<string> folders, List<string> allFiles)
        {
            InitializeComponent();

            _owner = owner;
            _folders = folders;
            _allFiles = allFiles;

            Loaded += PlaylistWindow_Loaded;
            
            // Set up CollectionViewSource for sorting
            _mediaItemsViewSource = (CollectionViewSource)FindResource("MediaItemsViewSource");
            if (_mediaItemsViewSource != null)
            {
                _mediaItemsViewSource.Source = _mediaItems;
            }
            
            // Bind all views to the CollectionViewSource
            if (_mediaItemsViewSource != null)
            {
                ListViewControl.ItemsSource = _mediaItemsViewSource.View;
                DetailedViewControl.ItemsSource = _mediaItemsViewSource.View;
                ThumbnailViewControl.ItemsSource = _mediaItemsViewSource.View;
            }
            
            // Initialize view mode
            UpdateViewMode();
            
            BuildFolderTree();
        }

        private void PlaylistWindow_Loaded(object sender, RoutedEventArgs e)
        {
            EnableDarkTitleBar();
        }

        private void EnableDarkTitleBar()
        {
            try
            {
                var helper = new WindowInteropHelper(this);
                IntPtr hWnd = helper.Handle;
                if (hWnd == IntPtr.Zero) return;

                int useDark = 1;

                // Newer Windows 10/11 attribute
                DwmSetWindowAttribute(hWnd, DWMWA_USE_IMMERSIVE_DARK_MODE, ref useDark, sizeof(int));
                // Older builds
                DwmSetWindowAttribute(hWnd, DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1, ref useDark, sizeof(int));
            }
            catch
            {
                // If the OS doesn't support it, just ignore
            }
        }

        /// <summary>
        /// Builds the hierarchical folder tree from root folders and files in the playlist.
        /// Creates FolderNode objects with parent-child relationships and auto-expands folders with subfolders.
        /// </summary>
        private void BuildFolderTree()
        {
            _folderTreeRoots.Clear();

            if (_folders.Count == 0)
            {
                FolderTree.ItemsSource = _folderTreeRoots;
                return;
            }

            // Get all unique folder paths from files in the playlist
            var allFolderPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var filePath in _allFiles)
            {
                if (string.IsNullOrWhiteSpace(filePath))
                    continue;

                try
                {
                    string? dir = Path.GetDirectoryName(filePath);
                    if (!string.IsNullOrEmpty(dir))
                    {
                        allFolderPaths.Add(Path.GetFullPath(dir));
                    }
                }
                catch
                {
                    // Skip invalid paths
                }
            }

            // Build tree for each root folder - show ALL root folders, even if empty
            foreach (var rootFolder in _folders)
            {
                if (string.IsNullOrWhiteSpace(rootFolder))
                    continue;

                try
                {
                    string normalizedRoot = Path.GetFullPath(rootFolder)
                        .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

                    // Create root node (always create it - it's a root folder we're tracking)
                    var rootNode = FolderNode.CreateRoot(normalizedRoot);

                    // Find all folders under this root that contain files
                    var foldersUnderRoot = allFolderPaths
                        .Where(f => 
                        {
                            string normalizedF = Path.GetFullPath(f)
                                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                            return string.Equals(normalizedF, normalizedRoot, StringComparison.OrdinalIgnoreCase) ||
                                   IsUnderFolder(f, normalizedRoot);
                        })
                        .OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
                        .ToList();

                    // Filter out the root folder itself from children
                    var childFolders = foldersUnderRoot
                        .Where(f => !string.Equals(
                            Path.GetFullPath(f).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar),
                            normalizedRoot,
                            StringComparison.OrdinalIgnoreCase))
                        .ToList();

                    // Build the tree structure
                    if (childFolders.Count > 0)
                    {
                        BuildFolderTreeRecursive(rootNode, childFolders, normalizedRoot);
                    }

                    // Auto-expand if it has children
                    if (rootNode.Children.Count > 0)
                    {
                        rootNode.IsExpanded = true;
                    }

                    _folderTreeRoots.Add(rootNode);
                }
                catch
                {
                    // Skip invalid folders
                }
            }

            // Sort root nodes by name
            var sortedRoots = _folderTreeRoots.OrderBy(n => n.Name, StringComparer.OrdinalIgnoreCase).ToList();
            _folderTreeRoots.Clear();
            foreach (var root in sortedRoots)
            {
                _folderTreeRoots.Add(root);
            }

            FolderTree.ItemsSource = _folderTreeRoots;
        }

        private void BuildFolderTreeRecursive(FolderNode parentNode, List<string> allFolders, string parentPath)
        {
            // Normalize parent path for comparison
            string normalizedParent = Path.GetFullPath(parentPath)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

            // Find direct children of the parent folder
            // A folder is a direct child if its parent directory exactly matches the parent path
            var children = allFolders
                .Where(f => 
                {
                    try
                    {
                        string normalizedChild = Path.GetFullPath(f)
                            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                        
                        // Get the parent directory of this folder
                        string? childParentDir = Path.GetDirectoryName(normalizedChild);
                        if (string.IsNullOrEmpty(childParentDir))
                            return false;

                        string normalizedChildParent = Path.GetFullPath(childParentDir)
                            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

                        // Check if this folder's parent matches our parent path
                        return string.Equals(normalizedChildParent, normalizedParent, StringComparison.OrdinalIgnoreCase);
                    }
                    catch
                    {
                        return false;
                    }
                })
                .OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
                .ToList();

            foreach (var childPath in children)
            {
                try
                {
                    string normalizedChild = Path.GetFullPath(childPath)
                        .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                    
                    string childName = Path.GetFileName(normalizedChild);
                    if (string.IsNullOrEmpty(childName))
                        childName = normalizedChild; // Root drive, etc.

                    var childNode = new FolderNode
                    {
                        Name = childName,
                        FullPath = normalizedChild,
                        Parent = parentNode,
                        IsExpanded = false // Will be set below if it has children
                    };

                    // Recursively build children of this child first
                    BuildFolderTreeRecursive(childNode, allFolders, normalizedChild);

                    // Auto-expand if it has children
                    if (childNode.Children.Count > 0)
                    {
                        childNode.IsExpanded = true;
                    }

                    parentNode.Children.Add(childNode);
                }
                catch
                {
                    // Skip invalid paths
                }
            }
        }


        private static bool IsUnderFolder(string filePath, string folderPath)
        {
            if (string.IsNullOrEmpty(filePath) || string.IsNullOrEmpty(folderPath))
                return false;

            folderPath = Path.GetFullPath(folderPath)
                             .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                             + Path.DirectorySeparatorChar;
            filePath = Path.GetFullPath(filePath);

            return filePath.StartsWith(folderPath, StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Handles folder selection in the tree view.
        /// When a folder is selected, populates the MediaItem collection with files from that folder.
        /// </summary>
        private async void FolderTree_SelectedItemChanged(object sender, RoutedPropertyChangedEventArgs<object> e)
        {
            if (FolderTree.SelectedItem is not FolderNode selectedNode)
            {
                _mediaItems.Clear();
                return;
            }

            // Update selection state (avoid circular updates)
            if (!selectedNode.IsSelected)
            {
                ClearSelection();
                selectedNode.IsSelected = true;
            }

            // Load media items for the selected folder asynchronously
            // This populates the _mediaItems collection which is shared across all view modes
            await LoadMediaItemsForFolderAsync(selectedNode.FullPath);
        }

        /// <summary>
        /// Asynchronously loads media files from the selected folder and populates the MediaItem collection.
        /// This collection is shared across all view modes (Thumbnail/List/Detailed).
        /// </summary>
        private async Task LoadMediaItemsForFolderAsync(string folderPath)
        {
            // Clear existing items
            _mediaItems.Clear();

            if (string.IsNullOrWhiteSpace(folderPath) || !Directory.Exists(folderPath))
                return;

            // Determine if videos are included by checking if any .mp4 files exist in the playlist
            bool includeVideos = _allFiles.Any(f => 
                Path.GetExtension(f).Equals(".mp4", StringComparison.OrdinalIgnoreCase));

            // Use the same extension logic as MediaPlaylistManager
            string[] imageExts = { ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff" };
            string[] motionExts = includeVideos ? new[] { ".gif", ".mp4" } : new[] { ".gif" };
            var allExts = imageExts.Concat(motionExts).ToHashSet(StringComparer.OrdinalIgnoreCase);

            // Enumerate files asynchronously to avoid blocking UI
            await Task.Run(() =>
            {
                try
                {
                    var files = Directory.GetFiles(folderPath, "*.*", SearchOption.TopDirectoryOnly)
                        .Where(f => allExts.Contains(Path.GetExtension(f)))
                        .Where(File.Exists)
                        .OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
                        .ToList();

                    // Create PlaylistMediaItem objects on UI thread
                    Dispatcher.Invoke(() =>
                    {
                        foreach (var filePath in files)
                        {
                            try
                            {
                                var mediaItem = PlaylistMediaItem.FromFilePath(filePath);
                                _mediaItems.Add(mediaItem);
                            }
                            catch
                            {
                                // Skip files that can't be processed
                            }
                        }
                        
                        // Start loading thumbnails asynchronously if in thumbnail view
                        if (_currentViewMode == PlaylistViewMode.Thumbnail)
                        {
                            // Fire-and-forget: intentionally not awaited
#pragma warning disable CS4014
                            _ = LoadThumbnailsAsync();
#pragma warning restore CS4014
                        }
                    });
                }
                catch
                {
                    // Skip folders we can't access
                }
            });
        }

        private void ClearSelection()
        {
            foreach (var root in _folderTreeRoots)
            {
                ClearSelectionRecursive(root);
            }
        }

        private void ClearSelectionRecursive(FolderNode node)
        {
            // Only update if actually selected to avoid unnecessary property change notifications
            if (node.IsSelected)
            {
                node.IsSelected = false;
            }
            foreach (var child in node.Children)
            {
                ClearSelectionRecursive(child);
            }
        }

        private async void AddFolderButton_Click(object sender, RoutedEventArgs e)
        {
            // Reuse main window logic for multi-folder selection
            await _owner.ChooseFoldersFromDialogAsync();
            BuildFolderTree();
        }

        private void RemoveFolderMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (FolderTree.SelectedItem is not FolderNode selectedNode)
                return;

            _owner.RemoveFolderFromPlaylist(selectedNode.FullPath);
            BuildFolderTree();
        }

        private void RemoveFileMenuItem_Click(object sender, RoutedEventArgs e)
        {
            // Get selected item from current view
            PlaylistMediaItem? selected = _currentViewMode switch
            {
                PlaylistViewMode.List => ListViewControl.SelectedItem as PlaylistMediaItem,
                PlaylistViewMode.Detailed => DetailedViewControl.SelectedItem as PlaylistMediaItem,
                _ => null
            };

            if (selected == null)
                return;

            _owner.RemoveFileFromPlaylist(selected.FullPath);
            BuildFolderTree();
            
            // Reload media items for the currently selected folder
            if (FolderTree.SelectedItem is FolderNode selectedNode)
            {
                _ = LoadMediaItemsForFolderAsync(selectedNode.FullPath);
            }
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }

        private void ColumnHeader_Click(object sender, RoutedEventArgs e)
        {
            if (sender is not GridViewColumnHeader header || _mediaItemsViewSource?.View == null)
                return;

            string? propertyName = GetPropertyNameFromColumn(header);
            if (string.IsNullOrEmpty(propertyName))
                return;

            SortByProperty(propertyName);
        }

        private string? GetPropertyNameFromColumn(GridViewColumnHeader header)
        {
            if (header.Content == null)
                return null;

            string headerText = header.Content.ToString() ?? "";
            return headerText switch
            {
                "File Name" => "Name",
                "File Type" => "FileType",
                "Duration" => "Duration",
                "File Date" => "FileDate",
                _ => null
            };
        }

        private void SortByProperty(string propertyName)
        {
            if (_mediaItemsViewSource?.View == null)
                return;

            var view = (ListCollectionView)_mediaItemsViewSource.View;
            
            // Check if already sorting by this property
            var existingSort = view.SortDescriptions
                .FirstOrDefault(sd => sd.PropertyName == propertyName);

            ListSortDirection newDirection = ListSortDirection.Ascending;

            // Check if we found an existing sort for this property
            if (existingSort.PropertyName != null && existingSort.PropertyName == propertyName)
            {
                // Toggle direction
                newDirection = existingSort.Direction == ListSortDirection.Ascending
                    ? ListSortDirection.Descending
                    : ListSortDirection.Ascending;
                
                // Remove existing sort
                view.SortDescriptions.Remove(existingSort);
            }
            else
            {
                // Clear all sorts and add new one
                view.SortDescriptions.Clear();
            }

            // Add new sort
            view.SortDescriptions.Add(new SortDescription(propertyName, newDirection));
        }

        private void ViewModeButton_Click(object sender, RoutedEventArgs e)
        {
            if (sender is not Button button || button.Tag is not string tag)
                return;

            // Parse the view mode from the tag
            if (Enum.TryParse<PlaylistViewMode>(tag, out var newMode))
            {
                SetViewMode(newMode);
            }
        }

        /// <summary>
        /// Switches between view modes (Thumbnail/List/Detailed).
        /// Preserves selection across mode changes and reuses the same MediaItem collection.
        /// </summary>
        private void SetViewMode(PlaylistViewMode mode)
        {
            if (_currentViewMode == mode)
                return;

            // Preserve selection before switching
            PreserveSelection();

            _currentViewMode = mode;
            UpdateViewMode();
            
            // Restore selection after switching
            RestoreSelection();
        }

        private void UpdateViewMode()
        {
            // Update button states
            UpdateViewModeButtons();

            // Show/hide appropriate views
            ThumbnailViewContainer.Visibility = _currentViewMode == PlaylistViewMode.Thumbnail 
                ? Visibility.Visible 
                : Visibility.Collapsed;
            
            ListViewControl.Visibility = _currentViewMode == PlaylistViewMode.List 
                ? Visibility.Visible 
                : Visibility.Collapsed;
            
            DetailedViewControl.Visibility = _currentViewMode == PlaylistViewMode.Detailed 
                ? Visibility.Visible 
                : Visibility.Collapsed;

            // Start loading thumbnails if switching to thumbnail view
            if (_currentViewMode == PlaylistViewMode.Thumbnail && _mediaItems.Count > 0)
            {
                // Fire-and-forget: intentionally not awaited
#pragma warning disable CS4014
                _ = LoadThumbnailsAsync();
#pragma warning restore CS4014
            }
        }

        private async Task LoadThumbnailsAsync()
        {
            // Load thumbnails for visible items first, then the rest
            var itemsToLoad = _mediaItems.ToList();
            
            if (itemsToLoad.Count == 0)
            {
                System.Diagnostics.Debug.WriteLine("LoadThumbnailsAsync: No items to load");
                return;
            }
            
            System.Diagnostics.Debug.WriteLine($"LoadThumbnailsAsync: Starting to load {itemsToLoad.Count} thumbnails");
            
            // Load thumbnails in batches to avoid overwhelming the UI thread
            const int batchSize = 5; // Reduced batch size for more responsive loading
            int loadedCount = 0;
            
            for (int i = 0; i < itemsToLoad.Count; i += batchSize)
            {
                var batch = itemsToLoad.Skip(i).Take(batchSize).ToList();
                
                // Process batch in parallel for faster loading
                var tasks = batch.Select(async item =>
                {
                    // Skip if already has thumbnail
                    if (item.Thumbnail != null)
                        return;

                    try
                    {
                        var thumbnail = await _thumbnailService.LoadThumbnailAsync(item.FullPath);
                        if (thumbnail != null)
                        {
                            // Update on UI thread
                            Dispatcher.Invoke(() =>
                            {
                                item.Thumbnail = thumbnail;
                                loadedCount++;
                            });
                            System.Diagnostics.Debug.WriteLine($"Loaded thumbnail for: {item.Name}");
                        }
                        else
                        {
                            System.Diagnostics.Debug.WriteLine($"Thumbnail is null for: {item.Name}");
                        }
                    }
                    catch (Exception ex)
                    {
                        // Log error for debugging
                        System.Diagnostics.Debug.WriteLine($"Failed to load thumbnail for {item.FullPath}: {ex.Message}");
                        System.Diagnostics.Debug.WriteLine($"Stack trace: {ex.StackTrace}");
                    }
                });
                
                await Task.WhenAll(tasks);

                // Small delay between batches to keep UI responsive
                await Task.Delay(100);
            }
            
            System.Diagnostics.Debug.WriteLine($"LoadThumbnailsAsync: Completed. Loaded {loadedCount} thumbnails");
        }

        private void UpdateViewModeButtons()
        {
            // Reset all buttons
            ThumbnailViewButton.Tag = "Thumbnail";
            ListViewButton.Tag = "List";
            DetailedViewButton.Tag = "Detailed";

            // Set selected button
            Button? selectedButton = _currentViewMode switch
            {
                PlaylistViewMode.Thumbnail => ThumbnailViewButton,
                PlaylistViewMode.List => ListViewButton,
                PlaylistViewMode.Detailed => DetailedViewButton,
                _ => null
            };

            if (selectedButton != null)
            {
                selectedButton.Tag = "Selected";
            }
        }

        private void PreserveSelection()
        {
            // Get selected item from current view
            _selectedItem = _currentViewMode switch
            {
                PlaylistViewMode.List => ListViewControl.SelectedItem as PlaylistMediaItem,
                PlaylistViewMode.Detailed => DetailedViewControl.SelectedItem as PlaylistMediaItem,
                _ => null
            };
        }

        private void RestoreSelection()
        {
            if (_selectedItem == null)
                return;

            // Restore selection in the new view
            switch (_currentViewMode)
            {
                case PlaylistViewMode.List:
                    ListViewControl.SelectedItem = _selectedItem;
                    ListViewControl.ScrollIntoView(_selectedItem);
                    break;
                case PlaylistViewMode.Detailed:
                    DetailedViewControl.SelectedItem = _selectedItem;
                    DetailedViewControl.ScrollIntoView(_selectedItem);
                    break;
            }
        }

        private void ListViewControl_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            _selectedItem = ListViewControl.SelectedItem as PlaylistMediaItem;
        }

        private void DetailedViewControl_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            _selectedItem = DetailedViewControl.SelectedItem as PlaylistMediaItem;
        }

        private void ListViewControl_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            if (ListViewControl.SelectedItem is not PlaylistMediaItem selectedItem)
                return;

            ShowFileInMainWindow(selectedItem.FullPath);
        }

        private void DetailedViewControl_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            if (DetailedViewControl.SelectedItem is not PlaylistMediaItem selectedItem)
                return;

            ShowFileInMainWindow(selectedItem.FullPath);
        }

        private void Thumbnail_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            if (sender is not FrameworkElement element || element.DataContext is not PlaylistMediaItem item)
                return;

            ShowFileInMainWindow(item.FullPath);
        }

        /// <summary>
        /// Centralized method to request MainWindow to display a specific media file.
        /// This is the single point of communication from PlaylistWindow to MainWindow for navigation.
        /// MainWindow's NavigateToFile method handles finding the file in the playlist and updating the current index.
        /// </summary>
        private void ShowFileInMainWindow(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                return;

            // Delegate to MainWindow's centralized navigation method
            // MainWindow will find the file in the playlist, set the index, and display it
            _owner.NavigateToFile(filePath);
        }
    }

    /// <summary>
    /// Converter to format TimeSpan? duration as a readable string.
    /// Returns "—" for null, or formatted time like "1:23" or "0:05".
    /// </summary>
    public class DurationConverter : IValueConverter
    {
        public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        {
            if (value is not TimeSpan duration)
                return "—";

            if (duration.TotalHours >= 1)
            {
                return $"{(int)duration.TotalHours}:{duration.Minutes:D2}:{duration.Seconds:D2}";
            }
            else
            {
                return $"{duration.Minutes}:{duration.Seconds:D2}";
            }
        }

        public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
