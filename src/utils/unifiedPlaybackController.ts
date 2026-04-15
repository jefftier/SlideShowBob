/**
 * Unified Playback Controller
 * 
 * Single source of truth for slideshow advancement decisions.
 * Implements deterministic, re-entrancy-safe rules matching the spec:
 * - Images: minimum display time after load
 * - Videos: advance only on ended event
 * - GIFs: play exactly once, then advance
 * 
 * This controller ensures exactly ONE active timer/event handler per media item.
 */

import { MediaType } from '../types/media';

export type MediaTypeCategory = 'image' | 'gif' | 'video';

export interface PlaybackState {
  mediaType: MediaType;
  delayMs: number;
  isLoaded: boolean;
  loadTimestamp?: number; // When media finished loading (for minimum display time)
  isRetrying: boolean;
  isPlaying: boolean; // Slideshow is playing (not paused)
}

export interface AdvanceCondition {
  type: 'timer' | 'event';
  description: string;
}

export interface PlaybackDecision {
  shouldAdvance: boolean;
  reason: string;
  condition?: AdvanceCondition;
}

/**
 * Determines the media type category for routing decisions.
 */
export function getMediaCategory(mediaType: MediaType): MediaTypeCategory {
  switch (mediaType) {
    case MediaType.Image:
      return 'image';
    case MediaType.Gif:
      return 'gif';
    case MediaType.Video:
      return 'video';
    default:
      return 'image'; // Fallback
  }
}

/**
 * Determines if an image should advance based on minimum display time.
 * Rule: Image must be visible for at least delayMs AFTER it loads.
 */
export function shouldAdvanceImage(
  state: PlaybackState,
  now: number
): PlaybackDecision {
  // Gate: Don't advance during retry
  if (state.isRetrying) {
    return {
      shouldAdvance: false,
      reason: 'retry_in_progress',
      condition: { type: 'timer', description: 'Waiting for retry to complete' }
    };
  }

  // Gate: Don't advance if not playing
  if (!state.isPlaying) {
    return {
      shouldAdvance: false,
      reason: 'slideshow_paused',
      condition: { type: 'timer', description: 'Slideshow is paused' }
    };
  }

  // Gate: Don't advance if not loaded
  if (!state.isLoaded) {
    return {
      shouldAdvance: false,
      reason: 'not_loaded',
      condition: { type: 'timer', description: 'Waiting for media to load' }
    };
  }

  // Gate: Don't advance if load timestamp not available
  if (!state.loadTimestamp) {
    return {
      shouldAdvance: false,
      reason: 'load_timestamp_missing',
      condition: { type: 'timer', description: 'Load timestamp not available' }
    };
  }

  // Calculate elapsed time since load
  const elapsedSinceLoad = now - state.loadTimestamp;

  // Rule: Must display for at least delayMs
  if (elapsedSinceLoad < state.delayMs) {
    return {
      shouldAdvance: false,
      reason: `min_delay_not_met: ${elapsedSinceLoad}ms < ${state.delayMs}ms`,
      condition: {
        type: 'timer',
        description: `Minimum display time not met (${elapsedSinceLoad}ms / ${state.delayMs}ms)`
      }
    };
  }

  // All conditions met - advance
  return {
    shouldAdvance: true,
    reason: `min_delay_met: ${elapsedSinceLoad}ms >= ${state.delayMs}ms`,
    condition: {
      type: 'timer',
      description: `Minimum display time met (${elapsedSinceLoad}ms >= ${state.delayMs}ms)`
    }
  };
}

/**
 * Determines if a video should advance.
 * Rule: Videos NEVER advance based on delay - only on ended event.
 * This function should never return true in timer context.
 */
export function shouldAdvanceVideo(): PlaybackDecision {
  // Videos should never advance via timer - only on ended event
  return {
    shouldAdvance: false,
    reason: 'videos_advance_on_ended_only',
    condition: {
      type: 'event',
      description: 'Videos advance only when ended event fires'
    }
  };
}

/**
 * Determines if a GIF should advance.
 * Rule: 
 * - Animated GIFs: play exactly ONCE, then advance on completion event (no timer)
 * - Static GIFs: use configured delay like images (use timer)
 * 
 * @param state - Playback state (includes gifIsAnimated if available)
 */
export function shouldAdvanceGif(
  state: PlaybackState & { gifIsAnimated?: boolean }
): PlaybackDecision {
  // Static GIFs (single frame) should be treated like images - use configured delay
  if (state.gifIsAnimated === false) {
    return shouldAdvanceImage(state, Date.now());
  }
  
  // Animated GIFs should never advance via timer - only on completion event
  return {
    shouldAdvance: false,
    reason: 'animated_gifs_advance_on_completion_only',
    condition: {
      type: 'event',
      description: 'Animated GIFs advance only when completion event fires (after one cycle)'
    }
  };
}

/**
 * Main decision function - routes to appropriate handler based on media type.
 * This is the SINGLE source of truth for advancement decisions.
 */
export function shouldAdvance(
  state: PlaybackState & { gifIsAnimated?: boolean },
  now: number
): PlaybackDecision {
  switch (state.mediaType) {
    case MediaType.Image:
      return shouldAdvanceImage(state, now);
    
    case MediaType.Video:
      return shouldAdvanceVideo();
    
    case MediaType.Gif:
      return shouldAdvanceGif(state);
    
    default:
      return {
        shouldAdvance: false,
        reason: `unknown_media_type: ${state.mediaType}`,
        condition: {
          type: 'timer',
          description: `Unknown media type: ${state.mediaType}`
        }
      };
  }
}

/**
 * Determines if a timer should run for the given media type.
 * Images: YES (need timer for minimum display time)
 * Videos: NO (advance on ended event only)
 * Static GIFs: YES (treat like images, use configured delay)
 * Animated GIFs: NO (advance on completion event only)
 * 
 * @param mediaType - Media type
 * @param gifIsAnimated - Optional: whether GIF is animated (if mediaType is Gif)
 */
export function shouldRunTimer(mediaType: MediaType, gifIsAnimated?: boolean): boolean {
  if (mediaType === MediaType.Image) {
    return true;
  }
  if (mediaType === MediaType.Gif) {
    // Static GIFs (single frame) should use timer like images
    // Animated GIFs should not use timer
    return gifIsAnimated === false;
  }
  return false; // Videos don't use timer
}

/**
 * Calculates the timer check interval.
 * Uses frequent checks (100ms) to catch the exact moment when delay is met.
 */
export function getTimerCheckInterval(): number {
  return 100; // Check every 100ms for accurate timing
}

/**
 * Validates that a media item is still current before advancing.
 * Prevents race conditions where timeout/event fires after media changed.
 */
export function isMediaStillCurrent(
  currentMediaId: string | null,
  expectedMediaId: string
): boolean {
  return currentMediaId === expectedMediaId;
}

