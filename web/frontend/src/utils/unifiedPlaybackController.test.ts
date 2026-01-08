/**
 * Unit tests for unified playback controller
 * Tests deterministic playback rules matching the spec
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
  isMediaStillCurrent,
  getMediaCategory,
  type PlaybackState,
} from './unifiedPlaybackController';

describe('unifiedPlaybackController', () => {
  describe('getMediaCategory', () => {
    it('should return correct category for Image', () => {
      expect(getMediaCategory(MediaType.Image)).toBe('image');
    });

    it('should return correct category for Gif', () => {
      expect(getMediaCategory(MediaType.Gif)).toBe('gif');
    });

    it('should return correct category for Video', () => {
      expect(getMediaCategory(MediaType.Video)).toBe('video');
    });
  });

  describe('shouldAdvanceImage', () => {
    it('should not advance if not loaded', () => {
      const state: PlaybackState = {
        mediaType: MediaType.Image,
        delayMs: 4000,
        isLoaded: false,
        isRetrying: false,
        isPlaying: true
      };
      const decision = shouldAdvanceImage(state, Date.now());
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toBe('not_loaded');
      expect(decision.condition?.type).toBe('timer');
    });

    it('should not advance if load timestamp missing', () => {
      const state: PlaybackState = {
        mediaType: MediaType.Image,
        delayMs: 4000,
        isLoaded: true,
        isRetrying: false,
        isPlaying: true
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
        loadTimestamp: now - 5000,
        isRetrying: true,
        isPlaying: true
      };
      const decision = shouldAdvanceImage(state, now);
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toBe('retry_in_progress');
    });

    it('should not advance if slideshow paused', () => {
      const now = Date.now();
      const state: PlaybackState = {
        mediaType: MediaType.Image,
        delayMs: 4000,
        isLoaded: true,
        loadTimestamp: now - 5000,
        isRetrying: false,
        isPlaying: false
      };
      const decision = shouldAdvanceImage(state, now);
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toBe('slideshow_paused');
    });

    it('should not advance if minimum delay not met', () => {
      const now = Date.now();
      const state: PlaybackState = {
        mediaType: MediaType.Image,
        delayMs: 4000,
        isLoaded: true,
        loadTimestamp: now - 2000, // Only 2 seconds ago
        isRetrying: false,
        isPlaying: true
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
        isRetrying: false,
        isPlaying: true
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
        isRetrying: false,
        isPlaying: true
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
      expect(decision.condition?.type).toBe('event');
    });
  });

  describe('shouldAdvanceGif', () => {
    it('should never advance via timer', () => {
      const decision = shouldAdvanceGif();
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toBe('gifs_advance_on_completion_only');
      expect(decision.condition?.type).toBe('event');
    });
  });

  describe('shouldAdvance', () => {
    it('should route to shouldAdvanceImage for Image type', () => {
      const now = Date.now();
      const state: PlaybackState = {
        mediaType: MediaType.Image,
        delayMs: 4000,
        isLoaded: true,
        loadTimestamp: now - 5000,
        isRetrying: false,
        isPlaying: true
      };
      const decision = shouldAdvance(state, now);
      expect(decision.shouldAdvance).toBe(true);
      expect(decision.reason).toContain('min_delay_met');
    });

    it('should route to shouldAdvanceVideo for Video type', () => {
      const state: PlaybackState = {
        mediaType: MediaType.Video,
        delayMs: 4000,
        isLoaded: true,
        isRetrying: false,
        isPlaying: true
      };
      const decision = shouldAdvance(state, Date.now());
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toBe('videos_advance_on_ended_only');
    });

    it('should route to shouldAdvanceGif for Gif type', () => {
      const state: PlaybackState = {
        mediaType: MediaType.Gif,
        delayMs: 4000,
        isLoaded: true,
        isRetrying: false,
        isPlaying: true
      };
      const decision = shouldAdvance(state, Date.now());
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toBe('gifs_advance_on_completion_only');
    });

    it('should handle unknown media type', () => {
      const state: PlaybackState = {
        mediaType: 'unknown' as MediaType,
        delayMs: 4000,
        isLoaded: true,
        isRetrying: false,
        isPlaying: true
      };
      const decision = shouldAdvance(state, Date.now());
      expect(decision.shouldAdvance).toBe(false);
      expect(decision.reason).toContain('unknown_media_type');
    });
  });

  describe('shouldRunTimer', () => {
    it('should return true for Image', () => {
      expect(shouldRunTimer(MediaType.Image)).toBe(true);
    });

    it('should return false for Video', () => {
      expect(shouldRunTimer(MediaType.Video)).toBe(false);
    });

    it('should return false for Gif', () => {
      expect(shouldRunTimer(MediaType.Gif)).toBe(false);
    });
  });

  describe('getTimerCheckInterval', () => {
    it('should return 100ms for accurate timing', () => {
      expect(getTimerCheckInterval()).toBe(100);
    });
  });

  describe('isMediaStillCurrent', () => {
    it('should return true when media IDs match', () => {
      expect(isMediaStillCurrent('media-1', 'media-1')).toBe(true);
    });

    it('should return false when media IDs differ', () => {
      expect(isMediaStillCurrent('media-1', 'media-2')).toBe(false);
    });

    it('should return false when current media is null', () => {
      expect(isMediaStillCurrent(null, 'media-1')).toBe(false);
    });
  });
});

