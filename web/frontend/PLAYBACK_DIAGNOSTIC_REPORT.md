# Playback System Diagnostic Report

## A) All Advance Triggers (Complete Enumeration)

### 1. Automatic Advancement Triggers

#### a) Timer-based (Images only)
- **Location**: `useSlideshow.ts:195-223`
- **Trigger**: `setInterval(tick, checkInterval)` where `checkInterval = 100ms`
- **Flow**: `tick()` → `shouldAdvance()` → `advance()`
- **Condition**: Only runs for `MediaType.Image` (GIFs and Videos excluded)
- **Frequency**: Checks every 100ms until `shouldAdvance()` returns true

#### b) Video Ended Event
- **Location**: `useSlideshow.ts:358-366`
- **Trigger**: `video.onEnded` event → `onVideoEnded()` callback
- **Flow**: `MediaDisplay` → `handleVideoEnded()` → `onVideoEnded()` → `advance()`
- **Condition**: Only for `MediaType.Video`
- **Timing**: Immediate (no delay)

#### c) GIF Completion Timeout
- **Location**: `MediaDisplay.tsx:869-899` (main), `929-956` (fallback)
- **Trigger**: `setTimeout(() => onGifCompleted(), finalDuration)`
- **Flow**: `MediaDisplay` GIF `onLoad` → parse metadata → set timeout → `onGifCompleted()` → `advance()`
- **Condition**: Only for `MediaType.Gif`
- **Timing**: Based on parsed GIF duration (min 500ms, max 30s, default 3s fallback)

### 2. Manual Advancement Triggers

#### d) Navigate Next Button
- **Location**: `App.tsx:808-810`
- **Trigger**: User clicks "Next" button
- **Flow**: `handleNext()` → `navigateNext()` → `advance()`
- **Effect**: Clears timer before advancing

#### e) Navigate Previous Button
- **Location**: `App.tsx:812-814`
- **Trigger**: User clicks "Previous" button
- **Flow**: `handlePrevious()` → `navigatePrevious()` → direct `onNavigate()` (bypasses `advance()`)
- **Effect**: Clears timer before navigating

#### f) Image/Media Click
- **Location**: `App.tsx:1173`, `MediaDisplay.tsx:596-654`
- **Trigger**: User clicks on media element
- **Flow**: `handleClick()` → `onImageClick()` → `handleNext()` → `navigateNext()` → `advance()`
- **Effect**: Clears timer before advancing

#### g) Keyboard Shortcuts
- **Location**: `App.tsx:966` (Arrow Right), `App.tsx:1059` (Space)
- **Trigger**: User presses keyboard shortcut
- **Flow**: Keyboard handler → `handleNext()` → `navigateNext()` → `advance()`
- **Effect**: Clears timer before advancing

#### h) After Max Retries
- **Location**: `App.tsx:1264-1266`
- **Trigger**: Media load fails after max retry attempts
- **Flow**: `setTimeout(() => navigateNext(), 1000)` → `advance()`
- **Effect**: Skips failed media item

## B) Current Behavior Flow Diagrams

### Image Playback Flow
```
MediaDisplay renders <img>
  ↓
onLoad fires → onMediaLoadSuccess()
  ↓
App.tsx: setMediaLoadState({ isLoaded: true, loadTimestamp: Date.now() })
  ↓
useSlideshow effect (line 399-412) detects isLoaded → startSlideshow()
  ↓
Timer starts: setInterval(tick, 100ms)
  ↓
Every 100ms: tick() → shouldAdvanceImage() checks:
  - isRetrying? → NO
  - isLoaded? → YES
  - loadTimestamp exists? → YES
  - elapsedSinceLoad >= delayMs? → Check every 100ms
  ↓
When condition met: advance() → onNavigate(nextIndex)
```

**Issues**:
- ✅ Timer correctly waits for load
- ✅ Minimum delay enforced after load
- ⚠️ Multiple effects can restart timer (lines 257, 281, 302, 319, 399)

### Video Playback Flow
```
MediaDisplay renders <video>
  ↓
onLoadedData fires → onMediaLoadSuccess()
  ↓
Video plays automatically (autoplay)
  ↓
Video ends → onEnded fires
  ↓
handleVideoEnded() → onVideoEnded() → advance()
```

