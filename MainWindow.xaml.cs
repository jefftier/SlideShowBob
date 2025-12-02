using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using System.Runtime.InteropServices;
using System.Windows.Interop;
using WinForms = System.Windows.Forms;
using Microsoft.WindowsAPICodePack.Dialogs;
using WpfAnimatedGif;
using SlideShowBob.ViewModels;


namespace SlideShowBob
{
    public partial class MainWindow : Window
    {
        // Dependency property to track scrollbar visibility
        public static readonly DependencyProperty HasScrollBarsProperty =
            DependencyProperty.Register(nameof(HasScrollBars), typeof(bool), typeof(MainWindow),
                new PropertyMetadata(false));

        public bool HasScrollBars
        {
            get => (bool)GetValue(HasScrollBarsProperty);
            set => SetValue(HasScrollBarsProperty, value);
        }

        // ViewModel (injected from App.xaml.cs)
        private MainViewModel? _viewModel;
        private Uri? _currentVideoSource = null; // Track current video source to tie blur to video

        private bool _isFullscreen = false;
        private WindowState _prevState;
        private WindowStyle _prevStyle;
        private ResizeMode _prevResizeMode;

        private double _zoomFactor = 1.0;
        private double _prevLeft, _prevTop, _prevWidth, _prevHeight;
        private readonly ScaleTransform _imageScale = new();
        private readonly ScaleTransform _videoScale = new();
        private readonly RotateTransform _imageRotation = new();

        private DispatcherTimer? _chromeTimer;

        private int _slideDelayMs = 2000;
        private bool _isMuted = true;

        private readonly List<string> _folders = new();
        private string? _currentFolder;

        private bool _toolbarMinimized = false;
        private CancellationTokenSource? _loadingOverlayDelayCts;
        private CancellationTokenSource? _showMediaCancellation;
        private readonly object _showMediaLock = new object();

        protected override void OnClosed(EventArgs e)
        {
            // Clean up cancellation tokens
            lock (_showMediaLock)
            {
                _showMediaCancellation?.Cancel();
                _showMediaCancellation?.Dispose();
                _showMediaCancellation = null;
            }
            
            _loadingOverlayDelayCts?.Cancel();
            _loadingOverlayDelayCts?.Dispose();
            
            base.OnClosed(e);
        }

        // Sort mode (still needed for UI)
        private SortMode _sortMode = SortMode.NameAZ;

        // Helper property to get current media type - now uses ViewModel
        private MediaType? CurrentMediaType => _viewModel?.CurrentMediaItem?.Type;

        public MainWindow()
        {
            InitializeComponent();
            // Services and ViewModel will be injected via InitializeWithViewModel
        }

        // Temporary bridge fields to access services during MVVM transition
        // TODO: Complete refactoring to remove direct service access
        private AppSettings? _settings;
        private MediaPlaylistManager? _playlist;
        private VideoPlaybackService? _videoService;
        private SlideshowController? _slideshowController;
        private MediaLoaderService? _mediaLoader;

        /// <summary>
        /// Initializes MainWindow with MainViewModel. Called from App.xaml.cs after services are created.
        /// </summary>
        public void InitializeWithViewModel(MainViewModel viewModel)
        {
            _viewModel = viewModel ?? throw new ArgumentNullException(nameof(viewModel));
            DataContext = _viewModel;

            // Initialize service references from ViewModel (temporary bridge during MVVM transition)
            _settings = _viewModel.Settings;
            _playlist = _viewModel.PlaylistManager;
            _videoService = _viewModel.VideoPlaybackService;
            _slideshowController = _viewModel.SlideshowController;
            _mediaLoader = _viewModel.MediaLoaderService;

            // Subscribe to service events (temporary - should eventually use ViewModel events)
            if (_slideshowController != null)
            {
                _slideshowController.NavigateToIndex += SlideshowController_NavigateToIndex;
            }
            if (_videoService != null)
            {
                _videoService.MediaOpened += VideoService_MediaOpened;
                _videoService.MediaEnded += VideoService_MediaEnded;
                _videoService.FrameCaptured += VideoService_FrameCaptured;
            }

            // Note: MainWindow should use MainViewModel properties/commands instead of direct service access.
            // Services are now managed by MainViewModel and created in App.xaml.cs.
            // This initialization method sets up UI-specific things that don't belong in ViewModel.

            // ImageElement uses rotation transform for EXIF orientation, sizing via Width/Height
            ImageElement.LayoutTransform = _imageRotation;
            VideoElement.LayoutTransform = _videoScale;
            VideoFrameImage.LayoutTransform = _videoScale; // Use same scale as video

            // Subscribe to ViewModel events for UI updates
            _viewModel.PropertyChanged += ViewModel_PropertyChanged;
            _viewModel.RequestShowMedia += ViewModel_RequestShowMedia;
            _viewModel.MediaChanged += ViewModel_MediaChanged;

            _chromeTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };

            // Hook up scrollbar visibility tracking after Loaded event
            Loaded += (s, e) =>
            {
                if (ScrollHost != null)
                {
                    ScrollHost.LayoutUpdated += ScrollHost_LayoutUpdated;
                    UpdateScrollBarVisibility();
                }
            };
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

            // Load previously used folders from settings only if saving is enabled
            if (_settings?.SaveFolderPaths == true)
            {
                // Initialize FolderPaths if null (for backward compatibility with old settings files)
                if (_settings.FolderPaths == null)
                {
                    _settings.FolderPaths = new List<string>();
                }

                if (_settings.FolderPaths.Count > 0)
                {
                    _folders.Clear();
                    foreach (var folderPath in _settings.FolderPaths)
                    {
                        if (Directory.Exists(folderPath) && !_folders.Contains(folderPath, StringComparer.OrdinalIgnoreCase))
                        {
                            _folders.Add(folderPath);
                        }
                    }
                    
                    if (_folders.Count > 0)
                    {
                        StatusText.Text = "Folders: " + string.Join("; ", _folders);
                        // Load folders asynchronously after window is loaded
                        Loaded += MainWindow_Loaded;
                    }
                }
            }
            else
            {
                // Saving disabled - clear folders
                _folders.Clear();
                if (_settings?.FolderPaths != null)
                {
                    _settings.FolderPaths.Clear();
                }
            }
        }

        #region Service Event Handlers

        private void SlideshowController_NavigateToIndex(object? sender, int index)
        {
            // Fire-and-forget: intentionally not awaited
            _ = Dispatcher.InvokeAsync(async () =>
            {
                await ShowCurrentMediaAsync();
            }, DispatcherPriority.Normal);
        }

        private void VideoService_MediaOpened(object? sender, EventArgs e)
        {
            HideLoadingOverlay();
            
            // Make sure video is visible and ready
            if (VideoElement != null)
            {
                VideoElement.Visibility = Visibility.Visible;
            }
            
            // Wait a short moment for video to start rendering, then fade from static frame
            // Use a simple delay since MediaElement doesn't expose playback state directly
            var fadeTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(150) };
            fadeTimer.Tick += (s, args) =>
            {
                fadeTimer.Stop();
                FadeFromFrameToVideo();
            };
            fadeTimer.Start();
            
            ApplyPortraitBlurEffectForVideo();
            
