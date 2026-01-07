# PR4: Timer Discipline & Race Condition Fixes

## Branch
`enterprise/pr4-timer-discipline-slideshow`

## Goal
Eliminate all "stacked timer" and race-condition risks in slideshow playback, especially when toggling play/pause, changing delay, switching media, or interacting with retry/backoff from PR3.

## Root Causes Identified

### 1. Timer Stacking in `useSlideshow.ts`
- **Issue**: The `useEffect` hook that manages the slideshow timer included `startSlideshow` in its dependency array. Since `startSlideshow` was recreated whenever `navigateNext` changed (which happens when `currentIndex` or `playlist` changes), the effect would re-run and potentially create multiple intervals before cleanup could run.
- **Issue**: When `slideDelayMs` changed, the effect would restart, but if `startSlideshow` was also recreated due to other dependencies, multiple timers could be created.
- **Issue**: No explicit clearing of timers before creating new ones, relying only on cleanup functions which could race.

### 2. Manifest Mode Timer Restart Logic
- **Issue**: In `App.tsx` (lines 953-963), a `useEffect` used `setTimeout` to restart the slideshow when `currentMedia` or `effectiveDelay` changed. This `setTimeout` could stack with the existing slideshow timer, creating overlapping timers.

### 3. Retry Timer Conflicts
- **Issue**: When a retry was scheduled for the current media item (PR3), the slideshow auto-advance timer would continue running in parallel. This could cause the slideshow to advance while a retry was pending, skipping the item that was being retried.
- **Issue**: No gating mechanism to prevent slideshow advancement during retry operations.

### 4. Re-entrancy in Advancement
- **Issue**: The `navigateNext` function could be called concurrently from multiple sources (timer tick, manual navigation, retry completion), potentially causing double-advancement or race conditions.

## Solutions Implemented

### 1. Single Timer Ownership Model (`useSlideshow.ts`)

**Key Changes:**
- Created a `clearTimer()` function that ALWAYS clears any existing timer before operations
- Modified `startSlideshow()` to ALWAYS call `clearTimer()` first, preventing timer stacking
- Separated timer management into distinct `useEffect` hooks:
  - One for `isPlaying` state changes
  - One for `slideDelayMs` changes (restarts timer with new delay)
  - One for `playlist.length` changes (restarts timer with new playlist)
- Each effect properly cleans up on unmount or dependency change

**Timer Lifecycle:**
```
1. Before creating ANY timer → clearTimer() (ensures no existing timer)
2. Create new timer → setInterval()
3. On state change → clearTimer() → (optionally) create new timer
4. On unmount → clearTimer()
```

### 2. Deterministic Advancement Function

**Created `advance()` function:**
- Single source of truth for index changes
- Re-entrancy guard using `isAdvancingRef` to prevent concurrent execution
- Gating support via `shouldGateAdvancement` callback
- All navigation (manual and automatic) flows through this function

**Re-entrancy Protection:**
```typescript
if (isAdvancingRef.current) {
  // Already advancing - ignore duplicate call
  return;
}
isAdvancingRef.current = true;
try {
  // Perform advancement
} finally {
  setTimeout(() => { isAdvancingRef.current = false; }, 50);
}
```

### 3. Retry Gating Mechanism

**Implementation:**
- Added `isRetryingCurrentMediaRef` ref in `App.tsx` to track retry state
- Created `shouldGateAdvancement` callback that returns `true` when retry is pending
- Passed callback to `useSlideshow` hook
- `advance()` function checks gating before proceeding

**Gating Rules:**
- When retry is scheduled → set `isRetryingCurrentMediaRef.current = true`
- When retry completes or media changes → set `isRetryingCurrentMediaRef.current = false`
- Slideshow timer continues to tick, but `advance()` is blocked during retry

### 4. Manifest Mode Timer Fix

**Removed problematic `setTimeout` restart:**
- The previous `useEffect` that used `setTimeout` to restart slideshow in manifest mode has been removed
- The `effectiveDelay` change is now handled by the `slideDelayMs` effect in `useSlideshow`, which properly clears and restarts the timer
- This eliminates the timer stacking that could occur with the `setTimeout` approach

### 5. Manual Navigation Timer Clearing

**Updated `navigateNext` and `navigatePrevious`:**
- Both functions now explicitly clear any active slideshow timer before navigating
- This ensures manual navigation doesn't conflict with the auto-advance timer
- Uses the same `clearTimer()` function for consistency

