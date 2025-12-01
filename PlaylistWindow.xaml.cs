using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
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
        
        // Virtual scrolling support
        private CancellationTokenSource? _thumbnailLoadCancellation;
        private readonly object _thumbnailLoadLock = new object();
        private bool _isClosed = false;
        private const int ItemWidth = 140; // Width of each thumbnail item (from XAML)
        private const int ItemHeight = 140; // Height of each thumbnail item (from XAML)
        private const int ItemMargin = 3; // Margin around each item (from XAML)
        private const int TotalItemWidth = ItemWidth + (ItemMargin * 2); // Total width including margins
        private const int TotalItemHeight = ItemHeight + (ItemMargin * 2); // Total height including margins

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
            
            // Set up scroll event handler for virtual scrolling
            ThumbnailViewContainer.ScrollChanged += ThumbnailViewContainer_ScrollChanged;
            
            // Handle window resize to recalculate visible items
            SizeChanged += PlaylistWindow_SizeChanged;
            
            BuildFolderTree();
        }

        private void PlaylistWindow_Loaded(object sender, RoutedEventArgs e)
        {
            EnableDarkTitleBar();
        }

        protected override void OnClosed(EventArgs e)
        {
            _isClosed = true;
            
            // Clean up cancellation token
            lock (_thumbnailLoadLock)
            {
                _thumbnailLoadCancellation?.Cancel();
                _thumbnailLoadCancellation?.Dispose();
                _thumbnailLoadCancellation = null;
            }
            base.OnClosed(e);
        }

        /// <summary>
        /// Handles window resize to recalculate visible thumbnails when viewport size changes.
        /// </summary>
        private void PlaylistWindow_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            if (_currentViewMode == PlaylistViewMode.Thumbnail && _mediaItems.Count > 0)
            {
                // Trigger recalculation of visible items after resize
                lock (_thumbnailLoadLock)
                {
                    _thumbnailLoadCancellation?.Cancel();
                    _thumbnailLoadCancellation?.Dispose();
                    _thumbnailLoadCancellation = new CancellationTokenSource();
                }

                var cancellationToken = _thumbnailLoadCancellation.Token;
#pragma warning disable CS4014 // Fire-and-forget: intentionally not awaited
                _ = Task.Delay(200, cancellationToken).ContinueWith(async _ =>
                {
                    if (!cancellationToken.IsCancellationRequested)
                    {
                        try
                        {
                            await LoadVisibleThumbnailsAsync(cancellationToken);
                        }
                        catch (OperationCanceledException)
                        {
                            // Expected when resizing quickly - ignore (TaskCanceledException inherits from this)
                        }
                    }
                }, cancellationToken, TaskContinuationOptions.OnlyOnRanToCompletion, TaskScheduler.Default);
#pragma warning restore CS4014
            }
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
            
            // Auto-select the first folder if available
            // Use Dispatcher to ensure TreeView is rendered before selecting
            Dispatcher.BeginInvoke(new Action(() =>
            {
                if (_folderTreeRoots.Count > 0)
                {
                    var firstFolder = _folderTreeRoots[0];
                    // Find the TreeViewItem container and select it
                    var container = FindTreeViewItem(FolderTree, firstFolder);
                    if (container != null)
                    {
                        container.IsSelected = true;
                        container.Focus();
                    }
                    else
                    {
                        // Fallback: Set IsSelected on the node and manually trigger file loading
                        ClearSelection();
                        firstFolder.IsSelected = true;
                        // Manually load files for the first folder
#pragma warning disable CS4014 // Fire-and-forget: intentionally not awaited
                        _ = LoadMediaItemsForFolderAsync(firstFolder.FullPath);
#pragma warning restore CS4014
                    }
                }
            }), System.Windows.Threading.DispatcherPriority.Loaded);
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
        /// Only shows files that are actually in the current playlist.
        /// </summary>
        private async Task LoadMediaItemsForFolderAsync(string folderPath)
        {
            // Clear existing items
            _mediaItems.Clear();

            if (string.IsNullOrWhiteSpace(folderPath) || !Directory.Exists(folderPath))
                return;

            // Get current playlist files from the owner (MainWindow)
            // This ensures we only show files that are actually in the playlist
            var currentPlaylistFiles = _owner.GetCurrentPlaylist();
            var playlistFileSet = currentPlaylistFiles
                .Select(f => Path.GetFullPath(f))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            // Determine if videos are included by checking if any .mp4 files exist in the playlist
            bool includeVideos = currentPlaylistFiles.Any(f => 
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
                        .Where(f => playlistFileSet.Contains(Path.GetFullPath(f))) // Only include files in the playlist
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
                        // Use a small delay to ensure layout is complete before calculating visible range
                        if (_currentViewMode == PlaylistViewMode.Thumbnail)
                        {
                            // Fire-and-forget: intentionally not awaited
#pragma warning disable CS4014
                            _ = Task.Delay(100).ContinueWith(async _ => await LoadThumbnailsAsync(), TaskScheduler.Default);
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

        /// <summary>
        /// Finds the TreeViewItem container for a given data item.
        /// </summary>
        private TreeViewItem? FindTreeViewItem(ItemsControl parent, object item)
        {
            if (parent.ItemContainerGenerator.ContainerFromItem(item) is TreeViewItem container)
            {
                return container;
            }

            // Recursively search child items
            foreach (var childItem in parent.Items)
            {
                if (parent.ItemContainerGenerator.ContainerFromItem(childItem) is TreeViewItem childContainer)
                {
                    var found = FindTreeViewItem(childContainer, item);
                    if (found != null)
                        return found;
                }
            }

            return null;
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

            string filePathToRemove = selected.FullPath;
            
            // Remove from playlist
            _owner.RemoveFileFromPlaylist(filePathToRemove);
            
            // Immediately remove from the displayed collection
            string normalizedPath = Path.GetFullPath(filePathToRemove);
            var itemToRemove = _mediaItems.FirstOrDefault(item => 
                string.Equals(Path.GetFullPath(item.FullPath), normalizedPath, StringComparison.OrdinalIgnoreCase));
            if (itemToRemove != null)
            {
                _mediaItems.Remove(itemToRemove);
            }
            
            BuildFolderTree();
            
            // Reload media items for the currently selected folder to ensure consistency
            if (FolderTree.SelectedItem is FolderNode selectedNode)
            {
                _ = LoadMediaItemsForFolderAsync(selectedNode.FullPath);
            }
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            // Clean up cancellation token
            lock (_thumbnailLoadLock)
            {
                _thumbnailLoadCancellation?.Cancel();
                _thumbnailLoadCancellation?.Dispose();
                _thumbnailLoadCancellation = null;
            }
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
            // Use a small delay to ensure layout is complete before calculating visible range
            if (_currentViewMode == PlaylistViewMode.Thumbnail && _mediaItems.Count > 0)
            {
                // Fire-and-forget: intentionally not awaited
#pragma warning disable CS4014
                _ = Task.Delay(100).ContinueWith(async _ => await LoadThumbnailsAsync(), TaskScheduler.Default);
#pragma warning restore CS4014
            }
        }

        /// <summary>
        /// Handles scroll changes in the thumbnail view to implement virtual scrolling.
        /// Only loads thumbnails for visible items plus a buffer zone.
        /// </summary>
        private void ThumbnailViewContainer_ScrollChanged(object sender, ScrollChangedEventArgs e)
        {
            if (_currentViewMode != PlaylistViewMode.Thumbnail || _mediaItems.Count == 0)
                return;

            // Debounce rapid scroll events - reload thumbnails after scrolling stops
            // Cancel any pending load operation
            lock (_thumbnailLoadLock)
            {
                _thumbnailLoadCancellation?.Cancel();
                _thumbnailLoadCancellation?.Dispose();
                _thumbnailLoadCancellation = new CancellationTokenSource();
            }

            // Delay loading to avoid loading during rapid scrolling
            var cancellationToken = _thumbnailLoadCancellation.Token;
#pragma warning disable CS4014 // Fire-and-forget: intentionally not awaited
            _ = Task.Delay(150, cancellationToken).ContinueWith(async _ =>
            {
                if (cancellationToken.IsCancellationRequested)
                    return;

                try
                {
                    await LoadVisibleThumbnailsAsync(cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    // Expected when scrolling quickly - ignore (TaskCanceledException inherits from this)
                }
            }, cancellationToken, TaskContinuationOptions.OnlyOnRanToCompletion, TaskScheduler.Default);
#pragma warning restore CS4014
        }

        /// <summary>
        /// Calculates which items are visible in the viewport plus buffer zones.
        /// Returns a range of indices that should have thumbnails loaded.
        /// </summary>
        private (int startIndex, int endIndex) CalculateVisibleRange()
        {
            if (_mediaItems.Count == 0)
                return (0, 0);

            var scrollViewer = ThumbnailViewContainer;

            // Get viewport dimensions
            double viewportHeight = scrollViewer.ViewportHeight;
            double viewportWidth = scrollViewer.ViewportWidth;
            double verticalOffset = scrollViewer.VerticalOffset;

            // Calculate how many items fit per row (accounting for margins)
            int itemsPerRow;
            
            // If viewport dimensions are not yet available, return a safe default range
            if (viewportHeight <= 0 || viewportWidth <= 0)
            {
                // Load first page of items as fallback
                itemsPerRow = Math.Max(1, (int)Math.Floor(600.0 / TotalItemWidth)); // Assume ~600px width
                int rowsToLoad = Math.Max(3, (int)Math.Ceiling(viewportHeight > 0 ? viewportHeight / TotalItemHeight : 3.0));
                return (0, Math.Min(_mediaItems.Count - 1, itemsPerRow * rowsToLoad - 1));
            }

            itemsPerRow = Math.Max(1, (int)Math.Floor(viewportWidth / TotalItemWidth));

            // Calculate which rows are visible
            double topVisibleY = verticalOffset;
            double bottomVisibleY = verticalOffset + viewportHeight;

            // Add buffer: 1 viewport height above and below
            double bufferHeight = viewportHeight;
            double topBufferY = Math.Max(0, topVisibleY - bufferHeight);
            double bottomBufferY = bottomVisibleY + bufferHeight;

            // Calculate row indices (0-based)
            int topRow = (int)Math.Floor(topBufferY / TotalItemHeight);
            int bottomRow = (int)Math.Ceiling(bottomBufferY / TotalItemHeight);

            // Calculate item indices
            int startIndex = Math.Max(0, topRow * itemsPerRow);
            int endIndex = Math.Min(_mediaItems.Count - 1, (bottomRow + 1) * itemsPerRow - 1);

            return (startIndex, endIndex);
        }

        /// <summary>
        /// Loads thumbnails only for visible items plus buffer zones.
        /// Releases thumbnails that are outside the buffer zone.
        /// </summary>
        private async Task LoadVisibleThumbnailsAsync(CancellationToken cancellationToken)
        {
            if (_mediaItems.Count == 0)
                return;

            var (startIndex, endIndex) = CalculateVisibleRange();

            System.Diagnostics.Debug.WriteLine($"LoadVisibleThumbnailsAsync: Loading thumbnails for indices {startIndex} to {endIndex} (total: {_mediaItems.Count})");

            // Release thumbnails outside the buffer zone
            try
            {
                await Dispatcher.InvokeAsync(() =>
                {
                    if (_isClosed) return;
                    
                    for (int i = 0; i < _mediaItems.Count; i++)
                    {
                        if (i < startIndex || i > endIndex)
                        {
                            // Item is outside buffer zone - release thumbnail
                            if (_mediaItems[i].Thumbnail != null)
                            {
                                _mediaItems[i].Thumbnail = null;
                            }
                        }
                    }
                }, System.Windows.Threading.DispatcherPriority.Normal, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                // Expected when window closes or operation is cancelled (includes TaskCanceledException)
                return;
            }
            catch (InvalidOperationException)
            {
                // Expected when window is closing or dispatcher is shutting down
                return;
            }

            // Load thumbnails for visible range
            const int batchSize = 5;
            int loadedCount = 0;

            for (int i = startIndex; i <= endIndex && !cancellationToken.IsCancellationRequested; i += batchSize)
            {
                var batchEnd = Math.Min(i + batchSize - 1, endIndex);
                var batch = new List<PlaylistMediaItem>();
                
                try
                {
                    await Dispatcher.InvokeAsync(() =>
                    {
                        if (_isClosed) return;
                        
                        for (int j = i; j <= batchEnd; j++)
                        {
                            if (j < _mediaItems.Count)
                            {
                                batch.Add(_mediaItems[j]);
                            }
                        }
                    }, System.Windows.Threading.DispatcherPriority.Normal, cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    // Expected when window closes or operation is cancelled (includes TaskCanceledException)
                    break;
                }
                catch (InvalidOperationException)
                {
                    // Expected when window is closing or dispatcher is shutting down
                    break;
                }

                if (batch.Count == 0)
                    break;

                // Process batch in parallel
                var tasks = batch.Select(async item =>
                {
                    if (cancellationToken.IsCancellationRequested)
                        return;

                    // Skip if already has thumbnail
                    if (item.Thumbnail != null)
                        return;

                    try
                    {
                        var thumbnail = await _thumbnailService.LoadThumbnailAsync(item.FullPath);
                        if (thumbnail != null && !cancellationToken.IsCancellationRequested)
                        {
                            // Update on UI thread - check if window is still valid
                            try
                            {
                                await Dispatcher.InvokeAsync(() =>
                                {
                                    // Check if window is still open and cancellation hasn't been requested
                                    if (!cancellationToken.IsCancellationRequested && 
                                        !_isClosed && 
                                        item.Thumbnail == null)
                                    {
                                        item.Thumbnail = thumbnail;
                                        loadedCount++;
                                    }
                                }, System.Windows.Threading.DispatcherPriority.Normal, cancellationToken);
                            }
                            catch (OperationCanceledException)
                            {
                                // Expected when window closes or operation is cancelled (includes TaskCanceledException)
                            }
                            catch (InvalidOperationException)
                            {
                                // Expected when window is closing or dispatcher is shutting down
                            }
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        // Expected when scrolling quickly - ignore (includes TaskCanceledException)
                    }
                    catch (Exception ex)
                    {
                        if (!cancellationToken.IsCancellationRequested)
                        {
                            System.Diagnostics.Debug.WriteLine($"Failed to load thumbnail for {item.FullPath}: {ex.Message}");
                        }
                    }
                }).ToArray(); // Convert to array for Task.WhenAll

                try
                {
                    await Task.WhenAll(tasks);
                }
                catch (OperationCanceledException)
                {
                    // Expected when scrolling quickly - ignore (includes TaskCanceledException)
                }
                catch (AggregateException aggEx)
                {
                    // Task.WhenAll can throw AggregateException containing cancelled tasks
                    // Filter out expected cancellation exceptions (TaskCanceledException inherits from OperationCanceledException)
                    var nonCancellationExceptions = aggEx.Flatten().InnerExceptions
                        .Where(ex => !(ex is OperationCanceledException))
                        .ToList();
                    
                    if (nonCancellationExceptions.Any())
                    {
                        // Only log if there are non-cancellation exceptions
                        foreach (var ex in nonCancellationExceptions)
                        {
                            System.Diagnostics.Debug.WriteLine($"Unexpected error in thumbnail loading: {ex.Message}");
                        }
                    }
                }

                // Small delay between batches to keep UI responsive
                if (!cancellationToken.IsCancellationRequested)
                {
                    try
                    {
                        await Task.Delay(50, cancellationToken);
                    }
                    catch (OperationCanceledException)
                    {
                        // Expected when scrolling quickly - ignore (TaskCanceledException inherits from this)
                    }
                }
            }

            if (!cancellationToken.IsCancellationRequested)
            {
                System.Diagnostics.Debug.WriteLine($"LoadVisibleThumbnailsAsync: Completed. Loaded {loadedCount} thumbnails");
            }
        }

        /// <summary>
        /// Legacy method - now delegates to LoadVisibleThumbnailsAsync for virtual scrolling.
        /// </summary>
        private async Task LoadThumbnailsAsync()
        {
            // Cancel any existing load operation
            lock (_thumbnailLoadLock)
            {
                _thumbnailLoadCancellation?.Cancel();
                _thumbnailLoadCancellation?.Dispose();
                _thumbnailLoadCancellation = new CancellationTokenSource();
            }

            // Load thumbnails for visible items only
            await LoadVisibleThumbnailsAsync(_thumbnailLoadCancellation.Token);
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

        private void ListViewControl_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            // Handle single-click to open file
            var item = ((FrameworkElement)e.OriginalSource).DataContext as PlaylistMediaItem;
            if (item != null)
            {
                ShowFileInMainWindow(item.FullPath);
                e.Handled = true;
            }
        }

        private void DetailedViewControl_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            // Handle single-click to open file
            var item = ((FrameworkElement)e.OriginalSource).DataContext as PlaylistMediaItem;
            if (item != null)
            {
                ShowFileInMainWindow(item.FullPath);
                e.Handled = true;
            }
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

        /// <summary>
        /// Implements smooth, Windows 11-style scrolling for the thumbnail view ScrollViewer.
        /// </summary>
        private void ThumbnailViewContainer_PreviewMouseWheel(object sender, MouseWheelEventArgs e)
        {
            if (ThumbnailViewContainer == null)
                return;

            // Use smooth scrolling helper for modern Win11-style scrolling
            SmoothScrollHelper.HandleMouseWheel(ThumbnailViewContainer, e);
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
