import { useEffect, useRef, useCallback } from 'react';
import { MediaItem, MediaType } from '../types/media';
import { 
  shouldAdvance, 
  shouldRunTimer, 
  getTimerCheckInterval,
  type PlaybackState
} from '../utils/playbackController';

interface UseSlideshowOptions {
  playlist: MediaItem[];
  currentIndex: number;
  slideDelayMs: number;
  isPlaying: boolean;
  onNavigate: (index: number) => void;
  /**
   * Optional callback to check if advancement should be gated (e.g., during retry).
   * Return true to prevent advancement, false to allow it.
   */
  shouldGateAdvancement?: () => boolean;
  /**
   * Current media load state - tracks when media has finished loading.
   * This is critical for enforcing minimum display time for images.
   */
  mediaLoadState?: {
    isLoaded: boolean;
    loadTimestamp?: number;
  };
}

/**
 * Timer discipline: ensures only ONE active timer controls slideshow advancement.
 * Prevents stacked timers and race conditions when toggling play/pause, changing delay,
 * switching media, or during retry operations.
 */
export function useSlideshow({
  playlist,
  currentIndex,
  slideDelayMs,
  isPlaying,
  onNavigate,
  shouldGateAdvancement,
  mediaLoadState,
}: UseSlideshowOptions) {
  // Single timer reference - only ONE timer should exist at any time
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoEndedRef = useRef(false);
  const currentMediaTypeRef = useRef<MediaType | null>(null);
  const gifCompletedRef = useRef(false);
  
  // Re-entrancy guard: prevents double-firing of advance operations
  const isAdvancingRef = useRef(false);
  
  // Dev-only: track timer count for debugging
  const activeTimerCountRef = useRef(0);
  
  // Expose timer count to window for debugging (dev-only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
      if (isDev) {
        (window as any).__getSlideshowTimerCount = () => activeTimerCountRef.current;
      }
    }
  }, []);

  /**
   * Deterministic advancement function - the ONLY place index changes happen.
   * Guards against re-entrancy and gating conditions.
   */
  const advance = useCallback(() => {
    const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
    
    // Re-entrancy guard: prevent concurrent execution
    if (isAdvancingRef.current) {
      if (isDev) {
        console.warn('[useSlideshow] Advance called while already advancing - ignoring', {
          currentIndex,
          playlistLength: playlist.length
        });
      }
      return;
    }
    
    // Gate check: prevent advancement during retry or other blocking conditions
    if (shouldGateAdvancement && shouldGateAdvancement()) {
      if (isDev) {
        console.log('[useSlideshow] Advancement gated by shouldGateAdvancement', {
          currentIndex,
          playlistLength: playlist.length
        });
      }
      return;
    }
    
    // Guard: ensure we have a valid playlist
    if (playlist.length === 0) {
      if (isDev) {
        console.warn('[useSlideshow] Cannot advance - playlist is empty');
      }
      return;
    }
    
    isAdvancingRef.current = true;
    try {
      const nextIndex = (currentIndex + 1) % playlist.length;
      if (isDev) {
        console.log('[useSlideshow] Advancing slideshow', {
          fromIndex: currentIndex,
          toIndex: nextIndex,
          fromMedia: playlist[currentIndex]?.fileName,
          toMedia: playlist[nextIndex]?.fileName
        });
      }
      onNavigate(nextIndex);
    } finally {
      // Reset guard after a brief delay to allow state updates to complete
      setTimeout(() => {
        isAdvancingRef.current = false;
      }, 50);
    }
  }, [playlist, currentIndex, onNavigate, shouldGateAdvancement]);

  /**
   * Navigate to next item - uses deterministic advance() function
   */
  const navigateNext = useCallback(() => {
    // Clear any active slideshow timer when manually navigating
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      activeTimerCountRef.current = Math.max(0, activeTimerCountRef.current - 1);
    }
    advance();
  }, [advance]);

  /**
   * Navigate to previous item
   */
  const navigatePrevious = useCallback(() => {
    // Clear any active slideshow timer when manually navigating
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      activeTimerCountRef.current = Math.max(0, activeTimerCountRef.current - 1);
    }
    
    if (playlist.length === 0) return;
    const prevIndex = currentIndex <= 0 ? playlist.length - 1 : currentIndex - 1;
    onNavigate(prevIndex);
  }, [playlist, currentIndex, onNavigate]);

  /**
   * Clear the slideshow timer - ALWAYS call this before creating a new timer
   */
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      activeTimerCountRef.current = Math.max(0, activeTimerCountRef.current - 1);
      
      const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
      if (isDev) {
        console.log('[useSlideshow] Timer cleared. Active timers:', activeTimerCountRef.current);
      }
    }
  }, []);

  /**
   * Start slideshow with a single timer
   * ALWAYS clears existing timer before creating a new one
   * Only runs timer for images - videos and GIFs advance on ended/completion event only
   */
  const startSlideshow = useCallback(() => {
    // CRITICAL: Always clear existing timer first to prevent stacking
    clearTimer();
    
    if (playlist.length === 0 || slideDelayMs <= 0) return;
    
    const currentMedia = playlist[currentIndex];
    if (!currentMedia) return;
    
    // Don't run timer for videos or GIFs - they advance on ended/completion event only
    if (!shouldRunTimer(currentMedia.type)) {
      const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
      if (isDev) {
        const mediaTypeName = currentMedia.type === MediaType.Video ? 'video' : 'GIF';
        console.log(`[useSlideshow] Timer not needed for ${mediaTypeName} - will advance on ${currentMedia.type === MediaType.Video ? 'ended' : 'completion'} event`);
      }
      return;
    }
    
    // For images, use playback controller to determine when to advance
    // NOTE: GIFs should NEVER reach here - they don't use timers (shouldRunTimer returns false)
    const tick = () => {
      const now = Date.now();
      const playbackState: PlaybackState = {
        mediaType: currentMedia.type,
        delayMs: slideDelayMs,
        isLoaded: mediaLoadState?.isLoaded ?? false,
        loadTimestamp: mediaLoadState?.loadTimestamp,
        isRetrying: shouldGateAdvancement?.() ?? false
      };
      
      // GIFs should never reach here (timer doesn't run for GIFs)
      // But if they do somehow, don't advance (wait for onGifCompleted)
      if (currentMedia.type === MediaType.Gif) {
        const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
        if (isDev) {
          console.warn('[useSlideshow] Timer tick called for GIF - this should not happen');
        }
        return;
      }
      
      const decision = shouldAdvance(playbackState, now);
      
      if (decision.shouldAdvance) {
        const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
        if (isDev) {
          console.log('[useSlideshow] Advance decision:', decision.reason);
        }
        advance();
      }
    };

    // Use frequent checks (100ms) to catch exact moment when delay is met
    // NOTE: This should ONLY run for images - GIFs and videos should never reach here
    if (currentMedia.type === MediaType.Gif || currentMedia.type === MediaType.Video) {
      const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
      if (isDev) {
        console.error(`[useSlideshow] BUG: Attempted to start timer for ${currentMedia.type} - this should not happen!`);
      }
      return; // Safety: Don't start timer for GIFs/videos
    }
    
    const checkInterval = getTimerCheckInterval(currentMedia.type);
    timerRef.current = setInterval(tick, checkInterval);
    activeTimerCountRef.current = 1;
    
    const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
    if (isDev) {
      console.log('[useSlideshow] Timer started for image. Active timers:', activeTimerCountRef.current, 'Check interval:', checkInterval);
    }
  }, [playlist, currentIndex, slideDelayMs, advance, clearTimer, mediaLoadState, shouldGateAdvancement]);

  /**
   * Stop slideshow - clears the timer
   */
  const stopSlideshow = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  // Effect: Manage timer based on isPlaying state
  // Clears timer on pause, starts timer on play (only for images)
  // NOTE: Only starts timer for images - GIFs and videos don't use timers
  // Other effects handle timer restarts for delay/playlist/media changes
  useEffect(() => {
    if (isPlaying) {
      const currentMedia = playlist[currentIndex];
      // Only start timer for images (GIFs and videos don't use timers)
      if (currentMedia && shouldRunTimer(currentMedia.type)) {
        startSlideshow();
      } else {
        // For GIFs/videos, just ensure timer is cleared
        stopSlideshow();
      }
    } else {
      stopSlideshow();
    }
    // Cleanup: ALWAYS clear timer on unmount or dependency change
    return () => {
      stopSlideshow();
    };
    // Only depend on isPlaying - other changes are handled by specific effects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Effect: Restart timer when delay changes (if playing)
  // This ensures the timer uses the new delay immediately
  // NOTE: Only for images - GIFs and videos don't use timers
  useEffect(() => {
    if (isPlaying && playlist.length > 0 && slideDelayMs > 0) {
      const currentMedia = playlist[currentIndex];
      // Only restart timer for images (GIFs and videos don't use timers)
      if (currentMedia && shouldRunTimer(currentMedia.type)) {
        clearTimer();
        startSlideshow();
      } else {
        // For GIFs/videos, just clear any existing timer
        clearTimer();
      }
    }
    return () => {
      // Cleanup on delay change
      clearTimer();
    };
  }, [slideDelayMs, isPlaying, playlist, currentIndex, startSlideshow, clearTimer]);

  // Effect: Clear timer when playlist changes (if playing)
  // Prevents timer from advancing with stale playlist reference
  // NOTE: Only for images - GIFs and videos don't use timers
  useEffect(() => {
    if (isPlaying) {
      const currentMedia = playlist[currentIndex];
      // Only restart timer for images (GIFs and videos don't use timers)
      if (currentMedia && shouldRunTimer(currentMedia.type)) {
        clearTimer();
        startSlideshow();
      } else {
        // For GIFs/videos, just clear any existing timer
        clearTimer();
      }
    }
    return () => {
      clearTimer();
    };
  }, [playlist.length, isPlaying, playlist, currentIndex, startSlideshow, clearTimer]);

  // Effect: Update media type ref when current media changes
  useEffect(() => {
    if (playlist && currentIndex >= 0 && currentIndex < playlist.length && playlist[currentIndex]) {
      const newMediaType = playlist[currentIndex].type;
      currentMediaTypeRef.current = newMediaType;
      videoEndedRef.current = false;
      gifCompletedRef.current = false;
      
      // Clear timer when media changes (always)
      clearTimer();
      
      // Only restart timer for images (GIFs and videos don't use timers)
      if (isPlaying && shouldRunTimer(newMediaType)) {
        // Small delay to ensure mediaLoadState is updated
        const timeoutId = setTimeout(() => {
          startSlideshow();
        }, 50);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [playlist, currentIndex, isPlaying, clearTimer, startSlideshow]);

  // Effect: Clear timer when current index changes significantly (e.g., manual navigation)
  // This prevents timer from continuing with stale index
  useEffect(() => {
    // Note: We don't clear on every index change to avoid disrupting the timer
    // The advance() function uses the latest currentIndex via closure
    // This effect mainly ensures videoEndedRef is reset
    videoEndedRef.current = false;
  }, [currentIndex]);

  // Cleanup on unmount: ensure no timers remain
  useEffect(() => {
    return () => {
      clearTimer();
      isAdvancingRef.current = false;
    };
  }, [clearTimer]);

  const onVideoEnded = useCallback(() => {
    videoEndedRef.current = true;
    // Immediately advance to next item when video ends
    // Don't wait for timer - videos should play to completion and then advance
    // No delay needed - ended event is reliable
    if (isPlaying) {
      advance();
    }
  }, [isPlaying, advance]);
  
  /**
   * Callback to notify when GIF animation completes.
   * GIFs behave like videos - they advance immediately on completion, ignoring delay.
   */
  const onGifCompleted = useCallback(() => {
    const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
    if (isDev) {
      console.log('[useSlideshow] onGifCompleted called', { 
        isPlaying, 
        currentIndex,
        playlistLength: playlist.length,
        currentMedia: playlist[currentIndex]?.fileName
      });
    }
    gifCompletedRef.current = true;
    // GIFs behave like videos - advance immediately on completion
    if (isPlaying) {
      if (isDev) {
        console.log('[useSlideshow] Calling advance() for GIF completion');
      }
      advance();
    } else {
      if (isDev) {
        console.log('[useSlideshow] Not advancing - slideshow not playing');
      }
    }
  }, [isPlaying, advance, currentIndex, playlist]);

  // Effect: Restart timer when media load state changes (for images only)
  // GIFs don't use timers - they advance via onGifCompleted callback
  // This ensures timer starts counting from when media actually loads
  useEffect(() => {
    if (isPlaying && mediaLoadState?.isLoaded) {
      const currentMedia = playlist[currentIndex];
      if (currentMedia && shouldRunTimer(currentMedia.type)) {
        // Restart timer now that media is loaded
        clearTimer();
        // Small delay to ensure state is stable
        const timeoutId = setTimeout(() => {
          startSlideshow();
        }, 50);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [mediaLoadState?.isLoaded, mediaLoadState?.loadTimestamp, isPlaying, playlist, currentIndex, clearTimer, startSlideshow]);

  return {
    navigateNext,
    navigatePrevious,
    startSlideshow,
    stopSlideshow,
    onVideoEnded,
    onGifCompleted
  };
}

