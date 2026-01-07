# PR3: Playback Retry/Backoff Implementation

## Summary

This PR implements enterprise-grade retry/backoff logic for media playback errors, replacing the previous "toast + immediate skip" behavior with a robust retry policy.

## What Was Wrong

- **Previous behavior**: On media load error, app showed a toast and immediately skipped to next item after ~1s
- **Problem**: Too aggressive for enterprise signage scenarios where network hiccups or transient decode issues are common
- **Impact**: Media items were skipped unnecessarily, reducing playback reliability

## New Policy

### Retry Configuration
- **Max attempts**: 3 (configurable)
- **Base delay**: 1000ms (1 second)
- **Max delay**: 10000ms (10 seconds)
- **Backoff multiplier**: 2x (exponential)

### Retry Schedule
- Attempt 1 → 1s delay
- Attempt 2 → 2s delay  
- Attempt 3 → 4s delay
- After 3 attempts → Skip to next item

## Implementation Details

### Files Changed

1. **`src/hooks/usePlaybackErrorPolicy.ts`** (NEW)
   - Centralized retry policy hook
   - Functions:
     - `recordFailure()` - Records error and returns retry info
     - `computeNextRetryDelay()` - Calculates exponential backoff
     - `shouldRetry()` - Determines if retry should occur
     - `resetOnSuccess()` - Clears retry state on successful load
     - `getErrorRecord()` - Retrieves error log entry
     - `getAllErrorRecords()` - Gets all errors (for debugging)

2. **`src/App.tsx`**
   - Integrated retry policy hook
   - Added `currentMediaReloadKey` state to force MediaDisplay remount on retry
   - Added `retryTimerRef` for timer cleanup
   - Updated `onMediaError` handler:
     - Records failure with error type classification
     - Shows retry toast with countdown
     - Schedules retry with exponential backoff
     - Skips to next item after max attempts
   - Added `onMediaLoadSuccess` callback to reset retry state
   - Cleanup: Clears retry timers on media change/unmount

3. **`src/components/MediaDisplay.tsx`**
   - Added `onMediaError` prop to interface
   - Added `onMediaLoadSuccess` prop to interface
   - Calls `onMediaLoadSuccess` on successful image/video load
   - Added dev-only failure simulation via `?failRate=X` URL parameter
   - Fixed duplicate success callback calls using `loadSuccessNotifiedRef`

### Key Functions

#### Error Handling Flow
```
Media Error → recordFailure() → shouldRetry?
  ├─ Yes → Show retry toast → Schedule retry (backoff delay) → Increment reloadKey → Remount MediaDisplay
  └─ No → Show final failure toast → Log error → Advance to next item
```

#### Retry Mechanism
- Uses React `key` prop to force remount: `key={`${media.filePath}-${reloadKey}`}`
- Timer cleanup ensures no stacked retries
- Retry state resets on successful load or media change

### Error Logging

- In-memory error log tracks:
  - Media ID (filePath)
  - File name
  - Attempt count
  - Error type (network/decode/unknown)
  - Timestamp
  - Final status (retrying/failed/succeeded)

- Dev-only console utilities:
  - `window.__getPlaybackErrors()` - View all error records
  - `window.__clearPlaybackErrors()` - Clear error log

### Toast Messages

- **Retry**: "Failed to load media. Retrying in Xs (attempt A/B)..."
- **Final failure**: "Failed to load after B attempts. Skipping."

## Testing

### Manual Verification

1. **Transient failure recovery**:
   - Rename a media file temporarily to break load
   - Observe retry attempts with countdown
   - Rename file back → Should succeed on retry and continue normally

2. **Permanent failure**:
   - Use invalid/non-existent file
   - Observe 3 retry attempts
   - After 3 attempts, should skip to next item

3. **Dev failure simulation**:
   - Add `?failRate=0.5` to URL
   - 50% of media loads will simulate failures
   - Useful for testing retry behavior

4. **Timer cleanup**:
   - Trigger error → Wait for retry countdown
   - Manually advance to next item during countdown
   - Verify no retry occurs for previous item

5. **Error log**:
   - Open browser console
   - Run `__getPlaybackErrors()` to view error records
   - Verify error details are logged correctly

### Build Verification

```bash
cd web/frontend
npm run build
```

**Note**: Build may show pre-existing TypeScript warnings (unused variables) that are unrelated to this PR. The retry/backoff functionality compiles successfully.

## Configuration

Retry policy can be customized in `App.tsx`:

```typescript
const errorPolicy = usePlaybackErrorPolicy({ 
  maxAttempts: 3,      // Default: 3
  baseDelayMs: 1000,   // Default: 1000ms
  maxDelayMs: 10000,   // Default: 10000ms
  backoffMultiplier: 2 // Default: 2
});
```

## Scope Boundaries Respected

✅ **Focused changes**: Only retry/backoff + error handling  
✅ **No broad refactors**: App.tsx structure unchanged  
✅ **No object URL changes**: PR2 logic preserved  
✅ **Minimal UI surface**: Toast messages only  

## Next Steps (Future PRs)

- Consider adding error log UI panel
- Add error metrics/analytics
- Configurable retry policy via settings
- Network error detection improvements

