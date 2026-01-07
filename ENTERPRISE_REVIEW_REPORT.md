# SlideShowBob Web Application - Enterprise Security & Code Quality Review

**Review Date:** 2024  
**Reviewer:** Staff+ Full-Stack Engineer + AppSec Reviewer  
**Scope:** `web/frontend` (React/TypeScript PWA)  
**Context:** Enterprise-class slideshow/digital signage player (long-running tab, reliability-sensitive, security-sensitive)

---

## Executive Summary

**Risk Score: 6.5/10 (Medium-High)**

The SlideShowBob web application is a functional React-based PWA for slideshow playback with File System Access API integration. While the core functionality is solid, there are **critical gaps** in enterprise readiness:

### Critical Findings
- ❌ **No Content Security Policy (CSP)** - XSS vulnerability vector
- ❌ **Memory leak risks** - Object URLs not consistently revoked, event listeners may accumulate
- ❌ **No error recovery/retry logic** - Media failures cause immediate skip without retry
- ❌ **No observability** - No structured logging, metrics, or health monitoring
- ❌ **No testing infrastructure** - Zero unit/integration/e2e tests
- ⚠️ **Service Worker caching strategy** - Basic Workbox config, no cache versioning/rollback
- ⚠️ **Timer management** - Multiple `setInterval`/`setTimeout` without guaranteed cleanup
- ⚠️ **Permission lifecycle** - Directory handle revocation handling is incomplete

### Strengths
- ✅ TypeScript with strict mode enabled
- ✅ Modern React patterns (hooks, functional components)
- ✅ Proper IndexedDB usage for directory handle persistence
- ✅ Manifest-based playlist support (enterprise feature)
- ✅ Virtual scrolling for large playlists
- ✅ LRU cache for thumbnails

### Immediate Actions Required
1. Implement CSP headers
2. Add comprehensive error handling with retry logic
3. Fix memory leak patterns (object URL cleanup, event listener cleanup)
4. Add structured logging and health monitoring
5. Implement test suite (start with critical paths)

---

## 1) Repository Understanding

### High-Level Architecture

**Application Type:** Progressive Web App (PWA) for local file-based slideshow playback

**Tech Stack:**
- **Frontend:** React 18.3.1, TypeScript 5.9.3, Vite 7.2.4
- **Styling:** Tailwind CSS 4.1.18 (via PostCSS)
- **PWA:** vite-plugin-pwa 1.2.0 (Workbox-based)
- **File Access:** File System Access API (Chrome/Edge only)
- **Storage:** localStorage (settings), IndexedDB (directory handles)

**Core Modules:**

1. **UI Layer** (`src/components/`)
   - `App.tsx` - Root component, state management, orchestration
   - `MediaDisplay.tsx` - Media rendering (image/video), zoom/pan, click handling
   - `Toolbar.tsx` - Playback controls, settings access
   - `PlaylistWindow.tsx` - Playlist management, folder tree, thumbnail grid
   - `SettingsWindow.tsx` - User preferences
   - Dialog components (ManifestModeDialog, ManifestSelectionDialog, etc.)

2. **State Management** (`src/hooks/`)
   - `useSlideshow.ts` - Slideshow timer logic, navigation
   - `useMediaLoader.ts` - File system scanning, media discovery
   - `useToast.ts` - Toast notification system

3. **Storage Layer** (`src/utils/`)
   - `settingsStorage.ts` - localStorage persistence for user preferences
   - `directoryStorage.ts` - IndexedDB persistence for FileSystemDirectoryHandle objects
   - `manifestLoader.ts` - JSON manifest parsing/validation for custom playlists
   - `thumbnailGenerator.ts` - Canvas-based thumbnail generation with LRU cache

4. **Types** (`src/types/`)
   - `media.ts` - MediaItem type, MediaType enum
   - `manifest.ts` - SlideshowManifest schema

### Folder/Module Map for `web/frontend/`

```
web/frontend/
├── src/
│   ├── components/          # React UI components (22 files: 12 TSX, 10 CSS)
│   │   ├── App.tsx          # Root orchestrator (1145 lines - needs refactor)
│   │   ├── MediaDisplay.tsx # Media rendering engine
│   │   ├── Toolbar.tsx      # Control panel
│   │   ├── PlaylistWindow.tsx # Playlist management UI
│   │   └── [dialogs, toasts, etc.]
│   ├── hooks/               # Custom React hooks (3 files)
│   │   ├── useSlideshow.ts  # Timer-based playback logic
│   │   ├── useMediaLoader.ts # File system scanning
│   │   └── useToast.ts      # Notification system
│   ├── utils/               # Pure utility functions (5 files)
│   │   ├── directoryStorage.ts # IndexedDB wrapper
│   │   ├── settingsStorage.ts  # localStorage wrapper
│   │   ├── manifestLoader.ts  # Manifest validation/parsing
│   │   ├── thumbnailGenerator.ts # Canvas thumbnail generation
│   │   └── folderTree.ts    # Tree structure utilities
│   ├── types/               # TypeScript type definitions
│   │   ├── media.ts         # MediaItem, MediaType
│   │   └── manifest.ts      # SlideshowManifest schema
│   ├── App.tsx              # Main app component
│   ├── main.tsx             # React entry point
│   └── style.css            # Global styles
├── dist/                     # Build output (PWA assets + SW)
├── index.html               # HTML entry point
├── vite.config.ts           # Vite + PWA config
├── tsconfig.json             # TypeScript config (strict mode)
└── package.json             # Dependencies

Note: No test/ directory, no .eslintrc, no .prettierrc
```

### Data Flow Summary

**Content Ingest → Storage → Playlist/Schedule → Playback → Telemetry/Health**

#### 1. Content Ingest
- **Entry Point:** `App.tsx::handleAddFolder()` (line 229)
- **Flow:**
  1. User clicks "Add Folder" → `window.showDirectoryPicker()` (File System Access API)
  2. `useMediaLoader::loadMediaFromDirectory()` → `scanDirectory()` (recursive file walk)
  3. Files filtered by extension (IMAGE_EXTENSIONS, VIDEO_EXTENSIONS)
  4. For each file: `fileHandle.getFile()` → `URL.createObjectURL(file)` → `MediaItem` created
  5. **Manifest Detection:** `findManifestFiles()` → `loadManifestFile()` → `matchManifestToMedia()`
  6. Directory handle stored in IndexedDB via `directoryStorage.ts::saveDirectoryHandle()`

