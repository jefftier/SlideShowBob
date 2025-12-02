using System;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using Microsoft.WindowsAPICodePack.Dialogs;
using SlideShowBob.Models;
using SlideShowBob.ViewModels;

namespace SlideShowBob
{
    public partial class PlaylistWindow : Window
    {
        private readonly PlaylistViewModel _viewModel;
        
        // Virtual scrolling support (UI-specific)
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

        public PlaylistWindow(PlaylistViewModel viewModel)
        {
            InitializeComponent();

            _viewModel = viewModel ?? throw new ArgumentNullException(nameof(viewModel));
            DataContext = _viewModel;

            Loaded += PlaylistWindow_Loaded;
            
            // Set up scroll event handler for virtual scrolling (UI-specific)
            ThumbnailViewContainer.ScrollChanged += ThumbnailViewContainer_ScrollChanged;
            
            // Handle window resize to recalculate visible items
            SizeChanged += PlaylistWindow_SizeChanged;

            // Subscribe to ViewModel events
            _viewModel.RequestAddFolder += ViewModel_RequestAddFolder;

            // Subscribe to ViewModel property changes for view mode updates
            _viewModel.PropertyChanged += ViewModel_PropertyChanged;

            // Initialize view mode
            UpdateViewMode();
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

            // Unsubscribe from events
            _viewModel.RequestAddFolder -= ViewModel_RequestAddFolder;
            _viewModel.PropertyChanged -= ViewModel_PropertyChanged;

            base.OnClosed(e);
        }

