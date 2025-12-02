using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using SlideShowBob.Commands;
using SlideShowBob.Models;

namespace SlideShowBob.ViewModels
{
    public enum PlaylistViewMode
    {
        Thumbnail,
        List,
        Detailed
    }

    /// <summary>
    /// ViewModel for the PlaylistWindow.
    /// Manages folder tree, media items, view modes, and playlist operations.
    /// </summary>
    public class PlaylistViewModel : BaseViewModel
    {
        private readonly ThumbnailService _thumbnailService;
        private readonly MainViewModel _mainViewModel;

        // Private fields
        private PlaylistViewMode _currentViewMode = PlaylistViewMode.Detailed;
        private PlaylistMediaItem? _selectedItem;
        private FolderNode? _selectedFolder;
        private string? _sortPropertyName;
        private bool _sortAscending = true;

        // Events for View to subscribe to
        public event EventHandler? RequestAddFolder;

        public PlaylistViewModel(ThumbnailService thumbnailService, MainViewModel mainViewModel)
        {
            _thumbnailService = thumbnailService ?? throw new ArgumentNullException(nameof(thumbnailService));
            _mainViewModel = mainViewModel ?? throw new ArgumentNullException(nameof(mainViewModel));

            // Initialize commands
            AddFolderCommand = new RelayCommand(AddFolder);
            RemoveFolderCommand = new RelayCommand<string>(RemoveFolder);
            RemoveFileCommand = new RelayCommand<PlaylistMediaItem>(RemoveFile);
            SetViewModeCommand = new RelayCommand<PlaylistViewMode>(SetViewMode);
            SortByPropertyCommand = new RelayCommand<string>(SortByProperty);
            SelectFolderCommand = new RelayCommand<FolderNode>(SelectFolder);
            NavigateToFileCommand = new RelayCommand<string>(NavigateToFile);

            // Initialize collections
            FolderTreeRoots = new ObservableCollection<FolderNode>();
            MediaItems = new ObservableCollection<PlaylistMediaItem>();

            // Subscribe to MainViewModel changes to refresh playlist
            // Note: MainViewModel is long-lived (created in App.xaml.cs), so this subscription is safe.
            // PlaylistViewModel lifetime matches PlaylistWindow, which properly unsubscribes on close.
            _mainViewModel.PropertyChanged += MainViewModel_PropertyChanged;

            // Initial load
            RefreshPlaylist();
        }

        #region Properties

        /// <summary>
        /// Root nodes of the folder tree.
        /// </summary>
        public ObservableCollection<FolderNode> FolderTreeRoots { get; }

        /// <summary>
        /// Media items in the currently selected folder.
        /// </summary>
        public ObservableCollection<PlaylistMediaItem> MediaItems { get; }

        /// <summary>
        /// ThumbnailService for loading thumbnails (exposed for View's virtual scrolling).
        /// </summary>
        public ThumbnailService ThumbnailService => _thumbnailService;

        /// <summary>
        /// Current view mode (Thumbnail/List/Detailed).
        /// </summary>
        public PlaylistViewMode CurrentViewMode
        {
            get => _currentViewMode;
            private set => SetProperty(ref _currentViewMode, value);
        }

        /// <summary>
        /// Currently selected media item.
        /// </summary>
        public PlaylistMediaItem? SelectedItem
        {
            get => _selectedItem;
            set => SetProperty(ref _selectedItem, value);
        }

        /// <summary>
        /// Currently selected folder node.
        /// </summary>
        public FolderNode? SelectedFolder
        {
            get => _selectedFolder;
            private set
            {
                if (SetProperty(ref _selectedFolder, value))
                {
                    if (value != null)
                    {
                        _ = LoadMediaItemsForFolderAsync(value.FullPath);
                    }
                    else
                    {
                        MediaItems.Clear();
                    }
                }
            }
        }

        /// <summary>
        /// Property name currently used for sorting.
        /// </summary>
        public string? SortPropertyName
        {
            get => _sortPropertyName;
            private set => SetProperty(ref _sortPropertyName, value);
        }

        /// <summary>
        /// Whether sorting is ascending (true) or descending (false).
        /// </summary>
        public bool SortAscending
        {
            get => _sortAscending;
            private set => SetProperty(ref _sortAscending, value);
        }

        #endregion

        #region Commands

        public ICommand AddFolderCommand { get; }
        public ICommand RemoveFolderCommand { get; }
        public ICommand RemoveFileCommand { get; }
        public ICommand SetViewModeCommand { get; }
        public ICommand SortByPropertyCommand { get; }
        public ICommand SelectFolderCommand { get; }
        public ICommand NavigateToFileCommand { get; }

        #endregion

        #region Command Implementations

