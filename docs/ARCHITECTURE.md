# SlideShowBob — architecture

Application code: **`src/`** (repository root).

## Entry and shell

- **`src/main.tsx`** — React root, PWA service worker registration in production.
- **`src/App.tsx`** — Main UI: toolbar, playlist, settings, media surface, folder/manifest flows.

## Slideshow and timing

- **`src/hooks/useSlideshow.ts`** — Timer-driven and event-driven advancement; coordinates with media load and GIF completion.
- **`src/utils/playbackController.ts`** — Pure functions used by `useSlideshow` for **when** to advance (`shouldAdvance*`, `shouldRunTimer`, etc.). Treat as the active rules engine for slideshow timing.
- **`src/utils/unifiedPlaybackController.ts`** — Alternate / experimental unified API and tests; not wired into `useSlideshow` today. Useful for refactors or parity checks.

## Media and GIFs

- **`src/components/MediaDisplay.tsx`** — Renders image / video / GIF; GIF path uses **`src/utils/gifPlayer.ts`** (`createGifPlayerOnce`, canvas playback).
- **`src/utils/gifPlayer.ts`** — GIF89a parsing, LZW decode, `GifPlayer` class, helpers (`getGifMetadata`, `isGifAnimated`, etc.).
- **`src/utils/gifParser.ts`** / **`src/utils/gifUtils.ts`** — Supporting metadata / utilities as needed by the UI.

## Files, folders, manifests

- **`src/hooks/useMediaLoader.ts`** — Loads media from handles / manifest.
- **`src/utils/manifestLoader.ts`**, **`src/utils/manifestValidation.ts`** — Manifest JSON shape and validation.
- **`src/hooks/useFolderPersistence.ts`**, **`src/utils/directoryStorage.ts`** — IndexedDB persistence for directory handles (where supported).

## Settings and UX

- **`src/utils/settingsStorage.ts`** — Local settings persistence.
- **`src/components/SettingsWindow.tsx`**, **`src/components/Toolbar.tsx`**, **`src/components/PlaylistWindow.tsx`** — Primary chrome.

## Tests

- **`src/utils/*.test.ts`**, **`src/utils/manifestValidation.test.ts`** — Vitest unit tests; CI runs `npm run test:run` at the repo root.

## Build and deploy

- **`vite.config.ts`** — `server` / `preview` host and `PORT`; `preview.allowedHosts` for Railway (or similar) hostnames.
- Production: `npm run build` then `npm start` (preview). Railway should set **`PORT`** and run **`npm start`** after build.