**Evidence:** `web/frontend/src/hooks/useMediaLoader.ts:24-105`, `web/frontend/src/App.tsx:229-426`

#### 2. Storage
- **Settings:** `localStorage` via `settingsStorage.ts` (key: `'slideshow-settings'`)
- **Directory Handles:** IndexedDB via `directoryStorage.ts` (DB: `'slideshow-db'`, Store: `'directoryHandles'`)
- **Thumbnails:** In-memory Map with LRU eviction (200 items) in `thumbnailGenerator.ts`
- **Media Object URLs:** Stored in `MediaItem.objectUrl` (created but **not consistently revoked**)

**Evidence:** `web/frontend/src/utils/settingsStorage.ts:20`, `web/frontend/src/utils/directoryStorage.ts:3-5`, `web/frontend/src/utils/thumbnailGenerator.ts:29`

#### 3. Playlist/Schedule
- **Playlist State:** `App.tsx::playlist` (array of `MediaItem[]`)
- **Sorting:** `sortMediaItems()` - Name/Date/Random modes
- **Manifest Mode:** Per-item delays via `manifestDelay` property, `defaultDelay` fallback
- **Filtering:** `filteredPlaylist` excludes videos/GIFs when `includeVideos === false`

**Evidence:** `web/frontend/src/App.tsx:37,69-74,200-227,94-102`

#### 4. Playback
- **Engine:** `useSlideshow.ts` - `setInterval`-based timer (line 44)
- **Navigation:** `navigateNext()` / `navigatePrevious()` → `onNavigate(index)` → `setCurrentMedia()`
- **Media Display:** `MediaDisplay.tsx` - renders `<img>` or `<video>` with object URL
- **Video Auto-Advance:** `onVideoEnded` callback → `videoEndedRef.current = true` → timer skips next tick
- **Error Handling:** `onMediaError` → toast + auto-advance after 1s (line 907-911)

**Evidence:** `web/frontend/src/hooks/useSlideshow.ts:35-45`, `web/frontend/src/components/MediaDisplay.tsx:186-206`, `web/frontend/src/App.tsx:907-911`

#### 5. Telemetry/Health
- **Status:** ❌ **MISSING** - No structured logging, metrics, or health endpoints
- **Current:** Only `console.error/warn` statements, toast notifications
- **No:** Error tracking (Sentry, etc.), performance metrics, heartbeat, crash reporting

**Evidence:** Search for `console.` - found only basic logging, no structured format

### Top 10 Files to Understand the System

1. **`web/frontend/src/App.tsx`** (1145 lines)
   - **Why:** Root orchestrator, all state management, data flow entry points
   - **Key:** `handleAddFolder()`, `handlePlayPause()`, manifest mode logic, initialization

2. **`web/frontend/src/components/MediaDisplay.tsx`** (595 lines)
   - **Why:** Core playback engine, media rendering, zoom/pan, error handling
   - **Key:** Object URL lifecycle, video/image loading, error callbacks

3. **`web/frontend/src/hooks/useSlideshow.ts`** (83 lines)
   - **Why:** Timer-based playback logic, navigation, video end detection
   - **Key:** `setInterval` management, `startSlideshow()` / `stopSlideshow()`

4. **`web/frontend/src/hooks/useMediaLoader.ts`** (159 lines)
   - **Why:** File system scanning, media discovery, object URL creation
   - **Key:** `scanDirectory()` recursive walk, `createObjectURL()` usage

5. **`web/frontend/src/utils/directoryStorage.ts`** (157 lines)
   - **Why:** IndexedDB persistence for directory handles, permission verification
   - **Key:** `saveDirectoryHandle()`, `loadDirectoryHandles()` with permission checks

6. **`web/frontend/src/utils/thumbnailGenerator.ts`** (333 lines)
   - **Why:** Thumbnail generation with memory management, LRU cache
   - **Key:** `generateThumbnail()`, `revokeThumbnail()`, cache eviction

7. **`web/frontend/src/utils/manifestLoader.ts`** (251 lines)
   - **Why:** Manifest file validation, matching to media items
   - **Key:** `validateManifest()`, `matchManifestToMedia()`, JSON parsing

8. **`web/frontend/src/components/PlaylistWindow.tsx`** (710+ lines)
   - **Why:** Playlist UI, folder tree, thumbnail grid, virtual scrolling
   - **Key:** Intersection Observer for lazy loading, thumbnail batch loading

9. **`web/frontend/vite.config.ts`** (30 lines)
   - **Why:** PWA configuration, Service Worker setup, build config
   - **Key:** `VitePWA` plugin config, Workbox settings

10. **`web/frontend/src/utils/settingsStorage.ts`** (97 lines)
    - **Why:** User preferences persistence, localStorage wrapper
    - **Key:** `loadSettings()`, `saveSettings()`, default values

---

## 2) Best-Practices Checklist for Signage/Slideshow Apps

### Playback Reliability

| Practice | Status | Evidence | Gap |
|----------|--------|----------|-----|
| Offline/spotty network handling | ⚠️ Partial | PWA with Workbox, but no network retry logic | No retry/backoff for media load failures |
| Caching strategy | ⚠️ Basic | Workbox precache for app assets only | Media files not cached (File System API limitation) |
| Retries/backoff | ❌ Missing | `onMediaError` → immediate skip (line 910) | No retry logic, no exponential backoff |
| Watchdog/health | ❌ Missing | No health monitoring | No heartbeat, no crash detection |

**Evidence:** `web/frontend/src/App.tsx:907-911` - Error handler immediately advances, no retry

### Long-Running Stability