        private void AddFolder()
        {
            RequestAddFolder?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Called by View after folder dialog returns paths.
        /// </summary>
        public async Task AddFoldersAsync(IEnumerable<string> folderPaths)
        {
            await _mainViewModel.AddFoldersAsync(folderPaths);
            RefreshPlaylist();
        }

        private void RemoveFolder(string? folderPath)
        {
            if (string.IsNullOrWhiteSpace(folderPath))
                return;

            // Call MainViewModel directly to remove folder
            if (_mainViewModel.RemoveFolderCommand.CanExecute(folderPath))
            {
                _mainViewModel.RemoveFolderCommand.Execute(folderPath);
            }
            
            RefreshPlaylist();
        }

        private void RemoveFile(PlaylistMediaItem? item)
        {
            if (item == null)
                return;

            string filePathToRemove = item.FullPath;

            // Remove from displayed collection immediately (instant UI update)
            string normalizedPath = Path.GetFullPath(filePathToRemove);
            var itemToRemove = MediaItems.FirstOrDefault(i =>
                string.Equals(Path.GetFullPath(i.FullPath), normalizedPath, StringComparison.OrdinalIgnoreCase));
            if (itemToRemove != null)
            {
                MediaItems.Remove(itemToRemove);
            }

            // Call MainViewModel directly to remove file from playlist
            if (_mainViewModel.RemoveFileCommand.CanExecute(filePathToRemove))
            {
                _mainViewModel.RemoveFileCommand.Execute(filePathToRemove);
            }
            
            // Note: We don't call RefreshPlaylist() here because it's expensive (rebuilds entire folder tree).
            // The item is already removed from MediaItems (UI) and from the playlist (via MainViewModel).
            // If the folder tree needs updating (e.g., folder becomes empty), it will be refreshed when
            // the user interacts with the playlist or when MainViewModel's playlist changes trigger a refresh.
        }

        private void SetViewMode(PlaylistViewMode mode)
        {
            if (_currentViewMode == mode)
                return;

            // Preserve selection before switching
            var preservedSelection = SelectedItem;

            CurrentViewMode = mode;

            // Restore selection after switching (View will handle scrolling)
            if (preservedSelection != null && MediaItems.Contains(preservedSelection))
            {
                SelectedItem = preservedSelection;
            }
        }

        private void SortByProperty(string? propertyName)
        {
            if (string.IsNullOrWhiteSpace(propertyName))
                return;

            // Toggle direction if already sorting by this property
            if (SortPropertyName == propertyName)
            {
                SortAscending = !SortAscending;
            }
            else
            {
                SortPropertyName = propertyName;
                SortAscending = true;
            }

            // Apply sort to collection
            ApplySort();
        }

        private void SelectFolder(FolderNode? folder)
        {
            if (folder == null)
            {
                SelectedFolder = null;
                return;
            }

            // Update selection state (avoid circular updates)
            if (!folder.IsSelected)
            {
                ClearSelection();
                folder.IsSelected = true;
            }

            SelectedFolder = folder;
        }

        private void NavigateToFile(string? filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                return;

            // Call MainViewModel directly to navigate to file
            if (_mainViewModel.NavigateToFileCommand.CanExecute(filePath))
            {
                _mainViewModel.NavigateToFileCommand.Execute(filePath);
            }
        }

        #endregion

        #region Helper Methods

        /// <summary>
        /// Refreshes the playlist by rebuilding the folder tree and reloading media items.
        /// </summary>
        public void RefreshPlaylist()
        {
            BuildFolderTree();
            
            // Reload media items if a folder is selected
            if (SelectedFolder != null)
            {
                _ = LoadMediaItemsForFolderAsync(SelectedFolder.FullPath);
            }
        }

        /// <summary>
        /// Builds the hierarchical folder tree from root folders and files in the playlist.
        /// </summary>
        private void BuildFolderTree()
        {
            FolderTreeRoots.Clear();

            var folders = _mainViewModel.Folders.ToList();
            var allFiles = _mainViewModel.GetCurrentPlaylist().ToList();

            if (folders.Count == 0)
            {
                return;
            }

            // Get all unique folder paths from files in the playlist
            var allFolderPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var filePath in allFiles)
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

            // Build tree for each root folder
            foreach (var rootFolder in folders)
            {
                if (string.IsNullOrWhiteSpace(rootFolder))
                    continue;

                try
                {
                    string normalizedRoot = Path.GetFullPath(rootFolder)
                        .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

                    // Create root node
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

                    FolderTreeRoots.Add(rootNode);
                }
                catch
                {
                    // Skip invalid folders
                }
            }

            // Sort root nodes by name
            var sortedRoots = FolderTreeRoots.OrderBy(n => n.Name, StringComparer.OrdinalIgnoreCase).ToList();
            FolderTreeRoots.Clear();
            foreach (var root in sortedRoots)
            {
                FolderTreeRoots.Add(root);
            }

            // Auto-select the first folder if available
            if (FolderTreeRoots.Count > 0 && SelectedFolder == null)
            {
                var firstFolder = FolderTreeRoots[0];
                firstFolder.IsSelected = true;
                SelectedFolder = firstFolder;
            }
        }

