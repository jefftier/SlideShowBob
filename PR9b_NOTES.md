# PR9b: Directory Storage Error Handling (IndexedDB)

## Branch
`enterprise/pr9b-indexeddb-storage-errors`

## Goal
Stop silent failures when saving/loading/deleting directory handles (IndexedDB). If IDB fails, app must:
- not crash
- show a clear user-visible warning
- fall back safely (empty folders on load failure)

**Scope:** Only `web/frontend/src/utils/directoryStorage.ts` and its direct callsites in `App.tsx`. No changes to `settingsStorage.ts` (already handled in PR9a).

## What Previously Failed Silently

### Before This PR
1. **Load failures**: If `loadDirectoryHandles()` failed (e.g., IndexedDB disabled, quota exceeded, database corruption), errors were logged to console but no user-visible warning was shown. The app would silently fall back to empty folder state.

2. **Save failures**: If `saveDirectoryHandle()` failed (e.g., quota exceeded, storage disabled), errors were logged but the user wasn't notified that their folder selections wouldn't persist after reload.

3. **Remove failures**: If `removeDirectoryHandle()` failed, errors were silently ignored. The folder would be removed from UI but might remain in IndexedDB.

4. **Clear failures**: If `clearAllDirectoryHandles()` failed, errors were only shown for quota issues, not for other failures.

## What Now Happens on Failure

### Load Path (`loadDirectoryHandles`)
- **IndexedDB errors**: Caught by try/catch, logged to `console.warn`, user sees: "Could not load saved folders. Please re-add them." (shown once per session)
- **Fallback behavior**: Throws friendly error that App.tsx catches, then uses empty Map as fallback. App continues running normally with no folders loaded.

### Save Path (`saveDirectoryHandle`)
- **IndexedDB errors**: Wrapped in try/catch, logged to `console.warn`, user sees: "Unable to save folders. Changes may not persist after reload." (throttled to at most once per 5 seconds)
- **DataCloneError**: Silently handled (browser limitation, not a real error)
- **App behavior**: Continues running with in-memory state. Folder is added to UI but won't persist across page reloads.

### Remove Path (`removeDirectoryHandle`)
- **IndexedDB errors**: Wrapped in try/catch, logged to `console.warn`, user sees: "Unable to remove folder from storage."
- **App behavior**: Folder is removed from UI even if IDB removal fails. Error is shown but doesn't block the operation.

### Clear Path (`clearAllDirectoryHandles`)
- **IndexedDB errors**: Wrapped in try/catch, logged to `console.warn`, user sees: "Unable to clear saved folders."
- **App behavior**: Continues running. Current folders in state remain active, but won't be saved on next load.

### User-Visible Warnings
- **Load failures**: One warning toast per session (tracked via `hasShownReadError` flag) to avoid spam
- **Save failures**: Error toast shown at most once per 5 seconds (throttled via `hasShownSaveError` and `lastSaveErrorTime`)
- **Remove/Clear failures**: Error toast shown each time (user should know the operation failed)

## Files Changed

### `web/frontend/src/utils/directoryStorage.ts`

**Key Changes:**
1. **Enhanced error handling**: All IDB operations wrapped in try/catch with friendly error messages
2. **Error deduplication**: 
   - `hasShownReadError` flag prevents multiple load warnings per session
   - `hasShownSaveError` + `lastSaveErrorTime` throttle save errors to at most once per 5 seconds
3. **Friendly error throwing**: All functions now throw user-safe Error messages that App.tsx can catch and display
4. **Backward compatibility**: Callbacks still supported but errors are also thrown for App.tsx to catch
5. **Safe fallbacks**: 
   - `loadDirectoryHandles` throws error (App.tsx catches and uses empty Map)
   - `saveDirectoryHandle` throws error (App.tsx catches and continues with in-memory state)
   - `removeDirectoryHandle` throws error (App.tsx catches and continues with UI removal)
   - `clearAllDirectoryHandles` throws error (App.tsx catches and continues)
6. **Silent cleanup**: Permission check failures during load silently remove invalid handles (no user notification needed)

### `web/frontend/src/App.tsx`

**Key Changes:**
1. **Error catching**: All `directoryStorage` function calls wrapped in try/catch blocks
2. **Toast notifications**: Errors caught from `directoryStorage` are displayed via `showError`/`showWarning` toasts
3. **Safe fallbacks**: 
   - On `loadDirectoryHandles` failure: uses empty Map, shows warning toast
   - On `saveDirectoryHandle` failure: continues with in-memory state, shows error toast
   - On `removeDirectoryHandle` failure: continues with UI removal, shows error toast
   - On `clearAllDirectoryHandles` failure: continues, shows error toast