| Practice | Status | Evidence | Gap |
|----------|--------|----------|-----|
| Memory leak prevention | ⚠️ Partial | Some cleanup, but gaps | Object URLs not revoked on playlist removal, event listeners may accumulate |
| Timer discipline | ⚠️ Partial | `clearInterval` in cleanup, but race conditions possible | Multiple timers can stack if `stopSlideshow()` called during navigation |
| Event listener cleanup | ⚠️ Partial | Most listeners cleaned up, but some edge cases | `MediaDisplay.tsx:168-174` - listeners added conditionally, cleanup may miss |
| Media cleanup | ⚠️ Partial | Video refs cleaned, but object URLs persist | `useMediaLoader.ts:70` - object URLs created but not tracked for revocation |
| Object URL lifecycle | ⚠️ Partial | Thumbnails revoked, but media object URLs not | `MediaDisplay.tsx:62-66` - comment says "don't revoke here" |

**Evidence:**
- `web/frontend/src/hooks/useMediaLoader.ts:70` - `createObjectURL()` without revocation tracking
- `web/frontend/src/components/MediaDisplay.tsx:62-66` - Object URLs not revoked on media change
- `web/frontend/src/hooks/useSlideshow.ts:54-61` - Timer cleanup in effect, but race conditions possible

### Scheduling Correctness

| Practice | Status | Evidence | Gap |
|----------|--------|----------|-----|
| Timezone/DST handling | ✅ N/A | Uses `Date.now()` for timestamps only | No time-based scheduling (only delay-based) |
| Deterministic selection | ✅ Good | Sort modes are deterministic (except Random) | Random mode uses `Math.random()` - not seedable |
| Conflict resolution | ✅ N/A | Single playlist, no conflicts | N/A |
| Per-item delays | ✅ Implemented | Manifest mode supports `delay` per item | Works correctly |

**Evidence:** `web/frontend/src/App.tsx:94-102` - Effective delay calculation with manifest support

### Content Safety

| Practice | Status | Evidence | Gap |
|----------|--------|----------|-----|
| Media validation | ⚠️ Basic | Extension-based filtering only | No MIME type validation, no file size limits |
| File size limits | ❌ Missing | No limits enforced | Large files can cause memory issues |
| HTML sanitization | ✅ N/A | No HTML rendering | N/A |
| Path traversal protection | ⚠️ Partial | File System API handles paths, but manifest paths not validated | `manifestLoader.ts:219` - path normalization but no strict validation |

**Evidence:**
- `web/frontend/src/hooks/useMediaLoader.ts:57-65` - Extension-only filtering
- `web/frontend/src/utils/manifestLoader.ts:217-228` - Path matching but no strict validation

### Device/Player Management

| Practice | Status | Evidence | Gap |
|----------|--------|----------|-----|
| Identity/enrollment | ❌ Missing | No device ID, no enrollment | No remote management capability |
| Configuration | ⚠️ Local only | Settings in localStorage | No remote config, no version pinning |
| Remote updates | ⚠️ Basic | PWA auto-update via `registerType: 'autoUpdate'` | No rollback strategy, no version pinning |
| Version pinning | ❌ Missing | No version tracking | Cannot pin to specific app version |

**Evidence:** `web/frontend/vite.config.ts:10` - `registerType: 'autoUpdate'` - no version control

### Observability

| Practice | Status | Evidence | Gap |
|----------|--------|----------|-----|
| Structured logs | ❌ Missing | Only `console.error/warn` | No structured format, no log levels |
| Client metrics | ❌ Missing | No metrics collection | No playback stats, error rates, performance |
| Crash reporting | ❌ Missing | No error tracking service | No Sentry/rollbar integration |
| Heartbeat | ❌ Missing | No periodic health check | Cannot detect hung players |

**Evidence:** Search for `console.` - found only basic logging, no structured format

### Security

| Practice | Status | Evidence | Gap |
|----------|--------|----------|-----|
| CSP headers | ❌ Missing | No CSP in `index.html` or server config | XSS vulnerability vector |
| Security headers | ❌ Missing | No headers configured | No HSTS, X-Frame-Options, etc. |
| Dependency hygiene | ⚠️ Unknown | No `npm audit` run | Need to audit dependencies |
| Storage security | ⚠️ Acceptable | localStorage for non-sensitive data | Directory handles in IndexedDB (acceptable) |
| Secrets handling | ✅ N/A | No secrets in client code | N/A |

**Evidence:** `web/frontend/index.html` - No CSP meta tag, no security headers

### Enterprise Operability

| Practice | Status | Evidence | Gap |
|----------|--------|----------|-----|
| CI/CD | ❌ Missing | No `.github/workflows/` or CI config | No automated testing, no deployment pipeline |
| Environments | ❌ Missing | No env config | No dev/staging/prod separation |
| Releases | ❌ Missing | No versioning strategy | No semantic versioning, no changelog |
| Rollback strategy | ❌ Missing | PWA auto-update, no rollback | Cannot revert to previous version |

**Evidence:** No CI/CD files found, no environment config files

---

## 3) Code Quality + Maintainability Review

### Component/State Anti-Patterns

#### 🔴 **BLOCKER: App.tsx Monolithic State (1145 lines)**

**File:** `web/frontend/src/App.tsx`

**Issue:** Single component manages 20+ state variables, complex interdependencies, difficult to test/maintain.

**Evidence:**
- Lines 22-65: 20+ `useState` declarations
- Lines 114-195: Complex initialization `useEffect` with nested async operations
- Lines 229-426: `handleAddFolder` is 197 lines with nested conditionals

**Impact:** High maintenance cost, difficult to debug, prone to race conditions.

**Fix:**
```typescript
// Extract state into custom hooks
const useAppState = () => {
  // Media state
  const [playlist, setPlaylist] = useState<MediaItem[]>([]);
  const [currentMedia, setCurrentMedia] = useState<MediaItem | null>(null);
  // ... group related state
  return { playlist, currentMedia, ... };
};

// Extract folder management
const useFolderManagement = () => {
  // Folder-related logic
};

// App.tsx becomes orchestrator
function App() {
  const appState = useAppState();
  const folderMgmt = useFolderManagement();
  // ...
}
```

**Priority:** High (refactor in 30-day plan)

---

#### 🟡 **HIGH: Duplicated Error Handling**

