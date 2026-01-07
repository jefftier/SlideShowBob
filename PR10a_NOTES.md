# PR10a: Observability Basics - Structured Logging + In-App Event Log

## Summary
Added minimal observability suitable for enterprise troubleshooting:
- Structured logger utility with log levels (debug/info/warn/error)
- Bounded in-memory event log (last 200 events)
- Instrumentation of key flows for troubleshooting

## New Utilities

### 1. `web/frontend/src/utils/logger.ts`
Structured logger utility with:
- **Log levels**: `debug`, `info`, `warn`, `error`
- **Log entry structure**: `{ timestamp, level, event, payload? }`
- **Behavior**:
  - Dev: logs everything to console
  - Prod: defaults to info+ (debug disabled unless `VITE_ENABLE_DEBUG_LOGS=true`)
- **Helper method**: `logger.event(name, payload?, level="info")`
- **Convenience methods**: `logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()`

### 2. `web/frontend/src/utils/eventLog.ts`
Bounded in-memory event log:
- Stores last 200 events (configurable via `MAX_EVENTS`)
- **Exports**:
  - `addEvent(entry: LogEntry)` - Add event to log
  - `getEvents()` - Get all events (returns copy)
  - `clearEvents()` - Clear all events
- **Dev helper**: `window.__eventLog.get()` / `window.__eventLog.clear()`

## Instrumented Events

The following events are now logged:

### Media Loading
1. **`media_load_success`** (info)
   - Emitted when image or video loads successfully
   - Payload: `{ mediaType: 'image' | 'video', fileName, filePath }`
   - Location: `MediaDisplay.tsx` (onLoad/onLoadedData handlers)

2. **`media_load_error`** (error)
   - Emitted when image or video fails to load
   - Payload: `{ mediaType: 'image' | 'video', fileName, filePath, error }`
   - Location: `MediaDisplay.tsx` (handleImageError/handleVideoError)

### Retry Policy (PR3)
3. **`retry_scheduled`** (info)
   - Emitted when a retry is scheduled after a media load error
   - Payload: `{ mediaId, fileName, attempt, maxAttempts, delayMs }`
   - Location: `App.tsx` (onMediaError handler, when shouldRetry is true)

4. **`final_skip_after_max_retries`** (error)
   - Emitted when max retries reached and media is skipped
   - Payload: `{ mediaId, fileName, attempts, maxAttempts, errorType }`
   - Location: `App.tsx` (onMediaError handler, when shouldRetry is false)

### Folder Permissions (PR8a)
5. **`folder_permission_revoked_removal`** (warn)
   - Emitted when a folder is removed due to revoked permission
   - Payload: `{ folderName }`
   - Location: `App.tsx` (handleRevokedFolder)

### Settings Storage (PR9a)
6. **`settings_load_failed`** (error)
   - Emitted when settings fail to load from localStorage
   - Payload: `{ error: 'parse_error' | 'storage_error', errorMessage }`
   - Location: `settingsStorage.ts` (loadSettings)

7. **`settings_save_failed`** (error)
   - Emitted when settings fail to save to localStorage
   - Payload: `{ error: 'write_error' | 'unknown_error', errorMessage }`
   - Location: `settingsStorage.ts` (saveSettings)

### Directory Storage (PR9b)
8. **`directory_storage_save_failed`** (error)
   - Emitted when directory handle fails to save to IndexedDB
   - Payload: `{ folderName, error: 'quota_error' | 'unknown_error', errorMessage }`
   - Location: `directoryStorage.ts` (saveDirectoryHandle)

9. **`directory_storage_load_failed`** (error)
   - Emitted when directory handles fail to load from IndexedDB
   - Payload: `{ error: 'read_error', errorMessage }`
   - Location: `directoryStorage.ts` (loadDirectoryHandles)

## Modified Files

1. **NEW**: `web/frontend/src/utils/logger.ts`
2. **NEW**: `web/frontend/src/utils/eventLog.ts`
3. **MODIFIED**: `web/frontend/src/components/MediaDisplay.tsx`
   - Added logging for media load success/error
4. **MODIFIED**: `web/frontend/src/App.tsx`
   - Added logging for retry scheduled, final skip, folder permission revoked
5. **MODIFIED**: `web/frontend/src/utils/settingsStorage.ts`
   - Added logging for settings save/load failures
6. **MODIFIED**: `web/frontend/src/utils/directoryStorage.ts`
   - Added logging for directory storage save/load failures

## How to Inspect Events in Dev

In development mode, the event log is exposed on the window object:

```javascript
// Get all events
window.__eventLog.get()

// Clear all events
window.__eventLog.clear()

// Example: Filter for errors only
window.__eventLog.get().filter(e => e.level === 'error')

// Example: Find specific event
window.__eventLog.get().find(e => e.event === 'media_load_error')
```

## Production Behavior

- Debug logs are disabled by default in production
- To enable debug logs in production, set `VITE_ENABLE_DEBUG_LOGS=true`
- Event log is always maintained in memory (last 200 events)
- Window helper (`window.__eventLog`) is only available in dev mode

## Design Decisions

1. **No external services**: All logging is in-memory, no telemetry vendors (Sentry, etc.) - that's PR10b
2. **Bounded log**: Limited to 200 events to prevent memory issues
3. **Structured format**: All events follow consistent structure for easy filtering/analysis
4. **Minimal payload**: Only essential data logged, no secrets or full file contents
5. **Non-intrusive**: Logging doesn't affect app behavior, failures are handled gracefully

## Testing

- Build passes: `npm run build` (pre-existing TypeScript errors in other files, not related to this PR)
- All instrumentation points verified
- Event log helper available in dev mode

## Next Steps (PR10b)

- Add Sentry/telemetry vendor integration
- Export event log to external service
- Add metrics/analytics

