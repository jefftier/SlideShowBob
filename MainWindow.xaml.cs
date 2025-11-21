using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using System.Runtime.InteropServices;
using System.Windows.Interop;
using Microsoft.WindowsAPICodePack.Dialogs;
using WpfAnimatedGif;


namespace SlideShowBob
{
    public partial class MainWindow : Window
    {
        private readonly List<string> _allFiles = new();
        private readonly List<string> _orderedFiles = new();
        private int _currentIndex = -1;
        private readonly Dictionary<string, BitmapImage> _imageCache = new();
        private const int MaxImageCache = 3;
        private AppSettings _settings;

        private bool _isFullscreen = false;
        private WindowState _prevState;
        private WindowStyle _prevStyle;
        private ResizeMode _prevResizeMode;

        private double _zoomFactor = 1.0;
        private double _prevLeft, _prevTop, _prevWidth, _prevHeight;
        private readonly ScaleTransform _imageScale = new();
        private readonly ScaleTransform _videoScale = new();

        private readonly DispatcherTimer _slideTimer;
        private readonly DispatcherTimer _videoProgressTimer;
        private readonly DispatcherTimer _chromeTimer;

        private DateTime _mediaStartTime;
        private int _slideDelayMs = 2000;
        private bool _videoEnded = false;
        private bool _isMuted = true;

        private readonly List<string> _folders = new();
        private string? _currentFolder;

        private enum MediaType { Image, Gif, Video }
        private MediaType _currentMediaType = MediaType.Image;

        private bool _toolbarMinimized = false;

        private enum SortMode
        {
            NameAZ,
            NameZA,
            DateOldest,
            DateNewest,
            Random
        }

        private SortMode _sortMode = SortMode.NameAZ;


        public MainWindow()
        {
            InitializeComponent();

            _settings = SettingsManager.Load();

            // apply
            _slideDelayMs = _settings.SlideDelayMs;
            DelayBox.Text = _slideDelayMs.ToString();
            IncludeVideoToggle.IsChecked = _settings.IncludeVideos;

            // muted comes from bool in settings
            _isMuted = _settings.IsMuted;

            // convert stored string ("NameAZ", etc.) to enum
            _sortMode = ParseSortMode(_settings.SortMode);


            ImageElement.LayoutTransform = _imageScale;
            VideoElement.LayoutTransform = _videoScale;

            _slideTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(_slideDelayMs) };
            _slideTimer.Tick += SlideTimer_Tick;

            _videoProgressTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(200) };
            _videoProgressTimer.Tick += VideoProgressTimer_Tick;

            _chromeTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
            _chromeTimer.Tick += ChromeTimer_Tick;

            
            UpdateZoomLabel();
            SetSlideshowState(false);

            VideoElement.IsMuted = _isMuted;
            MuteButton.Content = "🔇";
            ReplayButton.IsEnabled = false;

            StatusText.Text = "";
            TitleCountText.Text = "0 / 0";

            BigSelectFolderButton.Visibility = Visibility.Visible;
            VideoProgressBar.Visibility = Visibility.Collapsed;
            VideoProgressBar.Value = 0;

            // Initial toolbar state
            ToolbarExpandedPanel.Visibility = Visibility.Visible;
            ToolbarNotchPanel.Visibility = Visibility.Collapsed;
            ToolbarExpandedPanel.Opacity = 1.0;
            ToolbarNotchPanel.Opacity = 0.0;