**Files:** `web/frontend/src/components/MediaDisplay.tsx:190-206`, `web/frontend/src/App.tsx:907-911`

**Issue:** Error handling logic duplicated, inconsistent error messages.

**Evidence:**
- `MediaDisplay.tsx:191` - `Failed to load image: ${currentMedia?.fileName}`
- `MediaDisplay.tsx:200` - `Failed to load video: ${currentMedia?.fileName}`
- `App.tsx:908` - `Failed to load media: ${error}`

**Fix:** Centralize error handling in a custom hook:
```typescript
const useMediaErrorHandler = () => {
  const { showError } = useToast();
  
  return useCallback((error: Error, mediaItem: MediaItem | null, retry?: () => void) => {
    const message = `Failed to load ${mediaItem?.type || 'media'}: ${mediaItem?.fileName || 'Unknown'}`;
    showError(message);
    // Retry logic here
    if (retry) {
      setTimeout(retry, 1000);
    }
  }, [showError]);
};
```

**Priority:** Medium

---

#### 🟡 **HIGH: Race Condition in Slideshow Timer**

**File:** `web/frontend/src/hooks/useSlideshow.ts:54-61`

**Issue:** Timer cleanup may not prevent new timer from starting if `isPlaying` changes rapidly.

**Evidence:**
```typescript
useEffect(() => {
  if (isPlaying) {
    startSlideshow(); // Creates new interval
  } else {
    stopSlideshow(); // Clears interval
  }
  return () => stopSlideshow(); // Cleanup
}, [isPlaying, startSlideshow, stopSlideshow, slideDelayMs]);
```

**Problem:** If `slideDelayMs` changes while playing, effect re-runs, but `startSlideshow` may create new interval before old one is cleared.

**Fix:**
```typescript
useEffect(() => {
  if (isPlaying) {
    stopSlideshow(); // Always clear first
    startSlideshow();
  } else {
    stopSlideshow();
  }
  return () => stopSlideshow();
}, [isPlaying, slideDelayMs]); // Remove startSlideshow/stopSlideshow from deps
```

**Priority:** High

---

### Memory Leak Patterns

#### 🔴 **BLOCKER: Object URLs Not Revoked**

**Files:** `web/frontend/src/hooks/useMediaLoader.ts:70`, `web/frontend/src/components/MediaDisplay.tsx:62-66`

**Issue:** `URL.createObjectURL()` called but URLs not tracked/revoked when media removed from playlist.

**Evidence:**
- `useMediaLoader.ts:70` - Creates object URL, stores in `MediaItem.objectUrl`, but no cleanup
- `MediaDisplay.tsx:62-66` - Comment says "don't revoke here because we might want to reuse"

**Impact:** Memory leaks in long-running sessions, especially with large playlists.

**Fix:**
```typescript
// Track object URLs in a Set
const objectUrls = useRef<Set<string>>(new Set());

// When creating:
const objectUrl = URL.createObjectURL(file);
objectUrls.current.add(objectUrl);

// When removing media:
const revokeObjectUrl = (url: string) => {
  if (objectUrls.current.has(url)) {
    URL.revokeObjectURL(url);
    objectUrls.current.delete(url);
  }
};

// Cleanup on unmount:
useEffect(() => {
  return () => {
    objectUrls.current.forEach(revokeObjectURL);
    objectUrls.current.clear();
  };
}, []);
```

**Priority:** Blocker (fix immediately)

---

#### 🟡 **HIGH: Event Listener Accumulation**

**File:** `web/frontend/src/components/MediaDisplay.tsx:168-174`

**Issue:** Event listeners added conditionally, cleanup may miss if condition changes.

**Evidence:**
```typescript
if (mediaElement) {
  if (mediaElement.complete || ...) {
    calculateEffectiveZoom();
  } else {
    const handleLoad = () => { /* ... */ };
    mediaElement.addEventListener('load', handleLoad);
    mediaElement.addEventListener('loadeddata', handleLoad);
    return () => {
      clearTimeout(timeoutId);
      mediaElement.removeEventListener('load', handleLoad);
      mediaElement.removeEventListener('loadeddata', handleLoad);
    };
  }
}
```

**Problem:** If `mediaElement` changes before load completes, cleanup runs but listeners may be on different element.

**Fix:** Always track listeners in ref:
```typescript
const loadListenersRef = useRef<{ element: HTMLElement; handlers: Array<() => void> } | null>(null);

// Add listeners
loadListenersRef.current = { element: mediaElement, handlers: [handleLoad, handleLoadedData] };
mediaElement.addEventListener('load', handleLoad);
// ...

// Cleanup
return () => {
  if (loadListenersRef.current) {
    loadListenersRef.current.element.removeEventListener('load', handleLoad);
    // ...
  }
};
```

**Priority:** High

---

### Error Handling Gaps

#### 🔴 **BLOCKER: No Retry Logic for Media Failures**

**File:** `web/frontend/src/App.tsx:907-911`

**Issue:** Media load failures immediately skip to next item, no retry.

**Evidence:**
```typescript
onMediaError={(error) => {
  showError(`Failed to load media: ${error}`);
  setTimeout(() => handleNext(), 1000); // Immediate skip
}}
```

**Impact:** Network hiccups or temporary file locks cause permanent skips.

**Fix:**
```typescript
const useMediaErrorRetry = (mediaItem: MediaItem | null, maxRetries = 3) => {
  const retryCountRef = useRef(0);
  
  const handleError = useCallback((error: Error) => {
    if (retryCountRef.current < maxRetries) {
      retryCountRef.current++;
      const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 10000); // Exponential backoff
      setTimeout(() => {
        // Retry loading media
        setCurrentMedia(mediaItem); // Trigger reload
      }, delay);
    } else {
      // Max retries reached, skip
      handleNext();
      retryCountRef.current = 0;
    }
  }, [mediaItem, maxRetries]);
  
  return handleError;
};
```

**Priority:** Blocker

---

#### 🟡 **HIGH: FS Permission Revocation Not Handled**

**File:** `web/frontend/src/utils/directoryStorage.ts:86-100`

