using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;

namespace SlideShowBob
{
    /// <summary>
    /// Provides smooth, Windows 11-style scrolling for ScrollViewer controls.
    /// Uses smooth animations with easing for natural, fluid scrolling behavior.
    /// </summary>
    public static class SmoothScrollHelper
    {
        private const double ScrollSpeedMultiplier = 0.4; // Adjust for scroll sensitivity (lower = smoother)
        private const int AnimationSteps = 8; // Number of steps for smooth scrolling
        private const int AnimationIntervalMs = 16; // ~60fps animation steps

        // Track active animations per ScrollViewer to cancel previous ones
        private static readonly Dictionary<ScrollViewer, DispatcherTimer> _activeTimers = new Dictionary<ScrollViewer, DispatcherTimer>();

        /// <summary>
        /// Handles mouse wheel events with smooth scrolling, respecting Windows 11 natural scrolling behavior.
        /// Only scrolls if the content is actually scrollable and the event isn't over UI elements.
        /// </summary>
        /// <param name="scrollViewer">The ScrollViewer to scroll</param>
        /// <param name="e">The mouse wheel event arguments</param>
        /// <param name="shouldHandle">Optional function to determine if the event should be handled (e.g., check if over toolbar)</param>
        /// <returns>True if the event was handled, false otherwise</returns>
        public static bool HandleMouseWheel(ScrollViewer scrollViewer, MouseWheelEventArgs e, Func<bool>? shouldHandle = null)
        {
            if (scrollViewer == null || e == null)
                return false;

            // Check if we should handle this event (e.g., not over toolbar/menu)
            if (shouldHandle != null && !shouldHandle())
                return false;

            // Determine scroll direction and amount
            double delta = e.Delta;
            bool scrollVertically = false;
            bool scrollHorizontally = false;
            double scrollAmount = 0;

            // Check if vertical scrolling is needed
            if (scrollViewer.ScrollableHeight > 0)
            {
                scrollVertically = true;
                scrollAmount = delta * ScrollSpeedMultiplier;
            }
            // Check if horizontal scrolling is needed (only if vertical isn't)
            else if (scrollViewer.ScrollableWidth > 0)
            {
                scrollHorizontally = true;
                scrollAmount = delta * ScrollSpeedMultiplier;
            }
            else
            {
                // Content fits in viewport, no scrolling needed
                return false;
            }

            // Perform smooth scrolling
            if (scrollVertically)
            {
                SmoothScrollVertical(scrollViewer, scrollAmount);
            }
            else if (scrollHorizontally)
            {
                SmoothScrollHorizontal(scrollViewer, scrollAmount);
            }

            e.Handled = true;
            return true;
        }

        /// <summary>
        /// Smoothly scrolls the ScrollViewer vertically using a smooth animation.
        /// Uses a timer-based approach since WPF ScrollViewer doesn't support direct animation of offsets.
        /// </summary>
        private static void SmoothScrollVertical(ScrollViewer scrollViewer, double delta)
        {
            double startOffset = scrollViewer.VerticalOffset;
            double targetOffset = startOffset - delta; // Negative delta = scroll down (natural scrolling)
            
            // Clamp to valid range
            targetOffset = Math.Max(0, Math.Min(targetOffset, scrollViewer.ScrollableHeight));

            // Only animate if there's a meaningful change
            if (Math.Abs(targetOffset - startOffset) < 0.1)
            {
                scrollViewer.ScrollToVerticalOffset(targetOffset);
                return;
            }

            // Use smooth animation with easing
            AnimateScroll(scrollViewer, startOffset, targetOffset, true);
        }

        /// <summary>
        /// Smoothly scrolls the ScrollViewer horizontally using a smooth animation.
        /// </summary>
        private static void SmoothScrollHorizontal(ScrollViewer scrollViewer, double delta)
        {
            double startOffset = scrollViewer.HorizontalOffset;
            double targetOffset = startOffset - delta; // Negative delta = scroll right (natural scrolling)
            
            // Clamp to valid range
            targetOffset = Math.Max(0, Math.Min(targetOffset, scrollViewer.ScrollableWidth));

            // Only animate if there's a meaningful change
            if (Math.Abs(targetOffset - startOffset) < 0.1)
            {
                scrollViewer.ScrollToHorizontalOffset(targetOffset);
                return;
            }

            // Use smooth animation with easing
            AnimateScroll(scrollViewer, startOffset, targetOffset, false);
        }

        /// <summary>
        /// Animates scrolling using a timer-based approach with easing for smooth motion.
        /// Cancels any existing animation for the same ScrollViewer.
        /// </summary>
        private static void AnimateScroll(ScrollViewer scrollViewer, double startOffset, double targetOffset, bool isVertical)
        {
            // Cancel any existing animation for this ScrollViewer
            if (_activeTimers.TryGetValue(scrollViewer, out var existingTimer))
            {
                existingTimer.Stop();
                _activeTimers.Remove(scrollViewer);
            }

            double totalDistance = targetOffset - startOffset;
            int step = 0;

            var timer = new DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(AnimationIntervalMs)
            };

            _activeTimers[scrollViewer] = timer;

            timer.Tick += (s, e) =>
            {
                step++;
                double progress = step / (double)AnimationSteps;

                // Apply easing function (ease-out cubic for smooth deceleration)
                double easedProgress = 1.0 - Math.Pow(1.0 - progress, 3.0);

                // Clamp progress to [0, 1]
                easedProgress = Math.Max(0, Math.Min(1, easedProgress));

                double currentOffset = startOffset + (totalDistance * easedProgress);

                // Apply the scroll
                if (isVertical)
                {
                    scrollViewer.ScrollToVerticalOffset(currentOffset);
                }
                else
                {
                    scrollViewer.ScrollToHorizontalOffset(currentOffset);
                }

                // Stop when animation is complete
                if (step >= AnimationSteps)
                {
                    timer.Stop();
                    _activeTimers.Remove(scrollViewer);
                }
            };

            timer.Start();
        }
    }
}

