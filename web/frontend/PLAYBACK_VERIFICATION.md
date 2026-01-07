# Playback Timing Verification Guide

## Acceptance Criteria Checklist

### ✅ Image Minimum Display Time
- [ ] **Test**: Load an image with delay=4s
- [ ] **Expected**: Image displays for at least 4 seconds after it finishes loading
- [ ] **Verify**: Start slideshow, note when image appears, verify it stays visible for at least 4 seconds
- [ ] **Edge case**: If image takes 2s to load, total display time should be at least 4s (not 2s)

### ✅ Video Ignores Delay (Short Video)
- [ ] **Test**: Load a 2-second video with delay=4s
- [ ] **Expected**: Video plays completely (~2s) then transitions immediately
- [ ] **Verify**: Video should NOT wait for 4s delay - transitions as soon as video ends

### ✅ Video Ignores Delay (Long Video)
- [ ] **Test**: Load an 8-second video with delay=4s
- [ ] **Expected**: Video plays completely (~8s) then transitions immediately
- [ ] **Verify**: Video should NOT be cut off at 4s - plays full duration

### ✅ GIF Behavior
- [ ] **Test**: Load a GIF with delay=4s
- [ ] **Expected**: GIF plays (using delay policy by default)
- [ ] **Verify**: GIF displays for at least 4 seconds after loading
- [ ] **Note**: GIF completion detection is not yet implemented - uses delay fallback

### ✅ No Timer Stacking
- [ ] **Test**: Rapidly toggle play/pause, change delay, navigate
- [ ] **Expected**: Only one timer active at any time
- [ ] **Verify**: Check `window.__getSlideshowTimerCount()` in dev console - should always be 0 or 1

### ✅ No Double-Advance
- [ ] **Test**: Rapidly navigate or change settings during playback
- [ ] **Expected**: Each media item advances exactly once
- [ ] **Verify**: No skipped items, no duplicate displays

### ✅ Retry Gating
- [ ] **Test**: Force a media load error (use `?failRate=1.0` URL param)
- [ ] **Expected**: Slideshow pauses during retry, resumes after retry completes
- [ ] **Verify**: No advancement occurs while retry is in progress

## Manual Test Steps

### Setup
1. Start the dev server: `npm run dev`
2. Open browser console (F12)
3. Load a folder with mixed media (images, videos, GIFs)

### Test 1: Image Minimum Display Time
```
1. Set delay to 4 seconds in settings
2. Start slideshow on an image
3. Note the exact time when image appears (check console logs)
4. Verify image stays visible for at least 4 seconds
5. Try with a slow-loading image (large file or throttled network)
6. Verify minimum display time is still enforced
```

### Test 2: Video Playback (Short Video)
```
1. Set delay to 4 seconds
2. Load a 2-second video
3. Start slideshow
4. Verify video plays completely (~2s)
5. Verify transition happens immediately after video ends (not after 4s)
```

### Test 3: Video Playback (Long Video)
```
1. Set delay to 4 seconds
2. Load an 8-second video
3. Start slideshow
4. Verify video plays completely (~8s)
5. Verify video is NOT cut off at 4s
6. Verify transition happens immediately after video ends
```

### Test 4: GIF Behavior
```
1. Set delay to 4 seconds
2. Load a GIF
3. Start slideshow
4. Verify GIF displays for at least 4 seconds after loading
5. Note: GIF completion detection not yet implemented
```

### Test 5: Timer Discipline
```
1. Open console
2. Start slideshow
3. Check: window.__getSlideshowTimerCount() should be 1
4. Rapidly toggle play/pause
5. Check: timer count should alternate between 0 and 1 (never >1)
6. Change delay while playing
7. Check: timer count should remain 1
```

### Test 6: Retry Gating
```
1. Add ?failRate=1.0 to URL to force errors
2. Start slideshow
3. When error occurs, verify:
   - Retry message appears
   - Slideshow does NOT advance during retry
   - After retry completes, slideshow resumes
4. Check console for retry logs
```

## Expected Console Output (Dev Mode)

When running in dev mode, you should see logs like:
```
[useSlideshow] Timer started. Active timers: 1 Check interval: 100
[useSlideshow] Advance decision: min_delay_met: 4000ms >= 4000ms
[useSlideshow] Timer cleared. Active timers: 0
```

## Known Limitations

### GIF Completion Detection
- **Current**: GIFs use delay-based timing (like images)
- **Future**: Could implement completion detection via:
  - Image decode events (limited browser support)
  - Frame counting (requires GIF parsing)
  - Treat as video (convert to video element)
- **Workaround**: Use `gifPolicy: 'estimated-duration'` with known GIF durations

### Browser Autoplay Policies
- Videos may require user interaction to autoplay
- This is handled gracefully - video will play when ready
- Does not affect timing logic

## Debugging Tips

### Check Timer State
```javascript
// In browser console
window.__getSlideshowTimerCount() // Should be 0 or 1
```

### Check Playback Errors
```javascript
// In browser console
window.__getPlaybackErrors() // Shows retry history
window.__clearPlaybackErrors() // Clears error log
```

### Force Media Errors
Add `?failRate=0.5` to URL to simulate 50% failure rate (for testing retry logic)

## Automated Test Coverage

Run unit tests:
```bash
npm test playbackController.test.ts
```

Tests cover:
- Image minimum display time enforcement
- Video delay ignoring
- GIF policy handling
- Retry gating
- Edge cases and race conditions

