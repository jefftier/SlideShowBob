# GIF CSP Fix & Timer Optimization

## Issues Found from Console Logs

### 1. **Content Security Policy (CSP) Violation**
**Error**: `Fetch API cannot load blob:... Refused to connect because it violates the document's Content Security Policy`

**Root Cause**: `parseGifMetadataFromUrl()` was trying to `fetch()` blob URLs, which CSP blocks.

**Impact**: GIF parsing always failed, falling back to 3-second timeout instead of actual duration.

**Fix**: Use `File` object directly when available (avoids CSP), fallback to URL fetch only if File not available.

### 2. **Timer Churn**
**Observation**: Timer starting/stopping repeatedly in console logs.

**Root Cause**: Main `isPlaying` effect had too many dependencies (`playlist`, `currentIndex`, callbacks), causing it to fire on every change.

**Impact**: Unnecessary timer restarts, potential performance issues.

**Fix**: Reduced dependencies - effect only runs when `isPlaying` changes. Other effects handle specific cases.

## Changes Made

### MediaDisplay.tsx
- **Changed**: Use `currentMedia.file` directly when available
- **Fallback**: Only use `parseGifMetadataFromUrl()` if File object not available
- **Result**: Avoids CSP violation, parses GIFs correctly

### useSlideshow.ts
- **Changed**: Main isPlaying effect dependencies reduced
- **Result**: Timer only restarts when actually needed, not on every state change

## Expected Behavior After Fix

### GIF Parsing
- ✅ **With File object**: Parses directly, no CSP issues
- ✅ **Without File object**: Falls back to URL fetch (may still hit CSP, but less common)
- ✅ **On failure**: Uses 3-second fallback (better than nothing)

### Timer Behavior
- ✅ **For images**: Timer starts once when playing, restarts only when needed
- ✅ **For GIFs**: No timer at all (verified in console)
- ✅ **For videos**: No timer at all (verified in console)

## Verification

After fix, console should show:
- ✅ `[MediaDisplay] GIF metadata parsed:` with actual duration
- ✅ `[useSlideshow] Timer not needed for GIF` (no timer started)
- ✅ No CSP errors for GIF parsing
- ✅ Reduced timer start/stop churn

## If CSP Still Blocks

If URL fetch still fails (when File object not available), the fallback timeout (3 seconds) will be used. This is acceptable but not ideal. For best results, ensure File objects are available (they should be when using File System Access API).