**Issue:** Permission checks on load, but no handling during active session if permission revoked.

**Evidence:**
- Permission checked on `loadDirectoryHandles()` (line 89)
- But if permission revoked during playback, no detection/recovery

**Fix:**
```typescript
// Periodic permission check
useEffect(() => {
  const checkPermissions = async () => {
    for (const [folderName, handle] of directoryHandles.entries()) {
      const permission = await handle.queryPermission({ mode: 'read' });
      if (permission !== 'granted') {
        // Handle revocation
        await removeDirectoryHandle(folderName);
        // Remove from playlist
        setPlaylist(prev => prev.filter(item => item.folderName !== folderName));
      }
    }
  };
  
  const interval = setInterval(checkPermissions, 60000); // Check every minute
  return () => clearInterval(interval);
}, [directoryHandles]);
```

**Priority:** High

---

#### 🟡 **MEDIUM: Storage Quota Not Handled**

**Files:** `web/frontend/src/utils/settingsStorage.ts:88`, `web/frontend/src/utils/directoryStorage.ts:56`

**Issue:** `localStorage.setItem()` and IndexedDB operations can fail with quota exceeded, but errors are only logged.

**Evidence:**
- `settingsStorage.ts:88` - `localStorage.setItem()` in try/catch, but error only logged
- `directoryStorage.ts:56` - IndexedDB put can fail, but error handling is basic

**Fix:**
```typescript
export const saveSettings = (settings: Partial<AppSettings>): void => {
  try {
    // ... existing logic
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      // Clear old data or notify user
      console.error('Storage quota exceeded');
      // Optionally: clear old thumbnails, notify user
    }
    throw error; // Re-throw for caller to handle
  }
};
```

**Priority:** Medium

---

### Testing Gaps

#### 🔴 **BLOCKER: Zero Test Coverage**

**Status:** No test files found (`*.test.*`, `*.spec.*`)

**Missing:**
- Unit tests for utilities (`thumbnailGenerator.ts`, `manifestLoader.ts`)
- Integration tests for hooks (`useSlideshow.ts`, `useMediaLoader.ts`)
- E2E tests for critical flows (add folder → playback → error handling)

**Priority Tests to Add First:**
1. **`useSlideshow.ts`** - Timer logic, navigation, video end detection
2. **`manifestLoader.ts::validateManifest()`** - JSON validation, error cases
3. **`thumbnailGenerator.ts::generateThumbnail()`** - Memory cleanup, cache eviction
4. **Error recovery flow** - Media failure → retry → skip

**Recommendation:**
```bash
# Setup
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event

# Test structure:
src/
  __tests__/
    hooks/
      useSlideshow.test.ts
      useMediaLoader.test.ts
    utils/
      manifestLoader.test.ts
      thumbnailGenerator.test.ts
    components/
      MediaDisplay.test.tsx
```

**Priority:** Blocker

---

### Prioritized Issues Summary

| Priority | Issue | File(s) | Effort | Impact |
|----------|-------|---------|--------|--------|
| 🔴 Blocker | Object URLs not revoked | `useMediaLoader.ts:70`, `MediaDisplay.tsx:62` | 2h | Memory leaks |
| 🔴 Blocker | No retry logic | `App.tsx:907-911` | 4h | Playback reliability |
| 🔴 Blocker | Zero test coverage | All files | 20h | Maintainability |
| 🟡 High | App.tsx monolithic | `App.tsx` (1145 lines) | 16h | Maintainability |
| 🟡 High | Timer race condition | `useSlideshow.ts:54-61` | 2h | Playback bugs |
| 🟡 High | Event listener leaks | `MediaDisplay.tsx:168-174` | 3h | Memory leaks |
| 🟡 High | FS permission revocation | `directoryStorage.ts:86` | 4h | Reliability |
| 🟡 Medium | Storage quota handling | `settingsStorage.ts:88` | 2h | User experience |
| 🟡 Medium | Duplicated error handling | Multiple files | 3h | Maintainability |

---

## 4) Security Review (Enterprise Threat Model)

### Threat Model

**Attack Surface:**
1. **File System Access API** - User-selected directories (trusted input, but path traversal possible)
2. **Manifest Files** - JSON files parsed from user directories (untrusted input)
3. **localStorage/IndexedDB** - Client-side storage (XSS risk if CSP missing)
4. **Service Worker** - Caching strategy, update mechanism
5. **Dependencies** - Supply chain risk

### Security Findings

| Finding | Impact | Evidence | Fix | Effort |
|---------|--------|----------|-----|--------|
| **No CSP Headers** | 🔴 Critical | `index.html` has no CSP meta tag, no server headers | Add CSP: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:;` | 2h |
| **Manifest JSON Injection** | 🟡 High | `manifestLoader.ts:112` - `JSON.parse()` without validation | Validate JSON structure before parsing, sanitize file paths | 4h |
| **Path Traversal in Manifest** | 🟡 High | `manifestLoader.ts:219` - Path normalization but no strict validation | Reject paths with `..`, absolute paths, validate against directory root | 3h |
| **No File Size Limits** | 🟡 Medium | `useMediaLoader.ts:67` - No size check before `getFile()` | Check `file.size` before processing, reject > 100MB | 1h |
| **Object URL in DOM** | 🟡 Medium | `MediaDisplay.tsx:50` - Object URLs used in `<img src>` / `<video src>` | Acceptable for File System API, but ensure URLs are revoked | 2h |
| **Service Worker Auto-Update** | 🟡 Medium | `vite.config.ts:10` - `registerType: 'autoUpdate'` | Consider `prompt` mode for enterprise, add version pinning | 4h |
| **Dependency Audit** | ✅ Low | `npm audit` run - 0 vulnerabilities | Add Dependabot for ongoing monitoring | 1h |
| **localStorage XSS Risk** | 🟢 Low | `settingsStorage.ts:40` - `JSON.parse()` on user-controlled data | Mitigated by CSP, but add input validation | 1h |
| **IndexedDB Structured Clone** | 🟢 Low | `directoryStorage.ts:50` - Stores FileSystemDirectoryHandle | Acceptable, browser handles serialization | N/A |

### Input Handling

#### 🔴 **CRITICAL: No CSP Headers**

**File:** `web/frontend/index.html`, server config (if any)

**Issue:** No Content Security Policy, XSS vulnerability if any script injection occurs.

**Evidence:** `web/frontend/index.html:1-13` - No CSP meta tag

**Note:** `counter.ts` uses `innerHTML` (line 5), but this file is **not imported anywhere** - it's a leftover demo file. Should be deleted to avoid confusion.

**Fix:**
```html
<!-- index.html -->
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline' 'unsafe-eval'; 
               style-src 'self' 'unsafe-inline'; 
               img-src 'self' blob: data:; 
               media-src 'self' blob:; 
               connect-src 'self'; 
               font-src 'self' data:;">
