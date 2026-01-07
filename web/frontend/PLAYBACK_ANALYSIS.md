# Playback Timing Analysis & Implementation Plan

## A) Current Implementation Flow

### State Flow Diagram
```
App.tsx
  ├─ currentMedia (state)
  ├─ isPlaying (state)
  ├─ slideDelayMs (state)
  └─ useSlideshow hook
      ├─ Timer: setInterval(tick, slideDelayMs)
      │   └─ tick() → advance() if not Video
      ├─ onVideoEnded() → advance() after 100ms delay
      └─ shouldGateAdvancement() → checks isRetryingCurrentMediaRef

MediaDisplay.tsx
  ├─ onLoad/onLoadedData → onMediaLoadSuccess()
  ├─ onError → onMediaError()
  └─ video.onEnded → onVideoEnded()

Events → Timers → Transitions:
  - Image: Timer starts immediately → advances every slideDelayMs
  - Video: Timer skips advancement, onVideoEnded advances
  - GIF: Treated as Image (uses timer)
```

### Code Paths

1. **Scheduling Advancement** (`useSlideshow.ts:138-161`)
   - `startSlideshow()` creates `setInterval(tick, slideDelayMs)`
   - Timer starts immediately when `isPlaying` becomes true
   - Does NOT wait for media to load

2. **Image Load Timing** (`MediaDisplay.tsx:733-750`)
   - `onLoad` fires when image loads
   - Calls `onMediaLoadSuccess()` but doesn't affect timer

3. **GIF Playback** (`useSlideshow.ts:148`)
   - GIFs treated as images: `currentMediaTypeRef.current !== 'Video'`
   - Uses delay timer, no completion detection

4. **Video Playback Completion** (`useSlideshow.ts:236-246`)
   - `onVideoEnded()` callback advances after 100ms delay
   - Timer still runs but skips advancement for videos

5. **Retry/Backoff Gating** (`App.tsx:173-175, 1193-1220`)
   - `isRetryingCurrentMediaRef.current` gates advancement
   - Retry timer schedules reload after backoff delay

## B) Spec Violations

### Violation 1: Images Can Advance Before Delay Minimum
**Location**: `useSlideshow.ts:138-161`
**Issue**: Timer starts immediately when slideshow starts, not when image loads. If image takes time to load, timer could fire before image is visible, violating minimum display time.
**Example**: delay=4s, image loads at t=2s → timer fires at t=4s (only 2s visible)

### Violation 2: Images Can Advance Before Loaded
**Location**: `useSlideshow.ts:154`
**Issue**: Timer advances based on delay, regardless of whether image has loaded. If image fails to load or loads slowly, timer still advances.

### Violation 3: Videos Use Delay Timer (Wasteful)
**Location**: `useSlideshow.ts:148-152`
**Issue**: Timer still runs for videos (just skips advancement). Should not run at all for videos.

### Violation 4: Video Ended Has Arbitrary Delay
**Location**: `useSlideshow.ts:242`
**Issue**: `setTimeout(advance, 100)` adds unnecessary delay. Should advance immediately on ended event.

### Violation 5: GIFs Use Delay Instead of Completion
**Location**: `useSlideshow.ts:148`
**Issue**: GIFs treated as images, use delay timer. Should play to completion or use best-practice detection.

### Violation 6: Timer Can Stack on Delay Change
**Location**: `useSlideshow.ts:186-196`
**Issue**: Effect restarts timer when delay changes, but cleanup may not fire synchronously, allowing brief timer stacking.

### Violation 7: Multiple Effects Can Restart Timer
**Location**: `useSlideshow.ts:172-209`
**Issue**: Three separate effects can restart timer (isPlaying, slideDelayMs, playlist.length). Race conditions possible.

### Violation 8: No Re-entrancy Protection for Video Ended + Timer
**Location**: `useSlideshow.ts:55-87, 236-246`
**Issue**: Re-entrancy guard exists but video ended has 100ms delay, timer could fire during that window.

## C) Proposed Design

### Playback Controller Module
Create `utils/playbackController.ts` with deterministic rules:

```typescript
interface PlaybackState {
  mediaType: MediaType;
  delayMs: number;
  isLoaded: boolean;
  loadTimestamp?: number;
  isRetrying: boolean;
}

class PlaybackController {
  // Images: advance when minDelayElapsed AND imageLoaded
  shouldAdvanceImage(state: PlaybackState, now: number): boolean
  
  // Videos: advance only on ended event (no delay)
  shouldAdvanceVideo(): never // Videos never use delay
  
  // GIFs: advance on completion or fallback policy
  shouldAdvanceGif(state: PlaybackState, now: number, gifPolicy: 'completion' | 'delay' | 'duration'): boolean
}
```

### Refactored useSlideshow
- Single timer that checks `playbackController.shouldAdvance()`
- Timer only runs for images/GIFs (not videos)
- Timer starts after media loads (for images)
- Videos advance immediately on ended (no delay)

### GIF Strategy
- **Primary**: Attempt to detect completion via image decode/playback events
- **Fallback**: Use configurable policy (delay, estimated duration, or treat as video)
- **Documentation**: Clearly document limitations and policy options

## D) Implementation Steps

1. Create `utils/playbackController.ts` with pure functions
2. Refactor `useSlideshow.ts` to use controller
3. Update `MediaDisplay.tsx` to notify when media loads
4. Add GIF completion detection (or fallback policy)
5. Add comprehensive tests
6. Update documentation

## E) Acceptance Criteria

- [ ] Image with delay=4s displays for at least 4 seconds after load
- [ ] Video with duration=2s and delay=4s transitions at ~2s
- [ ] Video with duration=8s and delay=4s transitions at ~8s
- [ ] GIF behavior documented and validated
- [ ] No timer stacking (only one active timer)
- [ ] No double-advance on rapid state changes
- [ ] Retry gating prevents advancement correctly

