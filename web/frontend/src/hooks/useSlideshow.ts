import { useEffect, useRef, useCallback } from 'react';
import { MediaItem } from '../types/media';

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
  shouldGateAdvancement
}: UseSlideshowOptions) {
  // Single timer reference - only ONE timer should exist at any time
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoEndedRef = useRef(false);
  const currentMediaTypeRef = useRef<string | null>(null);
  
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
    // Re-entrancy guard: prevent concurrent execution
    if (isAdvancingRef.current) {
      const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
      if (isDev) {
        console.warn('[useSlideshow] Advance called while already advancing - ignoring');
      }
      return;
    }
    
    // Gate check: prevent advancement during retry or other blocking conditions
    if (shouldGateAdvancement && shouldGateAdvancement()) {
      const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
      if (isDev) {
        console.log('[useSlideshow] Advancement gated by shouldGateAdvancement');
      }
      return;
    }
    
    // Guard: ensure we have a valid playlist
    if (playlist.length === 0) return;
    
    isAdvancingRef.current = true;
    try {
      const nextIndex = (currentIndex + 1) % playlist.length;
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
   */
  const startSlideshow = useCallback(() => {
    // CRITICAL: Always clear existing timer first to prevent stacking
    clearTimer();
    
    if (playlist.length === 0 || slideDelayMs <= 0) return;
    
    const tick = () => {
      // Only advance if video has ended or current item is not a video
      if (videoEndedRef.current || currentMediaTypeRef.current !== 'Video') {
        advance();
      }
    };

    timerRef.current = setInterval(tick, slideDelayMs);
    activeTimerCountRef.current = 1;
    
    const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
    if (isDev) {
      console.log('[useSlideshow] Timer started. Active timers:', activeTimerCountRef.current);
    }
  }, [playlist, slideDelayMs, advance, clearTimer]);

  /**
   * Stop slideshow - clears the timer
   */
  const stopSlideshow = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  // Effect: Manage timer based on isPlaying state
  // Clears timer on pause, delay change, playlist change, or unmount
  useEffect(() => {
    if (isPlaying) {
      startSlideshow();
    } else {
      stopSlideshow();
    }
    // Cleanup: ALWAYS clear timer on unmount or dependency change
    return () => {
      stopSlideshow();
    };
  }, [isPlaying, startSlideshow, stopSlideshow]);

  // Effect: Restart timer when delay changes (if playing)
  // This ensures the timer uses the new delay immediately
  useEffect(() => {
    if (isPlaying && playlist.length > 0 && slideDelayMs > 0) {
      // Clear existing timer and restart with new delay
      clearTimer();
      startSlideshow();
    }
    return () => {
      // Cleanup on delay change
      clearTimer();
    };
  }, [slideDelayMs, isPlaying, playlist.length, startSlideshow, clearTimer]);

  // Effect: Clear timer when playlist changes (if playing)
  // Prevents timer from advancing with stale playlist reference
  useEffect(() => {
    if (isPlaying) {
      // Restart timer with new playlist
      clearTimer();
      startSlideshow();
    }
    return () => {
      clearTimer();
    };
  }, [playlist.length, isPlaying, startSlideshow, clearTimer]);

  // Effect: Update media type ref when current media changes
  useEffect(() => {
    if (playlist && currentIndex >= 0 && currentIndex < playlist.length && playlist[currentIndex]) {
      currentMediaTypeRef.current = playlist[currentIndex].type;
      videoEndedRef.current = false;
    }
  }, [playlist, currentIndex]);

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
  }, []);

  return {
    navigateNext,
    navigatePrevious,
    startSlideshow,
    stopSlideshow,
    onVideoEnded
  };
}

