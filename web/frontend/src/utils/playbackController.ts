/**
 * Enterprise-Grade Playback Controller
 * 
 * Provides deterministic, re-entrancy-safe rules for slideshow advancement.
 * Ensures exactly one media item is active at a time and transitions occur
 * according to spec:
 * - Images: minimum display time (delay) enforced after load
 * - Videos: advance only on ended event (delay ignored)
 * - GIFs: play to completion or use configurable policy
 */

import { MediaType } from '../types/media';

export interface PlaybackState {
  mediaType: MediaType;
  delayMs: number;
  isLoaded: boolean;
  loadTimestamp?: number; // Timestamp when media finished loading
  isRetrying: boolean;
}

export interface PlaybackDecision {
  shouldAdvance: boolean;
  reason: string;
}

/**
 * Determines if an image should advance based on minimum display time.
 * Rule: Image must be visible for at least delayMs after loading.
 */
export function shouldAdvanceImage(
  state: PlaybackState,
  now: number
): PlaybackDecision {
  // Gate: Don't advance during retry
  if (state.isRetrying) {
    return {
      shouldAdvance: false,
      reason: 'retry_in_progress'
    };
  }

  // Gate: Don't advance if not loaded
  if (!state.isLoaded) {
    return {
      shouldAdvance: false,
      reason: 'not_loaded'
    };
  }

  // Gate: Don't advance if load timestamp not available
  if (!state.loadTimestamp) {
    return {
      shouldAdvance: false,
      reason: 'load_timestamp_missing'
    };
  }

  // Calculate elapsed time since load
  const elapsedSinceLoad = now - state.loadTimestamp;

  // Rule: Must display for at least delayMs
  if (elapsedSinceLoad < state.delayMs) {
    return {
      shouldAdvance: false,
      reason: `min_delay_not_met: ${elapsedSinceLoad}ms < ${state.delayMs}ms`
    };
  }

  // All conditions met - advance
  return {
    shouldAdvance: true,
    reason: `min_delay_met: ${elapsedSinceLoad}ms >= ${state.delayMs}ms`
  };
}

/**
 * Determines if a video should advance.
 * Rule: Videos NEVER advance based on delay - only on ended event.
 * This function should never be called for videos in timer context.
 * GIFs also follow this rule - they advance on completion event only.
 */
export function shouldAdvanceVideo(): PlaybackDecision {
  // Videos should never advance via timer - only on ended event
  return {
    shouldAdvance: false,
    reason: 'videos_advance_on_ended_only'
  };
}

/**
 * Determines if a GIF should advance.
 * Rule: Animated GIFs behave like videos - play to completion, ignore delay.
 * Completion is detected via onGifCompleted callback (when GIF animation completes).
 */
export function shouldAdvanceGif(
  state: PlaybackState,
  now: number,
  isCompleted?: boolean // True if GIF animation completed (detected via image events)
): PlaybackDecision {
  // Gate: Don't advance during retry
  if (state.isRetrying) {
    return {
      shouldAdvance: false,
      reason: 'retry_in_progress'
    };
  }

  // Gate: Don't advance if not loaded
  if (!state.isLoaded) {
    return {
      shouldAdvance: false,
      reason: 'not_loaded'
    };
  }

  // Animated GIFs should behave like videos - advance only on completion
  // If completion is detected, advance immediately
  if (isCompleted === true) {
    return {
      shouldAdvance: true,
      reason: 'gif_animation_completed'
    };
  }

  // If completion not yet detected, don't advance (wait for completion event)
  // This ensures GIFs play to completion, ignoring delay
  return {
    shouldAdvance: false,
    reason: 'gif_still_playing_waiting_for_completion'
  };
}

/**
 * Main decision function - routes to appropriate handler based on media type.
 */
export function shouldAdvance(
  state: PlaybackState,
  now: number,
  gifCompleted?: boolean
): PlaybackDecision {
  switch (state.mediaType) {
    case MediaType.Image:
      return shouldAdvanceImage(state, now);
    
    case MediaType.Video:
      return shouldAdvanceVideo();
    
    case MediaType.Gif:
      return shouldAdvanceGif(state, now, gifCompleted);
    
    default:
      return {
        shouldAdvance: false,
        reason: `unknown_media_type: ${state.mediaType}`
      };
  }
}

/**
 * Determines if a timer should run for the given media type.
 * Videos and GIFs don't need timers - they advance on ended/completion event only.
 * Animated GIFs should play to completion like videos.
 */
export function shouldRunTimer(mediaType: MediaType): boolean {
  // GIFs are treated like videos - they play to completion, no timer needed
  return mediaType !== MediaType.Video && mediaType !== MediaType.Gif;
}

/**
 * Calculates the next check interval for the timer.
 * For images/GIFs, check frequently (every 100ms) to catch min delay accurately.
 * This ensures we don't miss the exact moment when delay is met.
 */
export function getTimerCheckInterval(mediaType: MediaType): number {
  // Check every 100ms for accurate timing
  // This is more frequent than typical delay values, ensuring we catch
  // the exact moment when delay is met without significant overhead
  return 100;
}

