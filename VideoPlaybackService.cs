using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace SlideShowBob
{
    /// <summary>
    /// Manages video playback with smooth transitions and state management.
    /// Wraps MediaElement interactions to prevent stutter and race conditions.
    /// </summary>
    public class VideoPlaybackService : IDisposable
    {
        private readonly MediaElement _mediaElement;
        private readonly ProgressBar _progressBar;
        private readonly DispatcherTimer _progressTimer;
        private bool _isMuted = true;
        private bool _isPlaying = false;
        private Uri? _currentSource = null;
        private RoutedEventHandler? _mediaOpenedHandler;
        private RoutedEventHandler? _mediaEndedHandler;
        private readonly object _loadLock = new object();
        private DispatcherOperation? _pendingPlayOperation = null;
        private bool _isDisposed = false;

        public event EventHandler? MediaOpened;
        public event EventHandler? MediaEnded;
        public event EventHandler<double>? ProgressUpdated;
        public event EventHandler<BitmapSource>? FrameCaptured; // For last frame capture

        public bool IsPlaying => _isPlaying;
        public bool IsMuted
        {
            get => _isMuted;
            set
            {
                _isMuted = value;
                if (_mediaElement != null)
                    _mediaElement.IsMuted = value;
            }
        }

        public VideoPlaybackService(MediaElement mediaElement, ProgressBar progressBar)
        {
            _mediaElement = mediaElement ?? throw new ArgumentNullException(nameof(mediaElement));
            _progressBar = progressBar ?? throw new ArgumentNullException(nameof(progressBar));

            _progressTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(200) };
            _progressTimer.Tick += ProgressTimer_Tick;

            _mediaElement.LoadedBehavior = MediaState.Manual;
            _mediaElement.UnloadedBehavior = MediaState.Stop;
            _mediaElement.IsMuted = _isMuted;
        }

        /// <summary>
        /// Loads and starts playing a video with smooth transition.
        /// Sequences operations to prevent stutter.
        /// Thread-safe to prevent crashes during rapid navigation.
        /// </summary>
        public void LoadVideo(Uri source, Action? onMediaOpened = null, Action? onMediaEnded = null)
        {
            if (source == null || _isDisposed) return;

            // Prevent concurrent loads - only one load operation at a time
            lock (_loadLock)
            {
                if (_isDisposed) return;

                // Cancel any pending BeginInvoke operations to prevent race conditions
                if (_pendingPlayOperation != null && _pendingPlayOperation.Status == DispatcherOperationStatus.Pending)
                {
                    _pendingPlayOperation.Abort();
                    _pendingPlayOperation = null;
                }

                // Stop current playback cleanly
                StopInternal();

                // Remove old handlers
                if (_mediaOpenedHandler != null)
                    _mediaElement.MediaOpened -= _mediaOpenedHandler;
                if (_mediaEndedHandler != null)
                    _mediaElement.MediaEnded -= _mediaEndedHandler;

                // Set up new handlers with source verification to prevent race conditions
                Uri handlerSource = source; // Capture source for handler
                _mediaOpenedHandler = (s, e) =>
                {
                    // Check if disposed or source changed
                    if (_isDisposed || _mediaElement == null || _mediaElement.Source != handlerSource || _currentSource != handlerSource)
                        return;

                    // Ensure playback is started (in case the immediate Play() call didn't work)
                    try
                    {
                        if (!_isDisposed && _mediaElement.Source == handlerSource && _currentSource == handlerSource)
                        {
                            _mediaElement.Play();
                        }
                    }
                    catch (InvalidOperationException)
                    {
                        // Dispatcher shutting down or MediaElement disposed - ignore
                    }
                    catch
                    {
                        // If play fails, ignore - it might already be playing
                    }
                    
                    // Ensure progress timer is running
                    if (!_isDisposed && !_progressTimer.IsEnabled && _mediaElement.Source == handlerSource && _currentSource == handlerSource)
                    {
                        _progressTimer.Start();
                        _progressBar.Visibility = Visibility.Visible;
                        _progressBar.Value = 0;
                    }
                    
                    if (!_isDisposed && _mediaElement.Source == handlerSource && _currentSource == handlerSource)
                    {
                        _isPlaying = true;
                        MediaOpened?.Invoke(this, EventArgs.Empty);
                        onMediaOpened?.Invoke();
                    }
                };

                _mediaEndedHandler = (s, e) =>
                {
                    // Check if disposed or source changed
                    if (_isDisposed || _mediaElement == null || _mediaElement.Source != handlerSource || _currentSource != handlerSource)
                        return;

                    _isPlaying = false;
                    
                    // Capture last frame BEFORE stopping (while video is still visible)
                    BitmapSource? lastFrame = null;
                    try
                    {
                        if (!_isDisposed && _mediaElement.Source == handlerSource)
                        {
                            lastFrame = CaptureCurrentFrame();
                        }
                    }
                    catch
                    {
                        // If capture fails, continue without frame
                    }
                    
                    if (lastFrame != null)
                    {
                        FrameCaptured?.Invoke(this, lastFrame);
                    }
                    
                    // Clear source and state without calling Stop() to avoid lock re-entry
                    // Stop() will be called by the next LoadVideo() or explicit Stop() call
                    try
                    {
                        if (!_isDisposed && _mediaElement.Source == handlerSource)
                        {
                            _mediaElement.Stop();
                            _mediaElement.Source = null;
                            _currentSource = null;
                            _isPlaying = false;
                            _progressTimer.Stop();
                            _progressBar.Visibility = Visibility.Collapsed;
                            _progressBar.Value = 0;
                        }
                    }
                    catch (InvalidOperationException)
                    {
                        // Dispatcher shutting down - ignore
                    }
                    
                    MediaEnded?.Invoke(this, EventArgs.Empty);
                    onMediaEnded?.Invoke();
                };

                _mediaElement.MediaOpened += _mediaOpenedHandler;
                _mediaElement.MediaEnded += _mediaEndedHandler;

                // Sequence the load: set source first, then visibility, then play
                _currentSource = source;
                _mediaElement.Source = source;
                _mediaElement.Visibility = Visibility.Visible;

                // Try to start playing immediately - MediaElement will queue it if not ready yet
                // This reduces delay compared to waiting for MediaOpened
                // Store the operation so we can cancel it if needed
                try
                {
                    _pendingPlayOperation = _mediaElement.Dispatcher.BeginInvoke(new Action(() =>
                    {
                        // Double-check source hasn't changed and not disposed before playing
                        if (_isDisposed || _mediaElement == null)
                            return;
                            
                        if (_mediaElement.Source == source && _currentSource == source)
                        {
                            try
                            {
                                _mediaElement.Play();
                                if (!_isDisposed && _mediaElement.Source == source) // Verify again after play
                                {
                                    _progressTimer.Start();
                                    _progressBar.Visibility = Visibility.Visible;
                                    _progressBar.Value = 0;
                                }
                            }
                            catch (InvalidOperationException)
                            {
                                // Dispatcher shutting down or MediaElement disposed - ignore
                            }
                            catch
                            {
                                // If play fails (media not ready), MediaOpened handler will retry
                            }
                        }
                    }), DispatcherPriority.Normal);
                }
                catch (InvalidOperationException)
                {
                    // Dispatcher is shutting down - ignore
                    _pendingPlayOperation = null;
                }
            }
        }

        /// <summary>
        /// Captures the current frame from the video element.
        /// Returns null if video is not ready or capture fails.
        /// </summary>
        public BitmapSource? CaptureCurrentFrame()
        {
            if (_isDisposed || _mediaElement == null || _mediaElement.Source == null)
                return null;

            if (_mediaElement.NaturalVideoWidth <= 0 || _mediaElement.NaturalVideoHeight <= 0)
                return null;

            try
            {
                // Use VisualBrush to capture the video frame
                var videoBrush = new VisualBrush(_mediaElement)
                {
                    Stretch = Stretch.Uniform,
                    Viewbox = new Rect(0, 0, 1, 1),
                    ViewboxUnits = BrushMappingMode.RelativeToBoundingBox
                };

                var drawingVisual = new DrawingVisual();
                using (var drawingContext = drawingVisual.RenderOpen())
                {
                    drawingContext.DrawRectangle(
                        videoBrush,
                        null,
                        new Rect(0, 0, _mediaElement.NaturalVideoWidth, _mediaElement.NaturalVideoHeight));
                }

                var renderTarget = new RenderTargetBitmap(
                    _mediaElement.NaturalVideoWidth,
                    _mediaElement.NaturalVideoHeight,
                    96, 96, PixelFormats.Pbgra32);

                renderTarget.Render(drawingVisual);
                renderTarget.Freeze();

                return renderTarget;
            }
            catch (InvalidOperationException)
            {
                // Dispatcher shutting down - ignore
                return null;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Stops playback and clears the video source.
        /// Optionally captures the last frame before stopping.
        /// Thread-safe.
        /// </summary>
        public void Stop(bool captureLastFrame = false)
        {
            lock (_loadLock)
            {
                StopInternal(captureLastFrame);
            }
        }

        /// <summary>
        /// Internal stop method that assumes lock is already held.
        /// </summary>
        private void StopInternal(bool captureLastFrame = false)
        {
            if (_isDisposed) return;

            // Cancel any pending BeginInvoke operations to prevent race conditions
            if (_pendingPlayOperation != null && _pendingPlayOperation.Status == DispatcherOperationStatus.Pending)
            {
                _pendingPlayOperation.Abort();
                _pendingPlayOperation = null;
            }

            // Capture last frame before stopping if requested
            if (captureLastFrame && _isPlaying)
            {
                try
                {
                    var lastFrame = CaptureCurrentFrame();
                    if (lastFrame != null)
                    {
                        FrameCaptured?.Invoke(this, lastFrame);
                    }
                }
                catch
                {
                    // If capture fails, continue with stop
                }
            }

            _isPlaying = false;
            _progressTimer.Stop();

            if (_mediaElement != null)
            {
                try
                {
                    _mediaElement.Stop();
                    _mediaElement.Source = null;
                    // CRITICAL FIX: Call Close() to properly release MediaElement resources
                    // This prevents memory leaks and crashes during rapid transitions
                    _mediaElement.Close();
                    _mediaElement.Visibility = Visibility.Collapsed;
                }
                catch (InvalidOperationException)
                {
                    // Dispatcher shutting down or MediaElement disposed - ignore
                }
                catch
                {
                    // If stop fails, continue with cleanup
                }
            }

            _progressBar.Visibility = Visibility.Collapsed;
            _progressBar.Value = 0;
            _currentSource = null;
        }

        /// <summary>
        /// Replays the current video.
        /// </summary>
        public void Replay()
        {
            if (_isDisposed || _currentSource == null || _mediaElement == null || _mediaElement.Source == null)
                return;

            try
            {
                _mediaElement.Stop();
                _mediaElement.Position = TimeSpan.Zero;
                _mediaElement.Play();
                _isPlaying = true;
                _progressBar.Value = 0;
            }
            catch (InvalidOperationException)
            {
                // Dispatcher shutting down - ignore
            }
            catch
            {
                // If replay fails, ignore
            }
        }

        /// <summary>
        /// Seeks to a specific position (0.0 to 1.0).
        /// </summary>
        public void SeekTo(double ratio)
        {
            if (_isDisposed || _mediaElement == null || _mediaElement.Source == null || !_mediaElement.NaturalDuration.HasTimeSpan)
                return;

            try
            {
                var duration = _mediaElement.NaturalDuration.TimeSpan;
                if (duration.TotalMilliseconds <= 0)
                    return;

                ratio = Math.Clamp(ratio, 0.0, 1.0);
                _mediaElement.Position = TimeSpan.FromMilliseconds(duration.TotalMilliseconds * ratio);
                _progressBar.Value = ratio * 100.0;
            }
            catch (InvalidOperationException)
            {
                // Dispatcher shutting down - ignore
            }
            catch
            {
                // If seek fails, ignore
            }
        }

        /// <summary>
        /// Gets the current playback progress (0.0 to 1.0).
        /// </summary>
        public double GetProgress()
        {
            if (_isDisposed || _mediaElement == null || _mediaElement.Source == null || !_mediaElement.NaturalDuration.HasTimeSpan)
                return 0.0;

            try
            {
                var duration = _mediaElement.NaturalDuration.TimeSpan;
                if (duration.TotalMilliseconds <= 0)
                    return 0.0;

                var position = _mediaElement.Position;
                return Math.Clamp(position.TotalMilliseconds / duration.TotalMilliseconds, 0.0, 1.0);
            }
            catch
            {
                return 0.0;
            }
        }

        private void ProgressTimer_Tick(object? sender, EventArgs e)
        {
            if (_isDisposed || _mediaElement == null || _mediaElement.Source == null || !_isPlaying)
            {
                _progressBar.Visibility = Visibility.Collapsed;
                return;
            }

            try
            {
                double progress = GetProgress();
                _progressBar.Value = progress * 100.0;
                ProgressUpdated?.Invoke(this, progress);
            }
            catch
            {
                // If progress calculation fails, stop timer
                _progressTimer.Stop();
                _progressBar.Visibility = Visibility.Collapsed;
            }
        }

        /// <summary>
        /// Gets video dimensions if available.
        /// </summary>
        public (int width, int height) GetVideoDimensions()
        {
            if (_mediaElement == null || _mediaElement.NaturalVideoWidth <= 0 || _mediaElement.NaturalVideoHeight <= 0)
                return (0, 0);

            return (_mediaElement.NaturalVideoWidth, _mediaElement.NaturalVideoHeight);
        }

        /// <summary>
        /// Disposes resources and unsubscribes from events to prevent memory leaks.
        /// </summary>
        public void Dispose()
        {
            lock (_loadLock)
            {
                if (_isDisposed) return;
                _isDisposed = true;

                // Cancel any pending operations
                if (_pendingPlayOperation != null && _pendingPlayOperation.Status == DispatcherOperationStatus.Pending)
                {
                    _pendingPlayOperation.Abort();
                    _pendingPlayOperation = null;
                }

                _progressTimer.Tick -= ProgressTimer_Tick;
                _progressTimer.Stop();

                // Stop and close media element properly
                if (_mediaElement != null)
                {
                    try
                    {
                        _mediaElement.Stop();
                        _mediaElement.Source = null;
                        _mediaElement.Close();
                    }
                    catch
                    {
                        // Ignore errors during disposal
                    }

                    // Unsubscribe from media element events
                    if (_mediaOpenedHandler != null)
                    {
                        _mediaElement.MediaOpened -= _mediaOpenedHandler;
                        _mediaOpenedHandler = null;
                    }

                    if (_mediaEndedHandler != null)
                    {
                        _mediaElement.MediaEnded -= _mediaEndedHandler;
                        _mediaEndedHandler = null;
                    }
                }

                _currentSource = null;
            }
        }
    }
}