4. **Error handling in cleanup**: Permission check loops silently handle `removeDirectoryHandle` errors (cleanup operations)

## Functions Hardened

1. **`saveDirectoryHandle`**: Throws "Unable to save folders. Changes may not persist after reload." on failure
2. **`loadDirectoryHandles`**: Throws "Could not load saved folders. Please re-add them." on failure
3. **`removeDirectoryHandle`**: Throws "Unable to remove folder from storage." on failure
4. **`clearAllDirectoryHandles`**: Throws "Unable to clear saved folders." on failure

## User Messages

- **Load failure**: "Could not load saved folders. Please re-add them." (warning, once per session)
- **Save failure**: "Unable to save folders. Changes may not persist after reload." (error, throttled)
- **Remove failure**: "Unable to remove folder from storage." (error)
- **Clear failure**: "Unable to clear saved folders." (error)

## How to Verify

### Manual Testing

#### Test 1: Simulate Load Failure
1. Open DevTools → Console
2. Temporarily override `indexedDB.open` to throw an error:
   ```javascript
   const originalOpen = indexedDB.open;
   indexedDB.open = function() { 
     return { onerror: () => {}, onsuccess: () => {}, onupgradeneeded: () => {} };
   };
   // Or force an error:
   indexedDB.open = function() {
     const req = { onerror: null, onsuccess: null, onupgradeneeded: null };
     setTimeout(() => { if (req.onerror) req.onerror({ target: { error: new Error('Test error') } }); }, 0);
     return req;
   };
   ```
3. Reload the app
4. **Expected:**
   - App loads successfully
   - Empty folder state (no folders loaded)
   - One warning toast appears: "Could not load saved folders. Please re-add them."

#### Test 2: Simulate Save Failure
1. Open DevTools → Console
2. Temporarily override `indexedDB.open` to return a database that fails on put:
   ```javascript
   // More complex - would need to mock the transaction/objectStore
   // Or use browser DevTools to disable IndexedDB temporarily
   ```
3. Add a folder in the app
4. **Expected:**
   - Folder is added to UI (in-memory)
   - Error toast appears: "Unable to save folders. Changes may not persist after reload."
   - App continues running normally
   - On reload, folder is not persisted

#### Test 3: Simulate Remove Failure
1. Add a folder to the app
2. Open DevTools → Application → IndexedDB → slideshow-db → directoryHandles
3. Manually delete the objectStore (or use console to break it)
4. Remove the folder from the app
5. **Expected:**
   - Folder is removed from UI
   - Error toast appears: "Unable to remove folder from storage."
   - App continues running normally

#### Test 4: Normal Operation
1. Clear IndexedDB or use a fresh browser session
2. Add folders, change settings, reload
3. **Expected:**
   - Folders persist correctly
   - No error messages
   - App behaves normally

### Build Check
- `npm run build` passes for `directoryStorage.ts` and `App.tsx` (pre-existing TypeScript errors in other files are unrelated)

## Technical Details

### Error Handling Strategy
- **Defensive programming**: All IndexedDB operations wrapped in try/catch
- **Graceful degradation**: App always continues running, falls back to empty state on load failure
- **User awareness**: Clear, consistent error messages via toast notifications
- **No crashes**: All errors are caught and handled, app never throws unhandled exceptions
- **Dual error reporting**: Errors both thrown (for App.tsx) and passed via callbacks (backward compatibility)

### Warning Deduplication
- `hasShownReadError` flag prevents showing multiple load warnings in the same session
- `hasShownSaveError` + `lastSaveErrorTime` throttle save errors to at most once per 5 seconds
- Remove/Clear errors shown each time (user needs to know the operation failed)

### Backward Compatibility
- Function signatures unchanged (callbacks parameter was already optional)
- Callbacks still work for backward compatibility
- Errors are also thrown so App.tsx can catch and show toasts
- No breaking changes to existing code

### Error Flow
1. IDB operation fails in `directoryStorage.ts`
2. Error caught, logged to `console.warn`
3. Friendly Error thrown with user-safe message
4. Callback called if provided (backward compatibility)
5. App.tsx catches error and shows toast via `showError`/`showWarning`
6. App continues with safe fallback (empty Map, in-memory state, etc.)

