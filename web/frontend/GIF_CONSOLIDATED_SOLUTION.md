# Consolidated GIF Playback Solution

## Problem Summary

GIFs were not playing consistently due to:
1. **Multiple overlapping solutions** - Timer code, completion detection, and policy logic all interacting
2. **Race conditions** - Timeouts firing after media changed
3. **No guards** - Multiple timeout setups possible
4. **Dead code** - Unused GIF policy parameters causing confusion

## Single, Clean Solution

### Architecture

```
MediaDisplay (GIF Rendering)
  ↓
onLoad fires → Parse GIF metadata (gifuct-js)
  ↓
Extract actual duration
  ↓
Set single timeout with validation
  ↓
onGifCompleted() callback
  ↓
useSlideshow.onGifCompleted()
  ↓
advance() immediately (no delay, no timer)
```

### Key Principles

1. **GIFs NEVER use timer** - `shouldRunTimer(MediaType.Gif)` returns `false`
2. **Single timeout per GIF** - Guards prevent multiple setups
3. **Media validation** - Timeout validates current media before advancing
4. **Immediate advance** - `onGifCompleted()` calls `advance()` directly (like videos)
5. **No policy logic** - Always use completion detection (parsed duration)

## Implementation Details

### MediaDisplay.tsx

**Guards Added:**
- `gifParsingInProgressRef` - Prevents multiple parsing operations
- `currentGifMediaRef` - Tracks which media the timeout is for
- Timeout validates `currentGifMediaRef === mediaId` before calling `onGifCompleted`

**Flow:**
1. GIF loads → `onLoad` fires
2. Check guards → Skip if already parsing or timeout exists
3. Store `mediaId` in `currentGifMediaRef`
4. Parse GIF metadata → Get actual duration
5. Validate media is still current → Skip if changed
6. Set timeout with validation → Only advance if media still matches
7. Cleanup on media change → Clear timeout and refs

### useSlideshow.ts

**Simplified:**
- Removed `gifPolicy` and `gifEstimatedDurationMs` parameters (unused)
- Timer tick function explicitly rejects GIFs (should never reach there)
- `onGifCompleted()` directly calls `advance()` (like `onVideoEnded()`)
- No timer logic for GIFs - they're handled entirely via callback

### playbackController.ts

**Simplified:**
- Removed `GifDurationPolicy` type (unused)
- Removed `gifPolicy` and `gifEstimatedDurationMs` from `PlaybackState`
- `shouldAdvanceGif()` only checks completion flag (simple and clear)
- `shouldRunTimer()` returns `false` for GIFs

## Code Flow

### GIF Loads
```
1. MediaDisplay: currentMedia changes
2. MediaDisplay: imageSrc set, onLoad fires
3. MediaDisplay: Check guards (parsing in progress? timeout exists?)
4. MediaDisplay: Store mediaId, set parsing flag
5. MediaDisplay: Parse GIF metadata (async)
6. MediaDisplay: Validate media still current
7. MediaDisplay: Set timeout with validation
```

### GIF Completes
```
1. MediaDisplay: Timeout fires
2. MediaDisplay: Validate mediaId matches currentGifMediaRef
3. MediaDisplay: Call onGifCompleted()
4. useSlideshow: onGifCompleted() sets gifCompletedRef.current = true
5. useSlideshow: Call advance() immediately
6. App: Navigate to next item
```

### Media Changes During Playback
```
1. MediaDisplay: currentMedia changes
2. MediaDisplay: Clear timeout, reset refs
3. MediaDisplay: New GIF starts loading
4. Old timeout (if still pending): Validates mediaId, sees mismatch, does nothing
```

## Safeguards

1. **Parsing Guard**: `gifParsingInProgressRef` prevents multiple parsing operations
2. **Timeout Guard**: Check if timeout exists before creating new one
3. **Media Validation**: Timeout callback validates mediaId before advancing
4. **Cleanup**: All refs and timeouts cleared on media change
5. **Timer Rejection**: Timer tick explicitly rejects GIFs (defensive)

## Benefits

1. **Single source of truth** - GIF completion handled only in MediaDisplay
2. **No conflicts** - Timer never runs for GIFs
3. **Race condition safe** - Media validation prevents wrong advances
4. **Deterministic** - Same GIF always plays for same duration
5. **Simple** - No complex policy logic, just parse and timeout

## Testing

To verify the solution:
1. **Short GIF** (< 1s): Should play once for actual duration
2. **Medium GIF** (2-5s): Should play once for actual duration  
3. **Long GIF** (> 10s): Should play up to 30s (safety limit)
4. **Rapid navigation**: Should not advance wrong GIF
5. **Parse failure**: Should use 3s fallback, still advance

## Debugging

Check console logs (dev mode):
- `[MediaDisplay] GIF metadata parsed:` - Shows parsed duration
- `[useSlideshow] Timer not needed for video` - Confirms timer not running for GIFs
- `[useSlideshow] Timer tick called for GIF` - Should never appear (indicates bug)