        private void ViewModel_PropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(PlaylistViewModel.CurrentViewMode))
            {
                UpdateViewMode();
            }
        }

        /// <summary>
        /// Handles window resize to recalculate visible thumbnails when viewport size changes.
        /// </summary>
        private void PlaylistWindow_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            if (_viewModel.CurrentViewMode == PlaylistViewMode.Thumbnail && _viewModel.MediaItems.Count > 0)
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

        #region ViewModel Event Handlers

        private async void ViewModel_RequestAddFolder(object? sender, EventArgs e)
        {
            // Open folder dialog and add folders
            try
            {
                var dlg = new CommonOpenFileDialog
                {
                    IsFolderPicker = true,
                    Multiselect = true,
                    Title = "Select one or more folders"
                };

                if (dlg.ShowDialog() == CommonFileDialogResult.Ok)
                {
                    await _viewModel.AddFoldersAsync(dlg.FileNames);
                }
            }
            catch
            {
                // Fallback: classic single-folder dialog
                var fb = new System.Windows.Forms.FolderBrowserDialog
                {
                    Description = "Select folder containing images/videos"
                };

                var result = fb.ShowDialog();
                if (result == System.Windows.Forms.DialogResult.OK)
                {
                    await _viewModel.AddFoldersAsync(new[] { fb.SelectedPath });
                }
            }
        }

        #endregion

        #region UI Event Handlers

        /// <summary>
        /// Handles folder selection in the tree view.
        /// </summary>
        private void FolderTree_SelectedItemChanged(object sender, RoutedPropertyChangedEventArgs<object> e)
        {
            if (FolderTree.SelectedItem is FolderNode selectedNode)
            {
                // Update selection state (avoid circular updates)
                if (!selectedNode.IsSelected)
                {
                    selectedNode.IsSelected = true;
                }

                // Call ViewModel command to select folder
                if (_viewModel.SelectFolderCommand.CanExecute(selectedNode))
                {
                    _viewModel.SelectFolderCommand.Execute(selectedNode);
                }
            }
        }

        /// <summary>
        /// Handles context menu for removing folder.
        /// </summary>
        private void RemoveFolderMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (FolderTree.SelectedItem is FolderNode selectedNode)
            {
                if (_viewModel.RemoveFolderCommand.CanExecute(selectedNode.FullPath))
                {
                    _viewModel.RemoveFolderCommand.Execute(selectedNode.FullPath);
                }
            }
        }

        /// <summary>
        /// Handles context menu for removing file.
        /// </summary>
        private void RemoveFileMenuItem_Click(object sender, RoutedEventArgs e)
        {
            // Use ViewModel's SelectedItem
            if (_viewModel.SelectedItem != null && _viewModel.RemoveFileCommand.CanExecute(_viewModel.SelectedItem))
            {
                _viewModel.RemoveFileCommand.Execute(_viewModel.SelectedItem);
            }
        }

        private void ListViewControl_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            _viewModel.SelectedItem = ListViewControl.SelectedItem as PlaylistMediaItem;
        }

        private void DetailedViewControl_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            _viewModel.SelectedItem = DetailedViewControl.SelectedItem as PlaylistMediaItem;
        }

        private void ListViewControl_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            // Handle single-click to open file
            var item = ((FrameworkElement)e.OriginalSource).DataContext as PlaylistMediaItem;
            if (item != null)
            {
                if (_viewModel.NavigateToFileCommand.CanExecute(item.FullPath))
                {
                    _viewModel.NavigateToFileCommand.Execute(item.FullPath);
                }
                e.Handled = true;
            }
        }

        private void DetailedViewControl_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            // Handle single-click to open file
            var item = ((FrameworkElement)e.OriginalSource).DataContext as PlaylistMediaItem;
            if (item != null)
            {
                if (_viewModel.NavigateToFileCommand.CanExecute(item.FullPath))
                {
                    _viewModel.NavigateToFileCommand.Execute(item.FullPath);
                }
                e.Handled = true;
            }
        }

        private void ListViewControl_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            if (ListViewControl.SelectedItem is PlaylistMediaItem selectedItem)
            {
                if (_viewModel.NavigateToFileCommand.CanExecute(selectedItem.FullPath))
                {
                    _viewModel.NavigateToFileCommand.Execute(selectedItem.FullPath);
                }
            }
        }

        private void DetailedViewControl_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            if (DetailedViewControl.SelectedItem is PlaylistMediaItem selectedItem)
            {
                if (_viewModel.NavigateToFileCommand.CanExecute(selectedItem.FullPath))
                {
                    _viewModel.NavigateToFileCommand.Execute(selectedItem.FullPath);
                }
            }
        }

        private void Thumbnail_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            if (sender is FrameworkElement element && element.DataContext is PlaylistMediaItem item)
            {
                if (_viewModel.NavigateToFileCommand.CanExecute(item.FullPath))
                {
                    _viewModel.NavigateToFileCommand.Execute(item.FullPath);
                }
            }
        }

        private void ColumnHeader_Click(object sender, RoutedEventArgs e)
        {
            if (sender is not GridViewColumnHeader header)
                return;

            string? propertyName = PlaylistViewModel.GetPropertyNameFromColumn(header.Content?.ToString() ?? "");
            if (string.IsNullOrEmpty(propertyName))
                return;

            if (_viewModel.SortByPropertyCommand.CanExecute(propertyName))
            {
                _viewModel.SortByPropertyCommand.Execute(propertyName);
            }
        }

        private void CloseButton_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }

        #endregion

        #region View Mode Management (UI-specific)

        /// <summary>
        /// Updates UI visibility based on current view mode.
        /// </summary>
        private void UpdateViewMode()
        {
            // Update button states
            UpdateViewModeButtons();

            // Show/hide appropriate views
            ThumbnailViewContainer.Visibility = _viewModel.CurrentViewMode == PlaylistViewMode.Thumbnail 
                ? Visibility.Visible 
                : Visibility.Collapsed;
            
            ListViewControl.Visibility = _viewModel.CurrentViewMode == PlaylistViewMode.List 
                ? Visibility.Visible 
                : Visibility.Collapsed;
            
            DetailedViewControl.Visibility = _viewModel.CurrentViewMode == PlaylistViewMode.Detailed 
                ? Visibility.Visible 
                : Visibility.Collapsed;

            // Start loading thumbnails if switching to thumbnail view
            // Use a small delay to ensure layout is complete before calculating visible range
            if (_viewModel.CurrentViewMode == PlaylistViewMode.Thumbnail && _viewModel.MediaItems.Count > 0)
            {
                // Fire-and-forget: intentionally not awaited
#pragma warning disable CS4014
                _ = Task.Delay(100).ContinueWith(async _ => await LoadThumbnailsAsync(), TaskScheduler.Default);
#pragma warning restore CS4014
            }

            // Restore selection after switching
            RestoreSelection();
        }

        private void UpdateViewModeButtons()
        {
            // Reset all buttons
            ThumbnailViewButton.Tag = "Thumbnail";
            ListViewButton.Tag = "List";
            DetailedViewButton.Tag = "Detailed";

            // Set selected button
            Button? selectedButton = _viewModel.CurrentViewMode switch
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

        private void RestoreSelection()
        {
            if (_viewModel.SelectedItem == null)
                return;

            // Restore selection in the new view
            switch (_viewModel.CurrentViewMode)
            {
                case PlaylistViewMode.List:
                    ListViewControl.SelectedItem = _viewModel.SelectedItem;
                    ListViewControl.ScrollIntoView(_viewModel.SelectedItem);
                    break;
                case PlaylistViewMode.Detailed:
                    DetailedViewControl.SelectedItem = _viewModel.SelectedItem;
                    DetailedViewControl.ScrollIntoView(_viewModel.SelectedItem);
                    break;
            }
        }

        #endregion

        #region Virtual Scrolling (UI-specific)

        /// <summary>
        /// Handles scroll changes in the thumbnail view to implement virtual scrolling.
        /// Only loads thumbnails for visible items plus a buffer zone.
        /// </summary>
        private void ThumbnailViewContainer_ScrollChanged(object sender, ScrollChangedEventArgs e)
        {
            if (_viewModel.CurrentViewMode != PlaylistViewMode.Thumbnail || _viewModel.MediaItems.Count == 0)
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
            if (_viewModel.MediaItems.Count == 0)
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
                return (0, Math.Min(_viewModel.MediaItems.Count - 1, itemsPerRow * rowsToLoad - 1));
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
            int endIndex = Math.Min(_viewModel.MediaItems.Count - 1, (bottomRow + 1) * itemsPerRow - 1);

            return (startIndex, endIndex);
        }

        /// <summary>
        /// Loads thumbnails only for visible items plus buffer zones.
        /// Releases thumbnails that are outside the buffer zone.
        /// </summary>
        private async Task LoadVisibleThumbnailsAsync(CancellationToken cancellationToken)
        {
            if (_viewModel.MediaItems.Count == 0)
                return;

            var (startIndex, endIndex) = CalculateVisibleRange();

            System.Diagnostics.Debug.WriteLine($"LoadVisibleThumbnailsAsync: Loading thumbnails for indices {startIndex} to {endIndex} (total: {_viewModel.MediaItems.Count})");

            // Release thumbnails outside the buffer zone
            try
            {
                await Dispatcher.InvokeAsync(() =>
                {
                    if (_isClosed) return;
                    
                    for (int i = 0; i < _viewModel.MediaItems.Count; i++)
                    {
                        if (i < startIndex || i > endIndex)
                        {
                            // Item is outside buffer zone - release thumbnail
                            if (_viewModel.MediaItems[i].Thumbnail != null)
                            {
                                _viewModel.MediaItems[i].Thumbnail = null;
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
                var batch = new System.Collections.Generic.List<PlaylistMediaItem>();
                
                try
                {
                    await Dispatcher.InvokeAsync(() =>
                    {
                        if (_isClosed) return;
                        
                        for (int j = i; j <= batchEnd; j++)
                        {
                            if (j < _viewModel.MediaItems.Count)
                            {
                                batch.Add(_viewModel.MediaItems[j]);
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
                // Use ThumbnailService from ViewModel (injected via DI)
                var tasks = batch.Select(async item =>
                {
                    if (cancellationToken.IsCancellationRequested)
                        return;

                    // Skip if already has thumbnail
                    if (item.Thumbnail != null)
                        return;

                           try
                           {
                               var thumbnail = await _viewModel.ThumbnailService.LoadThumbnailAsync(item.FullPath);
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

        #endregion

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
    public class DurationConverter : System.Windows.Data.IValueConverter
    {
        public object? Convert(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
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

        public object? ConvertBack(object? value, Type targetType, object? parameter, System.Globalization.CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
