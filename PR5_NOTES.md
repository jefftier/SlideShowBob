# PR5: Event Listener Cleanup + Media Element Lifecycle Correctness

## Branch
`enterprise/pr5-event-listener-cleanup`

## Root Causes Found

### 1. Effective Zoom Calculation Effect (Lines 135-240)
**Issues:**
- `calculateEffectiveZoom` function was redefined on every render, causing `window.removeEventListener('resize', calculateEffectiveZoom)` to fail (different function reference)
- `handleLoad` was defined inside conditional logic, and cleanup tried to remove listeners from `mediaElement` that might have changed if refs updated
- Multiple return statements meant some cleanup code paths were skipped
- Timeout inside `handleLoad` wasn't tracked for cleanup
- Element reference could change between listener attachment and cleanup, causing orphaned listeners

**Impact:** Window resize listeners accumulated, media element listeners could be orphaned, timeouts could leak

### 2. Orphaned Timeouts in Event Handlers
**Issues:**
- `handleMouseUp` (line 341): setTimeout not tracked, could continue after media change/unmount
- `handleTouchEnd` (line 446): setTimeout not tracked, could continue after media change/unmount  
- `handleClick` (lines 518-528): Multiple timeouts and requestAnimationFrame not tracked, could leak

**Impact:** Timeouts could fire after component unmount or media change, causing state updates on unmounted components or incorrect navigation flags

### 3. Video Event Handler Stability
**Issues:**
- `handleVideoEnded` was a regular function (not useCallback), though this was less critical since it's a React event handler

**Impact:** Minor - React handles this, but made stable for consistency

## What Changed

### Files Modified
- `web/frontend/src/components/MediaDisplay.tsx`

### Key Changes

#### 1. Effective Zoom Calculation Effect (Lines 135-240)
- **Captured element at effect start**: `const mediaElement = imageRef.current || videoRef.current` ensures cleanup targets the same instance
- **Stable handler functions**: `calculateEffectiveZoom` and `handleLoad` are defined once per effect run, ensuring addEventListener/removeEventListener symmetry
- **Timeout tracking**: All timeouts stored in `timeoutIds` array and cleared in cleanup
- **Single cleanup path**: Removed multiple return statements, ensuring all cleanup runs
- **Window resize listener**: Now uses stable `calculateEffectiveZoom` reference

#### 2. Timeout and Animation Frame Tracking (Lines 42, 377-390)
- **Added refs for tracking**: 
  - `activeTimeoutsRef: useRef<Set<number>>(new Set())`
  - `activeAnimationFramesRef: useRef<Set<number>>(new Set())`
- **Track all timeouts**: All `setTimeout` calls now add their IDs to `activeTimeoutsRef`
- **Track animation frames**: `requestAnimationFrame` IDs tracked in `activeAnimationFramesRef`
- **Cleanup effect**: New effect (lines 377-390) clears all timeouts and animation frames when `currentMedia` changes or component unmounts

#### 3. Event Handler Updates
- **handleMouseUp** (line 359): Timeout now tracked and cleaned up
- **handleTouchEnd** (line 482): Timeout now tracked and cleaned up
- **handleClick** (lines 558-575): All timeouts and requestAnimationFrame tracked and cleaned up
- **handleVideoEnded** (line 242): Wrapped in `useCallback` for stability

#### 4. Type Safety
- Used `window.setTimeout` and `window.clearTimeout` explicitly to ensure browser types (returns `number` not `NodeJS.Timeout`)

## How to Verify

### Manual Testing

1. **Rapid Media Switching Test**
   - Start dev server: `npm run dev` (in `web/frontend`)
   - Start slideshow
   - Rapidly click Next/Prev 50+ times
   - **Expected**: No duplicate "ended" events, no console errors, smooth transitions

2. **Play/Pause While Switching**
   - Start slideshow
   - Toggle play/pause while rapidly switching media
   - **Expected**: No listener leaks, proper cleanup

3. **Error Retry Test**
   - Use `?failRate=0.3` URL parameter to trigger retries
   - Rapidly switch media while retries are happening
   - **Expected**: Handler cleanup still works, no duplicate handlers

4. **DevTools Verification** (Optional)
   - Open DevTools → Elements → Select video element
   - Go to "Event Listeners" panel
   - Rapidly switch media
   - **Expected**: Only one listener per event type (load, loadeddata, ended, etc.)

5. **Window Resize Test**
   - Enable fit-to-window mode
   - Rapidly resize window while switching media
   - **Expected**: No memory leaks, proper zoom calculation

### Build Verification
- Run `npm run build` in `web/frontend`
- **Expected**: No TypeScript errors related to MediaDisplay.tsx (other files may have pre-existing errors)

## Technical Details

### Pattern Used
The preferred pattern from the requirements:
1. **Capture element in effect**: `const el = videoRef.current` at effect start
2. **Use captured element for add/remove**: All addEventListener/removeEventListener use the captured element
3. **Stable handler functions**: Handlers defined inside effect (or memoized) so they have stable identity
4. **Track timeouts**: All timeouts stored and cleared in cleanup
5. **Single cleanup path**: One return statement with all cleanup logic

### Why No useEventListener Hook?
The issues were specific to:
- Element reference changes
- Handler function identity
- Timeout tracking

These are better handled directly in the component with the captured-element pattern rather than a generic hook. The complexity didn't warrant a separate hook for this use case.

## Testing Checklist
- [x] Rapid media switching (50+ times)
- [x] Play/pause while switching
- [x] Error retry scenarios (`?failRate=0.3`)
- [x] Window resize during media changes
- [x] Build passes (MediaDisplay.tsx specific)
- [ ] DevTools Event Listeners panel verification (manual)

## Notes
- Object URL revocation remains in PR2 scope (not changed here)
- Playback logic (advance timing/retry policy) unchanged except for callback stability
- App.tsx not refactored (as per scope boundaries)

