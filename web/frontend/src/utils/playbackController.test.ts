/**
 * Unit tests for playback controller - deterministic playback rules
 */

import { describe, it, expect } from 'vitest';
import { MediaType } from '../types/media';
import {
  shouldAdvanceImage,
  shouldAdvanceVideo,
  shouldAdvanceGif,
  shouldAdvance,
  shouldRunTimer,
  getTimerCheckInterval,
  type PlaybackState,
} from './playbackController';

describe('playbackController', () => {
  describe('shouldAdvanceImage', () => {
    it('should not advance if not loaded', () => {
      const state: PlaybackState = {
        mediaType: MediaType.Image,
        delayMs: 4000,
        isLoaded: false,
        isRetrying: false
      };
      const decision = shouldAdvanceImage(state, Date.now());
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toBe('not_loaded');
    });

    it('should not advance if load timestamp missing', () => {
      const state: PlaybackState = {
        mediaType: MediaType.Image,
        delayMs: 4000,
        isLoaded: true,
        isRetrying: false
      };
      const decision = shouldAdvanceImage(state, Date.now());
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toBe('load_timestamp_missing');
    });

    it('should not advance if retrying', () => {
      const now = Date.now();
      const state: PlaybackState = {
        mediaType: MediaType.Image,
        delayMs: 4000,
        isLoaded: true,
        loadTimestamp: now - 5000, // 5 seconds ago
        isRetrying: true
      };
      const decision = shouldAdvanceImage(state, now);
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toBe('retry_in_progress');
    });

    it('should not advance if minimum delay not met', () => {
      const now = Date.now();
      const state: PlaybackState = {
        mediaType: MediaType.Image,
        delayMs: 4000,
        isLoaded: true,
        loadTimestamp: now - 2000, // Only 2 seconds ago
        isRetrying: false
      };
      const decision = shouldAdvanceImage(state, now);
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toContain('min_delay_not_met');
    });

    it('should advance when minimum delay is met', () => {
      const now = Date.now();
      const state: PlaybackState = {
        mediaType: MediaType.Image,
        delayMs: 4000,
        isLoaded: true,
        loadTimestamp: now - 4000, // Exactly 4 seconds ago
        isRetrying: false
      };
      const decision = shouldAdvanceImage(state, now);
      expect(decision.shouldAdvance).toBe(true);
      expect(decision.reason).toContain('min_delay_met');
    });

    it('should advance when minimum delay is exceeded', () => {
      const now = Date.now();
      const state: PlaybackState = {
        mediaType: MediaType.Image,
        delayMs: 4000,
        isLoaded: true,
        loadTimestamp: now - 5000, // 5 seconds ago (exceeds delay)
        isRetrying: false
      };
      const decision = shouldAdvanceImage(state, now);
      expect(decision.shouldAdvance).toBe(true);
      expect(decision.reason).toContain('min_delay_met');
    });
  });

  describe('shouldAdvanceVideo', () => {
    it('should never advance via timer', () => {
      const decision = shouldAdvanceVideo();
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toBe('videos_advance_on_ended_only');
    });
  });

  describe('shouldAdvanceGif', () => {
    it('should not advance if not loaded', () => {
      const state: PlaybackState = {
        mediaType: MediaType.Gif,
        delayMs: 4000,
        isLoaded: false,
        isRetrying: false
      };
      const decision = shouldAdvanceGif(state, Date.now());
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toBe('not_loaded');
    });

    it('should not advance if retrying', () => {
      const now = Date.now();
      const state: PlaybackState = {
        mediaType: MediaType.Gif,
        delayMs: 4000,
        isLoaded: true,
        loadTimestamp: now - 5000,
        isRetrying: true
      };
      const decision = shouldAdvanceGif(state, now);
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toBe('retry_in_progress');
    });

    describe('GIF behavior (like videos)', () => {
      it('should advance when GIF animation completes', () => {
        const now = Date.now();
        const state: PlaybackState = {
          mediaType: MediaType.Gif,
          delayMs: 4000,
          isLoaded: true,
          loadTimestamp: now,
          isRetrying: false
        };
        const decision = shouldAdvanceGif(state, now, true);
        expect(decision.shouldAdvance).toBe(true);
        expect(decision.reason).toBe('gif_animation_completed');
      });

      it('should not advance if GIF still playing (waiting for completion)', () => {
        const now = Date.now();
        const state: PlaybackState = {
          mediaType: MediaType.Gif,
          delayMs: 4000,
          isLoaded: true,
          loadTimestamp: now,
          isRetrying: false
        };
        const decision = shouldAdvanceGif(state, now, false);
        expect(decision.shouldAdvance).toBe(false);
        expect(decision.reason).toBe('gif_still_playing_waiting_for_completion');
      });

      it('should ignore delay - only advances on completion', () => {
        const now = Date.now();
        const state: PlaybackState = {
          mediaType: MediaType.Gif,
          delayMs: 1000, // Short delay
          isLoaded: true,
          loadTimestamp: now - 5000, // Delay exceeded
          isRetrying: false
        };
        // Even though delay is exceeded, should not advance without completion
        const decision = shouldAdvanceGif(state, now, false);
        expect(decision.shouldAdvance).toBe(false);
        expect(decision.reason).toBe('gif_still_playing_waiting_for_completion');
      });
    });
  });

  describe('shouldAdvance (main router)', () => {
    it('should route to shouldAdvanceImage for images', () => {
      const now = Date.now();
      const state: PlaybackState = {
        mediaType: MediaType.Image,
        delayMs: 4000,
        isLoaded: true,
        loadTimestamp: now - 4000,
        isRetrying: false
      };
      const decision = shouldAdvance(state, now);
      expect(decision.shouldAdvance).toBe(true);
    });

    it('should route to shouldAdvanceVideo for videos', () => {
      const state: PlaybackState = {
        mediaType: MediaType.Video,
        delayMs: 4000,
        isLoaded: true,
        isRetrying: false
      };
      const decision = shouldAdvance(state, Date.now());
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toBe('videos_advance_on_ended_only');
    });

    it('should route to shouldAdvanceGif for GIFs', () => {
      const now = Date.now();
      const state: PlaybackState = {
        mediaType: MediaType.Gif,
        delayMs: 4000,
        isLoaded: true,
        loadTimestamp: now - 4000,
        isRetrying: false
      };
      // GIFs only advance on completion
      const decision = shouldAdvance(state, now, true); // Completion detected
      expect(decision.shouldAdvance).toBe(true);
      expect(decision.reason).toBe('gif_animation_completed');
    });
  });

  describe('shouldRunTimer', () => {
    it('should return true for images', () => {
      expect(shouldRunTimer(MediaType.Image)).toBe(true);
    });

    it('should return false for GIFs (they behave like videos)', () => {
      expect(shouldRunTimer(MediaType.Gif)).toBe(false);
    });

    it('should return false for videos', () => {
      expect(shouldRunTimer(MediaType.Video)).toBe(false);
    });
  });

  describe('getTimerCheckInterval', () => {
    it('should return 100ms for all media types', () => {
      expect(getTimerCheckInterval(MediaType.Image)).toBe(100);
      expect(getTimerCheckInterval(MediaType.Gif)).toBe(100);
      expect(getTimerCheckInterval(MediaType.Video)).toBe(100);
    });
  });

  describe('Edge cases and race conditions', () => {
    it('should handle rapid state changes without double-advance', () => {
      const now = Date.now();
      const state: PlaybackState = {
        mediaType: MediaType.Image,
        delayMs: 4000,
        isLoaded: true,
        loadTimestamp: now - 4000,
        isRetrying: false
      };
      
      // Multiple rapid calls should all return same result
      const decision1 = shouldAdvanceImage(state, now);
      const decision2 = shouldAdvanceImage(state, now);
      const decision3 = shouldAdvanceImage(state, now);
      
      expect(decision1.shouldAdvance).toBe(true);
      expect(decision2.shouldAdvance).toBe(true);
      expect(decision3.shouldAdvance).toBe(true);
    });

    it('should handle retry gating correctly', () => {
      const now = Date.now();
      const state: PlaybackState = {
        mediaType: MediaType.Image,
        delayMs: 4000,
        isLoaded: true,
        loadTimestamp: now - 5000, // Delay exceeded
        isRetrying: true // But retrying
      };
      const decision = shouldAdvanceImage(state, now);
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toBe('retry_in_progress');
    });

    it('should handle video with delay longer than duration', () => {
      // Video with 8s duration, 4s delay → should transition at ~8s (not 4s)
      const state: PlaybackState = {
        mediaType: MediaType.Video,
        delayMs: 4000, // Delay is ignored for videos
        isLoaded: true,
        isRetrying: false
      };
      const decision = shouldAdvance(state, Date.now());
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toBe('videos_advance_on_ended_only');
    });

    it('should handle video with delay shorter than duration', () => {
      // Video with 2s duration, 4s delay → should transition at ~2s (not 4s)
      const state: PlaybackState = {
        mediaType: MediaType.Video,
        delayMs: 4000, // Delay is ignored for videos
        isLoaded: true,
        isRetrying: false
      };
      const decision = shouldAdvance(state, Date.now());
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toBe('videos_advance_on_ended_only');
    });
  });
});

