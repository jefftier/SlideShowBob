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

        // Dependency property to track fullscreen state for UI binding
        public static readonly DependencyProperty IsFullscreenProperty =
            DependencyProperty.Register(nameof(IsFullscreen), typeof(bool), typeof(MainWindow),
                new PropertyMetadata(false));

        public bool IsFullscreen
        {
            get => (bool)GetValue(IsFullscreenProperty);
            set => SetValue(IsFullscreenProperty, value);
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

        private bool _isMuted = true;

        private readonly List<string> _folders = new();
        private string? _currentFolder;

        private bool _toolbarMinimized = false;
        private CancellationTokenSource? _loadingOverlayDelayCts;
        private CancellationTokenSource? _showMediaCancellation;
        private readonly object _showMediaLock = new object();
        private ContextMenu? _mainContextMenu;
        private bool _isWindowClosed = false;

        protected override void OnClosed(EventArgs e)
        {
            // Mark window as closed to prevent dispatcher operations after close
            _isWindowClosed = true;
            
            // Clean up cancellation tokens
            lock (_showMediaLock)
            {
                _showMediaCancellation?.Cancel();
                _showMediaCancellation?.Dispose();
                _showMediaCancellation = null;
            }
            
            _loadingOverlayDelayCts?.Cancel();
            _loadingOverlayDelayCts?.Dispose();
            
            // Clean up timers
            _chromeTimer?.Stop();
            
            base.OnClosed(e);
        }

        /// <summary>
        /// Safely invokes an action on the dispatcher, checking if window is still open.
        /// Prevents crashes from dispatcher operations after window is closed.
        /// </summary>
        private void SafeDispatcherInvoke(Action action, DispatcherPriority priority = DispatcherPriority.Normal)
        {
            if (_isWindowClosed || Dispatcher == null || !Dispatcher.CheckAccess())
            {
                try
                {
                    Dispatcher?.BeginInvoke(action, priority);
                }
                catch (InvalidOperationException)
                {
                    // Window is closing or dispatcher is shutting down - ignore
                }
            }
            else
            {
                action();
            }
        }

        // Sort mode (still needed for UI)
        private SortMode _sortMode = SortMode.NameAZ;

        // Helper property to get current media type - now uses ViewModel
        private MediaType? CurrentMediaType => _viewModel?.CurrentMedia?.Type;

        // Temporary bridge fields to access services during MVVM transition
        // TODO: Complete refactoring to remove direct service access
        private VideoPlaybackService? _videoService;
        private SlideshowController? _slideshowController;
        private MediaLoaderService? _mediaLoader;

        /// <summary>
        /// Parameterless constructor for App.xaml.cs compatibility (needs window first to get UI elements).
        /// </summary>
        public MainWindow()
        {
            InitializeComponent();
            // Services and ViewModel will be injected via InitializeWithViewModel
        }

        /// <summary>
        /// Constructor that takes MainViewModel. Sets DataContext and initializes UI.
        /// </summary>
        public MainWindow(MainViewModel viewModel) : this()
        {
            if (viewModel == null) throw new ArgumentNullException(nameof(viewModel));
            
            _viewModel = viewModel;
            DataContext = _viewModel;
            
            InitializeUI();
            SubscribeToViewModelEvents();
        }

        /// <summary>
        /// Initializes MainWindow with MainViewModel. Called from App.xaml.cs after services are created.
        /// Kept for backward compatibility with App.xaml.cs.
        /// </summary>
        public void InitializeWithViewModel(MainViewModel viewModel)
        {
            if (viewModel == null) throw new ArgumentNullException(nameof(viewModel));
            
            _viewModel = viewModel;
            DataContext = _viewModel;
            
            InitializeUI();
            SubscribeToViewModelEvents();
            
            // Empty state panel visibility is now handled via data binding
            
            // Check if folders are being loaded or already loaded
            // Wait a bit for async loading to complete, then check again
            Dispatcher.BeginInvoke(new Action(async () =>
            {
                // Give LoadFoldersAsync time to complete
                await Task.Delay(100);
                
                // If media is loaded, show it
                if (_viewModel?.CurrentMedia != null && _viewModel.PlaylistManager?.HasItems == true)
                {
                    // Fire-and-forget: intentionally not awaited
#pragma warning disable CS4014 // Fire-and-forget async call
                    _ = ShowCurrentMediaAsync();
#pragma warning restore CS4014
                }
                else if (_viewModel?.Folders.Count > 0 && _viewModel?.TotalCount == 0)
                {
                    // Folders are set but no items loaded yet - might still be loading
                    // Check again after a longer delay
                    await Task.Delay(500);
                    if (_viewModel?.CurrentMedia != null && _viewModel.PlaylistManager?.HasItems == true)
                    {
#pragma warning disable CS4014 // Fire-and-forget async call
                        _ = ShowCurrentMediaAsync();
#pragma warning restore CS4014
                    }
                }
            }), DispatcherPriority.Loaded);
        }

        private void InitializeUI()
        {
            // Initialize service references from ViewModel (temporary bridge during MVVM transition)
            // Access via internal properties exposed by ViewModel
            if (_viewModel != null)
            {
                _videoService = _viewModel.VideoPlaybackService;
                _slideshowController = _viewModel.SlideshowController;
                _mediaLoader = _viewModel.MediaLoaderService;
            }

            // Subscribe to service events for UI-specific handling (video display, etc.)
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

            // ImageElement uses rotation transform for EXIF orientation, sizing via Width/Height
            ImageElement.LayoutTransform = _imageRotation;
            VideoElement.LayoutTransform = _videoScale;
            VideoFrameImage.LayoutTransform = _videoScale; // Use same scale as video

            _chromeTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
            _chromeTimer.Tick += ChromeTimer_Tick;

            // Hook up scrollbar visibility tracking after Loaded event
            Loaded += (s, e) =>
            {
                // Create context menu programmatically after window is loaded
                CreateContextMenu();
                
                if (ScrollHost != null)
                {
                    ScrollHost.LayoutUpdated += ScrollHost_LayoutUpdated;
                    UpdateScrollBarVisibility();
                }
                
                // If media is already loaded (from auto-load), show it now that window is ready
                if (_viewModel?.CurrentMedia != null && _viewModel.PlaylistManager?.HasItems == true)
                {
                    // Fire-and-forget: intentionally not awaited
#pragma warning disable CS4014 // Fire-and-forget async call
                    _ = ShowCurrentMediaAsync();
#pragma warning restore CS4014
                }
            };

            UpdateZoomLabel();
            SetSlideshowState(false);

            VideoElement.IsMuted = true; // Default muted
            MuteButton.Content = "\uE74F"; // Muted icon
            ReplayButton.IsEnabled = false;

            // Empty state panel visibility is now handled via data binding
            VideoProgressBar.Visibility = Visibility.Collapsed;
            VideoProgressBar.Value = 0;

            // Initial toolbar state
            ToolbarExpandedPanel.Visibility = Visibility.Visible;
            ToolbarNotchPanel.Visibility = Visibility.Collapsed;
            ToolbarExpandedPanel.Opacity = 1.0;
            ToolbarNotchPanel.Opacity = 0.0;

            // Initial fullscreen overlay state (hidden)
            if (FullscreenTopOverlay != null)
            {
                FullscreenTopOverlay.Visibility = Visibility.Collapsed;
                FullscreenTopOverlay.Opacity = 0;
            }

            UpdateSortMenuVisuals();
            ShowChrome();
            ResetChromeTimer();
        }

        private void SubscribeToViewModelEvents()
        {
            if (_viewModel == null) return;

            // Subscribe to ViewModel events for UI updates
            _viewModel.PropertyChanged += ViewModel_PropertyChanged;
            _viewModel.RequestShowMedia += ViewModel_RequestShowMedia;
            _viewModel.RequestShowMessage += ViewModel_RequestShowMessage;
            _viewModel.RequestAddFolder += ViewModel_RequestAddFolder;
        }

        #region Service Event Handlers

        private void SlideshowController_NavigateToIndex(object? sender, int index)
        {
            // Fire-and-forget: intentionally not awaited
            // Check if window is still open before dispatching
            if (_isWindowClosed) return;
            
            try
            {
#pragma warning disable CS4014 // Fire-and-forget async call
                _ = Dispatcher.InvokeAsync(async () =>
                {
                    if (!_isWindowClosed)
                    {
                        await ShowCurrentMediaAsync();
                    }
                }, DispatcherPriority.Normal);
#pragma warning restore CS4014
            }
            catch (InvalidOperationException)
            {
                // Window is closing or dispatcher is shutting down - ignore
            }
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
                SafeDispatcherInvoke(() =>
                {
                    if (!_isWindowClosed)
                    {
                        SetVideoFit();
                        ApplyPortraitBlurEffectForVideo();
                    }
                }, DispatcherPriority.Background);
            }
            else
            {
                ResetVideoScale();
                SafeDispatcherInvoke(() =>
                {
                    if (!_isWindowClosed)
                    {
                        ApplyPortraitBlurEffectForVideo();
                    }
                }, DispatcherPriority.Loaded);
            }

            var currentItem = _viewModel?.PlaylistManager?.CurrentItem;
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
            
            // If media is already loaded (from ViewModel auto-load), show it now that window is ready
            if (_viewModel?.CurrentMedia != null && _viewModel.PlaylistManager?.HasItems == true)
            {
                // Fire-and-forget: intentionally not awaited
#pragma warning disable CS4014 // Fire-and-forget async call
                _ = ShowCurrentMediaAsync();
#pragma warning restore CS4014
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

            // Check if setting is enabled (default to true if Settings is null, matching AppSettings default)
            bool blurEnabled = _viewModel?.Settings?.PortraitBlurEffect ?? true;
            if (!blurEnabled)
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

            // Check if setting is enabled (default to true if Settings is null, matching AppSettings default)
            bool blurEnabled = _viewModel?.Settings?.PortraitBlurEffect ?? true;
            if (!blurEnabled)
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

            // Show fullscreen top overlay if in fullscreen mode
            if (_isFullscreen && FullscreenTopOverlay != null)
            {
                if (FullscreenTopOverlay.Visibility != Visibility.Visible)
                {
                    FullscreenTopOverlay.Visibility = Visibility.Visible;
                    FullscreenTopOverlay.Opacity = 0.0;
                }

                var fadeInTop = new DoubleAnimation(
                    FullscreenTopOverlay.Opacity,
                    1.0,
                    TimeSpan.FromMilliseconds(250))
                {
                    EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut }
                };

                FullscreenTopOverlay.BeginAnimation(OpacityProperty, fadeInTop);
            }
        }

        private void DimChrome()
        {
            string behavior = _viewModel?.Settings?.ToolbarInactivityBehavior ?? "Dim"; // default

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

                // Hide fullscreen top overlay
                if (_isFullscreen && FullscreenTopOverlay != null)
                {
                    var fadeOutTop = new DoubleAnimation(
                        FullscreenTopOverlay.Opacity,
                        0.0,
                        TimeSpan.FromMilliseconds(250))
                    {
                        EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn }
                    };

                    fadeOutTop.Completed += (s, e) =>
                    {
                        if (_isFullscreen)
                        {
                            FullscreenTopOverlay.Visibility = Visibility.Collapsed;
                        }
                    };

                    FullscreenTopOverlay.BeginAnimation(OpacityProperty, fadeOutTop);
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

                // Dim fullscreen top overlay
                if (_isFullscreen && FullscreenTopOverlay != null)
                {
                    var fadeDimTop = new DoubleAnimation(
                        FullscreenTopOverlay.Opacity,
                        dimOpacity,
                        TimeSpan.FromMilliseconds(300))
                    {
                        EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn }
                    };

                    FullscreenTopOverlay.BeginAnimation(OpacityProperty, fadeDimTop);
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
            int total = _viewModel?.PlaylistManager?.Count ?? 0;
            int index = _viewModel?.PlaylistManager?.CurrentIndex >= 0 ? (_viewModel.PlaylistManager.CurrentIndex + 1) : 0;
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
                            string? currentFile = _viewModel?.PlaylistManager?.CurrentItem?.FilePath;
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

            NotchPlayPauseButton.Content = running ? "\uE769" : "\uEDB5"; // E769 = Pause, EDB5 = Play
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
            if (_viewModel?.Settings != null && _viewModel.Settings.SaveSortMode)
            {
                _viewModel.Settings.SortMode = _sortMode.ToString();
                _viewModel.SettingsService?.Save(_viewModel.Settings);
            }

            UpdateSortMenuVisuals();

            if (_viewModel?.PlaylistManager == null || !_viewModel.PlaylistManager.HasItems) return;

            // Preserve current item if possible
            var currentItem = _viewModel.PlaylistManager?.CurrentItem;
            string? currentFilePath = currentItem?.FilePath;

            ApplySort();

            // Try to restore position
            if (currentFilePath != null)
            {
                var items = _viewModel.PlaylistManager?.GetAllItems().ToList() ?? new List<MediaItem>();
                int foundIndex = items.FindIndex(i => i.FilePath == currentFilePath);
                if (foundIndex >= 0)
                    _viewModel.PlaylistManager?.SetIndex(foundIndex);
                else
                    _viewModel.PlaylistManager?.SetIndex(0);
            }
            else
            {
                _viewModel.PlaylistManager?.SetIndex(0);
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
            _viewModel?.PlaylistManager?.Sort(_sortMode);
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
                _viewModel?.PlaylistManager?.LoadFiles(new[] { path }, includeVideos);
                ApplySort();
                UpdateItemCount();

                if (_viewModel?.PlaylistManager != null && _viewModel.PlaylistManager.HasItems)
                {
                    _viewModel.PlaylistManager?.SetIndex(0);
                    await ShowCurrentMediaAsync();
                    SetStatus("");
                    // Empty state panel visibility is now handled via data binding
                }
                else
                {
                    SetStatus("No media found");
                    // Empty state panel visibility is now handled via data binding
                }
            }
            catch (Exception ex)
            {
                SetStatus("Error: " + ex.Message);
                // Empty state panel visibility is now handled via data binding
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
                // Empty state panel visibility is now handled via data binding
                Cursor = Cursors.Arrow;
                HideLoadingOverlay();
                return;
            }

            try
            {
                bool includeVideos = IncludeVideoToggle.IsChecked == true;

                // Load files using MediaPlaylistManager
                _viewModel?.PlaylistManager?.LoadFiles(_folders, includeVideos);
                ApplySort();
                UpdateItemCount();

                if (_viewModel?.PlaylistManager != null && _viewModel.PlaylistManager.HasItems)
                {
                    _viewModel.PlaylistManager?.SetIndex(0);
                    await ShowCurrentMediaAsync();
                    SetStatus("");
                    // Empty state panel visibility is now handled via data binding
                }
                else
                {
                    SetStatus("No media found");
                    // Empty state panel visibility is now handled via data binding
                    HideLoadingOverlay();
                }
            }
            catch (Exception ex)
            {
                SetStatus("Error: " + ex.Message);
                // Empty state panel visibility is now handled via data binding
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
            var currentItem = _viewModel?.CurrentMedia;
            
            // If no current item or no items in playlist, clear the display
            if (currentItem == null || !(_viewModel?.PlaylistManager?.HasItems == true))
            {
                ClearImageDisplay();
                HideLoadingOverlay();
                // Clear video element visibility
                if (VideoElement != null)
                {
                    VideoElement.Visibility = Visibility.Collapsed;
                    VideoElement.Source = null;
                }
                // Clear image element
                if (ImageElement != null)
                {
                    ImageElement.Visibility = Visibility.Collapsed;
                }
                Title = "Slide Show Bob";
                UpdateItemCount(); // Reset counter to 0 / 0
                return;
            }
            if (currentItem == null || !File.Exists(currentItem.FilePath))
            {
                ClearImageDisplay();
                HideLoadingOverlay();
                // Clear video element visibility
                if (VideoElement != null)
                {
                    VideoElement.Visibility = Visibility.Collapsed;
                    VideoElement.Source = null;
                }
                // Clear image element
                if (ImageElement != null)
                {
                    ImageElement.Visibility = Visibility.Collapsed;
                }
                Title = "Slide Show Bob";
                UpdateItemCount(); // Reset counter to 0 / 0
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
                        if (_viewModel != null)
                        {
                            firstFrame = await _viewModel.ExtractFirstFrameAsync(currentItem.FilePath);
                        }
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

                    // Re-apply blur effect after layout completes to ensure it's visible
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        UpdateLayout();
                        if (ImageElement.Source is BitmapSource bmp)
                        {
                            ApplyPortraitBlurEffectForImage(bmp, currentItem.FilePath);
                        }
                    }), DispatcherPriority.Loaded);

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
                    
                    // Re-apply blur effect after layout completes to ensure it's visible
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        UpdateLayout();
                        if (ImageElement.Source is BitmapSource bmp)
                        {
                            ApplyPortraitBlurEffectForImage(bmp, currentItem.FilePath);
                        }
                    }), DispatcherPriority.Loaded);
                    
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
                            
                            // Re-apply portrait blur effect after layout
                            if (ImageElement.Source is BitmapSource bmp)
                            {
                                string? currentFile = _viewModel?.PlaylistManager?.CurrentItem?.FilePath;
                                ApplyPortraitBlurEffect(bmp, currentFile);
                            }
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
                
                if (_mediaLoader != null && _viewModel?.PlaylistManager != null)
                {
                    _mediaLoader.PreloadNeighbors(
                        _viewModel.PlaylistManager.GetAllItems(),
                        _viewModel.PlaylistManager.CurrentIndex,
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
            if (_viewModel?.Settings != null && _viewModel.Settings.SaveFolderPaths)
            {
                _viewModel.Settings.FolderPaths = new List<string>(_folders);
                _viewModel.SettingsService?.Save(_viewModel.Settings);
            }
        }

        private async Task ChooseFolderAsync()
        {
            await ChooseFoldersFromDialogAsync();
        }

        private async void SelectFolderButton_Click(object sender, RoutedEventArgs e)
        {
            // Handle folder selection UI (folder dialog is UI-specific)
            await ChooseFoldersFromDialogAsync();
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
            if (_viewModel?.Settings != null && _viewModel.Settings.SaveIncludeVideos)
            {
                _viewModel.Settings.IncludeVideos = IncludeVideoToggle.IsChecked == true;
                _viewModel.SettingsService?.Save(_viewModel.Settings);
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
            return _viewModel?.PlaylistManager?.GetAllItems().Select(i => i.FilePath).ToList() ?? new List<string>();
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
            var items = _viewModel?.PlaylistManager?.GetAllItems().ToList() ?? new List<MediaItem>();
            int index = items.FindIndex(i => 
                string.Equals(Path.GetFullPath(i.FilePath), normalized, StringComparison.OrdinalIgnoreCase));

            if (index >= 0)
            {
                // Single source of truth: only PlaylistManager.SetIndex() updates the current media position
                _viewModel?.PlaylistManager?.SetIndex(index);
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
                        string? currentFile = _viewModel?.PlaylistManager?.CurrentItem?.FilePath;
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

        // These handlers are no longer needed - commands are bound in XAML
        // Keeping for backward compatibility but they won't be called
        private void StartButton_Click(object sender, RoutedEventArgs e)
        {
            // Command binding handles this
        }

        private void StopButton_Click(object sender, RoutedEventArgs e)
        {
            // Command binding handles this
        }

        private void FullscreenButton_Click(object sender, RoutedEventArgs e)
        {
            ToggleFullscreen();
        }

        private void ApplyFullscreenPosition()
        {
            // Get the target screen (preferred monitor or current screen)
            var windowInteropHelper = new WindowInteropHelper(this);
            WinForms.Screen targetScreen = WinForms.Screen.FromHandle(windowInteropHelper.Handle);
            
            // Check if there's a preferred monitor setting
            string? preferredDeviceName = _viewModel?.Settings?.PreferredFullscreenMonitorDeviceName;
            if (!string.IsNullOrEmpty(preferredDeviceName))
            {
                var preferredScreen = WinForms.Screen.AllScreens
                    .FirstOrDefault(s => s.DeviceName == preferredDeviceName);
                if (preferredScreen != null)
                {
                    targetScreen = preferredScreen;
                }
            }
            
            var screenBounds = targetScreen.Bounds;

            // Get DPI scaling factor for WPF
            // WPF uses device-independent units (1/96 inch), so we need to account for DPI scaling
            var source = PresentationSource.FromVisual(this);
            double dpiScaleX = 1.0;
            double dpiScaleY = 1.0;
            
            if (source?.CompositionTarget != null)
            {
                var transform = source.CompositionTarget.TransformToDevice;
                dpiScaleX = transform.M11;
                dpiScaleY = transform.M22;
            }
            
            // For per-monitor DPI, we need to get the DPI of the target monitor
            // Use Win32 API to get the actual DPI of the target screen
            IntPtr monitorHandle = Win32.MonitorFromPoint(
                new Win32.POINT { X = screenBounds.Left + screenBounds.Width / 2, Y = screenBounds.Top + screenBounds.Height / 2 },
                Win32.MONITOR_DEFAULTTONEAREST);
            
            uint dpiX = 96, dpiY = 96;
            int result = Win32.GetDpiForMonitor(monitorHandle, Win32.MONITOR_DPI_TYPE.MDT_EFFECTIVE_DPI, out dpiX, out dpiY);
            if (result == 0) // Success
            {
                dpiScaleX = dpiX / 96.0;
                dpiScaleY = dpiY / 96.0;
            }
            // If GetDpiForMonitor fails (e.g., on Windows 7), fall back to current window DPI scale
            
            // True fullscreen: cover entire screen, including over taskbar
            // Convert physical pixel bounds to WPF logical coordinates
            WindowState = WindowState.Normal;  // so manual bounds apply
            Left = screenBounds.Left / dpiScaleX;
            Top = screenBounds.Top / dpiScaleY;
            Width = screenBounds.Width / dpiScaleX;
            Height = screenBounds.Height / dpiScaleY;
        }

        private void ToggleFullscreen()
        {
            if (!_isFullscreen)
            {
                _isFullscreen = true;
                IsFullscreen = true;

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

                // Apply fullscreen positioning
                ApplyFullscreenPosition();

                // In fullscreen, always use minimized notch toolbar
                MinimizeToolbar();
                
                // Show fullscreen top overlay
                if (FullscreenTopOverlay != null)
                {
                    FullscreenTopOverlay.Visibility = Visibility.Visible;
                    FullscreenTopOverlay.Opacity = 0;
                }
                
                ShowChrome();  // start bright (shows both toolbar and top overlay)
            }
            else
            {
                _isFullscreen = false;
                IsFullscreen = false;
                
                // Hide fullscreen top overlay when exiting fullscreen
                if (FullscreenTopOverlay != null)
                {
                    FullscreenTopOverlay.Visibility = Visibility.Collapsed;
                    FullscreenTopOverlay.Opacity = 0;
                }

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

                // Wait for window layout to complete before recalculating media fit
                // This ensures the ScrollHost viewport has the correct size when exiting fullscreen
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    UpdateLayout();
                    if (ScrollHost != null)
                    {
                        ScrollHost.UpdateLayout();
                        MediaGrid?.UpdateLayout();
                    }

                    // Re-apply fit so media matches new size after layout is complete
                    if (CurrentMediaType == MediaType.Video && VideoElement.Source != null && FitToggle.IsChecked == true)
                    {
                        SetVideoFit();
                        // Re-apply portrait blur effect after resize
                        Dispatcher.BeginInvoke(new Action(() =>
                        {
                            ApplyPortraitBlurEffectForVideo();
                        }), System.Windows.Threading.DispatcherPriority.Loaded);
                    }
                    else if (ImageElement.Source != null && FitToggle.IsChecked == true)
                    {
                        SetZoomFit(CurrentMediaType == MediaType.Gif);
                        // Re-apply portrait blur effect after resize
                        Dispatcher.BeginInvoke(new Action(() =>
                        {
                            if (ImageElement.Source is BitmapSource bmp)
                            {
                                string? currentFile = _viewModel?.PlaylistManager?.CurrentItem?.FilePath;
                                ApplyPortraitBlurEffect(bmp, currentFile);
                            }
                        }), System.Windows.Threading.DispatcherPriority.Loaded);
                    }
                    else if (ImageElement.Source != null)
                    {
                        // Even if not in fit mode, reset scroll position and re-apply blur when exiting fullscreen
                        if (ScrollHost != null)
                        {
                            ScrollHost.UpdateLayout();
                            MediaGrid?.UpdateLayout();
                            Dispatcher.BeginInvoke(new Action(() =>
                            {
                                ScrollHost.ScrollToHorizontalOffset(0);
                                ScrollHost.ScrollToVerticalOffset(0);
                            }), DispatcherPriority.Render);
                        }
                        // Re-apply portrait blur effect after resize (even when not in fit mode)
                        Dispatcher.BeginInvoke(new Action(() =>
                        {
                            if (ImageElement.Source is BitmapSource bmp)
                            {
                                string? currentFile = _viewModel?.PlaylistManager?.CurrentItem?.FilePath;
                                ApplyPortraitBlurEffect(bmp, currentFile);
                            }
                        }), System.Windows.Threading.DispatcherPriority.Loaded);
                    }
                }), DispatcherPriority.Loaded);
            }

            // Re-apply fit so media matches new size (for entering fullscreen)
            if (_isFullscreen)
            {
                if (CurrentMediaType == MediaType.Video && VideoElement.Source != null && FitToggle.IsChecked == true)
                {
                    SetVideoFit();
                    // Re-apply portrait blur effect after entering fullscreen
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        ApplyPortraitBlurEffectForVideo();
                    }), System.Windows.Threading.DispatcherPriority.Loaded);
                }
                else if (ImageElement.Source != null && FitToggle.IsChecked == true)
                {
                    SetZoomFit(CurrentMediaType == MediaType.Gif);
                    // Re-apply portrait blur effect after entering fullscreen
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        if (ImageElement.Source is BitmapSource bmp)
                        {
                            string? currentFile = _viewModel?.PlaylistManager?.CurrentItem?.FilePath;
                            ApplyPortraitBlurEffect(bmp, currentFile);
                        }
                    }), System.Windows.Threading.DispatcherPriority.Loaded);
                }
                else if (ImageElement.Source != null)
                {
                    // Re-apply portrait blur effect even when not in fit mode
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        if (ImageElement.Source is BitmapSource bmp)
                        {
                            string? currentFile = _viewModel?.PlaylistManager?.CurrentItem?.FilePath;
                            ApplyPortraitBlurEffect(bmp, currentFile);
                        }
                    }), System.Windows.Threading.DispatcherPriority.Loaded);
                }
            }
        }


        private void MuteButton_Click(object sender, RoutedEventArgs e)
        {
            _isMuted = !_isMuted;
            VideoElement.IsMuted = _isMuted;
            MuteButton.Content = _isMuted ? "\uE74F" : "\uE767"; // E74F = Mute, E767 = Unmute

            if (_viewModel?.Settings != null && _viewModel.Settings.SaveIsMuted)
            {
                _viewModel.Settings.IsMuted = _isMuted;
                _viewModel.SettingsService?.Save(_viewModel.Settings);
            }
        }

        private void ReplayButton_Click(object sender, RoutedEventArgs e)
        {
            if (CurrentMediaType != MediaType.Video) return;
            if (_slideshowController == null || _slideshowController.IsRunning) return;
            _videoService?.Replay();
        }

        #region Context Menu Creation and Event Handlers

        private void CreateContextMenu()
        {
            if (_viewModel == null) return; // Don't create if ViewModel isn't ready
            
            _mainContextMenu = new ContextMenu();
            _mainContextMenu.Opened += MainContextMenu_Opened;
            _mainContextMenu.Closed += MainContextMenu_Closed;

            // Navigation
            var prevMenuItem = new MenuItem { Header = "Previous", Command = _viewModel.PreviousCommand };
            prevMenuItem.Icon = new TextBlock { Text = "\uE892", FontSize = 14, FontFamily = new FontFamily("Segoe MDL2 Assets") };
            _mainContextMenu.Items.Add(prevMenuItem);

            var nextMenuItem = new MenuItem { Header = "Next", Command = _viewModel.NextCommand };
            nextMenuItem.Icon = new TextBlock { Text = "\uE893", FontSize = 14, FontFamily = new FontFamily("Segoe MDL2 Assets") };
            _mainContextMenu.Items.Add(nextMenuItem);

            _mainContextMenu.Items.Add(new Separator());

            // Playback
            var startMenuItem = new MenuItem { Header = "Start Slideshow", Command = _viewModel.StartSlideshowCommand };
            startMenuItem.Icon = new TextBlock { Text = "\uEDB5", FontSize = 14, FontFamily = new FontFamily("Segoe MDL2 Assets") };
            _mainContextMenu.Items.Add(startMenuItem);

            var stopMenuItem = new MenuItem { Header = "Stop Slideshow", Command = _viewModel.StopSlideshowCommand };
            stopMenuItem.Icon = new TextBlock { Text = "\uE769", FontSize = 14, FontFamily = new FontFamily("Segoe MDL2 Assets") };
            _mainContextMenu.Items.Add(stopMenuItem);

            _mainContextMenu.Items.Add(new Separator());

            // View Controls
            var fullscreenMenuItem = new MenuItem { Header = "Toggle Fullscreen" };
            fullscreenMenuItem.Click += ContextMenu_ToggleFullscreen;
            fullscreenMenuItem.Icon = new TextBlock { Text = "⛶", FontSize = 14, FontFamily = new FontFamily("Segoe MDL2 Assets") };
            _mainContextMenu.Items.Add(fullscreenMenuItem);

            var fitMenuItem = new MenuItem { Header = "Fit to Window", IsCheckable = true };
            fitMenuItem.Click += ContextMenu_ToggleFit;
            if (FitToggle != null)
            {
                fitMenuItem.IsChecked = FitToggle.IsChecked ?? false;
            }
            _mainContextMenu.Items.Add(fitMenuItem);

            var resetZoomMenuItem = new MenuItem { Header = "Reset Zoom" };
            resetZoomMenuItem.Click += ContextMenu_ResetZoom;
            _mainContextMenu.Items.Add(resetZoomMenuItem);

            _mainContextMenu.Items.Add(new Separator());

            // Media Controls
            var replayMenuItem = new MenuItem { Header = "Replay Video" };
            replayMenuItem.Click += ContextMenu_ReplayVideo;
            replayMenuItem.Icon = new TextBlock { Text = "\uE72C", FontSize = 14, FontFamily = new FontFamily("Segoe MDL2 Assets") };
            _mainContextMenu.Items.Add(replayMenuItem);

            var muteMenuItem = new MenuItem { Header = "Mute/Unmute", Name = "MuteMenuItem" };
            muteMenuItem.Click += ContextMenu_ToggleMute;
            muteMenuItem.Icon = new TextBlock { Text = "\uE74F", FontSize = 14, FontFamily = new FontFamily("Segoe MDL2 Assets"), Name = "MuteIcon" };
            _mainContextMenu.Items.Add(muteMenuItem);

            _mainContextMenu.Items.Add(new Separator());

            // File Management
            var addFolderMenuItem = new MenuItem { Header = "Add Folder...", Command = _viewModel.AddFolderCommand };
            addFolderMenuItem.Icon = new TextBlock { Text = "\uED25", FontSize = 14, FontFamily = new FontFamily("Segoe MDL2 Assets") };
            _mainContextMenu.Items.Add(addFolderMenuItem);

            var playlistMenuItem = new MenuItem { Header = "Open Playlist", Command = _viewModel.OpenPlaylistCommand };
            playlistMenuItem.Icon = new TextBlock { Text = "\uE700", FontSize = 14, FontFamily = new FontFamily("Segoe MDL2 Assets") };
            _mainContextMenu.Items.Add(playlistMenuItem);

            var settingsMenuItem = new MenuItem { Header = "Settings", Command = _viewModel.OpenSettingsCommand };
            settingsMenuItem.Icon = new TextBlock { Text = "\uE713", FontSize = 14, FontFamily = new FontFamily("Segoe MDL2 Assets") };
            _mainContextMenu.Items.Add(settingsMenuItem);

            _mainContextMenu.Items.Add(new Separator());

            // Delete Options
            var deleteFromSlideshowMenuItem = new MenuItem { Header = "Delete from Slideshow", Name = "DeleteFromSlideshowMenuItem" };
            deleteFromSlideshowMenuItem.Click += ContextMenu_DeleteFromSlideshow;
            deleteFromSlideshowMenuItem.Icon = new TextBlock { Text = "\uE74D", FontSize = 14, FontFamily = new FontFamily("Segoe MDL2 Assets") };
            _mainContextMenu.Items.Add(deleteFromSlideshowMenuItem);

            var deleteFromDiskMenuItem = new MenuItem { Header = "Delete from Disk...", Name = "DeleteFromDiskMenuItem" };
            deleteFromDiskMenuItem.Click += ContextMenu_DeleteFromDisk;
            deleteFromDiskMenuItem.Icon = new TextBlock { Text = "\uE74D", FontSize = 14, FontFamily = new FontFamily("Segoe MDL2 Assets") };
            _mainContextMenu.Items.Add(deleteFromDiskMenuItem);
        }

        private void MainContextMenu_Opened(object sender, RoutedEventArgs e)
        {
            // Update menu item states when menu opens
            if (_viewModel == null || _mainContextMenu == null) return;

            // Find mute menu item and update icon
            var muteMenuItem = _mainContextMenu.Items.OfType<MenuItem>()
                .FirstOrDefault(m => m.Name == "MuteMenuItem");
            if (muteMenuItem != null)
            {
                var muteIcon = muteMenuItem.Icon as TextBlock;
                if (muteIcon != null)
                    muteIcon.Text = _isMuted ? "\uE74F" : "\uE767"; // Mute/Unmute icon
            }

            // Enable/disable delete menu items based on whether media is loaded
            bool hasMedia = _viewModel.HasMediaItems && _viewModel.CurrentMedia != null;
            var deleteFromSlideshow = _mainContextMenu.Items.OfType<MenuItem>()
                .FirstOrDefault(m => m.Name == "DeleteFromSlideshowMenuItem");
            var deleteFromDisk = _mainContextMenu.Items.OfType<MenuItem>()
                .FirstOrDefault(m => m.Name == "DeleteFromDiskMenuItem");
            
            if (deleteFromSlideshow != null)
                deleteFromSlideshow.IsEnabled = hasMedia;
            if (deleteFromDisk != null)
                deleteFromDisk.IsEnabled = hasMedia;
        }

        private void MainContextMenu_Closed(object sender, RoutedEventArgs e)
        {
            // Cleanup if needed
        }

        private void ContextMenu_ToggleFullscreen(object sender, RoutedEventArgs e)
        {
            ToggleFullscreen();
        }

        private void ContextMenu_ToggleFit(object sender, RoutedEventArgs e)
        {
            if (FitToggle != null)
            {
                FitToggle.IsChecked = !FitToggle.IsChecked;
            }
        }

        private void ContextMenu_ResetZoom(object sender, RoutedEventArgs e)
        {
            ZoomResetButton_Click(sender, e);
        }

        private void ContextMenu_ReplayVideo(object sender, RoutedEventArgs e)
        {
            ReplayButton_Click(sender, e);
        }

        private void ContextMenu_ToggleMute(object sender, RoutedEventArgs e)
        {
            MuteButton_Click(sender, e);
        }

        private void ContextMenu_DeleteFromSlideshow(object sender, RoutedEventArgs e)
        {
            if (_viewModel?.DeleteFileFromSlideshowCommand?.CanExecute(null) == true)
            {
                _viewModel.DeleteFileFromSlideshowCommand.Execute(null);
            }
        }

        private void ContextMenu_DeleteFromDisk(object sender, RoutedEventArgs e)
        {
            if (_viewModel?.DeleteFileFromDiskCommand?.CanExecute(null) == true)
            {
                _viewModel.DeleteFileFromDiskCommand.Execute(null);
            }
        }

        #endregion

        private void MonitorButton_Click(object sender, RoutedEventArgs e)
        {
            // Create context menu with available monitors
            var menu = new ContextMenu();
            var screens = WinForms.Screen.AllScreens;
            
            for (int i = 0; i < screens.Length; i++)
            {
                var screen = screens[i];
                var menuItem = new MenuItem
                {
                    Header = $"Monitor {i + 1}{(screen.Primary ? " (Primary)" : "")}",
                    Tag = screen.DeviceName
                };
                
                // Check if this is the current preferred monitor
                string? preferredDeviceName = _viewModel?.Settings?.PreferredFullscreenMonitorDeviceName;
                if (screen.DeviceName == preferredDeviceName)
                {
                    menuItem.IsChecked = true;
                }
                
                menuItem.Click += (s, args) =>
                {
                    if (_viewModel?.Settings != null)
                    {
                        _viewModel.Settings.PreferredFullscreenMonitorDeviceName = screen.DeviceName;
                        if (_viewModel.Settings.SavePreferredFullscreenMonitorDeviceName)
                        {
                            _viewModel.SettingsService?.Save(_viewModel.Settings);
                        }
                        
                        // If currently in fullscreen mode, immediately switch to the new monitor
                        if (_isFullscreen)
                        {
                            ApplyFullscreenPosition();
                            
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
                    }
                };
                
                menu.Items.Add(menuItem);
            }
            
            // Show menu at button position
            if (sender is Button button)
            {
                menu.PlacementTarget = button;
                menu.Placement = System.Windows.Controls.Primitives.PlacementMode.Bottom;
                menu.IsOpen = true;
            }
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
                        current == EmptyStatePanel ||
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
                    
                    // Get parent - handle both Visual and TextElement (like Run)
                    DependencyObject? parent = null;
                    if (current is System.Windows.Media.Visual || current is System.Windows.Media.Media3D.Visual3D)
                    {
                        parent = VisualTreeHelper.GetParent(current);
                    }
                    else if (current is System.Windows.Documents.TextElement textElement)
                    {
                        parent = LogicalTreeHelper.GetParent(current);
                    }
                    else
                    {
                        parent = LogicalTreeHelper.GetParent(current);
                    }
                    current = parent;
                }
            }
            
            // Left-click on empty space in ScrollViewer advances to next
            ShowNext();
            e.Handled = true;
        }

        private void Media_MouseRightButtonUp(object sender, MouseButtonEventArgs e)
        {
            // Show context menu instead of just going to previous
            if (_mainContextMenu != null)
            {
                _mainContextMenu.PlacementTarget = sender as UIElement ?? this;
                _mainContextMenu.IsOpen = true;
            }
            e.Handled = true; // Prevent bubbling to window handler
        }

        private void MainGrid_PreviewMouseRightButtonUp(object sender, MouseButtonEventArgs e)
        {
            // Don't handle if we're clicking on media elements (they have their own handlers)
            if (e.OriginalSource == ImageElement || e.OriginalSource == VideoElement || e.OriginalSource == VideoFrameImage)
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
                    
                    // Exclude the empty state panel
                    if (current == EmptyStatePanel)
                    {
                        return; // Click is on the empty state panel, don't handle
                    }
                    
                    // Exclude ScrollBar and its parts (Thumb, Track, etc.)
                    if (current is System.Windows.Controls.Primitives.ScrollBar ||
                        current is System.Windows.Controls.Primitives.Thumb ||
                        current is System.Windows.Controls.Primitives.Track)
                    {
                        return; // Click is on scrollbar, don't handle
                    }
                    
                    // Exclude context menu
                    if (current is ContextMenu)
                    {
                        return; // Click is on context menu, don't handle
                    }
                    
                    // Exclude ScrollViewer (but allow clicks on its background)
                    if (current == ScrollHost)
                    {
                        // Continue checking - we want to handle clicks on empty ScrollViewer area
                    }
                    
                    // Get parent - handle both Visual and TextElement (like Run)
                    DependencyObject? parent = null;
                    if (current is System.Windows.Media.Visual || current is System.Windows.Media.Media3D.Visual3D)
                    {
                        parent = VisualTreeHelper.GetParent(current);
                    }
                    else if (current is System.Windows.Documents.TextElement)
                    {
                        parent = LogicalTreeHelper.GetParent(current);
                    }
                    else
                    {
                        parent = LogicalTreeHelper.GetParent(current);
                    }
                    current = parent;
                }
            }
            
            // Right-click anywhere else in the window shows context menu
            if (_mainContextMenu != null)
            {
                _mainContextMenu.PlacementTarget = this;
                _mainContextMenu.IsOpen = true;
            }
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
                    
                    // Exclude the empty state panel
                    if (current == EmptyStatePanel)
                    {
                        return; // Click is on the empty state panel, don't handle
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
                    
                    // Get parent - handle both Visual and TextElement (like Run)
                    DependencyObject? parent = null;
                    if (current is System.Windows.Media.Visual || current is System.Windows.Media.Media3D.Visual3D)
                    {
                        parent = VisualTreeHelper.GetParent(current);
                    }
                    else if (current is System.Windows.Documents.TextElement)
                    {
                        parent = LogicalTreeHelper.GetParent(current);
                    }
                    else
                    {
                        parent = LogicalTreeHelper.GetParent(current);
                    }
                    current = parent;
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

                // Check if we're over the empty state panel
                if (current == EmptyStatePanel)
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

                // Get parent - handle both Visual and TextElement (like Run)
                DependencyObject? parent = null;
                if (current is System.Windows.Media.Visual || current is System.Windows.Media.Media3D.Visual3D)
                {
                    parent = VisualTreeHelper.GetParent(current);
                }
                else if (current is System.Windows.Documents.TextElement textElement)
                {
                    parent = LogicalTreeHelper.GetParent(current);
                }
                else
                {
                    parent = LogicalTreeHelper.GetParent(current);
                }
                current = parent;
            }

            return false;
        }

        private void ScrollHost_PreviewMouseRightButtonUp(object sender, MouseButtonEventArgs e)
        {
            // Don't handle if clicking directly on the image or video (they have their own handlers)
            if (e.OriginalSource == ImageElement || e.OriginalSource == VideoElement || e.OriginalSource == VideoFrameImage)
            {
                return;
            }
            
            // Check if clicking on UI elements - don't show menu
            var source = e.OriginalSource as DependencyObject;
            if (source != null)
            {
                var current = source;
                while (current != null)
                {
                    if (current == ToolbarExpandedPanel || current == ToolbarNotchPanel ||
                        current == StatusBar || current == TitleCountText ||
                        current == EmptyStatePanel ||
                        current == ImageElement || current == VideoElement ||
                        current == VideoFrameImage)
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
                    
                    // Exclude context menu
                    if (current is ContextMenu)
                    {
                        return; // Click is on context menu, don't handle
                    }
                    
                    // Get parent - handle both Visual and TextElement (like Run)
                    DependencyObject? parent = null;
                    if (current is System.Windows.Media.Visual || current is System.Windows.Media.Media3D.Visual3D)
                    {
                        parent = VisualTreeHelper.GetParent(current);
                    }
                    else if (current is System.Windows.Documents.TextElement textElement)
                    {
                        parent = LogicalTreeHelper.GetParent(current);
                    }
                    else
                    {
                        parent = LogicalTreeHelper.GetParent(current);
                    }
                    current = parent;
                }
            }
            
            // Right-click on empty space in ScrollViewer shows context menu
            if (_mainContextMenu != null)
            {
                _mainContextMenu.PlacementTarget = ScrollHost;
                _mainContextMenu.IsOpen = true;
            }
            e.Handled = true;
        }
        public async Task ChooseFoldersFromDialogAsync()
        {
            if (_viewModel == null) return;

            List<string> selectedFolders = new List<string>();

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
                    selectedFolders.AddRange(dlg.FileNames);
                }
            }
            catch
            {
                // fallthrough to FolderBrowserDialog
            }

            // Fallback: classic single-folder dialog if no folders selected
            if (selectedFolders.Count == 0)
            {
                var fb = new System.Windows.Forms.FolderBrowserDialog
                {
                    Description = "Select folder containing images/videos"
                };

                var result = fb.ShowDialog();
                if (result == System.Windows.Forms.DialogResult.OK)
                {
                    selectedFolders.Add(fb.SelectedPath);
                }
            }

            // Add folders via ViewModel
            if (selectedFolders.Count > 0)
            {
                await _viewModel.AddFoldersAsync(selectedFolders);
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
            var items = _viewModel?.PlaylistManager?.GetAllItems().ToList() ?? new List<MediaItem>();
            var itemsToRemove = items.Where(i => PlaylistWindow_IsUnderFolderStatic(i.FilePath, folderPath)).ToList();
            
            // Reload playlist without removed items
            var remainingItems = items.Except(itemsToRemove).Select(i => i.FilePath).ToList();
            bool includeVideos = IncludeVideoToggle.IsChecked == true;
            
            // Rebuild playlist
            _viewModel?.PlaylistManager?.LoadFiles(_folders, includeVideos);
            ApplySort();

            if (!(_viewModel?.PlaylistManager?.HasItems == true))
            {
                ClearImageDisplay();
                _videoService?.Stop();
                UpdateItemCount();
                return;
            }

            // Ensure index is valid
            if (_viewModel?.PlaylistManager?.CurrentIndex >= _viewModel.PlaylistManager.Count)
                _viewModel.PlaylistManager?.SetIndex(_viewModel.PlaylistManager.Count - 1);

            ShowCurrentMedia();
        }

        public void RemoveFileFromPlaylist(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                return;

            // Preserve current item if it's not being removed
            var currentItem = _viewModel?.PlaylistManager?.CurrentItem;
            string? currentFilePath = currentItem?.FilePath;
            string normalized = Path.GetFullPath(filePath);
            bool isRemovingCurrent = currentFilePath != null && 
                string.Equals(Path.GetFullPath(currentFilePath), normalized, StringComparison.OrdinalIgnoreCase);

            // Remove the file directly from the playlist
            bool removed = _viewModel?.PlaylistManager?.RemoveFile(filePath) ?? false;

            if (!removed)
                return;

            if (!(_viewModel?.PlaylistManager?.HasItems == true))
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
                if (_viewModel?.PlaylistManager?.CurrentIndex >= _viewModel.PlaylistManager.Count)
                    _viewModel.PlaylistManager?.SetIndex(_viewModel.PlaylistManager.Count - 1);
                else if (_viewModel?.PlaylistManager?.CurrentIndex < 0 && _viewModel.PlaylistManager.Count > 0)
                    _viewModel.PlaylistManager?.SetIndex(0);
            }
            // Otherwise, try to restore position to the same file
            else if (currentFilePath != null)
            {
                var itemsAfter = _viewModel?.PlaylistManager?.GetAllItems() ?? Enumerable.Empty<MediaItem>();
                var itemsAfterList = itemsAfter.ToList();
                int foundIndex = itemsAfterList.FindIndex(i => 
                    string.Equals(Path.GetFullPath(i.FilePath), Path.GetFullPath(currentFilePath), StringComparison.OrdinalIgnoreCase));
                if (foundIndex >= 0)
                    _viewModel?.PlaylistManager?.SetIndex(foundIndex);
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
            if (e.PropertyName == nameof(MainViewModel.IsPlaying))
            {
                SetSlideshowState(_viewModel?.IsPlaying ?? false);
            }
            else if (e.PropertyName == nameof(MainViewModel.CurrentMedia))
            {
                // Update replay button state
                if (_viewModel?.CurrentMedia != null)
                {
                    ReplayButton.IsEnabled = _viewModel.CurrentMedia.Type == MediaType.Video && 
                                            !(_viewModel.IsPlaying);
                    
                    // If media is set and window is loaded, show it (handles auto-load case)
                    if (IsLoaded && _viewModel.PlaylistManager?.HasItems == true)
                    {
                        // Fire-and-forget: intentionally not awaited
#pragma warning disable CS4014 // Fire-and-forget async call
                        _ = ShowCurrentMediaAsync();
#pragma warning restore CS4014
                    }
                }
                else
                {
                    ReplayButton.IsEnabled = false;
                }
            }
            else if (e.PropertyName == nameof(MainViewModel.TotalCount))
            {
                // Empty state panel visibility is now handled via data binding
                
                // If items are loaded and CurrentMedia is set, show it (handles auto-load case)
                if (_viewModel?.TotalCount > 0 && _viewModel?.CurrentMedia != null && IsLoaded)
                {
                    // Fire-and-forget: intentionally not awaited
#pragma warning disable CS4014 // Fire-and-forget async call
                    _ = ShowCurrentMediaAsync();
#pragma warning restore CS4014
                }
            }
            else if (e.PropertyName == nameof(MainViewModel.Folders))
            {
                // Empty state panel visibility is now handled via data binding
            }
            else if (e.PropertyName == nameof(MainViewModel.StatusText))
            {
                // Update status text when it changes
                if (_viewModel?.StatusText != null)
                {
                    SetStatus(_viewModel.StatusText);
                }
            }
        }


        private async void ViewModel_RequestShowMedia(object? sender, EventArgs e)
        {
            // Request to show current media - call the existing ShowCurrentMediaAsync method
            // Fire-and-forget: intentionally not awaited to avoid blocking
#pragma warning disable CS4014 // Fire-and-forget async call
            _ = ShowCurrentMediaAsync();
#pragma warning restore CS4014
        }

        private void ViewModel_RequestShowMessage(object? sender, string message)
        {
            MessageBox.Show(message, "Slide Show Bob", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private async void ViewModel_RequestAddFolder(object? sender, EventArgs e)
        {
            // Open folder dialog and add folders
            await ChooseFoldersFromDialogAsync();
        }

        #endregion

    }

    #region Win32 API for DPI detection
    internal static class Win32
    {
        [DllImport("user32.dll")]
        public static extern IntPtr MonitorFromPoint(POINT pt, uint dwFlags);

        [DllImport("shcore.dll")]
        public static extern int GetDpiForMonitor(IntPtr hmonitor, MONITOR_DPI_TYPE dpiType, out uint dpiX, out uint dpiY);

        public const uint MONITOR_DEFAULTTONEAREST = 2;

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT
        {
            public int X;
            public int Y;
        }

        public enum MONITOR_DPI_TYPE
        {
            MDT_EFFECTIVE_DPI = 0,
            MDT_ANGULAR_DPI = 1,
            MDT_RAW_DPI = 2
        }
    }
    #endregion
}
