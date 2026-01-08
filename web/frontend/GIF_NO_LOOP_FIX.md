# GIF No-Loop Fix

## Problem
GIFs were looping infinitely by default, even when the slideshow wasn't started. This is because `<img>` tags with GIF sources loop infinitely in browsers - there's no way to prevent this with the `<img>` tag.

## Solution
Changed GIF rendering from `<img>` to `<video>` tag, which allows us to control looping with the `loop={false}` attribute.

## Changes Made

### MediaDisplay.tsx
1. **Changed GIF rendering**: GIFs now render as `<video>` elements instead of `<img>`
2. **Added `loop={false}`**: Prevents GIF from looping infinitely
3. **Added `onEnded` handler**: Provides reliable fallback when GIF video ends naturally
4. **Separate ref**: Added `gifVideoRef` to distinguish GIF videos from regular videos
5. **Updated media element references**: All places that check for media elements now include `gifVideoRef`

### Key Benefits
- ✅ GIFs never loop - they play exactly once and stop
- ✅ Works even when slideshow is paused/stopped
- ✅ More reliable completion detection (both timeout and `onEnded` event)
- ✅ Better control over playback behavior

## Technical Details

### Before (Problematic)
```tsx
<img
  src={imageSrc}
  // No way to prevent looping - browser loops infinitely
/>
```

### After (Fixed)
```tsx
<video
  src={imageSrc}
  loop={false}  // Plays exactly once
  autoPlay
  playsInline
  muted
  onEnded={() => {
    // Reliable fallback when video ends
    onGifCompleted();
  }}
/>
```

## Verification

### Manual Test
1. Load a GIF
2. **Before fix**: GIF loops infinitely, even when slideshow is paused
3. **After fix**: GIF plays once and stops, even when slideshow is paused
4. Start slideshow: GIF plays once, then advances to next item

### Expected Behavior
- ✅ GIF plays exactly once (no looping)
- ✅ Works when slideshow is paused
- ✅ Works when slideshow is playing
- ✅ Advances after one cycle (via timeout or `onEnded` event)

## Notes
- GIFs are rendered as videos but are always muted (they're visual only)
- The `onEnded` event provides a reliable fallback if the timeout doesn't fire
- Both timeout and `onEnded` check that the media is still current before advancing

