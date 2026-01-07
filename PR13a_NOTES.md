# PR13a: Controlled PWA Updates (No Surprise Reloads)

## Summary

Implemented controlled PWA updates to prevent automatic service worker updates that could disrupt signage playback. When a new service worker is available, the app now shows a user-controlled update prompt instead of automatically reloading.

## Changes Made

### 1. PWA Configuration (`web/frontend/vite.config.ts`)
- Changed `registerType` from `'autoUpdate'` to `'prompt'`
- This prevents automatic service worker updates

### 2. Service Worker Registration (`web/frontend/src/main.tsx`)
- Added manual service worker registration using `virtual:pwa-register`
- Implemented `onNeedRefresh` handler that dispatches a custom event when an update is available
- Added periodic update checks (every hour) to detect new service worker versions
- Only runs in production mode (service worker disabled in development)

### 3. Update Prompt Component (`web/frontend/src/components/UpdatePrompt.tsx` & `.css`)
- Created minimal banner component that appears at bottom-right of screen
- Shows "Update available. Reload to update." message
- Provides "Reload" button to apply update
- Optional "Dismiss" button (for signage, prompt persists until action taken)
- Styled to match existing app design with warning color scheme

### 4. App Integration (`web/frontend/src/App.tsx`)
- Added state management for update availability (`updateAvailable`)
- Added ref to store update function (`updateSWRef`)
- Listens for `sw-update-available` custom event from service worker registration
- Renders `UpdatePrompt` component when update is available
- Implements `handleApplyUpdate` function that:
  - Calls the service worker update function
  - Reloads the page to apply the update

## How It Works

1. **Service Worker Registration**: On app load (production only), the service worker is registered with `registerType: 'prompt'`
2. **Update Detection**: The service worker periodically checks for updates (every hour) or when the app loads
3. **Update Available**: When a new service worker is detected, `onNeedRefresh` is called
4. **User Notification**: A custom event is dispatched with the update function, which triggers the `UpdatePrompt` to appear
5. **User Action**: User clicks "Reload" button when ready to update
6. **Update Applied**: The update function is called, which activates the new service worker and reloads the page

## Verification Steps

### Manual Testing

1. **Build the app:**
   ```bash
   cd web/frontend
   npm run build
   ```

2. **Serve the built app:**
   ```bash
   npm run preview
   ```
   Or serve the `dist` directory with any web server (nginx, Apache, etc.)

3. **Initial Load:**
   - Open the app in a browser (must be HTTPS or localhost for service worker)
   - Open DevTools → Application → Service Workers
   - Verify service worker is registered

4. **Simulate Update:**
   - Make a visible change to the app (e.g., change a string in `App.tsx`)
   - Rebuild: `npm run build`
   - Reload the page (the service worker should detect the new version)
   - **Expected**: Update prompt appears at bottom-right with "Update available. Reload to update." message
   - **Expected**: App does NOT automatically reload

5. **Apply Update:**
   - Click the "Reload" button in the update prompt
   - **Expected**: Page reloads and new version is active
   - **Expected**: Update prompt disappears

6. **Dismiss Update (optional):**
   - If "Dismiss" button is shown, click it
   - **Expected**: Update prompt disappears
   - **Expected**: Update prompt reappears on next page load if update is still available

### Expected Behavior

✅ **Update prompt appears** when new service worker is waiting  
✅ **App does NOT auto-reload** - only updates when user clicks "Reload"  
✅ **No disruptive reloads** during playback  
✅ **Update prompt persists** until user takes action  
✅ **Update applies correctly** when user clicks "Reload"

## Technical Details

### Service Worker Update Flow

- `registerType: 'prompt'` tells vite-plugin-pwa to NOT automatically apply updates
- The `registerSW` function returns an `updateSW` function that can be called to apply the update
- When `updateSW()` is called, it activates the waiting service worker and reloads the page
- The update prompt only appears in production builds (service worker is disabled in development)

### Custom Event Pattern

The implementation uses a custom event (`sw-update-available`) to communicate between the service worker registration code (in `main.tsx`) and the React app (in `App.tsx`). This pattern:
- Keeps service worker logic separate from React components
- Allows the update function to be passed to the component that needs it
- Maintains clean separation of concerns

## Files Changed

- `web/frontend/vite.config.ts` - Changed registerType to 'prompt'
- `web/frontend/src/main.tsx` - Added service worker registration with onNeedRefresh handler
- `web/frontend/src/components/UpdatePrompt.tsx` - New component for update prompt
- `web/frontend/src/components/UpdatePrompt.css` - Styles for update prompt
- `web/frontend/src/App.tsx` - Integrated UpdatePrompt with state management

## Notes

- Service worker only registers in production mode (`import.meta.env.PROD`)
- Update checks happen automatically every hour
- The update prompt uses the existing app's design language (dark theme, warning colors)
- For enterprise signage, the prompt can be kept visible until action is taken (no auto-dismiss)

## Future Enhancements (Out of Scope for PR13a)

- PR13b: Enhanced caching strategy and offline modes
- Version pinning mechanism
- Update notification preferences
- Scheduled update windows

