# GIF Playback Logic Analysis

## Current Issues Found

### 1. **Dead Code in Timer Tick**
- Location: `useSlideshow.ts:198-202`
- Issue: Timer tick function checks `gifCompletedRef` for GIFs, but timer should NEVER run for GIFs
- Impact: Confusing code, potential for bugs if logic changes

### 2. **No Guard Against Multiple Timeout Setups**
- Location: `MediaDisplay.tsx:768-812`
- Issue: GIF parsing happens in `onLoad`, which can fire multiple times
- Impact: Multiple timeouts could be set, causing premature or duplicate advances

### 3. **Race Condition: Timeout vs Media Change**
- Location: `MediaDisplay.tsx:784-788`
- Issue: Timeout might fire after media has changed, calling `onGifCompleted` for wrong media
- Impact: Wrong GIF might advance, or advance might happen at wrong time

### 4. **Unused GIF Policy Parameters**
- Location: `useSlideshow.ts:194-195`
- Issue: `gifPolicy` and `gifEstimatedDurationMs` are passed but never used (we always use completion detection)
- Impact: Dead code, confusion

### 5. **Timer Effect Might Interfere**
- Location: `useSlideshow.ts:332-347`
- Issue: Effect restarts timer when media loads, but checks `shouldRunTimer` (returns false for GIFs)
- Impact: Should be safe, but adds complexity

## Solution: Single, Clean GIF Handling

### Principles:
1. **GIFs NEVER use timer** - Only advance via `onGifCompleted` callback
2. **Single timeout per GIF** - Guard against multiple setups
3. **Timeout validates current media** - Prevents race conditions
4. **Clean separation** - GIF logic only in MediaDisplay, advance logic only in useSlideshow