            UpdateSortMenuVisuals();
            ShowChrome();
            ResetChromeTimer();
        }
        protected override void OnSourceInitialized(EventArgs e)
        {
            base.OnSourceInitialized(e);
            EnableDarkTitleBar();
        }

        // Dark title bar constants for different Win10/Win11 builds
        private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;          // 20H1+
        private const int DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1 = 19;

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(
            IntPtr hwnd,
            int dwAttribute,
            ref int pvAttribute,
            int cbAttribute);

        private void EnableDarkTitleBar()
        {
            try
            {
                var helper = new WindowInteropHelper(this);
                IntPtr hWnd = helper.Handle;
                if (hWnd == IntPtr.Zero) return;

                int useDark = 1;

                // Try new attribute id first
                DwmSetWindowAttribute(hWnd, DWMWA_USE_IMMERSIVE_DARK_MODE, ref useDark, sizeof(int));
                // Also try the older one for older Win10 builds (no harm if it fails)
                DwmSetWindowAttribute(hWnd, DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1, ref useDark, sizeof(int));
            }
            catch
            {
                // If the OS doesn't support it, just ignore
            }
        }

        private BitmapImage? GetOrLoadImage(string path, bool isGif)
        {
            if (!File.Exists(path)) return null;

            if (!isGif && _imageCache.TryGetValue(path, out var cached))
                return cached;

            var bmp = new BitmapImage();
            bmp.BeginInit();
            bmp.CacheOption = isGif ? BitmapCacheOption.OnDemand : BitmapCacheOption.OnLoad;
            bmp.UriSource = new Uri(path);
            bmp.EndInit();
            if (!isGif)
            {
                bmp.Freeze();
                _imageCache[path] = bmp;

                // simple pruning
                if (_imageCache.Count > MaxImageCache)
                {
                    var firstKey = _imageCache.Keys.First();
                    _imageCache.Remove(firstKey);
                }
            }
            return bmp;
        }

        private SortMode ParseSortMode(string? value)
        {
            return value switch
            {
                "NameZA" => SortMode.NameZA,
                "DateOldest" => SortMode.DateOldest,
                "DateNewest" => SortMode.DateNewest,
                "Random" => SortMode.Random,
                _ => SortMode.NameAZ
            };
        }


        #region Chrome / toolbar show-dim

        private void ShowChrome()
        {
            // Clear any opacity animations so direct values take effect
            ToolbarExpandedPanel.BeginAnimation(OpacityProperty, null);
            ToolbarNotchPanel.BeginAnimation(OpacityProperty, null);

            if (_toolbarMinimized)
            {
                ToolbarNotchPanel.Opacity = 1.0;
                ToolbarNotchPanel.IsHitTestVisible = true;
            }
            else
            {
                ToolbarExpandedPanel.Opacity = 1.0;
                ToolbarExpandedPanel.IsHitTestVisible = true;
            }
        }

        private void DimChrome()
        {
            double dimOpacity = 0.18;

            // Clear opacity animations so dimming is respected
            ToolbarExpandedPanel.BeginAnimation(OpacityProperty, null);
            ToolbarNotchPanel.BeginAnimation(OpacityProperty, null);

            if (_toolbarMinimized)
            {
                ToolbarNotchPanel.Opacity = dimOpacity;
                ToolbarNotchPanel.IsHitTestVisible = false;
            }
            else
            {
                ToolbarExpandedPanel.Opacity = dimOpacity;
                ToolbarExpandedPanel.IsHitTestVisible = false;
            }
        }

        private void ResetChromeTimer()
        {
            _chromeTimer.Stop();
            _chromeTimer.Start();
        }

        private void ChromeTimer_Tick(object? sender, EventArgs e)
        {
            _chromeTimer.Stop();
            DimChrome();
        }

        private void Window_MouseMove(object sender, MouseEventArgs e)
        {
            ShowChrome();
            ResetChromeTimer();
        }

        #endregion

        #region UI helpers

        private void SetStatus(string text)
        {
            StatusText.Text = text;
        }

        private void UpdateItemCount()
        {
            int total = _orderedFiles.Count;
            int index = _currentIndex >= 0 && _currentIndex < total ? _currentIndex + 1 : 0;
            TitleCountText.Text = $"{index} / {total}";
        }



        private void UpdateZoomLabel()
        {
            if (_currentMediaType == MediaType.Video)
            {
                ZoomLabel.Text = "Auto";
                return;
            }

            int percent = (int)Math.Round(_zoomFactor * 100);
            ZoomLabel.Text = percent + "%";
        }

        private void SetZoom(double factor)
        {
            if (factor < 0.1) factor = 0.1;
            if (factor > 10.0) factor = 10.0;

            _zoomFactor = factor;
            _imageScale.ScaleX = factor;
            _imageScale.ScaleY = factor;
            UpdateZoomLabel();
        }

        private void SetZoomFit(bool allowZoomIn = false)
        {
            if (ScrollHost == null)
                return;

            if (ImageElement.Source is not BitmapSource bmp)
                return;

            double viewportWidth = ScrollHost.ViewportWidth > 0 ? ScrollHost.ViewportWidth : ScrollHost.ActualWidth;
            double viewportHeight = ScrollHost.ViewportHeight > 0 ? ScrollHost.ViewportHeight : ScrollHost.ActualHeight;

            if (viewportWidth <= 0 || viewportHeight <= 0)
                return;

            double imgWidth = bmp.PixelWidth;
            double imgHeight = bmp.PixelHeight;
            if (imgWidth <= 0 || imgHeight <= 0)
                return;

            double scaleX = viewportWidth / imgWidth;
            double scaleY = viewportHeight / imgHeight;
            double fitScale = Math.Min(scaleX, scaleY);

            if (fitScale < 0.1)
                fitScale = 0.1;

            SetZoom(fitScale);
        }

        private void Window_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            if (!IsLoaded) return;

            // If Fit is on, keep media auto-fitted as the window changes
            if (FitToggle.IsChecked == true)
            {
                if (_currentMediaType == MediaType.Video && VideoElement.Source != null)
                {
                    SetVideoFit();
                }
                else if (ImageElement.Source != null)
                {
                    SetZoomFit(_currentMediaType == MediaType.Gif);
                }
            }
            else if (_currentMediaType == MediaType.Video && VideoElement.Source != null)
            {
                // If not fitting, at least keep the progress bar width in sync
                UpdateVideoProgressWidth();
            }
        }

        private void SetVideoFit()
        {
            if (ScrollHost == null)
                return;

            if (VideoElement == null || VideoElement.Source == null)
                return;

            if (VideoElement.NaturalVideoWidth <= 0 || VideoElement.NaturalVideoHeight <= 0)
                return;

            // Use the ScrollViewer viewport; fall back to ActualWidth/Height if needed
            double viewportWidth = ScrollHost.ViewportWidth > 0 ? ScrollHost.ViewportWidth : ScrollHost.ActualWidth;
            double viewportHeight = ScrollHost.ViewportHeight > 0 ? ScrollHost.ViewportHeight : ScrollHost.ActualHeight;


            if (viewportWidth <= 0 || viewportHeight <= 0)
                return;

            double vWidth = VideoElement.NaturalVideoWidth;
            double vHeight = VideoElement.NaturalVideoHeight;

            double scaleX = viewportWidth / vWidth;
            double scaleY = viewportHeight / vHeight;
            double fitScale = Math.Min(scaleX, scaleY); // uniform -> keeps aspect

            if (fitScale < 0.1) fitScale = 0.1;
            if (fitScale > 10.0) fitScale = 10.0;

            _videoScale.ScaleX = fitScale;
            _videoScale.ScaleY = fitScale;

            UpdateVideoProgressWidth();
        }

        private void ResetVideoScale()
        {
            _videoScale.ScaleX = 1.0;
            _videoScale.ScaleY = 1.0;
            UpdateVideoProgressWidth();
        }

        private void UpdateVideoProgressWidth()
        {
            if (_currentMediaType != MediaType.Video)
                return;

            double scale = _videoScale.ScaleX;
            if (scale <= 0) scale = 1.0;

            double displayWidth = VideoElement.NaturalVideoWidth * scale;
            if (displayWidth <= 0)
            {
                displayWidth = ScrollHost.ViewportWidth;
                if (displayWidth <= 0)
                    displayWidth = ScrollHost.ActualWidth;
            }

            double maxWidth = ScrollHost.ViewportWidth;
            if (maxWidth <= 0) maxWidth = ScrollHost.ActualWidth;
            if (maxWidth <= 0) maxWidth = ActualWidth;

            double width = Math.Min(displayWidth, maxWidth);
            if (width > 0)
                VideoProgressBar.Width = width;
        }

        private void SetSlideshowState(bool running)
        {
            if (running)
            {
                StartButton.Visibility = Visibility.Collapsed;
                StopButton.Visibility = Visibility.Visible;
                StartButton.IsEnabled = false;
                StopButton.IsEnabled = true;

                if (!Title.Contains("[Running]"))
                    Title += " [Running]";
            }
            else
            {
                StartButton.Visibility = Visibility.Visible;
                StopButton.Visibility = Visibility.Collapsed;
                StartButton.IsEnabled = true;
                StopButton.IsEnabled = false;
                Title = Title.Replace(" [Running]", "");
            }

            NotchPlayPauseButton.Content = running ? "⏸" : "⏵";
            ReplayButton.IsEnabled = !running && _currentMediaType == MediaType.Video;
        }


        private void MinimizeToolbar()
        {
            if (_toolbarMinimized) return;

            _toolbarMinimized = true;

            // Hide expanded, show notch with animation (slide up from below)
            ToolbarExpandedPanel.Visibility = Visibility.Collapsed;

            ToolbarNotchPanel.Visibility = Visibility.Visible;
            ToolbarNotchPanel.Opacity = 0.0;
            NotchTransform.Y = 10;

            var opacityAnim = new DoubleAnimation(0.0, 1.0, TimeSpan.FromMilliseconds(160))
            {
                EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut }
            };
            var translateAnim = new DoubleAnimation(10, 0, TimeSpan.FromMilliseconds(160))
            {
                EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut }
            };

            ToolbarNotchPanel.BeginAnimation(OpacityProperty, opacityAnim);
            NotchTransform.BeginAnimation(TranslateTransform.YProperty, translateAnim);

            ShowChrome();
            ResetChromeTimer();
        }

        #endregion




        #region Sort menu

        private void SortButton_Click(object sender, RoutedEventArgs e)
        {
            if (SortButton.ContextMenu != null)
            {
                SortButton.ContextMenu.PlacementTarget = SortButton;
                SortButton.ContextMenu.IsOpen = true;
            }


        }

        private void SortMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (sender is not MenuItem mi) return;
            string tag = mi.Tag as string ?? "";

            switch (tag)
            {
                case "NameAZ":
                    _sortMode = SortMode.NameAZ;
                    break;
                case "NameZA":
                    _sortMode = SortMode.NameZA;
                    break;
                case "DateOldest":
                    _sortMode = SortMode.DateOldest;
                    break;
                case "DateNewest":
                    _sortMode = SortMode.DateNewest;
                    break;
                case "Random":
                    _sortMode = SortMode.Random;
                    break;
            }
            _settings.SortMode = _sortMode.ToString();
            SettingsManager.Save(_settings);

            UpdateSortMenuVisuals();

            if (_allFiles.Count == 0) return;

            string? currentFile = null;
            if (_currentIndex >= 0 && _currentIndex < _orderedFiles.Count)
                currentFile = _orderedFiles[_currentIndex];

            ApplySort();

            if (currentFile != null && _orderedFiles.Contains(currentFile))
                _currentIndex = _orderedFiles.IndexOf(currentFile);
            else
                _currentIndex = 0;

            ShowCurrentMedia();
        }

        private void UpdateSortMenuVisuals()
        {
            void SetDot(MenuItem mi, bool active)
            {
                if (!active)
                {
                    mi.Icon = null;
                    return;
                }

                var dot = new System.Windows.Shapes.Ellipse
                {
                    Width = 6,
                    Height = 6,
                    Fill = new SolidColorBrush(Color.FromRgb(45, 125, 255))
                };
                dot.Effect = new DropShadowEffect
                {
                    BlurRadius = 8,
                    Color = Color.FromRgb(45, 125, 255),
                    ShadowDepth = 0,
                    Opacity = 0.8
                };
                mi.Icon = dot;
            }

            SetDot(SortNameAZ, _sortMode == SortMode.NameAZ);
            SetDot(SortNameZA, _sortMode == SortMode.NameZA);
            SetDot(SortDateOldest, _sortMode == SortMode.DateOldest);
            SetDot(SortDateNewest, _sortMode == SortMode.DateNewest);
            SetDot(SortRandom, _sortMode == SortMode.Random);
        }

        private void ApplySort()
        {
            _orderedFiles.Clear();
            if (_allFiles.Count == 0) return;

            switch (_sortMode)
            {
                case SortMode.NameAZ:
                    _orderedFiles.AddRange(_allFiles.OrderBy(f => Path.GetFileName(f)));
                    break;
                case SortMode.NameZA:
                    _orderedFiles.AddRange(_allFiles.OrderByDescending(f => Path.GetFileName(f)));
                    break;
                case SortMode.DateOldest:
                    _orderedFiles.AddRange(_allFiles
                        .OrderBy(f => File.GetLastWriteTime(f)));
                    break;
                case SortMode.DateNewest:
                    _orderedFiles.AddRange(_allFiles
                        .OrderByDescending(f => File.GetLastWriteTime(f)));
                    break;
                case SortMode.Random:
                    var rnd = new Random();
                    _orderedFiles.AddRange(_allFiles.OrderBy(_ => rnd.Next()));
                    break;
            }
        }

        #endregion

        #region Media loading

        private async Task LoadFolderAsync(string path)
        {
            _currentFolder = path;
            SetStatus("Loading...");
            Cursor = Cursors.Wait;
            _allFiles.Clear();
            _orderedFiles.Clear();
            _currentIndex = -1;

            ImageElement.Source = null;
            VideoElement.Source = null;
            VideoElement.Visibility = Visibility.Collapsed;
            VideoProgressBar.Visibility = Visibility.Collapsed;
            VideoProgressBar.Value = 0;
            _videoProgressTimer.Stop();
            _slideTimer.Stop();
            SetSlideshowState(false);
            UpdateItemCount();

            try
            {
                bool includeVideos = IncludeVideoToggle.IsChecked == true;

                string[] imageExts = { ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff" };
                string[] motionExts = { ".gif", ".mp4" };


                var files = Directory.EnumerateFiles(path, "*.*", SearchOption.AllDirectories)
                    .Where(f =>
                    {
                        string ext = Path.GetExtension(f).ToLowerInvariant();
                        if (imageExts.Contains(ext)) return true;
                        if (includeVideos && motionExts.Contains(ext)) return true;
                        return false;
                    })
                    .ToList();

                Dispatcher.Invoke(() =>
                {
                    _allFiles.AddRange(files);
                });

                ApplySort();
                UpdateItemCount();

                if (_orderedFiles.Count > 0)
                {
                    _currentIndex = 0;
                    ShowCurrentMedia();
                    SetStatus("");
                    BigSelectFolderButton.Visibility = Visibility.Collapsed;
                }
                else
                {
                    SetStatus("No media found");
                    BigSelectFolderButton.Visibility = Visibility.Visible;
                }
            }
            catch (Exception ex)
            {
                SetStatus("Error: " + ex.Message);
                BigSelectFolderButton.Visibility = Visibility.Visible;
            }
            finally
            {
                Cursor = Cursors.Arrow;
            }
        }

        private async Task LoadFoldersAsync()
        {
            SetStatus("Loading...");
            Cursor = Cursors.Wait;
            _allFiles.Clear();
            _orderedFiles.Clear();
            _currentIndex = -1;

            ImageElement.Source = null;
            VideoElement.Source = null;
            VideoElement.Visibility = Visibility.Collapsed;
            VideoProgressBar.Visibility = Visibility.Collapsed;
            VideoProgressBar.Value = 0;
            _videoProgressTimer.Stop();
            _slideTimer.Stop();
            SetSlideshowState(false);
            UpdateItemCount();

            if (_folders.Count == 0)
            {
                SetStatus("No folders selected.");
                BigSelectFolderButton.Visibility = Visibility.Visible;
                Cursor = Cursors.Arrow;
                return;
            }

            try
            {
                bool includeVideos = IncludeVideoToggle.IsChecked == true;

                string[] imageExts = { ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff" };
                string[] motionExts = { ".gif", ".mp4" };

                var collected = new List<string>();

                await Task.Run(() =>
                {
                    foreach (var folder in _folders)
                    {
                        if (!Directory.Exists(folder))
                            continue;

                        try
                        {
                            var files = Directory.EnumerateFiles(folder, "*.*", SearchOption.AllDirectories)
                                .Where(f =>
                                {
                                    string ext = Path.GetExtension(f).ToLowerInvariant();
                                    if (imageExts.Contains(ext)) return true;
                                    if (includeVideos && motionExts.Contains(ext)) return true;
                                    return false;
                                });

                            lock (collected)
                            {
                                collected.AddRange(files);
                            }
                        }
                        catch
                        {
                            // ignore individual folder access issues
                        }
                    }
                });

                var distinctFiles = collected
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();

                _allFiles.AddRange(distinctFiles);

                ApplySort();
                UpdateItemCount();

                if (_orderedFiles.Count > 0)
                {
                    _currentIndex = 0;
                    ShowCurrentMedia();
                    SetStatus("");
                    BigSelectFolderButton.Visibility = Visibility.Collapsed;
                }
                else
                {
                    SetStatus("No media found");
                    BigSelectFolderButton.Visibility = Visibility.Visible;
                }
            }
            catch (Exception ex)
            {
                SetStatus("Error: " + ex.Message);
                BigSelectFolderButton.Visibility = Visibility.Visible;
            }
            finally
            {
                Cursor = Cursors.Arrow;
            }
        }

        #endregion

        #region Show media

        private void ShowCurrentMedia()
        {
            try
            {
                var sb = (Storyboard)FindResource("SlideTransitionFade");
                sb.Begin();
            }
            catch
            {
                // if the resource is missing, ignore
            }
            if (_orderedFiles.Count == 0) return;
            if (_currentIndex < 0) _currentIndex = 0;
            if (_currentIndex >= _orderedFiles.Count) _currentIndex = 0;

            _mediaStartTime = DateTime.UtcNow;
            _videoEnded = false;

            // Reset progress UI
            _videoProgressTimer.Stop();
            VideoProgressBar.Visibility = Visibility.Collapsed;
            VideoProgressBar.Value = 0;

            // Reset video state
            VideoElement.Stop();
            VideoElement.Source = null;
            VideoElement.Visibility = Visibility.Collapsed;
            ResetVideoScale();

            // Make sure image is visible by default
            ImageElement.Visibility = Visibility.Visible;

            string file = _orderedFiles[_currentIndex];
            if (!File.Exists(file)) return;

            string ext = Path.GetExtension(file).ToLowerInvariant();
            if (ext == ".mp4")
                _currentMediaType = MediaType.Video;
            else if (ext == ".gif")
                _currentMediaType = MediaType.Gif;
            else
                _currentMediaType = MediaType.Image;

            UpdateItemCount();

            // Zoom controls behavior
            if (_currentMediaType == MediaType.Video)
            {
                ZoomResetButton.IsEnabled = false;
                ZoomLabel.Text = "Auto";
            }
            else
            {
                ZoomResetButton.IsEnabled = true;
            }

            // Replay only makes sense when slideshow NOT running and current is video
            ReplayButton.IsEnabled = !_slideTimer.IsEnabled && _currentMediaType == MediaType.Video;

            try
            {
                // -------------------------
                // VIDEO (MP4)
                // -------------------------
                if (_currentMediaType == MediaType.Video)
                {
                    ImageElement.Source = null;
                    ScrollHost.ScrollToHorizontalOffset(0);
                    ScrollHost.ScrollToVerticalOffset(0);

                    VideoElement.Source = new Uri(file);
                    VideoElement.Visibility = Visibility.Visible;
                    VideoElement.IsMuted = _isMuted;
                    ResetVideoScale();
                    VideoElement.Play();

                    VideoProgressBar.Visibility = Visibility.Visible;
                    VideoProgressBar.Value = 0;
                    UpdateVideoProgressWidth();
                    _videoProgressTimer.Start();

                    Title = $"Slide Show Bob - {Path.GetFileName(file)} (Video)";
                    return;
                }

                // -------------------------
                // IMAGES + GIFs
                // -------------------------
                if (_currentMediaType == MediaType.Gif)
                {
                    // Clear any previous static image
                    ImageElement.Source = null;

                    var uri = new Uri(file);
                    var gifImage = new BitmapImage();
                    gifImage.BeginInit();
                    gifImage.UriSource = uri;

                    // Let WPF stream the data instead of loading everything up front.
                    gifImage.CacheOption = BitmapCacheOption.OnDemand;

                    // Downscale at decode time to roughly the viewport width
                    // so giant GIFs don't waste time decoding off-screen pixels.
                    double viewportWidth = ScrollHost.ViewportWidth > 0
                        ? ScrollHost.ViewportWidth
                        : ScrollHost.ActualWidth;

                    if (viewportWidth > 0)
                    {
                        gifImage.DecodePixelWidth = (int)viewportWidth;
                    }

                    gifImage.EndInit();

                    // Use WpfAnimatedGif to animate
                    ImageBehavior.SetAnimatedSource(ImageElement, gifImage);

                    ScrollHost.ScrollToHorizontalOffset(0);
                    ScrollHost.ScrollToVerticalOffset(0);

                    if (FitToggle.IsChecked == true)
                        SetZoomFit(true);   // allow zoom-in fit for GIFs
                    else
                        SetZoom(1.0);

                    Title = $"Slide Show Bob - {Path.GetFileName(file)} (GIF)";
                    return;
                }
                else
                {
                    var img = GetOrLoadImage(file, isGif: false);
                    if (img == null) return;

                    ImageElement.Source = img;
                    ScrollHost.ScrollToHorizontalOffset(0);
                    ScrollHost.ScrollToVerticalOffset(0);

                    if (FitToggle.IsChecked == true)
                        SetZoomFit(false);
                    else
                        SetZoom(1.0);

                    Title = $"Slide Show Bob - {Path.GetFileName(file)}";
                }
            }
            catch
            {
                // ignore bad files
            }
            // Preload neighbors (images only)
            try
            {
                if (_orderedFiles.Count > 1)
                {
                    int next = (_currentIndex + 1) % _orderedFiles.Count;
                    int prev = (_currentIndex - 1 + _orderedFiles.Count) % _orderedFiles.Count;

                    foreach (var idx in new[] { next, prev })
                    {
                        string path = _orderedFiles[idx];
                        string exts = System.IO.Path.GetExtension(path).ToLowerInvariant();
                        if (exts == ".jpg" || exts == ".jpeg" || exts == ".png" || exts == ".bmp" || exts == ".tif" || exts == ".tiff")
                        {
                            _ = GetOrLoadImage(path, isGif: false);
                        }
                    }
                }
            }
            catch { }
        }

        private void VideoProgressBar_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (_currentMediaType != MediaType.Video || VideoElement.Source == null)
                return;

            if (!VideoElement.NaturalDuration.HasTimeSpan)
                return;

            var bar = (ProgressBar)sender;
            var pos = e.GetPosition(bar);
            double ratio = pos.X / bar.ActualWidth;
            if (ratio < 0) ratio = 0;
            if (ratio > 1) ratio = 1;

            var total = VideoElement.NaturalDuration.TimeSpan;
            VideoElement.Position = TimeSpan.FromMilliseconds(total.TotalMilliseconds * ratio);
        }

        private void VideoProgressBar_MouseMove(object sender, MouseEventArgs e)
        {
            if (_currentMediaType != MediaType.Video || VideoElement.Source == null)
                return;

            if (!VideoElement.NaturalDuration.HasTimeSpan)
                return;

            var bar = (ProgressBar)sender;
            var pos = e.GetPosition(bar);
            double ratio = pos.X / bar.ActualWidth;
            if (ratio < 0) ratio = 0;
            if (ratio > 1) ratio = 1;

            var total = VideoElement.NaturalDuration.TimeSpan;
            var hoverTime = TimeSpan.FromMilliseconds(total.TotalMilliseconds * ratio);

            HoverTimeText.Text = hoverTime.ToString(@"mm\:ss");
            HoverTimeText.Visibility = Visibility.Visible;
        }

        private void VideoProgressBar_MouseLeave(object sender, MouseEventArgs e)
        {
            HoverTimeText.Visibility = Visibility.Collapsed;
        }

        private void ShowNext()
        {
            if (_orderedFiles.Count == 0) return;
            _currentIndex = (_currentIndex + 1) % _orderedFiles.Count;
            ShowCurrentMedia();
        }

        private void ShowPrevious()
        {
            if (_orderedFiles.Count == 0) return;
            _currentIndex--;
            if (_currentIndex < 0) _currentIndex = _orderedFiles.Count - 1;
            ShowCurrentMedia();
        }

        #endregion

        #region Timers

        private void SlideTimer_Tick(object? sender, EventArgs e)
        {
            if (_orderedFiles.Count == 0) return;

            var elapsedMs = (DateTime.UtcNow - _mediaStartTime).TotalMilliseconds;
            if (elapsedMs < _slideDelayMs)
                return;

            if (_currentMediaType == MediaType.Video && !_videoEnded)
                return;

            ShowNext();
        }

        private void VideoProgressTimer_Tick(object? sender, EventArgs e)
        {
            if (_currentMediaType != MediaType.Video || VideoElement.Source == null)
            {
                VideoProgressBar.Visibility = Visibility.Collapsed;
                VideoProgressBar.Value = 0;
                return;
            }

            if (VideoElement.NaturalDuration.HasTimeSpan)
            {
                var duration = VideoElement.NaturalDuration.TimeSpan;
                if (duration.TotalMilliseconds > 0)
                {
                    var pos = VideoElement.Position;
                    double percent = pos.TotalMilliseconds / duration.TotalMilliseconds * 100.0;
                    if (percent < 0) percent = 0;
                    if (percent > 100) percent = 100;
                    VideoProgressBar.Value = percent;
                }
            }

            UpdateVideoProgressWidth();
        }

        private void VideoProgressBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (_currentMediaType != MediaType.Video)
                return;

            if (VideoElement.Source == null)
                return;

            if (!VideoElement.NaturalDuration.HasTimeSpan)
                return;

            double width = VideoProgressBar.ActualWidth;
            if (width <= 0)
                return;

            var pos = e.GetPosition(VideoProgressBar);
            double ratio = pos.X / width;
            if (ratio < 0) ratio = 0;
            if (ratio > 1) ratio = 1;

            var duration = VideoElement.NaturalDuration.TimeSpan;
            var target = TimeSpan.FromMilliseconds(duration.TotalMilliseconds * ratio);

            VideoElement.Position = target;

            _mediaStartTime = DateTime.UtcNow;
            _videoEnded = false;

            VideoProgressBar.Value = ratio * 100.0;
            e.Handled = true;
        }

        #endregion

        #region Video events

        private void VideoElement_MediaEnded(object sender, RoutedEventArgs e)
        {
            _videoEnded = true;
            VideoElement.Stop();
            VideoProgressBar.Value = 100;
            _videoProgressTimer.Stop();
        }

        private void VideoElement_MediaOpened(object sender, RoutedEventArgs e)
        {
            if (FitToggle.IsChecked == true)
            {
                // Defer until layout is ready so ScrollHost has a valid viewport
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    SetVideoFit();
                }), System.Windows.Threading.DispatcherPriority.Background);
            }
            else
            {
                ResetVideoScale();
            }
        }
        #endregion

        #region Folder selection helpers

        private async Task ChooseFolderAsync()
        {
            await ChooseFoldersFromDialogAsync();
        }

        private async void SelectFolderButton_Click(object sender, RoutedEventArgs e)
        {
            await ChooseFolderAsync();
        }

        private async void BigSelectFolderButton_Click(object sender, RoutedEventArgs e)
        {
            await ChooseFolderAsync();
        }

        private async void IncludeVideoToggle_Checked(object sender, RoutedEventArgs e)
        {
            await OnIncludeVideoToggleChanged();
        }

        private async void IncludeVideoToggle_Unchecked(object sender, RoutedEventArgs e)
        {
            await OnIncludeVideoToggleChanged();
        }

        private async Task OnIncludeVideoToggleChanged()
        {
            // Persist setting
            _settings.IncludeVideos = IncludeVideoToggle.IsChecked == true;
            SettingsManager.Save(_settings);

            // Reload playlist if we already have folders
            if (_folders.Count > 0)
            {
                await LoadFoldersAsync();
            }
        }

        #endregion


        public IReadOnlyList<string> GetCurrentPlaylist()
        {
            return _orderedFiles.ToList();
        }

        public async Task AddFolderInteractiveAsync()
        {
            await ChooseFolderAsync();
        }

        #region Toolbar / controls


        private void PlaylistButton_Click(object sender, RoutedEventArgs e)
        {
            // _folders and _allFiles should be your in-memory playlist sources
            var window = new PlaylistWindow(this, _folders, _allFiles);
            window.Owner = this;
            window.Show();
        }

        private void FitToggle_Checked(object sender, RoutedEventArgs e)
        {
            if (!IsLoaded || ScrollHost == null || ImageElement == null || VideoElement == null)
                return;

            if (ImageElement.Source == null && VideoElement.Source == null)
                return;

            if (_currentMediaType == MediaType.Video && VideoElement.Source != null)
            {
                SetVideoFit();
            }
            else if (ImageElement.Source != null)
            {
                SetZoomFit(_currentMediaType == MediaType.Gif);
            }
        }

        private void FitToggle_Unchecked(object sender, RoutedEventArgs e)
        {
            if (!IsLoaded || ScrollHost == null || ImageElement == null || VideoElement == null)
                return;

            if (_currentMediaType == MediaType.Video)
            {
                ResetVideoScale();
            }
            else
            {
                SetZoom(1.0);
            }
        }

        private void ZoomResetButton_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMediaType == MediaType.Video) return;
            FitToggle.IsChecked = false;
            SetZoom(1.0);
        }

        private void StartButton_Click(object sender, RoutedEventArgs e)
        {
            if (_orderedFiles.Count == 0)
            {
                MessageBox.Show("Please select a folder with images or videos first.",
                                "No Media", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            if (!int.TryParse(DelayBox.Text, out int delay) || delay <= 0)
            {
                MessageBox.Show("Please enter a valid delay in milliseconds (greater than 0).",
                                "Invalid Delay", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

         
            _slideDelayMs = delay;
            _slideTimer.Interval = TimeSpan.FromMilliseconds(delay);
            _slideTimer.Start();
            SetSlideshowState(true);

            // Auto-minimize toolbar when slideshow starts
            MinimizeToolbar();

            _settings.SlideDelayMs = _slideDelayMs;
            SettingsManager.Save(_settings);
        }

        private void StopButton_Click(object sender, RoutedEventArgs e)
        {
            _slideTimer.Stop();
            SetSlideshowState(false);
        }

        private void FullscreenButton_Click(object sender, RoutedEventArgs e)
        {
            ToggleFullscreen();
        }

        private void ToggleFullscreen()
        {
            if (!_isFullscreen)
            {
                _isFullscreen = true;

                // Save current window state and bounds
                _prevState = WindowState;
                _prevStyle = WindowStyle;
                _prevResizeMode = ResizeMode;
                _prevLeft = Left;
                _prevTop = Top;
                _prevWidth = Width;
                _prevHeight = Height;

                // Borderless, non-resizable, and on top
                WindowStyle = WindowStyle.None;
                ResizeMode = ResizeMode.NoResize;
                Topmost = true;

                // True fullscreen: cover entire primary screen, including over taskbar
                double screenWidth = SystemParameters.PrimaryScreenWidth;
                double screenHeight = SystemParameters.PrimaryScreenHeight;

                WindowState = WindowState.Normal;  // so manual bounds apply
                Left = 0;
                Top = 0;
                Width = screenWidth;
                Height = screenHeight;

                // In fullscreen, always use minimized notch toolbar
                MinimizeToolbar();
                ShowChrome();  // start bright
            }
            else
            {
                _isFullscreen = false;

                // Restore style / mode
                WindowStyle = _prevStyle;
                ResizeMode = _prevResizeMode;
                Topmost = false;

                // Restore previous bounds and state
                WindowState = WindowState.Normal;
                Left = _prevLeft;
                Top = _prevTop;
                Width = _prevWidth;
                Height = _prevHeight;

                if (_prevState == WindowState.Maximized)
                {
                    WindowState = WindowState.Maximized;
                }

                ShowChrome();
            }

            // Re-apply fit so media matches new size
            if (_currentMediaType == MediaType.Video && VideoElement.Source != null && FitToggle.IsChecked == true)
            {
                SetVideoFit();
            }
            else if (ImageElement.Source != null && FitToggle.IsChecked == true)
            {
                SetZoomFit(_currentMediaType == MediaType.Gif);
            }
        }


        private void MuteButton_Click(object sender, RoutedEventArgs e)
        {
            _isMuted = !_isMuted;
            VideoElement.IsMuted = _isMuted;
            MuteButton.Content = _isMuted ? "🔇" : "🔊";

            _settings.IsMuted = _isMuted;
            SettingsManager.Save(_settings);
        }

        private void ReplayButton_Click(object sender, RoutedEventArgs e)
        {
            if (_currentMediaType != MediaType.Video) return;
            if (_slideTimer.IsEnabled) return;
            if (VideoElement.Source == null) return;

            _videoEnded = false;
            _mediaStartTime = DateTime.UtcNow;
            VideoElement.Stop();
            VideoElement.Position = TimeSpan.Zero;
            VideoElement.IsMuted = _isMuted;
            VideoElement.Play();

            VideoProgressBar.Visibility = Visibility.Visible;
            VideoProgressBar.Value = 0;
            UpdateVideoProgressWidth();
            _videoProgressTimer.Start();
        }

        private void PrevButton_Click(object sender, RoutedEventArgs e) => ShowPrevious();
        private void NextButton_Click(object sender, RoutedEventArgs e) => ShowNext();

        private void ToolbarCollapseButton_Click(object sender, RoutedEventArgs e)
        {
            MinimizeToolbar();
        }

        private void ToolbarExpandButton_Click(object sender, RoutedEventArgs e)
        {
            if (!_toolbarMinimized) return;

            _toolbarMinimized = false;

            // Hide notch, show expanded with animation (slide up from below)
            ToolbarNotchPanel.Visibility = Visibility.Collapsed;

            ToolbarExpandedPanel.Visibility = Visibility.Visible;
            ToolbarExpandedPanel.Opacity = 0.0;
            ExpandedTransform.Y = 10;

            var opacityAnim = new DoubleAnimation(0.0, 1.0, TimeSpan.FromMilliseconds(160))
            {
                EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut }
            };
            var translateAnim = new DoubleAnimation(10, 0, TimeSpan.FromMilliseconds(160))
            {
                EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut }
            };

            ToolbarExpandedPanel.BeginAnimation(OpacityProperty, opacityAnim);
            ExpandedTransform.BeginAnimation(TranslateTransform.YProperty, translateAnim);

            ShowChrome();
            ResetChromeTimer();
        }

        private void NotchPrevButton_Click(object sender, RoutedEventArgs e) => ShowPrevious();
        private void NotchNextButton_Click(object sender, RoutedEventArgs e) => ShowNext();

        private void NotchPlayPauseButton_Click(object sender, RoutedEventArgs e)
        {
            if (_slideTimer.IsEnabled)
                StopButton_Click(sender, e);
            else
                StartButton_Click(sender, e);
        }

        #endregion

        #region Input

        private void Window_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Space || e.Key == Key.Right)
            {
                ShowNext();
                e.Handled = true;
            }
            else if (e.Key == Key.Left)
            {
                ShowPrevious();
                e.Handled = true;
            }
            else if (e.Key == Key.F11)
            {
                ToggleFullscreen();
                e.Handled = true;
            }
            else if (e.Key == Key.Escape && _isFullscreen)
            {
                ToggleFullscreen();
                e.Handled = true;
            }
        }

        private void Media_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            ShowNext();
        }

        private void Media_MouseRightButtonUp(object sender, MouseButtonEventArgs e)
        {
            ShowPrevious();
        }

        private void ScrollHost_PreviewMouseWheel(object sender, MouseWheelEventArgs e)
        {
            if (_currentMediaType == MediaType.Video) return;
            if (FitToggle.IsChecked == true) return;

            double factor = e.Delta > 0 ? 1.1 : 0.9;
            SetZoom(_zoomFactor * factor);
            e.Handled = true;
        }
        public async Task ChooseFoldersFromDialogAsync()
        {
            // Try CommonOpenFileDialog first (multi-folder, Ctrl/Shift support)
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
                    bool addedAny = false;

                    foreach (var folderPath in dlg.FileNames)
                    {
                        if (!_folders.Contains(folderPath, StringComparer.OrdinalIgnoreCase))
                        {
                            _folders.Add(folderPath);
                            addedAny = true;
                        }
                    }

                    if (addedAny)
                    {
                        StatusText.Text = "Folders: " + string.Join("; ", _folders);
                        await LoadFoldersAsync();
                    }

                    return;
                }
            }
            catch
            {
                // fallthrough to FolderBrowserDialog
            }

            // Fallback: classic single-folder dialog
            var fb = new System.Windows.Forms.FolderBrowserDialog
            {
                Description = "Select folder containing images/videos"
            };

            var result = fb.ShowDialog();
            if (result == System.Windows.Forms.DialogResult.OK)
            {
                string path = fb.SelectedPath;

                if (!_folders.Contains(path, StringComparer.OrdinalIgnoreCase))
                {
                    _folders.Add(path);
                    StatusText.Text = "Folders: " + string.Join("; ", _folders);
                    await LoadFoldersAsync();
                }
            }
        }
        public void RemoveFolderFromPlaylist(string folderPath)
        {
            if (string.IsNullOrWhiteSpace(folderPath))
                return;

            // Remove folder from folder list
            _folders.RemoveAll(f =>
                string.Equals(Path.GetFullPath(f),
                              Path.GetFullPath(folderPath),
                              StringComparison.OrdinalIgnoreCase));

            // Remove all files under that folder from playlist
            _allFiles.RemoveAll(f => PlaylistWindow_IsUnderFolderStatic(f, folderPath));
            _orderedFiles.RemoveAll(f => PlaylistWindow_IsUnderFolderStatic(f, folderPath));

            if (_orderedFiles.Count == 0)
            {
                _currentIndex = -1;
                ImageElement.Source = null;
                VideoElement.Source = null;
                UpdateItemCount();
                return;
            }

            // Fix current index if needed
            if (_currentIndex >= _orderedFiles.Count)
                _currentIndex = _orderedFiles.Count - 1;

            ShowCurrentMedia();
        }

        public void RemoveFileFromPlaylist(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                return;

            string normalized = Path.GetFullPath(filePath);

            _allFiles.RemoveAll(f => string.Equals(Path.GetFullPath(f), normalized, StringComparison.OrdinalIgnoreCase));
            _orderedFiles.RemoveAll(f => string.Equals(Path.GetFullPath(f), normalized, StringComparison.OrdinalIgnoreCase));

            if (_orderedFiles.Count == 0)
            {
                _currentIndex = -1;
                ImageElement.Source = null;
                VideoElement.Source = null;
                UpdateItemCount();
                return;
            }

            if (_currentIndex >= _orderedFiles.Count)
                _currentIndex = _orderedFiles.Count - 1;

            ShowCurrentMedia();
        }

        // Helper that PlaylistWindow and MainWindow can both use
        private static bool PlaylistWindow_IsUnderFolderStatic(string filePath, string folderPath)
        {
            if (string.IsNullOrEmpty(filePath) || string.IsNullOrEmpty(folderPath))
                return false;

            folderPath = Path.GetFullPath(folderPath).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
            filePath = Path.GetFullPath(filePath);

            return filePath.StartsWith(folderPath, StringComparison.OrdinalIgnoreCase);
        }
        #endregion

    }
}