### 6. Dev-Only Debug Helper

**Added timer tracking:**
- `activeTimerCountRef` tracks the number of active timers (should always be 0 or 1)
- Exposed `window.__getSlideshowTimerCount()` in development mode for debugging
- Console logging in development mode to trace timer lifecycle

## Files Modified

1. **`web/frontend/src/hooks/useSlideshow.ts`**
   - Complete refactor for single timer ownership
   - Added `advance()` function with re-entrancy guard
   - Added gating support via `shouldGateAdvancement` callback
   - Added dev-only debug helpers
   - Separated timer management into focused effects

2. **`web/frontend/src/App.tsx`**
   - Added `isRetryingCurrentMediaRef` for retry gating
   - Created `shouldGateAdvancement` callback
   - Passed callback to `useSlideshow` hook
   - Removed problematic manifest mode timer restart logic
   - Updated retry logic to set/clear gating flag
   - Updated max retries case to use `navigateNext()` instead of `setTimeout`

## Verification Steps

### Manual Testing Checklist

1. **Rapid Play/Pause Toggle**
   - Start slideshow
   - Rapidly toggle play/pause 10-20 times
   - ✅ **Expected**: No acceleration, slideshow advances at normal rate
   - ✅ **Verify**: Check console for timer count (should be 0 or 1)

2. **Delay Change**
   - Start slideshow with 1s delay
   - Quickly change delay: 1s → 5s → 2s → 3s repeatedly
   - ✅ **Expected**: No speed-up, slideshow uses the latest delay value
   - ✅ **Verify**: Timer count remains 0 or 1

3. **Retry Gating**
   - Use `?failRate=0.5` query parameter to trigger retries (if available)
   - Or manually trigger media errors
   - ✅ **Expected**: When retry is pending, slideshow does NOT advance
   - ✅ **Expected**: Slideshow resumes after retry completes or fails
   - ✅ **Verify**: Check console logs for "Advancement gated" messages

4. **Long-Run Stability**
   - Let slideshow run for 15+ minutes
   - ✅ **Expected**: Stable cadence, no acceleration over time
   - ✅ **Verify**: Timer count remains stable

5. **Manual Navigation During Playback**
   - Start slideshow
   - Manually click Next/Previous buttons
   - ✅ **Expected**: Timer is cleared, slideshow pauses or restarts correctly
   - ✅ **Verify**: No double-advancement

6. **Manifest Mode Per-Item Delays**
   - Load a manifest with per-item delays
   - Start slideshow
   - ✅ **Expected**: Timer restarts with correct delay for each item
   - ✅ **Verify**: No timer stacking when switching items

### Debug Commands (Development Mode)

```javascript
// Check active timer count (should be 0 or 1)
window.__getSlideshowTimerCount()

// Check playback errors (from PR3)
window.__getPlaybackErrors()
```

## Technical Details

### Timer Model
- **Single Owner**: Only ONE `setInterval` can exist at any time
- **Clear-First**: Always clear existing timer before creating new one
- **Effect Isolation**: Separate effects for different concerns (playing state, delay, playlist)
- **Cleanup Guarantee**: All effects have cleanup functions that clear timers

### Advancement Model
- **Deterministic**: Single `advance()` function is the only place index changes happen
- **Re-entrancy Guard**: `isAdvancingRef` prevents concurrent execution
- **Gating**: `shouldGateAdvancement` callback can block advancement
- **Manual Navigation**: Clears timer before navigating

### Retry Integration
- **Gating Flag**: `isRetryingCurrentMediaRef` tracks retry state
- **Automatic Gating**: Slideshow advancement is blocked when retry is pending
- **State Synchronization**: Flag is cleared on media change, retry completion, or success

## Build Status

✅ TypeScript compilation passes for modified files
- Note: Some pre-existing TypeScript warnings in other files (unused variables, type mismatches) remain but are unrelated to this PR

## Testing Notes

- All timer-related code paths have been refactored
- Re-entrancy guards prevent double-advancement
- Gating prevents advancement during retry
- Timer lifecycle is deterministic and traceable

## Next Steps

After merge:
- Monitor production for any timer-related issues
- Consider adding unit tests in PR11 (when Vitest is added)
- May want to add telemetry for timer count in production (if needed)

