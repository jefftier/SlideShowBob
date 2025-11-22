using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;

namespace SlideShowBob
{
    /// <summary>
    /// Manages video playback with smooth transitions and state management.
    /// Wraps MediaElement interactions to prevent stutter and race conditions.
    /// </summary>
    public class VideoPlaybackService
    {
        private readonly MediaElement _mediaElement;
        private readonly ProgressBar _progressBar;
        private readonly DispatcherTimer _progressTimer;
        private bool _isMuted = true;
        private bool _isPlaying = false;
        private Uri? _currentSource = null;
        private RoutedEventHandler? _mediaOpenedHandler;
        private RoutedEventHandler? _mediaEndedHandler;

        public event EventHandler? MediaOpened;
        public event EventHandler? MediaEnded;
        public event EventHandler<double>? ProgressUpdated;

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
        /// </summary>
        public void LoadVideo(Uri source, Action? onMediaOpened = null, Action? onMediaEnded = null)
        {
            if (source == null) return;

            // Stop current playback cleanly
            Stop();

            // Remove old handlers
            if (_mediaOpenedHandler != null)
                _mediaElement.MediaOpened -= _mediaOpenedHandler;
            if (_mediaEndedHandler != null)
                _mediaElement.MediaEnded -= _mediaEndedHandler;

            // Set up new handlers
            _mediaOpenedHandler = (s, e) =>
            {
                _isPlaying = true;
                MediaOpened?.Invoke(this, EventArgs.Empty);
                onMediaOpened?.Invoke();
            };

            _mediaEndedHandler = (s, e) =>
            {
                _isPlaying = false;
                Stop();
                MediaEnded?.Invoke(this, EventArgs.Empty);
                onMediaEnded?.Invoke();
            };

            _mediaElement.MediaOpened += _mediaOpenedHandler;
            _mediaElement.MediaEnded += _mediaEndedHandler;

            // Sequence the load: set source first, then visibility, then play
            // Use dispatcher to avoid blocking UI thread
            _currentSource = source;
            _mediaElement.Source = source;
            _mediaElement.Visibility = Visibility.Visible;

            // Defer play until after layout pass to prevent stutter
            _mediaElement.Dispatcher.BeginInvoke(new Action(() =>
            {
                if (_mediaElement.Source == source) // Verify source hasn't changed
                {
                    _mediaElement.Play();
                    _progressTimer.Start();
                    _progressBar.Visibility = Visibility.Visible;
                    _progressBar.Value = 0;
                }
            }), DispatcherPriority.Loaded);
        }

        /// <summary>
        /// Stops playback and clears the video source.
        /// </summary>
        public void Stop()
        {
            _isPlaying = false;
            _progressTimer.Stop();

            if (_mediaElement != null)
            {
                _mediaElement.Stop();
                _mediaElement.Source = null;
                _mediaElement.Visibility = Visibility.Collapsed;
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
            if (_currentSource == null || _mediaElement.Source == null)
                return;

            _mediaElement.Stop();
            _mediaElement.Position = TimeSpan.Zero;
            _mediaElement.Play();
            _isPlaying = true;
            _progressBar.Value = 0;
        }

        /// <summary>
        /// Seeks to a specific position (0.0 to 1.0).
        /// </summary>
        public void SeekTo(double ratio)
        {
            if (_mediaElement.Source == null || !_mediaElement.NaturalDuration.HasTimeSpan)
                return;

            var duration = _mediaElement.NaturalDuration.TimeSpan;
            if (duration.TotalMilliseconds <= 0)
                return;

            ratio = Math.Clamp(ratio, 0.0, 1.0);
            _mediaElement.Position = TimeSpan.FromMilliseconds(duration.TotalMilliseconds * ratio);
            _progressBar.Value = ratio * 100.0;
        }

        /// <summary>
        /// Gets the current playback progress (0.0 to 1.0).
        /// </summary>
        public double GetProgress()
        {
            if (_mediaElement.Source == null || !_mediaElement.NaturalDuration.HasTimeSpan)
                return 0.0;

            var duration = _mediaElement.NaturalDuration.TimeSpan;
            if (duration.TotalMilliseconds <= 0)
                return 0.0;

            var position = _mediaElement.Position;
            return Math.Clamp(position.TotalMilliseconds / duration.TotalMilliseconds, 0.0, 1.0);
        }

        private void ProgressTimer_Tick(object? sender, EventArgs e)
        {
            if (_mediaElement.Source == null || !_isPlaying)
            {
                _progressBar.Visibility = Visibility.Collapsed;
                return;
            }

            double progress = GetProgress();
            _progressBar.Value = progress * 100.0;
            ProgressUpdated?.Invoke(this, progress);
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
    }
}