        private void BuildFolderTreeRecursive(FolderNode parentNode, List<string> allFolders, string parentPath)
        {
            // Normalize parent path for comparison
            string normalizedParent = Path.GetFullPath(parentPath)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

            // Find direct children of the parent folder
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
                        IsExpanded = false
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

        /// <summary>
        /// Asynchronously loads media files from the selected folder and populates the MediaItem collection.
        /// Only shows files that are actually in the current playlist.
        /// </summary>
        private async Task LoadMediaItemsForFolderAsync(string folderPath)
        {
            // Clear existing items
            MediaItems.Clear();

            if (string.IsNullOrWhiteSpace(folderPath) || !Directory.Exists(folderPath))
                return;

            // Get current playlist files from MainViewModel
            var currentPlaylistFiles = _mainViewModel.GetCurrentPlaylist();
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

                    // Create PlaylistMediaItem objects
                    foreach (var filePath in files)
                    {
                        try
                        {
                            var mediaItem = PlaylistMediaItem.FromFilePath(filePath);
                            MediaItems.Add(mediaItem);
                        }
                        catch
                        {
                            // Skip files that can't be processed
                        }
                    }
                }
                catch
                {
                    // Skip folders we can't access
                }
            });

            // Apply current sort
            ApplySort();

            // Start loading thumbnails if in thumbnail view
            if (_currentViewMode == PlaylistViewMode.Thumbnail && MediaItems.Count > 0)
            {
                // Fire-and-forget: intentionally not awaited
                _ = Task.Delay(100).ContinueWith(async _ => await LoadThumbnailsAsync(), TaskScheduler.Default);
            }
        }

        /// <summary>
        /// Loads thumbnails for all media items (for thumbnail view).
        /// </summary>
        private async Task LoadThumbnailsAsync()
        {
            if (MediaItems.Count == 0)
                return;

            const int batchSize = 5;
            for (int i = 0; i < MediaItems.Count; i += batchSize)
            {
                var batchEnd = Math.Min(i + batchSize - 1, MediaItems.Count - 1);
                var batch = new List<PlaylistMediaItem>();
                
                for (int j = i; j <= batchEnd; j++)
                {
                    if (j < MediaItems.Count)
                    {
                        batch.Add(MediaItems[j]);
                    }
                }

                if (batch.Count == 0)
                    break;

                // Process batch in parallel
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
                            item.Thumbnail = thumbnail;
                        }
                    }
                    catch (Exception ex)
                    {
                        System.Diagnostics.Debug.WriteLine($"Failed to load thumbnail for {item.FullPath}: {ex.Message}");
                    }
                }).ToArray();

                await Task.WhenAll(tasks);

                // Small delay between batches to keep UI responsive
                await Task.Delay(50);
            }
        }

        /// <summary>
        /// Applies sorting to the MediaItems collection based on current sort settings.
        /// </summary>
        private void ApplySort()
        {
            if (string.IsNullOrWhiteSpace(SortPropertyName))
            {
                // Default sort by name
                var defaultSorted = MediaItems
                    .Where(item => item != null)
                    .OrderBy(item => item?.Name ?? string.Empty)
                    .ToList();
                MediaItems.Clear();
                foreach (var item in defaultSorted)
                {
                    MediaItems.Add(item);
                }
                return;
            }

            var items = MediaItems.Where(item => item != null).ToList();
            MediaItems.Clear();

            var sortedItems = SortPropertyName switch
            {
                "Name" => SortAscending
                    ? items.OrderBy(item => item?.Name ?? string.Empty)
                    : items.OrderByDescending(item => item?.Name ?? string.Empty),
                "FileType" => SortAscending
                    ? items.OrderBy(item => item?.FileType ?? string.Empty)
                    : items.OrderByDescending(item => item?.FileType ?? string.Empty),
                "FileDate" => SortAscending
                    ? items.OrderBy(item => item?.FileDate ?? DateTime.MinValue)
                    : items.OrderByDescending(item => item?.FileDate ?? DateTime.MaxValue),
                "Duration" => SortAscending
                    ? items.OrderBy(item => item?.Duration ?? TimeSpan.MaxValue)
                    : items.OrderByDescending(item => item?.Duration ?? TimeSpan.MinValue),
                _ => items.OrderBy(item => item?.Name ?? string.Empty)
            };

            foreach (var item in sortedItems)
            {
                MediaItems.Add(item);
            }
        }

        private void ClearSelection()
        {
            foreach (var root in FolderTreeRoots)
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
        /// Maps column header text to property name for sorting.
        /// </summary>
        public static string? GetPropertyNameFromColumn(string headerText)
        {
            return headerText switch
            {
                "File Name" => "Name",
                "File Type" => "FileType",
                "Duration" => "Duration",
                "File Date" => "FileDate",
                _ => null
            };
        }

        private void MainViewModel_PropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(MainViewModel.Folders) || 
                e.PropertyName == nameof(MainViewModel.GetCurrentPlaylist))
            {
                RefreshPlaylist();
            }
        }

        #endregion
    }
}