```

**Note:** `'unsafe-inline'` needed for Vite's inline scripts, but consider nonce-based CSP for production.

**Priority:** Blocker

---

#### 🟡 **HIGH: Manifest JSON Injection**

**File:** `web/frontend/src/utils/manifestLoader.ts:102-130`

**Issue:** `JSON.parse()` on user-provided JSON files without strict validation.

**Evidence:**
```typescript
const file = await fileHandle.getFile();
const text = await file.text();
let data: any;
try {
  data = JSON.parse(text); // No size limit, no structure validation before parse
} catch (parseError) {
  return { valid: false, error: `JSON syntax error: ...` };
}
const result = validateManifest(data); // Validation after parse
```

**Risk:** Large JSON files can cause DoS, malformed JSON can cause parse errors.

**Fix:**
```typescript
// Add size limit
const MAX_MANIFEST_SIZE = 1024 * 1024; // 1MB
const file = await fileHandle.getFile();
if (file.size > MAX_MANIFEST_SIZE) {
  return { valid: false, error: 'Manifest file too large' };
}

const text = await file.text();
// Validate JSON structure before parse (basic check)
if (!text.trim().startsWith('{') || !text.includes('"items"')) {
  return { valid: false, error: 'Invalid manifest structure' };
}

let data: any;
try {
  data = JSON.parse(text);
} catch (parseError) {
  return { valid: false, error: `JSON syntax error: ${parseError.message}` };
}
```

**Priority:** High

---

#### 🟡 **HIGH: Path Traversal in Manifest**

**File:** `web/frontend/src/utils/manifestLoader.ts:217-228`

**Issue:** Manifest file paths normalized but not strictly validated against directory root.

**Evidence:**
```typescript
const normalizedPath = manifestItem.file.replace(/\\/g, '/').toLowerCase();
// No check for '..', absolute paths, or paths outside root
```

**Risk:** Malicious manifest could reference files outside selected directory.

**Fix:**
```typescript
function validateManifestPath(path: string, rootFolderName: string): boolean {
  // Reject absolute paths
  if (path.startsWith('/') || /^[A-Z]:\\/.test(path)) {
    return false;
  }
  
  // Reject paths with '..'
  if (path.includes('..')) {
    return false;
  }
  
  // Reject paths starting with root folder name (should be relative)
  if (path.startsWith(rootFolderName)) {
    return false;
  }
  
  return true;
}

