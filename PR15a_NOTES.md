# PR15a: Kiosk Mode Implementation

## Overview
Added Kiosk Mode feature for enterprise signage use cases. Kiosk mode provides a fullscreen, distraction-free viewing experience by hiding all admin UI elements while maintaining media playback functionality.

## What Kiosk Mode Does
- **Fullscreen Activation**: Automatically enters fullscreen when kiosk mode is activated
- **UI Hiding**: Hides all admin/control UI elements:
  - Toolbar
  - Playlist window
  - Settings window
  - Keyboard shortcuts help
  - Manifest dialogs
  - Update prompts
  - Empty state messages
- **Media Playback**: Continues normal slideshow playback and media display
- **Status Indicator**: Shows a minimal blue dot in the top-right corner when kiosk mode is active

## Escape Sequence
To exit kiosk mode, use one of these methods:

1. **Ctrl+Alt+K**: Press and hold Ctrl and Alt, then press K
2. **Shift+Escape (3 times)**: Hold Shift and press Escape 3 times within 2 seconds

The escape sequence is intentionally deliberate to prevent accidental exits in a kiosk environment.

**Note**: If the user exits fullscreen via browser controls (e.g., F11 or browser UI), kiosk mode will automatically exit.

## How to Use

### Entering Kiosk Mode
1. Click the "🖥" (monitor) button in the toolbar
2. The app will enter fullscreen and hide all admin UI

### Exiting Kiosk Mode
- Use the escape sequence (Ctrl+Alt+K or Shift+Escape 3 times)
- Exit fullscreen via browser controls (F11, browser UI, etc.)

## Files Changed

### New Files
- `web/frontend/src/hooks/useKioskMode.ts` - Kiosk mode state management and fullscreen handling

### Modified Files
- `web/frontend/src/App.tsx`
  - Integrated `useKioskMode` hook
  - Added conditional rendering to hide UI components when `isKioskMode` is true
  - Added kiosk mode status indicator
  - Updated keyboard shortcuts handler to not interfere with escape sequence

- `web/frontend/src/components/Toolbar.tsx`
  - Added "Enter Kiosk" button (🖥 icon)
  - Added `isKioskMode` and `onEnterKiosk` props
  - Button only visible when not in kiosk mode

## Technical Details

### State Management
- Kiosk mode state is managed by the `useKioskMode` hook
- State automatically syncs with fullscreen API events
- If user exits fullscreen via browser, kiosk mode automatically exits

### Fullscreen API
- Uses standard Fullscreen API with cross-browser fallbacks
- Supports Chrome, Firefox, Safari, and Edge
- Handles fullscreen change events to keep state in sync

### Escape Sequence Implementation
- Escape sequence handler only active when in kiosk mode
- Prevents regular Escape key from exiting fullscreen in kiosk mode
- Two escape methods provided for flexibility

## Verification Steps

### Manual Testing
1. **Enter Kiosk Mode**:
   - Click the "🖥" button in toolbar
   - Verify fullscreen activates
   - Verify all admin UI is hidden (toolbar, playlist, settings, etc.)
   - Verify media playback continues
   - Verify blue status dot appears in top-right corner

2. **Escape Sequence - Ctrl+Alt+K**:
   - While in kiosk mode, press Ctrl+Alt+K
   - Verify kiosk mode exits
   - Verify fullscreen exits
   - Verify admin UI is restored

3. **Escape Sequence - Shift+Escape (3 times)**:
   - While in kiosk mode, hold Shift and press Escape 3 times within 2 seconds
   - Verify kiosk mode exits
   - Verify fullscreen exits
   - Verify admin UI is restored

4. **Browser Fullscreen Exit**:
   - Enter kiosk mode
   - Exit fullscreen via browser (F11 or browser UI)
   - Verify kiosk mode automatically exits
   - Verify admin UI is restored

5. **Functionality in Kiosk Mode**:
   - Verify slideshow continues playing
   - Verify retry/backoff still works for media errors
   - Verify slideshow timers continue to function
   - Verify media navigation (if keyboard shortcuts still work)

6. **Edge Cases**:
   - Enter kiosk mode with no media loaded (should still work)
   - Enter kiosk mode while playlist/settings windows are open (should hide them)
   - Try partial escape sequence (Shift+Escape 1-2 times) - should not exit

## Build & Tests
- `npm run build` - Builds successfully (some pre-existing TypeScript warnings in other files)
- Manual testing required for full verification

## Notes
- Kiosk mode does not persist across page reloads (by design - minimal implementation)
- No remote management or device enrollment features (out of scope)
- Escape sequence is intentionally non-trivial to prevent accidental exits
- Status indicator is minimal and unobtrusive

