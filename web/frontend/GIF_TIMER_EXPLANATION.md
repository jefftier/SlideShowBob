# GIF Timer Explanation

## Two Different Types of Timers

### 1. Slideshow Timer (setInterval) - SHOULD NOT RUN FOR GIFs
- **Purpose**: Advances slideshow for images based on delay
- **Location**: `useSlideshow.ts` - `timerRef.current = setInterval(...)`
- **For GIFs**: **NEVER RUNS** - `shouldRunTimer(MediaType.Gif)` returns `false`
- **Protection**: Multiple guards prevent this timer from starting for GIFs

### 2. GIF Completion Timeout (setTimeout) - EXPECTED FOR GIFs
- **Purpose**: Detects when GIF animation completes (one cycle)
- **Location**: `MediaDisplay.tsx` - `gifCompletionTimeoutRef.current = setTimeout(...)`
- **For GIFs**: **ALWAYS RUNS** - This is the correct mechanism
- **Duration**: Based on parsed GIF metadata (actual animation duration)

## How to Verify No Slideshow Timer for GIFs

### In Browser Console (Dev Mode):
```javascript
// Check active slideshow timer count
window.__getSlideshowTimerCount()
// Should be 0 when a GIF is playing
```

### Expected Console Logs:
- **For Images**: `[useSlideshow] Timer started for image. Active timers: 1`
- **For GIFs**: `[useSlideshow] Timer not needed for GIF - will advance on completion event`
- **For Videos**: `[useSlideshow] Timer not needed for video - will advance on ended event`

### If You See This (BUG):
- `[useSlideshow] BUG: Attempted to start timer for Gif` - This should never appear
- `[useSlideshow] Timer tick called for GIF` - This should never appear

## All Guards in Place

1. **Main Effect** (line 226): Checks `shouldRunTimer()` before calling `startSlideshow()`
2. **Delay Change Effect** (line 238): Checks `shouldRunTimer()` before calling `startSlideshow()`
3. **Playlist Change Effect** (line 252): Checks `shouldRunTimer()` before calling `startSlideshow()`
4. **Media Change Effect** (line 265): Checks `shouldRunTimer()` before calling `startSlideshow()`
5. **Media Load Effect** (line 323): Checks `shouldRunTimer()` before calling `startSlideshow()`
6. **startSlideshow()** (line 165): Checks `shouldRunTimer()` and returns early for GIFs
7. **Safety Check** (line 207): Double-checks media type before `setInterval()`

## Expected Behavior

### When GIF is Playing:
- ✅ **Slideshow timer**: 0 (does not run)
- ✅ **GIF completion timeout**: 1 (runs, based on parsed duration)
- ✅ **Advancement**: Only via `onGifCompleted()` callback

### When Image is Playing:
- ✅ **Slideshow timer**: 1 (runs, checks every 100ms)
- ✅ **GIF completion timeout**: 0 (does not exist)
- ✅ **Advancement**: Via timer when delay is met

## If You Still See Issues

1. **Check console logs** - Look for any timer-related messages for GIFs
2. **Check timer count** - `window.__getSlideshowTimerCount()` should be 0 for GIFs
3. **Check GIF completion timeout** - This is expected and correct
4. **Report specific behavior** - What exactly is happening? Is the GIF advancing too early/late?