// In matchManifestToMedia:
for (const manifestItem of manifest.items) {
  if (!validateManifestPath(manifestItem.file, rootFolderName)) {
    missing.push(manifestItem.file); // Or reject entire manifest
    continue;
  }
  // ... rest of matching logic
}
```

**Priority:** High

---

### Storage Security

#### 🟡 **MEDIUM: localStorage XSS Risk (Mitigated by CSP)**

**File:** `web/frontend/src/utils/settingsStorage.ts:40-49`

**Issue:** `JSON.parse()` on localStorage data, but data is user-controlled (via settings UI).

**Risk:** Low if CSP is enforced, but if CSP is bypassed, XSS could inject malicious JSON.

**Mitigation:** CSP (see above) + input validation:
```typescript
export const loadSettings = (): AppSettings => {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      // Validate JSON structure before parse
      if (stored.length > 10000) { // Reasonable limit
        console.warn('Settings data too large, using defaults');
        return { ...defaultSettings };
      }
      const parsed = JSON.parse(stored);
      // Validate structure
      if (typeof parsed !== 'object' || !parsed.slideDelayMs) {
        return { ...defaultSettings };
      }
      return { ...defaultSettings, ...parsed };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return { ...defaultSettings };
};
```

**Priority:** Medium (after CSP is implemented)

---

### PWA/Service Worker Security

#### 🟡 **MEDIUM: Service Worker Auto-Update**

**File:** `web/frontend/vite.config.ts:10`

**Issue:** `registerType: 'autoUpdate'` means SW updates immediately, no user control.

**Risk:** Malicious update could be deployed, no rollback.

**Fix:**
```typescript
VitePWA({
  registerType: 'prompt', // Or 'manualUpdate' for enterprise
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
    // Add versioning
    cleanupOutdatedCaches: true,
    skipWaiting: false, // Don't skip waiting
    clientsClaim: false, // Don't claim clients immediately
  },
  // Add version pinning mechanism
  // Store current version in localStorage, check on load
})
```

**Priority:** Medium (for enterprise deployments)

---

### Dependency Security

#### ✅ **LOW: Dependency Audit - No Vulnerabilities Found**

**Status:** `npm audit` run - **0 vulnerabilities** found (info: 0, low: 0, moderate: 0, high: 0, critical: 0)

**Evidence:** Audit completed successfully with no security issues in dependencies.

**Recommendation:** Still add Dependabot for ongoing monitoring:
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/web/frontend"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

**Note:** Build fails due to missing `@types/react` and `@types/react-dom` - this is a development setup issue, not a security issue. Fix: `npm install -D @types/react @types/react-dom`

**Priority:** Low (dependencies are clean, but add monitoring)

---

### Minimum Enterprise Baseline Checklist

| Item | Status | Action |
|------|--------|--------|
| **CSP Headers** | ❌ Missing | Add CSP meta tag + server headers |
| **Security Headers** | ❌ Missing | Add HSTS, X-Frame-Options, X-Content-Type-Options |
| **Dependency Scanning** | ✅ Clean | `npm audit` - 0 vulnerabilities, add Dependabot for monitoring |
| **SAST (Static Analysis)** | ❌ Missing | Add ESLint security plugin, TypeScript strict checks |
| **Source Maps** | ⚠️ Unknown | Configure source map strategy (exclude from prod?) |
| **Environment Config** | ❌ Missing | No env validation, no secret scanning |
| **Error Tracking** | ❌ Missing | No Sentry/rollbar integration |

**Recommendations:**
1. **CSP:** Implement immediately (2h)
2. **Security Headers:** Configure in server/CDN (1h)
3. **Dependency Scanning:** Run audit, add Dependabot (1h)
4. **SAST:** Add `eslint-plugin-security` (2h)
5. **Source Maps:** Exclude from production builds (1h)
6. **Error Tracking:** Integrate Sentry (4h)

---

## 5) UI/UX Review (Enterprise Polish + Consistency)

### Visual Consistency

#### 🟡 **MEDIUM: Inconsistent Spacing/Typography**

**Files:** Multiple CSS files (`Toolbar.css`, `MediaDisplay.css`, `PlaylistWindow.css`, etc.)

**Issue:** No design system, spacing/typography defined per-component.

**Evidence:**
- `Toolbar.css` - Custom spacing values
- `PlaylistWindow.css` - Different spacing values
- No shared design tokens

**Recommendation:** Implement design system:
```typescript
// src/design-tokens.ts
export const tokens = {
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: {
      sm: '12px',
      base: '14px',
      lg: '16px',
      xl: '20px',
    },
  },
  colors: {
    primary: '#242424',
    // ...
  },
};
```

**Priority:** Medium

---

#### 🟡 **MEDIUM: Component Reusability**

**Issue:** Some UI patterns duplicated across components (buttons, modals, loading states).

**Evidence:**
- Loading spinners in multiple components
- Modal overlays duplicated
- Button styles inconsistent

**Recommendation:** Extract reusable components:
```typescript
// src/components/ui/Button.tsx
// src/components/ui/Modal.tsx
// src/components/ui/LoadingSpinner.tsx
```

**Priority:** Medium

---

### UX Flow

#### ✅ **GOOD: Add Folder → Playback Flow**

**Flow:** Add Folder → Scan → Playlist → Playback

**Status:** Works well, clear progression.

**Minor Issues:**
- No progress indicator during initial folder scan (large folders)
- No cancel option during scan

**Evidence:** `web/frontend/src/App.tsx:229-426` - `handleAddFolder()` shows progress but no cancel

**Priority:** Low

---

#### 🟡 **MEDIUM: Player Mode vs Admin Mode**

**Issue:** No clear separation between "player mode" (fullscreen, auto-play) and "admin mode" (settings, playlist management).

**Evidence:**
- Manifest mode auto-enters fullscreen (line 559-563), but toolbar still accessible
- No dedicated "kiosk mode" or "presentation mode"

**Recommendation:**
```typescript
// Add kiosk mode
const [kioskMode, setKioskMode] = useState(false);

// In kiosk mode:
// - Hide toolbar (or show on mouse move to bottom)
// - Auto-fullscreen
// - Disable keyboard shortcuts (except Escape to exit)
// - No settings access
```

**Priority:** Medium (for enterprise signage)

---

### Accessibility

#### 🟡 **MEDIUM: Keyboard Navigation**

**Status:** Basic keyboard shortcuts implemented, but:
- No focus indicators visible
- No keyboard navigation for playlist window
- No ARIA labels on interactive elements

**Evidence:**
- `App.tsx:706-801` - Keyboard shortcuts exist
- But no visible focus states in CSS
- No `aria-label` attributes

**Fix:**
```css
/* Add focus indicators */
button:focus-visible,
input:focus-visible {
  outline: 2px solid #0066cc;
  outline-offset: 2px;
}
```

```typescript
// Add ARIA labels
<button
  onClick={handlePlayPause}
  aria-label={isPlaying ? 'Pause slideshow' : 'Play slideshow'}
>
```

**Priority:** Medium

---

#### 🟡 **MEDIUM: Contrast/Color**

**Issue:** No contrast ratio verification, dark theme may have low contrast.

**Action:** Run contrast checker (WCAG AA target: 4.5:1 for text).

**Priority:** Medium

---

#### 🟢 **LOW: Reduced Motion**

**Status:** No `prefers-reduced-motion` support.

**Fix:**
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Priority:** Low

---

### Loading/Empty/Error States

#### ✅ **GOOD: Loading States**

**Evidence:**
- `App.tsx:883-891` - Initial loading screen
- `MediaDisplay.tsx:545-550` - Media loading overlay
- `ProgressIndicator.tsx` - Progress during folder scan

**Status:** Well implemented.

---

#### 🟡 **MEDIUM: Empty States**

**Evidence:**
- `App.tsx:924-931` - Empty state when no media loaded

**Issue:** Empty state is basic, could be more helpful (suggestions, examples).

**Priority:** Low

---

#### 🟡 **MEDIUM: Error States**

**Issue:** Errors shown as toasts, but no persistent error log or retry UI.

**Evidence:**
- `App.tsx:907-911` - Error toast + auto-advance
- No error history, no manual retry button

**Recommendation:** Add error log panel:
```typescript
// Show error log in settings or dedicated panel
const [errorLog, setErrorLog] = useState<Array<{ time: Date; message: string; media: string }>>([]);

