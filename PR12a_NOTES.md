# PR12a: Extract Folder Persistence into Hook

## Summary
Extracted folder persistence and revoked-folder handling logic from `App.tsx` into a new hook `useFolderPersistence.ts`. This reduces `App.tsx` complexity by moving one cohesive concern (folder storage management) into a dedicated hook.

## Changes

### New File
- **`web/frontend/src/hooks/useFolderPersistence.ts`**
  - Manages `directoryHandles` and `folders` state
  - Provides functions:
    - `loadFolders(saveFoldersEnabled)` - loads saved folders from IndexedDB
    - `persistFolder(folderName, handle, saveFoldersEnabled)` - saves folder handle to IndexedDB
    - `removeFolder(folderName)` - removes folder from state and IndexedDB
    - `handleRevokedFolder(folderName, playlist)` - handles revoked permission cleanup
    - `clearAllFolders()` - clears all folders from state and IndexedDB
  - Exposes `setFolders` for special cases (manifest mode)

### Modified File
- **`web/frontend/src/App.tsx`**
  - Removed `directoryHandles` and `folders` state declarations
  - Removed direct imports of `loadDirectoryHandles`, `saveDirectoryHandle`, `removeDirectoryHandle`, `clearAllDirectoryHandles`
  - Replaced folder loading logic in initialization `useEffect` with `loadFolders()` hook call
  - Replaced folder saving in `handleAddFolder` with `persistFolder()` hook call
  - Updated `handleRevokedFolder` to use hook version and return removed items
  - Replaced folder removal in `onRemoveFolder` with `removeFolder()` hook call
  - Replaced `clearAllDirectoryHandles` calls with `clearAllFolders()` hook call
  - Updated manifest mode handlers to use hook functions

## Responsibilities Moved

### From App.tsx to useFolderPersistence Hook:
1. **Folder state management**
   - `directoryHandles` Map state
   - `folders` array state

2. **Folder persistence operations**
   - Loading saved folders from IndexedDB on startup
   - Saving new folder handles to IndexedDB
   - Removing folder handles from IndexedDB
   - Clearing all folder handles from IndexedDB

3. **Error handling for persistence**
   - Try/catch blocks for IDB operations
   - Toast notifications for persistence errors (via callbacks)

4. **Revoked folder handling**
   - `handleRevokedFolder` helper function
   - Removes folder from state and storage
   - Revokes object URLs for media items in revoked folder
   - Returns removed items for playlist cleanup

## Functions Now in Hook

- `loadFolders(saveFoldersEnabled)` - async function to load folders from IndexedDB
- `persistFolder(folderName, handle, saveFoldersEnabled)` - async function to save folder
- `removeFolder(folderName)` - async function to remove folder
- `handleRevokedFolder(folderName, playlist)` - async function to handle revoked permissions
- `clearAllFolders()` - async function to clear all folders

## Behavior Verification

All behavior remains identical:
- ✅ Saved folders load on startup (or fail with same toast messages)
- ✅ Adding folders still works and persists to IndexedDB
- ✅ Removing folders still works and removes from IndexedDB
- ✅ Revoked permission handling still removes folder + playlist items + revokes URLs
- ✅ Manifest mode folder handling still works
- ✅ Settings changes (saveFolders toggle) still clear folders when disabled

## Quick Smoke Test Steps

1. **Load saved folders:**
   - Add a folder, reload page → folder should reload automatically

2. **Add folder:**
   - Click "Add Folder" → select folder → should save and appear in playlist

3. **Remove folder:**
   - Open playlist → remove folder → should remove from playlist and storage

4. **Revoked permission:**
   - Add folder → revoke permission in browser settings → reload page → should show error toast and remove folder

5. **Settings toggle:**
   - Disable "Save folders" in settings → saved folders should be cleared from IndexedDB

## Build & Test Results

- ✅ `npm run build` - passes (only pre-existing warnings in other files)
- ✅ `npm run test:run` - all tests pass (11/11)

## Notes

- The hook accepts callbacks (`showError`, `showWarning`, `revokeUrlsForMediaItems`) to avoid tight coupling with React components
- `handleRevokedFolder` returns removed media items so App.tsx can handle playlist state updates
- `setFolders` is exposed for special cases like manifest mode where folders array is used differently
- All error handling and toast notifications remain identical to before