**Issues**:
- ✅ No timer runs for videos (correct)
- ✅ Advances immediately on ended (correct)
- ✅ Fallback: None (could add if ended doesn't fire)

### GIF Playback Flow (CURRENT - PROBLEMATIC)
```
MediaDisplay renders <img> (GIF)
  ↓
onLoad fires → Check gifLoadHandledRef.has(mediaId)
  ↓
If not handled:
  - Mark as handled: gifLoadHandledRef.add(mediaId)
  - Set currentGifMediaRef.current = mediaId
  - Parse GIF metadata (async)
  ↓
Parse completes → Set timeout: setTimeout(onGifCompleted, finalDuration)
  ↓
Timeout fires → Validate currentGifMediaRef === mediaId
  ↓
If valid: onGifCompleted() → advance()
```

**ROOT CAUSE OF ~9 LOOPS**:

1. **Component Remounts Reset Guards**:
   - `App.tsx:1166`: `key={currentMedia.filePath}-${currentMediaReloadKey}`
   - When `reloadKey` changes (retry), component fully remounts
   - Remount resets ALL refs in MediaDisplay, including `gifLoadHandledRef`
   - `gifLoadHandledRef` is only cleared on media change (line 124), NOT on remount

2. **Multiple Timeout Setups**:
   - Each remount → new `onLoad` → new parsing → new timeout
   - If GIF remounts 9 times, 9 timeouts are set
   - Each timeout fires and calls `onGifCompleted()`
   - But `advance()` has re-entrancy guard, so only first one advances
   - However, the GIF element itself may have looped 9 times visually

3. **GIF Element Looping**:
   - Browser `<img>` with GIF src will loop infinitely by default
   - No way to prevent looping with `<img>` tag
   - Timeout is set for ONE cycle duration, but GIF keeps looping
   - If timeout is slightly off, GIF loops multiple times before timeout fires

4. **Race Condition**:
   - If media changes while timeout is pending, timeout should validate
   - But if component remounts with SAME media (reloadKey change), validation passes
   - Multiple timeouts for same media can all fire

## C) Why GIF Loops ~9 Times: Root Cause Analysis

### Hypothesis 1: Multiple Remounts (MOST LIKELY)
- **Evidence**: `reloadKey` changes on retry (line 1229)
- **Evidence**: `gifLoadHandledRef` is cleared on media change, not remount
- **Evidence**: Each remount resets refs, allowing new timeout setup
- **Calculation**: If retry happens 3 times with 3 attempts each = 9 remounts

### Hypothesis 2: GIF Duration Miscalculation
- **Evidence**: GIF duration parsed from frame delays
- **Evidence**: Some GIFs have frame delays that don't account for browser rendering
- **Evidence**: If parsed duration is 1/9th of actual, timeout fires 9x too early
- **Unlikely**: Would affect all GIFs consistently

### Hypothesis 3: Timer + GIF Timeout Conflict
- **Evidence**: Timer should NOT run for GIFs (line 184 checks `shouldRunTimer`)
- **Evidence**: But if timer somehow runs, it could advance prematurely
- **Evidence**: GIF timeout also fires, causing double-advance
- **Unlikely**: Re-entrancy guard prevents double-advance

### Hypothesis 4: Browser GIF Looping
- **Evidence**: `<img>` with GIF src loops infinitely by default
- **Evidence**: No CSS or attribute to prevent looping
- **Evidence**: Timeout set for one cycle, but GIF visually loops
- **MOST LIKELY**: Combined with remounts, this causes visual looping

## D) Spec Violations

1. **GIF plays multiple times**: Should play exactly once
2. **GIF remounts reset guards**: Guards should persist across remounts
3. **No way to prevent GIF looping**: `<img>` tag doesn't support loop control
4. **Multiple effects restart timer**: Could cause race conditions
5. **Manual prev bypasses advance()**: Inconsistent with next

## E) Proposed Solution Architecture

### Unified Playback Controller
- **Single source of truth** for when to advance
- **State machine** tracking: loading → ready → playing → completed
- **One timer** per media item, owned by controller
- **Event-driven** for videos/GIFs, timer-driven for images
- **Remount-safe** guards stored outside component (App-level refs)

### GIF-Specific Fixes
1. **Prevent remount loops**: Store `gifLoadHandledRef` in App.tsx, not MediaDisplay
2. **Prevent GIF looping**: Use `<video>` tag for GIFs (if feasible) OR use canvas with frame control
3. **Single timeout**: Validate media ID and clear previous timeout before setting new one
4. **Debug logging**: Track remount count, timeout count, and advance count per GIF