// On error:
setErrorLog(prev => [...prev, { time: new Date(), message: error, media: currentMedia?.fileName || 'Unknown' }]);
```

**Priority:** Medium

---

### UI Inconsistency Punch List

| Issue | File(s) | Priority |
|-------|---------|----------|
| No design tokens | All CSS files | Medium |
| Inconsistent button styles | `Toolbar.css`, `PlaylistWindow.css` | Medium |
| No focus indicators | All interactive elements | Medium |
| Missing ARIA labels | `Toolbar.tsx`, `MediaDisplay.tsx` | Medium |
| No reduced motion support | All CSS files | Low |
| Empty state could be better | `App.tsx:924` | Low |

---

### Design System Direction

**Recommendation:** Implement design system in phases:

**Phase 1 (Quick Wins):**
1. Extract spacing/typography tokens to shared file
2. Create reusable `Button`, `Modal`, `LoadingSpinner` components
3. Add focus indicators

**Phase 2 (Strategic):**
1. Implement full design token system (colors, spacing, typography, shadows)
2. Create component library (`src/components/ui/`)
3. Add Storybook for component documentation

**Phase 3 (Advanced):**
1. Theming support (light/dark)
2. Accessibility audit and fixes
3. Animation system

---

### Top 10 Quick Wins

1. **Add focus indicators** (1h) - CSS only
2. **Extract design tokens** (2h) - Create `design-tokens.ts`
3. **Add ARIA labels** (2h) - Add to interactive elements
4. **Improve empty state** (1h) - Better messaging
5. **Add error log panel** (3h) - Persistent error history
6. **Extract reusable Button component** (2h)
7. **Add reduced motion support** (1h) - CSS media query
8. **Consistent loading spinners** (1h) - Single component
9. **Keyboard navigation for playlist** (3h) - Arrow keys, Enter to select
10. **Add cancel button during folder scan** (2h)

---

### Top 5 Strategic Improvements

1. **Design System Implementation** (20h)
   - Design tokens, component library, Storybook

2. **Kiosk/Presentation Mode** (8h)
   - Dedicated fullscreen mode, admin controls hidden

3. **Accessibility Audit & Fixes** (16h)
   - WCAG AA compliance, screen reader testing, keyboard navigation

4. **Error Recovery UI** (8h)
   - Error log, retry buttons, error categorization

5. **Performance Monitoring Dashboard** (12h)
   - Client-side metrics, playback stats, memory usage

---

## 6) Final Report Structure

### 30/60/90-Day Plan

#### **30-Day Plan (Critical Fixes)**

**Week 1-2: Security & Stability**
- [ ] Implement CSP headers (2h)
- [ ] Fix object URL memory leaks (2h)
- [ ] Add retry logic for media failures (4h)
- [ ] Fix timer race condition (2h)
- [ ] Run `npm audit`, fix vulnerabilities (2h)

**Week 3-4: Testing & Observability**
- [ ] Setup test infrastructure (Vitest) (4h)
- [ ] Write tests for `useSlideshow.ts` (4h)
- [ ] Write tests for `manifestLoader.ts` (4h)
- [ ] Add structured logging (4h)
- [ ] Integrate error tracking (Sentry) (4h)

**Deliverables:**
- CSP implemented
- Memory leaks fixed
- Basic test coverage (20%)
- Error tracking active

---

#### **60-Day Plan (Code Quality & UX)**

**Week 5-6: Refactoring**
- [ ] Refactor `App.tsx` into smaller hooks (16h)
- [ ] Extract reusable UI components (8h)
- [ ] Fix event listener cleanup issues (3h)
- [ ] Add FS permission revocation handling (4h)

**Week 7-8: UX Improvements**
- [ ] Implement design tokens (4h)
- [ ] Add focus indicators & ARIA labels (4h)
- [ ] Improve error states (4h)
- [ ] Add keyboard navigation for playlist (3h)

**Deliverables:**
- App.tsx refactored
- Design system foundation
- Improved accessibility
- Test coverage (40%)

---

#### **90-Day Plan (Enterprise Features)**

**Week 9-10: Enterprise Readiness**
- [ ] Implement kiosk/presentation mode (8h)
- [ ] Add version pinning for PWA (4h)
- [ ] Setup CI/CD pipeline (8h)
- [ ] Add dependency scanning (Dependabot) (2h)

**Week 11-12: Advanced Features**
- [ ] Performance monitoring dashboard (12h)
- [ ] Advanced error recovery UI (8h)
- [ ] Complete test coverage (60%+) (16h)
- [ ] Documentation (architecture, deployment) (8h)

**Deliverables:**
- Enterprise-ready deployment
- CI/CD active
- Comprehensive test coverage
- Documentation complete

---

### Appendix: Files Reviewed

**Total Files Reviewed:** 25+

**Key Files:**
- `web/frontend/src/App.tsx` (1145 lines)
- `web/frontend/src/components/MediaDisplay.tsx` (595 lines)
- `web/frontend/src/hooks/useSlideshow.ts` (83 lines)
- `web/frontend/src/hooks/useMediaLoader.ts` (159 lines)
- `web/frontend/src/utils/directoryStorage.ts` (157 lines)
- `web/frontend/src/utils/thumbnailGenerator.ts` (333 lines)
- `web/frontend/src/utils/manifestLoader.ts` (251 lines)
- `web/frontend/src/components/PlaylistWindow.tsx` (710+ lines)
- `web/frontend/vite.config.ts` (30 lines)
- `web/frontend/src/utils/settingsStorage.ts` (97 lines)
- `web/frontend/index.html` (13 lines)
- `web/frontend/tsconfig.json` (25 lines)
- `web/frontend/package.json` (28 lines)

**Notes:**
- No test files found
- No ESLint/Prettier config found
- No CI/CD configuration found
- Backend directory exists but not reviewed (out of scope)
- `counter.ts` is unused (not imported) - contains `innerHTML` usage, should be deleted
- Build fails due to missing `@types/react` and `@types/react-dom` - development setup issue

---

## Risk Score Calculation

**Base Score:** 6.5/10

**Factors:**
- **Security:** -2.0 (No CSP, manifest injection risk, no dependency audit)
- **Reliability:** -1.5 (No retry logic, memory leaks, timer race conditions)
- **Maintainability:** -1.0 (Monolithic App.tsx, no tests, duplicated code)
- **Observability:** -1.0 (No logging, no metrics, no error tracking)
- **Enterprise Readiness:** -1.0 (No CI/CD, no versioning, no rollback)

**Mitigating Factors:**
- TypeScript strict mode: +0.5
- Modern React patterns: +0.5
- IndexedDB usage: +0.5

**Final Risk Score: 6.5/10 (Medium-High)**

---

**Report End**

