# Implementation Plan: Toolbar UI Improvements

## Overview

Incremental implementation of five UI polish improvements: toolbar transparency, media count repositioning, low-contrast text fixes, auto-hide toolbar during idle playback, and blurred background fill for aspect-ratio mismatches. Each task builds on the previous, with CSS-only changes first, then React logic additions. Property-based tests use `fast-check` via Vitest.

## Tasks

- [x] 1. Install fast-check and update CSS design tokens for toolbar transparency
  - [x] 1.1 Install `fast-check` as a dev dependency
    - Run `npm install --save-dev fast-check`
    - _Requirements: Testing strategy prerequisite_

  - [x] 1.2 Update `--glass-bg` and `--text-tertiary` CSS variables in `src/style.css`
    - Change dark mode `--glass-bg` from `rgba(28, 28, 30, 0.72)` to `rgba(28, 28, 30, 0.56)`
    - Change light mode `--glass-bg` from `rgba(255, 255, 255, 0.72)` to `rgba(255, 255, 255, 0.56)`
    - Change dark mode `--text-tertiary` from `rgba(255, 255, 255, 0.45)` to `rgba(255, 255, 255, 0.65)`
    - Change light mode `--text-tertiary` from `rgba(0, 0, 0, 0.45)` to `rgba(0, 0, 0, 0.65)`
    - Leave `--glass-bg-elevated` unchanged
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 3.8, 3.9_

- [x] 2. Reposition media count to bottom-right corner overlay
  - [x] 2.1 Update `src/components/Toolbar.tsx` to move `toolbar-count` out of `toolbar-footer`
    - Move the `<span className="toolbar-count">` element out of the `toolbar-footer` div
    - Place it as a direct child of `toolbar-shell`, after the footer
    - The footer should only contain `toolbar-status`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 Update `src/components/Toolbar.css` to absolutely position `toolbar-count`
    - Set `toolbar-count` to `position: absolute; bottom: 0; right: 8px`
    - Add a small semi-transparent background pill (`background: rgba(0,0,0,0.4); border-radius: 8px; padding: 2px 8px`)
    - Ensure `toolbar-shell` remains the positioning context (already `position: fixed`)
    - Verify count is visible in both expanded and minimized toolbar states
    - _Requirements: 2.1, 2.2, 2.5, 2.6_