            if (FitToggle.IsChecked == true)
            {
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    SetVideoFit();
                    ApplyPortraitBlurEffectForVideo();
                }), DispatcherPriority.Background);
            }
            else
            {
                ResetVideoScale();
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    ApplyPortraitBlurEffectForVideo();
                }), DispatcherPriority.Loaded);
            }

            var currentItem = _playlist?.CurrentItem;
            if (currentItem != null)
            {
                _slideshowController?.OnMediaDisplayed(MediaType.Video);
            }
        }

        private void VideoService_MediaEnded(object? sender, EventArgs e)
        {
            _slideshowController?.OnVideoEnded();
        }

        private void VideoService_FrameCaptured(object? sender, System.Windows.Media.Imaging.BitmapSource frame)
        {
            // Display the captured last frame immediately
            if (frame != null)
            {
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    // Hide video element and show the last frame
                    if (VideoElement != null)
                    {
                        VideoElement.Visibility = Visibility.Collapsed;
                    }
                    ShowVideoFrame(frame, fadeIn: true);
                }), DispatcherPriority.Normal);
            }
        }

        #endregion

        private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            Loaded -= MainWindow_Loaded; // Only run once
            if (_folders.Count > 0)
            {
                await LoadFoldersAsync();
            }
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

        // GetOrLoadImage and ExifOrientation enum removed - now handled by MediaLoaderService

        private bool IsPortraitImage(BitmapSource? image, string? filePath = null)
        {
            if (image == null)
                return false;

            double width = image.PixelWidth;
            double height = image.PixelHeight;

            // Account for EXIF rotation - if rotated 90/270, swap dimensions
            if (filePath != null)
            {
                var orientation = _mediaLoader?.GetOrientation(filePath);
                if (orientation == ExifOrientation.Rotate90 || orientation == ExifOrientation.Rotate270)
                {
                    (width, height) = (height, width);
                }
            }

            return height > width;
        }

        private void ClearImageDisplay()
        {
            // Clear video source tracking
            _currentVideoSource = null;
            
            if (ImageElement != null)
            {
                ImageElement.Source = null;
                ImageElement.Effect = null;
            }
            if (VideoElement != null)
            {
                VideoElement.Effect = null;
            }
            if (VideoFrameImage != null)
            {
                VideoFrameImage.Source = null;
                VideoFrameImage.Visibility = Visibility.Collapsed;
                VideoFrameImage.Opacity = 0;
            }
            if (BlurredBackgroundImage != null)
            {
                BlurredBackgroundImage.Visibility = Visibility.Collapsed;
                BlurredBackgroundImage.Source = null;
            }
        }

        private bool IsPortraitVideo()
        {
            if (VideoElement == null || VideoElement.Source == null)
                return false;

            if (VideoElement.NaturalVideoWidth <= 0 || VideoElement.NaturalVideoHeight <= 0)
                return false;

            return VideoElement.NaturalVideoHeight > VideoElement.NaturalVideoWidth;
        }

        private void ApplyPortraitBlurEffectForImage(BitmapSource? image, string? filePath = null)
        {
            if (BlurredBackgroundImage == null || ImageElement == null)
                return;

            // Always clear first
            BlurredBackgroundImage.Visibility = Visibility.Collapsed;
            BlurredBackgroundImage.Source = null;
            ImageElement.Effect = null;

            // Check if setting is enabled
            if (_settings != null && !_settings.PortraitBlurEffect)
                return;

            // Check if image is portrait
            if (image == null || !IsPortraitImage(image, filePath))
                return;

            // Apply effect for portrait images - use the SAME source as the main image
            // This ensures they're always in sync
            BlurredBackgroundImage.Source = image;
            BlurredBackgroundImage.Visibility = Visibility.Visible;

            // Apply soft drop shadow to the main image
            ImageElement.Effect = new DropShadowEffect
            {
                Color = Colors.Black,
                Direction = 270,
                ShadowDepth = 10,
                BlurRadius = 25,
                Opacity = 0.5
            };
        }

        private void ApplyPortraitBlurEffectForVideo()
        {
            if (BlurredBackgroundImage == null || VideoElement == null)
                return;

            // Always clear first
            BlurredBackgroundImage.Visibility = Visibility.Collapsed;
            BlurredBackgroundImage.Source = null;
            VideoElement.Effect = null;

            // Check if setting is enabled
            if (_settings != null && !_settings.PortraitBlurEffect)
                return;

            // Check if video is portrait
            if (!IsPortraitVideo())
                return;

            // Store the current video source to tie the blur to this specific video
            if (VideoElement.Source != null)
            {
                _currentVideoSource = VideoElement.Source;
            }
            else
            {
                return; // No video source, can't apply blur
            }

            // For videos, we need to wait for the first frame to actually render
            // This is especially important for larger videos which take longer to decode
            // Use a retry mechanism to wait for the video to be ready
            TryCaptureVideoFrameForBlur(0);
        }

        private void TryCaptureVideoFrameForBlur(int attempt)
        {
            const int maxAttempts = 10; // Try up to 10 times (about 1 second total)
            const int delayMs = 100; // Wait 100ms between attempts

            // CRITICAL: Verify we're still showing the SAME video source
            if (VideoElement == null || VideoElement.Source == null || VideoElement.Source != _currentVideoSource)
                return;

            // Check if video has valid dimensions and is ready
            if (VideoElement.NaturalVideoWidth <= 0 || VideoElement.NaturalVideoHeight <= 0)
            {
                // Video not ready yet, retry after a delay
                if (attempt < maxAttempts)
                {
                    Task.Delay(delayMs).ContinueWith(_ =>
                    {
                        Dispatcher.BeginInvoke(new Action(() =>
                        {
                            TryCaptureVideoFrameForBlur(attempt + 1);
                        }), DispatcherPriority.Background);
                    });
                    return;
                }
                // Give up after max attempts - just apply drop shadow
                ApplyDropShadowOnly();
                return;
            }

            // Try to capture the frame
            try
            {
                // Use VisualBrush to capture the video at its natural dimensions
                var videoBrush = new VisualBrush(VideoElement)
                {
                    Stretch = Stretch.Uniform,
                    Viewbox = new Rect(0, 0, 1, 1),
                    ViewboxUnits = BrushMappingMode.RelativeToBoundingBox
                };
                
                // Create a drawing visual with the video brush
                var drawingVisual = new DrawingVisual();
                using (var drawingContext = drawingVisual.RenderOpen())
                {
                    drawingContext.DrawRectangle(
                        videoBrush,
                        null,
                        new Rect(0, 0, VideoElement.NaturalVideoWidth, VideoElement.NaturalVideoHeight));
                }
                
                // Render to bitmap at natural video dimensions
                var renderTarget = new RenderTargetBitmap(
                    VideoElement.NaturalVideoWidth,
                    VideoElement.NaturalVideoHeight,
                    96, 96, PixelFormats.Pbgra32);
                
                renderTarget.Render(drawingVisual);
                renderTarget.Freeze();
                
                // Verify we're still on the same video
                if (VideoElement.Source != null && VideoElement.Source == _currentVideoSource)
                {
                    // Set the source first while keeping it hidden
                    // This allows the blur effect to be applied before the image becomes visible
                    BlurredBackgroundImage.Source = renderTarget;
                    BlurredBackgroundImage.Visibility = Visibility.Collapsed; // Keep hidden initially

                    // Apply soft drop shadow to the video
                    VideoElement.Effect = new DropShadowEffect
                    {
                        Color = Colors.Black,
                        Direction = 270,
                        ShadowDepth = 10,
                        BlurRadius = 25,
                        Opacity = 0.5
                    };

                    // Make the blurred background visible after a render pass
                    // This ensures the blur effect is fully applied before showing the image
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        // Verify we're still on the same video before making visible
                        if (VideoElement.Source != null && VideoElement.Source == _currentVideoSource)
                        {
                            BlurredBackgroundImage.Visibility = Visibility.Visible;
                        }
                    }), DispatcherPriority.Loaded);
                }
            }
            catch
            {
                // Capture failed - retry if we haven't exceeded max attempts
                if (attempt < maxAttempts)
                {
                    Task.Delay(delayMs).ContinueWith(_ =>
                    {
                        Dispatcher.BeginInvoke(new Action(() =>
                        {
                            TryCaptureVideoFrameForBlur(attempt + 1);
                        }), DispatcherPriority.Background);
                    });
                }
                else
                {
                    // Give up after max attempts - just apply drop shadow
                    ApplyDropShadowOnly();
                }
            }
        }

        private void ApplyDropShadowOnly()
        {
            // Apply drop shadow without blurred background
            if (VideoElement != null && VideoElement.Source != null && VideoElement.Source == _currentVideoSource)
            {
                VideoElement.Effect = new DropShadowEffect
                {
                    Color = Colors.Black,
                    Direction = 270,
                    ShadowDepth = 10,
                    BlurRadius = 25,
                    Opacity = 0.5
                };
            }
        }

        // Keep the old method name for backward compatibility, but redirect to the new method
        private void ApplyPortraitBlurEffect(BitmapSource? image, string? filePath = null)
        {
            ApplyPortraitBlurEffectForImage(image, filePath);
        }

        /// <summary>
        /// Displays a video frame in the VideoFrameImage element with optional fade-in animation.
        /// </summary>
        private void ShowVideoFrame(System.Windows.Media.Imaging.BitmapSource frame, bool fadeIn = false)
        {
            if (VideoFrameImage == null || frame == null)
                return;

            VideoFrameImage.Source = frame;
            VideoFrameImage.Visibility = Visibility.Visible;

            if (fadeIn)
            {
                // Fade in animation
                var fadeInAnim = new DoubleAnimation(0.0, 1.0, TimeSpan.FromMilliseconds(300))
                {
                    EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut }
                };
                VideoFrameImage.BeginAnimation(OpacityProperty, fadeInAnim);
            }
            else
            {
                VideoFrameImage.Opacity = 1.0;
            }
        }

        /// <summary>
        /// Fades from the static video frame to the actual video playback.
        /// </summary>
        private void FadeFromFrameToVideo()
        {
            if (VideoFrameImage == null || VideoElement == null)
                return;

            // Make sure video is visible and on top (z-order)
            VideoElement.Visibility = Visibility.Visible;
            
            // Ensure video element is in front of frame image
            // The XAML order determines z-order, but we can also use Panel.ZIndex if needed

            // Only fade out if frame is actually visible
            if (VideoFrameImage.Visibility == Visibility.Visible && VideoFrameImage.Opacity > 0)
            {
                // Fade out the static frame quickly so video is visible
                var fadeOutAnim = new DoubleAnimation(VideoFrameImage.Opacity, 0.0, TimeSpan.FromMilliseconds(200))
                {
                    EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn }
                };

                fadeOutAnim.Completed += (s, e) =>
                {
                    // Hide frame image after fade out
                    if (VideoFrameImage != null)
                    {
                        VideoFrameImage.Visibility = Visibility.Collapsed;
                        VideoFrameImage.Source = null;
                        VideoFrameImage.Opacity = 0;
                    }
                };

                VideoFrameImage.BeginAnimation(OpacityProperty, fadeOutAnim);
            }
            else
            {
                // Frame wasn't shown, just make sure it's hidden
                HideVideoFrame();
            }
        }

        /// <summary>
        /// Hides the video frame image immediately.
        /// </summary>
        private void HideVideoFrame()
        {
            if (VideoFrameImage != null)
            {
                VideoFrameImage.Visibility = Visibility.Collapsed;
                VideoFrameImage.Source = null;
                VideoFrameImage.Opacity = 0;
            }
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
            if (_toolbarMinimized)
            {
                if (ToolbarNotchPanel.Visibility != Visibility.Visible)
                {
                    ToolbarNotchPanel.Visibility = Visibility.Visible;
                    ToolbarNotchPanel.Opacity = 0.0;
                }

                // Smooth fade-in animation
                var fadeInAnim = new DoubleAnimation(
                    ToolbarNotchPanel.Opacity,
                    1.0,
                    TimeSpan.FromMilliseconds(250))
                {
                    EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut }
                };

                ToolbarNotchPanel.BeginAnimation(OpacityProperty, fadeInAnim);
                ToolbarNotchPanel.IsHitTestVisible = true;
            }
            else
            {
                if (ToolbarExpandedPanel.Visibility != Visibility.Visible)
                {
                    ToolbarExpandedPanel.Visibility = Visibility.Visible;
                    ToolbarExpandedPanel.Opacity = 0.0;
                }

                // Smooth fade-in animation
                var fadeInAnim = new DoubleAnimation(
                    ToolbarExpandedPanel.Opacity,
                    1.0,
                    TimeSpan.FromMilliseconds(250))
                {
                    EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut }
                };

                ToolbarExpandedPanel.BeginAnimation(OpacityProperty, fadeInAnim);
                ToolbarExpandedPanel.IsHitTestVisible = true;
            }
        }

        private void DimChrome()
        {
            string behavior = _settings?.ToolbarInactivityBehavior ?? "Dim"; // default

            if (behavior == "Nothing")
            {
                // Do nothing - keep toolbars visible and interactive
                return;
            }
            else if (behavior == "Disappear")
            {
                // Smooth fade-out before hiding
                if (_toolbarMinimized)
                {
                    var fadeOutAnim = new DoubleAnimation(
                        ToolbarNotchPanel.Opacity,
                        0.0,
                        TimeSpan.FromMilliseconds(250))
                    {
                        EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn }
                    };

                    fadeOutAnim.Completed += (s, e) =>
                    {
                        ToolbarNotchPanel.Visibility = Visibility.Collapsed;
                    };

                    ToolbarNotchPanel.BeginAnimation(OpacityProperty, fadeOutAnim);
                }
                else
                {
                    var fadeOutAnim = new DoubleAnimation(
                        ToolbarExpandedPanel.Opacity,
                        0.0,
                        TimeSpan.FromMilliseconds(250))
                    {
                        EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn }
                    };

                    fadeOutAnim.Completed += (s, e) =>
                    {
                        ToolbarExpandedPanel.Visibility = Visibility.Collapsed;
                    };

                    ToolbarExpandedPanel.BeginAnimation(OpacityProperty, fadeOutAnim);
                }
            }
            else // "Dim" (default)
            {
                double dimOpacity = 0.18;
                if (_toolbarMinimized)
                {
                    // Smooth fade to dimmed opacity
                    var fadeDimAnim = new DoubleAnimation(
                        ToolbarNotchPanel.Opacity,
                        dimOpacity,
                        TimeSpan.FromMilliseconds(300))
                    {
                        EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn }
                    };

                    ToolbarNotchPanel.BeginAnimation(OpacityProperty, fadeDimAnim);
                    ToolbarNotchPanel.IsHitTestVisible = false;
                }
                else
                {
                    // Smooth fade to dimmed opacity
                    var fadeDimAnim = new DoubleAnimation(
                        ToolbarExpandedPanel.Opacity,
                        dimOpacity,
                        TimeSpan.FromMilliseconds(300))
                    {
                        EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn }
                    };

                    ToolbarExpandedPanel.BeginAnimation(OpacityProperty, fadeDimAnim);
                    ToolbarExpandedPanel.IsHitTestVisible = false;
                }
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

        private async void ShowLoadingOverlayDelayed(int delayMs = 1000)
        {
            // Cancel any pending overlay show
            _loadingOverlayDelayCts?.Cancel();
            _loadingOverlayDelayCts?.Dispose();
            _loadingOverlayDelayCts = new CancellationTokenSource();

            try
            {
                await Task.Delay(delayMs, _loadingOverlayDelayCts.Token);
                
                // Only show if we weren't cancelled (i.e., loading is still in progress)
                if (!_loadingOverlayDelayCts.Token.IsCancellationRequested)
                {
                    Dispatcher.Invoke(() =>
                    {
                        if (LoadingOverlay.Visibility != Visibility.Visible)
                        {
                            LoadingOverlay.Visibility = Visibility.Visible;
                            LoadingOverlay.Opacity = 0;
                        }
                        
                        var sb = (Storyboard)FindResource("LoadingOverlayFadeIn");
                        if (sb != null)
                        {
                            sb.Begin();
                        }
                        else
                        {
                            LoadingOverlay.Opacity = 1.0;
                        }
                    });
                }
            }
            catch (TaskCanceledException)
            {
                // Loading completed quickly, don't show overlay
            }
        }

        private void HideLoadingOverlay()
        {
            // Cancel any pending overlay show
            _loadingOverlayDelayCts?.Cancel();
            _loadingOverlayDelayCts?.Dispose();
            _loadingOverlayDelayCts = null;

            var sb = (Storyboard)FindResource("LoadingOverlayFadeOut");
            if (sb != null)
            {
                sb.Completed += (s, e) =>
                {
                    LoadingOverlay.Visibility = Visibility.Collapsed;
                };
                sb.Begin();
            }
            else
            {
                LoadingOverlay.Opacity = 0;
                LoadingOverlay.Visibility = Visibility.Collapsed;
            }
        }

        private void UpdateItemCount()
        {
            int total = _playlist?.Count ?? 0;
            int index = _playlist?.CurrentIndex >= 0 ? (_playlist.CurrentIndex + 1) : 0;
            TitleCountText.Text = $"{index} / {total}";
        }



        private void UpdateZoomLabel()
        {
            if (CurrentMediaType == MediaType.Video)
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
            
            // Enable scrolling when zooming (not in fit mode)
            if (ScrollHost != null && FitToggle?.IsChecked != true)
            {
                ScrollHost.HorizontalScrollBarVisibility = ScrollBarVisibility.Auto;
                ScrollHost.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
            }
            
            // Set explicit Width/Height on the Image based on zoom factor
            if (ImageElement != null && ImageElement.Source is BitmapSource bmp)
            {
                double imgWidth = bmp.PixelWidth;
                double imgHeight = bmp.PixelHeight;
                
                if (imgWidth > 0 && imgHeight > 0)
                {
                    // If factor is 1.0, clear explicit size to show at natural size
                    if (factor == 1.0)
                    {
                        ImageElement.Width = double.NaN;
                        ImageElement.Height = double.NaN;
                        // Clear MediaGrid min size when at natural size
                        if (MediaGrid != null)
                        {
                            MediaGrid.MinWidth = 0;
                            MediaGrid.MinHeight = 0;
                        }
                    }
                    else
                    {
                        double zoomedWidth = imgWidth * factor;
                        double zoomedHeight = imgHeight * factor;
                        ImageElement.Width = zoomedWidth;
                        ImageElement.Height = zoomedHeight;
                        // Set MediaGrid min size to match zoomed image to ensure ScrollViewer calculates extents correctly
                        if (MediaGrid != null)
                        {
                            MediaGrid.MinWidth = zoomedWidth;
                            MediaGrid.MinHeight = zoomedHeight;
                        }
                    }
                }
            }
            
            // Reset scroll position to top-left after zoom
            // Use Render priority to ensure it happens after all layout calculations
            if (ScrollHost != null)
            {
                // First ensure layout is updated
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    ScrollHost.UpdateLayout();
                    MediaGrid?.UpdateLayout();
                }), DispatcherPriority.Loaded);
                
                // Then reset scroll position after layout is complete
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    ScrollHost.ScrollToHorizontalOffset(0);
                    ScrollHost.ScrollToVerticalOffset(0);
                }), DispatcherPriority.Render);
            }
            
            UpdateZoomLabel();
        }

        private void SetZoomFit(bool allowZoomIn = false)
        {
            if (ScrollHost == null || ImageElement == null)
                return;

            if (ImageElement.Source is not BitmapSource bmp)
                return;

            // Hide scrolling when fitting
            ScrollHost.HorizontalScrollBarVisibility = ScrollBarVisibility.Hidden;
            ScrollHost.VerticalScrollBarVisibility = ScrollBarVisibility.Hidden;

            // Wait for layout, then calculate and set size directly
            Dispatcher.BeginInvoke(new Action(() =>
            {
                // Force layout
                ScrollHost.UpdateLayout();
                ImageElement.UpdateLayout();
                UpdateLayout();

                // Get viewport size - use ScrollHost's actual size
                double viewportWidth = ScrollHost.ActualWidth;
                double viewportHeight = ScrollHost.ActualHeight;

                // Fallback to window dimensions if ScrollHost size is invalid
                if (viewportWidth <= 0 || double.IsNaN(viewportWidth) || double.IsInfinity(viewportWidth))
                {
                    viewportWidth = ActualWidth;
                }

                if (viewportHeight <= 0 || double.IsNaN(viewportHeight) || double.IsInfinity(viewportHeight))
                {
                    // Calculate from window minus UI elements
                    double toolbarHeight = 0;
                    if (ToolbarExpandedPanel.Visibility == Visibility.Visible)
                        toolbarHeight = ToolbarExpandedPanel.ActualHeight;
                    else if (ToolbarNotchPanel.Visibility == Visibility.Visible)
                        toolbarHeight = ToolbarNotchPanel.ActualHeight;
                    if (toolbarHeight <= 0) toolbarHeight = 50;

                    double statusBarHeight = StatusBar.ActualHeight > 0 ? StatusBar.ActualHeight : 30;
                    double titleCountHeight = TitleCountText.ActualHeight > 0 ? TitleCountText.ActualHeight : 0;
                    
                    viewportHeight = ActualHeight - toolbarHeight - statusBarHeight - titleCountHeight;
                }

                // Validate dimensions
                if (viewportWidth <= 0 || viewportHeight <= 0 ||
                    double.IsNaN(viewportWidth) || double.IsNaN(viewportHeight) ||
                    double.IsInfinity(viewportWidth) || double.IsInfinity(viewportHeight))
                {
                    return;
                }

                // Get image dimensions
                double imgWidth = bmp.PixelWidth;
                double imgHeight = bmp.PixelHeight;
                if (imgWidth <= 0 || imgHeight <= 0)
                    return;

                // Calculate scale to fit within viewport (maintain aspect ratio)
                double scaleX = viewportWidth / imgWidth;
                double scaleY = viewportHeight / imgHeight;
                double fitScale = Math.Min(scaleX, scaleY);

                // In fit mode, always allow zooming in to fill the window
                // This is the expected behavior - images should fill available space
                // Only restrict zoom-in if explicitly disabled (for backward compatibility)
                // Note: allowZoomIn parameter is kept for GIFs which might have different behavior

                // Clamp to reasonable bounds
                if (fitScale < 0.1)
                    fitScale = 0.1;

                // Calculate display dimensions
                double displayWidth = imgWidth * fitScale;
                double displayHeight = imgHeight * fitScale;

                // Set the image size directly - Stretch="Uniform" will handle the rest
                ImageElement.Width = displayWidth;
                ImageElement.Height = displayHeight;
                
                // Update zoom factor for tracking
                _zoomFactor = fitScale;
                UpdateZoomLabel();

                // Verify it fits after layout
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    ScrollHost.UpdateLayout();
                    ImageElement.UpdateLayout();
                    UpdateLayout();

                    // Check if we need to adjust
                    double actualWidth = ImageElement.ActualWidth;
                    double actualHeight = ImageElement.ActualHeight;
                    double currentViewportWidth = ScrollHost.ActualWidth;
                    double currentViewportHeight = ScrollHost.ActualHeight;

                    if (currentViewportWidth > 0 && currentViewportHeight > 0)
                    {
                        // If image is larger than viewport, reduce size
                        if (actualWidth > currentViewportWidth || actualHeight > currentViewportHeight)
                        {
                            double adjustScaleX = actualWidth > currentViewportWidth ? currentViewportWidth / actualWidth : 1.0;
                            double adjustScaleY = actualHeight > currentViewportHeight ? currentViewportHeight / actualHeight : 1.0;
                            double adjustFactor = Math.Min(adjustScaleX, adjustScaleY);
                            
                            if (adjustFactor < 0.99)
                            {
                                ImageElement.Width = displayWidth * adjustFactor;
                                ImageElement.Height = displayHeight * adjustFactor;
                                _zoomFactor = fitScale * adjustFactor;
                                UpdateZoomLabel();
                            }
                        }
                    }
                }), System.Windows.Threading.DispatcherPriority.Loaded);
                
                // Ensure scroll position is reset to top-left after fit calculation
                // Use Render priority to ensure it happens after all layout calculations
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    ScrollHost.UpdateLayout();
                    MediaGrid?.UpdateLayout();
                }), DispatcherPriority.Loaded);
                
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    ScrollHost.ScrollToHorizontalOffset(0);
                    ScrollHost.ScrollToVerticalOffset(0);
                }), DispatcherPriority.Render);
            }), System.Windows.Threading.DispatcherPriority.Loaded);
        }

        private void Window_SizeChanged(object sender, SizeChangedEventArgs e)
        {
            if (!IsLoaded) return;

            // If Fit is on, keep media auto-fitted as the window changes
            if (FitToggle.IsChecked == true)
            {
                // Ensure scrolling is hidden when in fit mode
                if (ScrollHost != null)
                {
                    ScrollHost.HorizontalScrollBarVisibility = ScrollBarVisibility.Hidden;
                    ScrollHost.VerticalScrollBarVisibility = ScrollBarVisibility.Hidden;
                }

                if (CurrentMediaType == MediaType.Video && VideoElement.Source != null)
                {
                    SetVideoFit();
                    // Re-apply portrait blur effect after resize
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        ApplyPortraitBlurEffectForVideo();
                    }), System.Windows.Threading.DispatcherPriority.Loaded);
                }
                else if (ImageElement.Source != null)
                {
                    SetZoomFit(true); // Always allow zoom-in in fit mode to fill window
                    // Re-apply portrait blur effect after resize
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        if (ImageElement.Source is BitmapSource bmp)
                        {
                            string? currentFile = _playlist.CurrentItem?.FilePath;
                            ApplyPortraitBlurEffect(bmp, currentFile);
                        }
                    }), System.Windows.Threading.DispatcherPriority.Loaded);
                }
            }
            else if (CurrentMediaType == MediaType.Video && VideoElement.Source != null)
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
            if (CurrentMediaType != MediaType.Video)
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
            ReplayButton.IsEnabled = !running && CurrentMediaType == MediaType.Video;
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
            if (_settings != null && _settings.SaveSortMode)
            {
                _settings!.SortMode = _sortMode.ToString();
                SettingsManager.Save(_settings);
            }

            UpdateSortMenuVisuals();

            if (_playlist == null || !_playlist.HasItems) return;

            // Preserve current item if possible
            var currentItem = _playlist?.CurrentItem;
            string? currentFilePath = currentItem?.FilePath;

            ApplySort();

            // Try to restore position
            if (currentFilePath != null)
            {
                var items = _playlist?.GetAllItems().ToList() ?? new List<MediaItem>();
                int foundIndex = items.FindIndex(i => i.FilePath == currentFilePath);
                if (foundIndex >= 0)
                    _playlist?.SetIndex(foundIndex);
                else
                    _playlist?.SetIndex(0);
            }
            else
            {
                _playlist.SetIndex(0);
            }

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
            _playlist?.Sort(_sortMode);
            UpdateItemCount();
        }

        #endregion

        #region Media loading

        private async Task LoadFolderAsync(string path)
        {
            _currentFolder = path;
            SetStatus("Loading...");
            Cursor = Cursors.Wait;

            ClearImageDisplay();
            _videoService?.Stop();
            _slideshowController?.Stop();
            UpdateItemCount();

            try
            {
                bool includeVideos = IncludeVideoToggle.IsChecked == true;

                // Load files using MediaPlaylistManager
                _playlist?.LoadFiles(new[] { path }, includeVideos);
                ApplySort();
                UpdateItemCount();

                if (_playlist != null && _playlist.HasItems)
                {
                    _playlist?.SetIndex(0);
                    await ShowCurrentMediaAsync();
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
            ShowLoadingOverlayDelayed();

            ClearImageDisplay();
            _videoService?.Stop();
            _slideshowController?.Stop();
            UpdateItemCount();

            if (_folders.Count == 0)
            {
                SetStatus("No folders selected.");
                BigSelectFolderButton.Visibility = Visibility.Visible;
                Cursor = Cursors.Arrow;
                HideLoadingOverlay();
                return;
            }

            try
            {
                bool includeVideos = IncludeVideoToggle.IsChecked == true;

                // Load files using MediaPlaylistManager
                _playlist?.LoadFiles(_folders, includeVideos);
                ApplySort();
                UpdateItemCount();

                if (_playlist != null && _playlist.HasItems)
                {
                    _playlist?.SetIndex(0);
                    await ShowCurrentMediaAsync();
                    SetStatus("");
                    BigSelectFolderButton.Visibility = Visibility.Collapsed;
                }
                else
                {
                    SetStatus("No media found");
                    BigSelectFolderButton.Visibility = Visibility.Visible;
                    HideLoadingOverlay();
                }
            }
            catch (Exception ex)
            {
                SetStatus("Error: " + ex.Message);
                BigSelectFolderButton.Visibility = Visibility.Visible;
                HideLoadingOverlay();
            }
            finally
            {
                Cursor = Cursors.Arrow;
            }
        }

        #endregion

        #region Show media

        private async Task ShowCurrentMediaAsync()
        {
            // Cancel any previous media loading operation to prevent race conditions
            CancellationToken cancellationToken;
            lock (_showMediaLock)
            {
                _showMediaCancellation?.Cancel();
                _showMediaCancellation?.Dispose();
                _showMediaCancellation = new CancellationTokenSource();
                cancellationToken = _showMediaCancellation.Token;
            }

            ShowLoadingOverlayDelayed();
            
            try
            {
                var sb = (Storyboard)FindResource("SlideTransitionFade");
                sb.Begin();
            }
            catch
            {
                // if the resource is missing, ignore
            }

            // Use ViewModel's CurrentMediaItem as the source of truth
            var currentItem = _viewModel?.CurrentMediaItem;
            
            if (currentItem == null || !(_playlist?.HasItems == true))
            {
                HideLoadingOverlay();
                return;
            }
            if (currentItem == null || !File.Exists(currentItem.FilePath))
            {
                HideLoadingOverlay();
                return;
            }

            // Check if operation was cancelled
            if (cancellationToken.IsCancellationRequested)
            {
                HideLoadingOverlay();
                return;
            }

            // Stop video playback cleanly (don't capture frame when switching)
            _videoService?.Stop(captureLastFrame: false);

            // Clear image display when switching media - this must happen first
            ClearImageDisplay();

            // Make sure image is visible by default
            ImageElement.Visibility = Visibility.Visible;

            UpdateItemCount();

            // Zoom controls behavior
            if (currentItem.Type == MediaType.Video)
            {
                ZoomResetButton.IsEnabled = false;
                ZoomLabel.Text = "Auto";
            }
            else
            {
                ZoomResetButton.IsEnabled = true;
            }

            // Replay only makes sense when slideshow NOT running and current is video
            ReplayButton.IsEnabled = _slideshowController != null && !_slideshowController.IsRunning && currentItem?.Type == MediaType.Video;

            try
            {
                // -------------------------
                // VIDEO (MP4)
                // -------------------------
                if (currentItem.Type == MediaType.Video)
                {
                    ImageElement.Source = null;
                    // Reset scroll position for video
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        ScrollHost?.UpdateLayout();
                        MediaGrid?.UpdateLayout();
                    }), DispatcherPriority.Loaded);
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        ScrollHost?.ScrollToHorizontalOffset(0);
                        ScrollHost?.ScrollToVerticalOffset(0);
                    }), DispatcherPriority.Render);

                    // Extract and display first frame immediately for instant visual feedback
                    BitmapSource? firstFrame = null;
                    try
                    {
                        firstFrame = await VideoFrameService.ExtractFirstFrameAsync(currentItem.FilePath);
                    }
                    catch (OperationCanceledException)
                    {
                        // Expected when navigating quickly (includes TaskCanceledException)
                        HideLoadingOverlay();
                        return;
                    }
                    
                    if (firstFrame != null && !cancellationToken.IsCancellationRequested)
                    {
                        ShowVideoFrame(firstFrame, fadeIn: true);
                    }
                    
                    // Check cancellation before continuing
                    if (cancellationToken.IsCancellationRequested)
                    {
                        HideLoadingOverlay();
                        return;
                    }

                    // Load video using VideoPlaybackService for smooth transition
                    var videoUri = new Uri(currentItem.FilePath);
                    _videoService?.LoadVideo(videoUri);

                    ResetVideoScale();
                    UpdateVideoProgressWidth();

                    Title = $"Slide Show Bob - {currentItem.FileName} (Video)";
                    
                    // Notify controller that media is displayed
                    _slideshowController?.OnMediaDisplayed(MediaType.Video);
                    return;
                }

                // -------------------------
                // IMAGES + GIFs
                // -------------------------
                if (currentItem.Type == MediaType.Gif)
                {
                    // Clear any previous static image
                    ImageElement.Source = null;

                    // Calculate viewport width for optimized decode
                    double viewportWidth = ScrollHost.ViewportWidth > 0
                        ? ScrollHost.ViewportWidth
                        : ScrollHost.ActualWidth;

                    // Load GIF asynchronously with optimized decoding
                    BitmapImage? gifImage = null;
                    try
                    {
                        if (_mediaLoader != null)
                        {
                            gifImage = await _mediaLoader.LoadGifAsync(
                                currentItem.FilePath,
                                viewportWidth > 0 ? viewportWidth : null);
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        // Expected when navigating quickly (includes TaskCanceledException)
                        HideLoadingOverlay();
                        return;
                    }

                    if (gifImage == null || cancellationToken.IsCancellationRequested)
                    {
                        HideLoadingOverlay();
                        return;
                    }

                    // Use WpfAnimatedGif to animate
                    ImageBehavior.SetAnimatedSource(ImageElement, gifImage);

                    // Apply portrait blur effect immediately - directly tied to the GIF source
                    ApplyPortraitBlurEffectForImage(gifImage, currentItem.FilePath);

                    // Wait for GIF to load and layout to complete before fitting
                    if (FitToggle.IsChecked == true)
                    {
                        // Use LayoutUpdated event to ensure accurate viewport calculation
                        EventHandler? layoutHandler = null;
                        layoutHandler = (s, e) =>
                        {
                            if (FitToggle.IsChecked == true && ImageElement.Source != null)
                            {
                                LayoutUpdated -= layoutHandler;
                                Dispatcher.BeginInvoke(new Action(() =>
                                {
                                    SetZoomFit(true);   // allow zoom-in fit for GIFs
                                    // Reset scroll position after fit
                                    ScrollHost.UpdateLayout();
                                    MediaGrid?.UpdateLayout();
                                }), DispatcherPriority.Loaded);
                                Dispatcher.BeginInvoke(new Action(() =>
                                {
                                    ScrollHost.ScrollToHorizontalOffset(0);
                                    ScrollHost.ScrollToVerticalOffset(0);
                                }), DispatcherPriority.Render);
                            }
                        };
                        LayoutUpdated += layoutHandler;
                    }
                    else
                    {
                        // Re-enable scrolling when fit mode is disabled
                        ScrollHost.HorizontalScrollBarVisibility = ScrollBarVisibility.Auto;
                        ScrollHost.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
                        SetZoom(1.0);
                        
                        // Ensure scroll position is reset to top-left after layout completes
                        // Use multiple dispatcher calls to ensure it happens after all layout
                        Dispatcher.BeginInvoke(new Action(() =>
                        {
                            ScrollHost.UpdateLayout();
                            ImageElement.UpdateLayout();
                            UpdateLayout();
                        }), DispatcherPriority.Loaded);
                        
                        Dispatcher.BeginInvoke(new Action(() =>
                        {
                            ScrollHost.ScrollToHorizontalOffset(0);
                            ScrollHost.ScrollToVerticalOffset(0);
                        }), DispatcherPriority.Render);
                    }

                    Title = $"Slide Show Bob - {currentItem.FileName} (GIF)";
                    
                    // For GIFs, hide overlay after a short delay to allow initial load
                    await Task.Delay(100);
                    HideLoadingOverlay();
                    
                    // Notify controller
                    _slideshowController?.OnMediaDisplayed(MediaType.Gif);
                    return;
                }
                else
                {
                    // Load image asynchronously with optimized decoding
                    double viewportWidth = ScrollHost.ViewportWidth > 0
                        ? ScrollHost.ViewportWidth
                        : ScrollHost.ActualWidth;

                    BitmapImage? img = null;
                    try
                    {
                        if (_mediaLoader != null)
                        {
                            img = await _mediaLoader.LoadImageAsync(
                                currentItem.FilePath,
                                viewportWidth > 0 ? viewportWidth : null);
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        // Expected when navigating quickly (includes TaskCanceledException)
                        HideLoadingOverlay();
                        return;
                    }

                    if (img == null || cancellationToken.IsCancellationRequested)
                    {
                        HideLoadingOverlay();
                        return;
                    }

                    ImageElement.Source = img;
                    
                    // Apply portrait blur effect immediately - directly tied to the image source
                    ApplyPortraitBlurEffectForImage(img, currentItem.FilePath);
                    
                    // Apply EXIF rotation if needed
                    var orientation = _mediaLoader?.GetOrientation(currentItem.FilePath);
                    if (orientation == ExifOrientation.Rotate90)
                    {
                        _imageRotation.Angle = -90; // WPF uses counter-clockwise, EXIF 6 is 90° CW
                    }
                    else if (orientation == ExifOrientation.Rotate270)
                    {
                        _imageRotation.Angle = 90; // WPF uses counter-clockwise, EXIF 8 is 90° CCW
                    }
                    else
                    {
                        _imageRotation.Angle = 0;
                    }
                    
                    // Set rotation center after image dimensions are known
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        if (ImageElement.Source is BitmapSource bmp)
                        {
                            _imageRotation.CenterX = bmp.PixelWidth / 2.0;
                            _imageRotation.CenterY = bmp.PixelHeight / 2.0;
                        }
                    }), DispatcherPriority.Loaded);
                    
                    // Wait for image to load and layout to complete before fitting
                    if (FitToggle.IsChecked == true)
                    {
                        // Use LayoutUpdated event to ensure accurate viewport calculation
                        EventHandler? layoutHandler = null;
                        layoutHandler = (s, e) =>
                        {
                            if (FitToggle.IsChecked == true && ImageElement.Source != null)
                            {
                                LayoutUpdated -= layoutHandler;
                                Dispatcher.BeginInvoke(new Action(() =>
                                {
                                    SetZoomFit(true); // Always allow zoom-in in fit mode
                                    // Reset scroll position after fit
                                    ScrollHost.UpdateLayout();
                                    MediaGrid?.UpdateLayout();
                                }), DispatcherPriority.Loaded);
                                Dispatcher.BeginInvoke(new Action(() =>
                                {
                                    ScrollHost.ScrollToHorizontalOffset(0);
                                    ScrollHost.ScrollToVerticalOffset(0);
                                }), DispatcherPriority.Render);
                            }
                        };
                        LayoutUpdated += layoutHandler;
                    }
                    else
                    {
                        // Re-enable scrolling when fit mode is disabled
                        ScrollHost.HorizontalScrollBarVisibility = ScrollBarVisibility.Auto;
                        ScrollHost.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
                        // Clear explicit size to show at natural size
                        ImageElement.Width = double.NaN;
                        ImageElement.Height = double.NaN;
                        _zoomFactor = 1.0;
                        UpdateZoomLabel();
                        
                        // Ensure scroll position is reset to top-left after layout completes
                        // Use multiple dispatcher calls to ensure it happens after all layout
                        Dispatcher.BeginInvoke(new Action(() =>
                        {
                            ScrollHost.UpdateLayout();
                            ImageElement.UpdateLayout();
                            UpdateLayout();
                        }), DispatcherPriority.Loaded);
                        
                        Dispatcher.BeginInvoke(new Action(() =>
                        {
                            ScrollHost.ScrollToHorizontalOffset(0);
                            ScrollHost.ScrollToVerticalOffset(0);
                        }), DispatcherPriority.Render);
                    }

                    Title = $"Slide Show Bob - {currentItem.FileName}";
                    
                    // Hide overlay after image is set
                    HideLoadingOverlay();
                    
                    // Notify controller
                    _slideshowController?.OnMediaDisplayed(MediaType.Image);
                }
            }
            catch (OperationCanceledException)
            {
                // Expected when navigating quickly - ignore (includes TaskCanceledException)
                HideLoadingOverlay();
            }
            catch
            {
                // ignore bad files
                HideLoadingOverlay();
            }
            
            // Preload neighbors (images only) for smooth transitions
            try
            {
                double viewportWidth = ScrollHost.ViewportWidth > 0
                    ? ScrollHost.ViewportWidth
                    : ScrollHost.ActualWidth;
                
                if (_mediaLoader != null && _playlist != null)
                {
                    _mediaLoader.PreloadNeighbors(
                        _playlist.GetAllItems(),
                        _playlist.CurrentIndex,
                        viewportWidth > 0 ? viewportWidth : null);
                }
            }
            catch { }
            
            // Mark transition as complete
            _slideshowController?.OnTransitionComplete();
        }

        private void ShowCurrentMedia()
        {
            // Synchronous wrapper for backward compatibility
            // Fire-and-forget: intentionally not awaited
#pragma warning disable CS4014 // Fire-and-forget async call
            _ = ShowCurrentMediaAsync();
#pragma warning restore CS4014
        }

        private void VideoProgressBar_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (CurrentMediaType != MediaType.Video || VideoElement.Source == null)
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
            if (CurrentMediaType != MediaType.Video || VideoElement.Source == null)
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
            _slideshowController?.NavigateNext();
        }

        private void ShowPrevious()
        {
            _slideshowController?.NavigatePrevious();
        }

        #endregion

        #region Timers
        // Timer logic is now handled by SlideshowController and VideoPlaybackService

        private void VideoProgressBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (CurrentMediaType != MediaType.Video)
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

            _videoService?.SeekTo(ratio);
            VideoProgressBar.Value = ratio * 100.0;
            e.Handled = true;
        }

        #endregion

        #region Video events

        // Video event handlers are now in VideoPlaybackService
        #endregion

        #region Folder selection helpers

        private void SaveFoldersToSettings()
        {
            if (_settings != null && _settings.SaveFolderPaths)
            {
                _settings!.FolderPaths = new List<string>(_folders);
                SettingsManager.Save(_settings);
            }
        }

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
            // Save setting
            if (_settings != null && _settings.SaveIncludeVideos)
            {
                _settings!.IncludeVideos = IncludeVideoToggle.IsChecked == true;
                SettingsManager.Save(_settings);
            }

            // Reload playlist if we already have folders
            if (_folders.Count > 0)
            {
                await LoadFoldersAsync();
            }
        }

        #endregion


        /// <summary>
        /// Gets the current playlist file paths. Used by PlaylistWindow to check if files are in the playlist.
        /// </summary>
        public IReadOnlyList<string> GetCurrentPlaylist()
        {
            return _playlist.GetAllItems().Select(i => i.FilePath).ToList();
        }

        /// <summary>
        /// Centralized navigation method: finds a file in the playlist and displays it.
        /// This is the single point of control for updating the slideshow's current media index.
        /// Called by PlaylistWindow when user selects a media item.
        /// 
        /// Flow:
        /// 1. Normalize and find file path in playlist
        /// 2. Set playlist index (single source of truth for current position)
        /// 3. Display the media via ShowCurrentMedia()
        /// </summary>
        public void NavigateToFile(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                return;

            string normalized = Path.GetFullPath(filePath);
            var items = _playlist.GetAllItems().ToList();
            int index = items.FindIndex(i => 
                string.Equals(Path.GetFullPath(i.FilePath), normalized, StringComparison.OrdinalIgnoreCase));

            if (index >= 0)
            {
                // Single source of truth: only _playlist.SetIndex() updates the current media position
                _playlist.SetIndex(index);
                ShowCurrentMedia();
            }
        }

        public async Task AddFolderInteractiveAsync()
        {
            await ChooseFolderAsync();
        }

        #region Toolbar / controls


        private void PlaylistButton_Click(object sender, RoutedEventArgs e)
        {
            // Delegate to ViewModel command - App.xaml.cs will handle window creation
            _viewModel?.OpenPlaylistCommand.Execute(null);
        }

        private void SettingsButton_Click(object sender, RoutedEventArgs e)
        {
            // Delegate to ViewModel command - App.xaml.cs will handle window creation and settings reload
            _viewModel?.OpenSettingsCommand.Execute(null);
        }

        private void FitToggle_Checked(object sender, RoutedEventArgs e)
        {
            if (!IsLoaded || ScrollHost == null || ImageElement == null || VideoElement == null)
                return;

            if (ImageElement.Source == null && VideoElement.Source == null)
                return;

            // Use dispatcher to ensure layout is complete
            Dispatcher.BeginInvoke(new Action(() =>
            {
                if (CurrentMediaType == MediaType.Video && VideoElement.Source != null)
                {
                    SetVideoFit();
                }
                else if (ImageElement.Source != null)
                {
                    SetZoomFit(true); // Always allow zoom-in in fit mode to fill window
                    // Re-apply portrait blur effect after resize
                    if (ImageElement.Source is BitmapSource bmp)
                    {
                        string? currentFile = _playlist.CurrentItem?.FilePath;
                        ApplyPortraitBlurEffect(bmp, currentFile);
                    }
                }
            }), System.Windows.Threading.DispatcherPriority.Loaded);
        }

        private void FitToggle_Unchecked(object sender, RoutedEventArgs e)
        {
            if (!IsLoaded || ScrollHost == null || ImageElement == null || VideoElement == null)
                return;

            // Re-enable scrolling when fit mode is disabled
            ScrollHost.HorizontalScrollBarVisibility = ScrollBarVisibility.Auto;
            ScrollHost.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;

            if (CurrentMediaType == MediaType.Video)
            {
                ResetVideoScale();
            }
            else
            {
                // Clear explicit size to show at natural size
                ImageElement.Width = double.NaN;
                ImageElement.Height = double.NaN;
                _zoomFactor = 1.0;
                UpdateZoomLabel();
            }
        }

        private void ZoomResetButton_Click(object sender, RoutedEventArgs e)
        {
            if (CurrentMediaType == MediaType.Video) return;
            FitToggle.IsChecked = false;
            SetZoom(1.0);
        }

        private void StartButton_Click(object sender, RoutedEventArgs e)
        {
            if (!_playlist.HasItems)
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
            if (_slideshowController != null)
            {
                _slideshowController.SlideDelayMs = delay;
                _slideshowController.Start();
            }

            // Auto-minimize toolbar when slideshow starts
            MinimizeToolbar();

            if (_settings != null && _settings.SaveSlideDelay)
            {
                _settings!.SlideDelayMs = _slideDelayMs;
                SettingsManager.Save(_settings);
            }
        }

        private void StopButton_Click(object sender, RoutedEventArgs e)
        {
            _slideshowController?.Stop();
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

                // Get the screen that the window is currently on
                var windowInteropHelper = new WindowInteropHelper(this);
                var screen = WinForms.Screen.FromHandle(windowInteropHelper.Handle);
                var screenBounds = screen.Bounds;

                // True fullscreen: cover entire screen the window is on, including over taskbar
                WindowState = WindowState.Normal;  // so manual bounds apply
                Left = screenBounds.Left;
                Top = screenBounds.Top;
                Width = screenBounds.Width;
                Height = screenBounds.Height;

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
            if (CurrentMediaType == MediaType.Video && VideoElement.Source != null && FitToggle.IsChecked == true)
            {
                SetVideoFit();
            }
            else if (ImageElement.Source != null && FitToggle.IsChecked == true)
            {
                SetZoomFit(CurrentMediaType == MediaType.Gif);
            }
        }


        private void MuteButton_Click(object sender, RoutedEventArgs e)
        {
            _isMuted = !_isMuted;
            VideoElement.IsMuted = _isMuted;
            MuteButton.Content = _isMuted ? "🔇" : "🔊";

            if (_settings != null && _settings.SaveIsMuted)
            {
                _settings!.IsMuted = _isMuted;
                SettingsManager.Save(_settings);
            }
        }

        private void ReplayButton_Click(object sender, RoutedEventArgs e)
        {
            if (CurrentMediaType != MediaType.Video) return;
            if (_slideshowController == null || _slideshowController.IsRunning) return;
            _videoService?.Replay();
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
            if (_slideshowController.IsRunning)
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
            e.Handled = true; // Prevent bubbling to window handler
        }

        private void ScrollHost_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            // Don't handle if clicking directly on the image or video (they have their own handlers)
            if (e.OriginalSource == ImageElement || e.OriginalSource == VideoElement)
            {
                return;
            }
            
            // Check if clicking on UI elements - don't advance image
            var source = e.OriginalSource as DependencyObject;
            if (source != null)
            {
                var current = source;
                while (current != null)
                {
                    if (current == ToolbarExpandedPanel || current == ToolbarNotchPanel ||
                        current == StatusBar || current == TitleCountText ||
                        current == BigSelectFolderButton ||
                        current == ImageElement || current == VideoElement)
                    {
                        return; // Click is on UI element, don't handle
                    }
                    // Exclude ScrollBar and its parts (Thumb, Track, etc.)
                    if (current is System.Windows.Controls.Primitives.ScrollBar ||
                        current is System.Windows.Controls.Primitives.Thumb ||
                        current is System.Windows.Controls.Primitives.Track)
                    {
                        return; // Click is on scrollbar, don't handle
                    }
                    current = VisualTreeHelper.GetParent(current);
                }
            }
            
            // Left-click on empty space in ScrollViewer advances to next
            ShowNext();
            e.Handled = true;
        }

        private void Media_MouseRightButtonUp(object sender, MouseButtonEventArgs e)
        {
            ShowPrevious();
            e.Handled = true; // Prevent bubbling to window handler
        }

        private void MainGrid_PreviewMouseRightButtonUp(object sender, MouseButtonEventArgs e)
        {
            // Don't handle if we're clicking on media elements (they have their own handlers)
            if (e.OriginalSource == ImageElement || e.OriginalSource == VideoElement)
            {
                return; // Let the media element handlers deal with it
            }
            
            // Check if click is on toolbar or other UI elements - if so, don't handle it
            var source = e.OriginalSource as DependencyObject;
            if (source != null)
            {
                // Walk up the visual tree to see if we're clicking on UI elements
                var current = source;
                while (current != null)
                {
                    // Exclude toolbar panels
                    if (current == ToolbarExpandedPanel || current == ToolbarNotchPanel)
                    {
                        return; // Click is on toolbar, don't handle
                    }
                    
                    // Exclude status bar and title count
                    if (current == StatusBar || current == TitleCountText)
                    {
                        return; // Click is on status elements, don't handle
                    }
                    
                    // Exclude the big select folder button
                    if (current == BigSelectFolderButton)
                    {
                        return; // Click is on the folder button, don't handle
                    }
                    
                    // Exclude ScrollBar and its parts (Thumb, Track, etc.)
                    if (current is System.Windows.Controls.Primitives.ScrollBar ||
                        current is System.Windows.Controls.Primitives.Thumb ||
                        current is System.Windows.Controls.Primitives.Track)
                    {
                        return; // Click is on scrollbar, don't handle
                    }
                    
                    // Exclude ScrollViewer (but allow clicks on its background)
                    if (current == ScrollHost)
                    {
                        // Continue checking - we want to handle clicks on empty ScrollViewer area
                    }
                    
                    current = VisualTreeHelper.GetParent(current);
                }
            }
            
            // Right-click anywhere else in the window advances to previous
            ShowPrevious();
            e.Handled = true;
        }

        private void MainGrid_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            // Don't handle if we're clicking on media elements (they have their own handlers)
            if (e.OriginalSource == ImageElement || e.OriginalSource == VideoElement)
            {
                return; // Let the media element handlers deal with it
            }
            
            // Check if click is on toolbar or other UI elements - if so, don't handle it
            var source = e.OriginalSource as DependencyObject;
            if (source != null)
            {
                // Walk up the visual tree to see if we're clicking on UI elements
                var current = source;
                while (current != null)
                {
                    // Exclude toolbar panels
                    if (current == ToolbarExpandedPanel || current == ToolbarNotchPanel)
                    {
                        return; // Click is on toolbar, don't handle
                    }
                    
                    // Exclude status bar and title count
                    if (current == StatusBar || current == TitleCountText)
                    {
                        return; // Click is on status elements, don't handle
                    }
                    
                    // Exclude the big select folder button
                    if (current == BigSelectFolderButton)
                    {
                        return; // Click is on the folder button, don't handle
                    }
                    
                    // Exclude ScrollBar and its parts (Thumb, Track, etc.)
                    if (current is System.Windows.Controls.Primitives.ScrollBar ||
                        current is System.Windows.Controls.Primitives.Thumb ||
                        current is System.Windows.Controls.Primitives.Track)
                    {
                        return; // Click is on scrollbar, don't handle
                    }
                    
                    // Exclude ScrollViewer (but allow clicks on its background)
                    if (current == ScrollHost)
                    {
                        // Continue checking - we want to handle clicks on empty ScrollViewer area
                    }
                    
                    current = VisualTreeHelper.GetParent(current);
                }
            }
            
            // Left-click anywhere else in the window advances to next
            ShowNext();
            e.Handled = true;
        }

        private void ScrollHost_PreviewMouseWheel(object sender, MouseWheelEventArgs e)
        {
            if (CurrentMediaType == MediaType.Video) return;
            
            // Check if mouse is over UI elements (toolbars, status bars, etc.) - don't scroll if so
            if (IsMouseOverUIElement(e.GetPosition(this)))
            {
                return; // Let the UI element handle it or ignore
            }
            
            // Check if image is larger than viewport - if so, use smooth scrolling
            if (ScrollHost != null && ImageElement != null && ImageElement.Source is BitmapSource bmp)
            {
                double viewportWidth = ScrollHost.ViewportWidth > 0 ? ScrollHost.ViewportWidth : ScrollHost.ActualWidth;
                double viewportHeight = ScrollHost.ViewportHeight > 0 ? ScrollHost.ViewportHeight : ScrollHost.ActualHeight;
                
                // Calculate actual displayed image size
                double imageWidth = ImageElement.ActualWidth;
                double imageHeight = ImageElement.ActualHeight;
                
                // Check if image is larger than viewport (needs scrolling)
                bool needsScrolling = (imageWidth > viewportWidth && ScrollHost.ScrollableWidth > 0) ||
                                      (imageHeight > viewportHeight && ScrollHost.ScrollableHeight > 0);
                
                if (needsScrolling)
                {
                    // Use smooth scrolling helper for modern Win11-style scrolling
                    bool handled = SmoothScrollHelper.HandleMouseWheel(ScrollHost, e, () => true);
                    if (handled)
                    {
                        return; // Smooth scrolling handled the event
                    }
                }
            }
            
            // If not zoomed or image fits in viewport, use zoom on wheel
            if (FitToggle.IsChecked == true) return;

            double factor = e.Delta > 0 ? 1.1 : 0.9;
            SetZoom(_zoomFactor * factor);
            e.Handled = true;
        }

        /// <summary>
        /// Checks if the mouse is currently over any UI element that should not be affected by scrolling.
        /// Uses the visual tree to check if the mouse is over UI elements.
        /// </summary>
        private bool IsMouseOverUIElement(Point mousePosition)
        {
            // Convert window-relative position to screen coordinates for InputHitTest
            var screenPoint = PointToScreen(mousePosition);
            
            // Get the element at the mouse position
            var element = InputHitTest(screenPoint) as DependencyObject;
            if (element == null)
                return false;

            // Walk up the visual tree to check if we're over any UI elements
            var current = element;
            while (current != null)
            {
                // Check if we're over toolbar panels
                if (current == ToolbarExpandedPanel || current == ToolbarNotchPanel)
                    return true;

                // Check if we're over status bar or title count
                if (current == StatusBar || current == TitleCountText)
                    return true;

                // Check if we're over the big select folder button
                if (current == BigSelectFolderButton)
                    return true;

                // Check if we're over any menu or context menu
                if (current is ContextMenu || current is Menu || current is MenuItem)
                    return true;

                // Check if we're over ScrollBar or its parts
                if (current is System.Windows.Controls.Primitives.ScrollBar ||
                    current is System.Windows.Controls.Primitives.Thumb ||
                    current is System.Windows.Controls.Primitives.Track)
                    return true;

                // Stop if we've reached the window or main grid
                if (current == this || current == ContentGrid)
                    break;

                current = System.Windows.Media.VisualTreeHelper.GetParent(current);
            }

            return false;
        }

        private void ScrollHost_PreviewMouseRightButtonUp(object sender, MouseButtonEventArgs e)
        {
            // Don't handle if clicking directly on the image or video (they have their own handlers)
            if (e.OriginalSource == ImageElement || e.OriginalSource == VideoElement)
            {
                return;
            }
            
            // Check if clicking on UI elements - don't advance image
            var source = e.OriginalSource as DependencyObject;
            if (source != null)
            {
                var current = source;
                while (current != null)
                {
                    if (current == ToolbarExpandedPanel || current == ToolbarNotchPanel ||
                        current == StatusBar || current == TitleCountText ||
                        current == BigSelectFolderButton ||
                        current == ImageElement || current == VideoElement)
                    {
                        return; // Click is on UI element, don't handle
                    }
                    // Exclude ScrollBar and its parts (Thumb, Track, etc.)
                    if (current is System.Windows.Controls.Primitives.ScrollBar ||
                        current is System.Windows.Controls.Primitives.Thumb ||
                        current is System.Windows.Controls.Primitives.Track)
                    {
                        return; // Click is on scrollbar, don't handle
                    }
                    current = VisualTreeHelper.GetParent(current);
                }
            }
            
            // Right-click on empty space in ScrollViewer advances to previous
            ShowPrevious();
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
                        SaveFoldersToSettings();
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
                    SaveFoldersToSettings();
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

            // Save folders to settings after removal
            SaveFoldersToSettings();

            // Remove all files under that folder from playlist
            var items = _playlist.GetAllItems().ToList();
            var itemsToRemove = items.Where(i => PlaylistWindow_IsUnderFolderStatic(i.FilePath, folderPath)).ToList();
            
            // Reload playlist without removed items
            var remainingItems = items.Except(itemsToRemove).Select(i => i.FilePath).ToList();
            bool includeVideos = IncludeVideoToggle.IsChecked == true;
            
            // Rebuild playlist
            _playlist.LoadFiles(_folders, includeVideos);
            ApplySort();

            if (!_playlist.HasItems)
            {
                ClearImageDisplay();
                _videoService?.Stop();
                UpdateItemCount();
                return;
            }

            // Ensure index is valid
            if (_playlist.CurrentIndex >= _playlist.Count)
                _playlist.SetIndex(_playlist.Count - 1);

            ShowCurrentMedia();
        }

        public void RemoveFileFromPlaylist(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                return;

            // Preserve current item if it's not being removed
            var currentItem = _playlist?.CurrentItem;
            string? currentFilePath = currentItem?.FilePath;
            string normalized = Path.GetFullPath(filePath);
            bool isRemovingCurrent = currentFilePath != null && 
                string.Equals(Path.GetFullPath(currentFilePath), normalized, StringComparison.OrdinalIgnoreCase);

            // Remove the file directly from the playlist
            bool removed = _playlist.RemoveFile(filePath);

            if (!removed)
                return;

            if (!_playlist.HasItems)
            {
                ClearImageDisplay();
                _videoService?.Stop();
                UpdateItemCount();
                return;
            }

            // If we removed the current item, move to the next available item
            if (isRemovingCurrent)
            {
                // If current index is now out of bounds, adjust it
                if (_playlist.CurrentIndex >= _playlist.Count)
                    _playlist.SetIndex(_playlist.Count - 1);
                else if (_playlist.CurrentIndex < 0 && _playlist.Count > 0)
                    _playlist?.SetIndex(0);
            }
            // Otherwise, try to restore position to the same file
            else if (currentFilePath != null)
            {
                var itemsAfter = _playlist.GetAllItems();
                var itemsAfterList = itemsAfter.ToList();
                int foundIndex = itemsAfterList.FindIndex(i => 
                    string.Equals(Path.GetFullPath(i.FilePath), Path.GetFullPath(currentFilePath), StringComparison.OrdinalIgnoreCase));
                if (foundIndex >= 0)
                    _playlist?.SetIndex(foundIndex);
            }

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

        #region Drag and Drop

        private void Window_DragEnter(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                e.Effects = DragDropEffects.None;

                var files = (string[])e.Data.GetData(DataFormats.FileDrop);
                if (files != null)
                {
                    // Check if any of the dropped items are directories
                    foreach (var path in files)
                    {
                        if (Directory.Exists(path))
                        {
                            e.Effects = DragDropEffects.Copy;
                            break;
                        }
                    }
                }
            }
            else
            {
                e.Effects = DragDropEffects.None;
            }
        }

        private void Window_DragOver(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                e.Effects = DragDropEffects.None;

                var files = (string[])e.Data.GetData(DataFormats.FileDrop);
                if (files != null)
                {
                    // Check if any of the dropped items are directories
                    foreach (var path in files)
                    {
                        if (Directory.Exists(path))
                        {
                            e.Effects = DragDropEffects.Copy;
                            break;
                        }
                    }
                }
            }
            else
            {
                e.Effects = DragDropEffects.None;
            }
        }

        private async void Window_Drop(object sender, DragEventArgs e)
        {
            if (!e.Data.GetDataPresent(DataFormats.FileDrop))
                return;

            var files = (string[])e.Data.GetData(DataFormats.FileDrop);
            if (files == null || files.Length == 0)
                return;

            bool addedAny = false;

            foreach (var path in files)
            {
                // Only process directories
                if (!Directory.Exists(path))
                    continue;

                // Normalize the path and check for duplicates
                string normalizedPath = Path.GetFullPath(path);
                if (!_folders.Contains(normalizedPath, StringComparer.OrdinalIgnoreCase))
                {
                    _folders.Add(normalizedPath);
                    addedAny = true;
                }
            }

            if (addedAny)
            {
                StatusText.Text = "Folders: " + string.Join("; ", _folders);
                SaveFoldersToSettings();
                await LoadFoldersAsync();
            }
        }

        #endregion

        #region Scrollbar Visibility Tracking

        private void ScrollHost_LayoutUpdated(object? sender, EventArgs e)
        {
            UpdateScrollBarVisibility();
        }

        private void UpdateScrollBarVisibility()
        {
            if (ScrollHost == null) return;

            bool hasVerticalScrollBar = ScrollHost.ComputedVerticalScrollBarVisibility == Visibility.Visible;
            bool hasHorizontalScrollBar = ScrollHost.ComputedHorizontalScrollBarVisibility == Visibility.Visible;
            
            HasScrollBars = hasVerticalScrollBar || hasHorizontalScrollBar;
        }

        #endregion

        #region ViewModel Event Handlers

        private void ViewModel_PropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
        {
            // Handle ViewModel property changes for UI updates
            // This is a placeholder - MainWindow still needs full refactoring to use ViewModel properties
        }

        private async void ViewModel_RequestShowMedia(object? sender, EventArgs e)
        {
            // Request to show current media - call the existing ShowCurrentMediaAsync method
            // Fire-and-forget: intentionally not awaited to avoid blocking
            _ = ShowCurrentMediaAsync();
        }

        private void ViewModel_MediaChanged(object? sender, EventArgs e)
        {
            // Media changed event - update UI accordingly
            // Update item count and position text
            UpdateItemCount();
            
            // Update replay button state
            if (_viewModel?.CurrentMediaItem != null)
            {
                ReplayButton.IsEnabled = _viewModel.CurrentMediaItem.Type == MediaType.Video && 
                                        !(_viewModel.IsSlideshowRunning);
            }
            else
            {
                ReplayButton.IsEnabled = false;
            }
        }

        #endregion

    }
}

