using System;
using System.Threading;
using System.Windows.Threading;

namespace SlideShowBob
{
    /// <summary>
    /// Centralized state machine for slideshow transitions.
    /// Prevents race conditions by ensuring only one transition happens at a time.
    /// </summary>
    public class SlideshowController
    {
        private readonly MediaPlaylistManager _playlist;
        private readonly DispatcherTimer _slideTimer;
        private readonly object _transitionLock = new();
        private bool _isTransitioning = false;
        private bool _isSlideshowRunning = false;
        private DateTime _mediaStartTime;
        private int _slideDelayMs = 2000;
        private bool _videoEnded = false;
        private MediaType? _currentMediaType = null;

        public event EventHandler<int>? NavigateToIndex;
        public event EventHandler? SlideshowStarted;
        public event EventHandler? SlideshowStopped;

        public bool IsRunning => _isSlideshowRunning;
        public int SlideDelayMs
        {
            get => _slideDelayMs;
            set
            {
                _slideDelayMs = value;
                if (_slideTimer != null)
                    _slideTimer.Interval = TimeSpan.FromMilliseconds(value);
            }
        }

        public SlideshowController(MediaPlaylistManager playlist)
        {
            _playlist = playlist ?? throw new ArgumentNullException(nameof(playlist));
            _slideTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(_slideDelayMs) };
            _slideTimer.Tick += SlideTimer_Tick;
        }

        /// <summary>
        /// Starts the slideshow timer.
        /// </summary>
        public void Start()
        {
            if (_isSlideshowRunning) return;

            _isSlideshowRunning = true;
            ResetMediaStartTime();
            _slideTimer.Start();
            SlideshowStarted?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Stops the slideshow timer.
        /// </summary>
        public void Stop()
        {
            if (!_isSlideshowRunning) return;

            _isSlideshowRunning = false;
            _slideTimer.Stop();
            SlideshowStopped?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>
        /// Navigates to the next item. Thread-safe and prevents race conditions.
        /// </summary>
        public bool NavigateNext()
        {
            lock (_transitionLock)
            {
                if (_isTransitioning) return false;
                _isTransitioning = true;
            }

            try
            {
                if (!_playlist.MoveNext())
                    return false;

                ResetMediaStartTime();
                NavigateToIndex?.Invoke(this, _playlist.CurrentIndex);
                return true;
            }
            finally
            {
                lock (_transitionLock)
                {
                    _isTransitioning = false;
                }
            }
        }

        /// <summary>
        /// Navigates to the previous item. Thread-safe and prevents race conditions.
        /// </summary>
        public bool NavigatePrevious()
        {
            lock (_transitionLock)
            {
                if (_isTransitioning) return false;
                _isTransitioning = true;
            }

            try
            {
                if (!_playlist.MovePrevious())
                    return false;

                ResetMediaStartTime();
                NavigateToIndex?.Invoke(this, _playlist.CurrentIndex);
                return true;
            }
            finally
            {
                lock (_transitionLock)
                {
                    _isTransitioning = false;
                }
            }
        }

        /// <summary>
        /// Navigates to a specific index. Thread-safe.
        /// </summary>
        public bool NavigateTo(int index)
        {
            lock (_transitionLock)
            {
                if (_isTransitioning) return false;
                _isTransitioning = true;
            }

            try
            {
                _playlist.SetIndex(index);
                ResetMediaStartTime();
                NavigateToIndex?.Invoke(this, _playlist.CurrentIndex);
                return true;
            }
            finally
            {
                lock (_transitionLock)
                {
                    _isTransitioning = false;
                }
            }
        }

        /// <summary>
        /// Called when media starts displaying. Resets timing and state.
        /// </summary>
        public void OnMediaDisplayed(MediaType mediaType)
        {
            _currentMediaType = mediaType;
            _videoEnded = false;
            ResetMediaStartTime();
        }

        /// <summary>
        /// Called when a video ends. Allows slideshow to advance.
        /// </summary>
        public void OnVideoEnded()
        {
            _videoEnded = true;
            // Auto-advance if slideshow is running
            if (_isSlideshowRunning)
            {
                // Small delay to let video fully stop
                _slideTimer.Dispatcher.BeginInvoke(new Action(() =>
                {
                    if (_isSlideshowRunning && _videoEnded)
                        NavigateNext();
                }), DispatcherPriority.Normal);
            }
        }

        /// <summary>
        /// Marks that a transition has completed. Called by the media display system.
        /// </summary>
        public void OnTransitionComplete()
        {
            lock (_transitionLock)
            {
                _isTransitioning = false;
            }
        }

        private void SlideTimer_Tick(object? sender, EventArgs e)
        {
            if (!_isSlideshowRunning) return;
            if (_playlist.Count == 0) return;

            // Check if enough time has passed
            var elapsedMs = (DateTime.UtcNow - _mediaStartTime).TotalMilliseconds;
            if (elapsedMs < _slideDelayMs)
                return;

            // Don't advance if video is still playing
            if (_currentMediaType == MediaType.Video && !_videoEnded)
                return;

            // Advance to next
            NavigateNext();
        }

        private void ResetMediaStartTime()
        {
            _mediaStartTime = DateTime.UtcNow;
        }
    }
}