- [x] 3. Fix low-contrast text across all component CSS files
  - [x] 3.1 Update hardcoded colors in `src/components/PlaylistWindow.css`
    - Replace `#888` with `var(--text-secondary)` or `#aaa` for: `.playlist-item-index`, `.playlist-item-type`, `.playlist-grid-index`, `.playlist-search`, `.playlist-empty`, `.folder-tree-count`, `.playlist-tree-count`
    - Replace `#666` with `#999` or `var(--text-secondary)` for: `.playlist-empty-hint`, `.folder-tree-remove`, `.folder-tree-count`
    - _Requirements: 3.3, 3.10_

  - [x] 3.2 Update hardcoded colors in `src/components/SettingsWindow.css`
    - Replace `#888` with `var(--text-secondary)` for: `.settings-group-title`, `.settings-action-desc`, `.settings-toggle-label`
    - Replace `#0078d4` with `var(--accent)` for `.settings-btn-link`
    - _Requirements: 3.4, 3.10_

  - [x] 3.3 Update hardcoded colors in `src/components/KeyboardShortcutsHelp.css`
    - Replace `#888` with `var(--text-secondary)` for: `.shortcuts-help-footer p`, `.key-separator`, `.shortcuts-help-close`
    - _Requirements: 3.5, 3.10_

  - [x] 3.4 Update hardcoded colors in `src/components/DiagnosticsPanel.css`
    - Replace `#666` with `#999` for `.diagnostics-empty-hint`
    - Replace `#aaa` with `#bbb` or `var(--text-secondary)` for `.diagnostics-auto-refresh`, `.diagnostics-btn-close`
    - Replace `#888` with `var(--text-secondary)` for `.diagnostics-event-time`, `.diagnostics-empty`
    - _Requirements: 3.6, 3.10_

  - [x] 3.5 Update hardcoded colors in `src/components/ManifestModeDialog.css` and `src/components/ManifestSelectionDialog.css`
    - Replace `#888` with `var(--text-secondary)` for `.manifest-selection-item-count`, `.manifest-dialog-btn-secondary`, `.manifest-selection-btn-secondary`
    - _Requirements: 3.7, 3.10_

  - [x] 3.6 Update hardcoded colors in `src/components/Toolbar.css`
    - Verify `.glass-menu-label` and `.glass-menu-value` use `var(--text-secondary)` (already set, confirm ≥ 4.5:1)
    - Update `.toolbar-status` if needed (uses `var(--text-tertiary)`, fixed by token update in 1.2)
    - _Requirements: 3.1, 3.2, 3.8_

  - [x] 3.7 Write property test for WCAG AA text contrast (Property 1)
    - **Property 1: Text contrast meets WCAG AA threshold**
    - Create `src/utils/contrastCheck.test.ts`
    - Use `fast-check` to generate foreground/background color pairs from the app's palette
    - Compute WCAG 2.1 relative luminance contrast ratio and assert ≥ 4.5:1
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement auto-hide toolbar with useIdleTimer hook
  - [x] 5.1 Create `src/hooks/useIdleTimer.ts` hook
    - Implement `UseIdleTimerOptions` interface: `timeoutMs`, `enabled`, `onIdle`, `onActive`
    - Implement `UseIdleTimerReturn` interface: `isIdle`, `reset`, `pause`, `resume`
    - Listen for `mousemove` and `keydown` events on `document`
    - Use `setTimeout` for idle detection, clear on any activity
    - Clean up all timers and event listeners on unmount or when `enabled` changes to `false`
    - When paused, do not trigger idle; resume counting from where left off when unpaused
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 5.2 Integrate `useIdleTimer` in `src/App.tsx`
    - Import and call `useIdleTimer` with `timeoutMs: 5000`
    - Enable when `isPlaying === true`
    - On idle: set `toolbarVisible = false` and `cursorHidden = true`
    - On active: set `toolbarVisible = true` and `cursorHidden = false`
    - Pause the timer when menus or dialogs are open (`showMoreMenu`, `showSortMenu`, `showPlaylist`, `showSettings`, etc.)
    - When `isPlaying` becomes false while toolbar is hidden, immediately restore visibility
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 4.9_

  - [x] 5.3 Update `src/components/Toolbar.tsx` to accept and use idle-hide visibility
    - Ensure the `toolbarVisible` prop controls the `hidden` class on `toolbar-shell` for all modes (not just manifest mode)
    - Change the hidden condition from `isManifestMode && !toolbarVisible` to `!toolbarVisible`
    - Verify the existing CSS transition (`opacity 0.25s ease, transform 0.25s ease`) applies correctly
    - _Requirements: 4.1, 4.7_

  - [x] 5.4 Write property test for idle timer triggers after timeout (Property 2)
    - **Property 2: Idle timer triggers after timeout with no activity**
    - Create `src/hooks/useIdleTimer.test.ts`
    - Use `fast-check` to generate random positive timeout values
    - Simulate no-activity periods using fake timers, assert `isIdle` transitions to `true`
    - **Validates: Requirements 4.1**

  - [x] 5.5 Write property test for user input resets idle state (Property 3)
    - **Property 3: Any user input resets idle state**
    - Use `fast-check` to generate random event types (`mousemove`, `keydown`)
    - Dispatch events while idle, assert `isIdle` resets to `false` and timer restarts
    - **Validates: Requirements 4.2, 4.3, 4.4**

  - [x] 5.6 Write property test for disabled timer never reports idle (Property 4)
    - **Property 4: Disabled timer never reports idle**
    - Use `fast-check` to generate random timeout values with `enabled=false`
    - Advance timers past timeout, assert `isIdle` never becomes `true`
    - **Validates: Requirements 4.5, 4.8**

  - [x] 5.7 Write property test for paused timer does not trigger idle (Property 5)
    - **Property 5: Paused timer does not trigger idle**
    - Use `fast-check` to generate random pause/resume sequences
    - Assert idle does not trigger while paused, and resumes correctly after unpause
    - **Validates: Requirements 4.6**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement blurred background fill for aspect-ratio mismatch
  - [x] 7.1 Add background fill CSS to `src/components/MediaDisplay.css`
    - Add `.media-background-fill` with `position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none`
    - Add `.media-background-fill img, .media-background-fill video` with `width: 100%; height: 100%; object-fit: cover; filter: blur(30px) brightness(0.5); transform: scale(1.1)`
    - Update `.media-container` to `position: relative; z-index: 1`
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 5.12_

  - [x] 7.2 Add aspect-match detection and background fill rendering in `src/components/MediaDisplay.tsx`
    - Add state/ref for container dimensions using `ResizeObserver` on `.media-display`
    - Add state for media natural dimensions (from `onLoad`/`onLoadedMetadata`)
    - Compute `isAspectMatch` by comparing aspect ratios with a 2% threshold
    - Render `<div className="media-background-fill">` before `.media-container` when `!isAspectMatch && currentMedia`
    - For images: render `<img src={imageSrc} alt="" aria-hidden="true" />`
    - For videos: render `<video src={videoSrc} autoPlay loop muted playsInline />`
    - For GIFs: render `<img src={imageSrc} alt="" aria-hidden="true" />` (static first frame)
    - Do not render background fill when `isAspectMatch` is true
    - _Requirements: 5.1, 5.2, 5.3, 5.7, 5.9, 5.10_

  - [x] 7.3 Implement video sync for background fill
    - Add a ref for the background video element
    - Sync `currentTime` of background video to foreground video on `timeupdate` events
    - Add `onError` handler on background video that logs silently without triggering user-facing errors
    - _Requirements: 5.3, 5.11_

  - [x] 7.4 Write property test for aspect-match detection (Property 6)
    - **Property 6: Aspect-match detection controls background fill rendering**
    - Create `src/components/MediaDisplay.test.ts`
    - Use `fast-check` to generate random (mediaWidth, mediaHeight, containerWidth, containerHeight) tuples
    - Assert: background fill renders iff `abs(mediaAspect - containerAspect) > threshold`
    - **Validates: Requirements 5.1, 5.9**

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- CSS-only changes (tasks 1–3) are implemented first to minimize risk
- The `useIdleTimer` hook is a standalone unit, testable in isolation
- Background fill uses CSS `filter: blur()` which is GPU-accelerated for performance
