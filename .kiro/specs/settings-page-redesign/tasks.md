# Implementation Plan: Settings Page Redesign

## Overview

Redesign the Settings panel with section navigation, grouped controls, simplified persistence, and user-friendly labels. Redesign the Playlist panel with a simplified header/toolbar, media-type icons, readable thumbnails, toast+undo removal, and enhanced folder sidebar. All changes modify existing React/TypeScript components and CSS within the glassmorphism dark theme.

## Tasks

- [x] 1. Extend data models and storage layer
  - [x] 1.1 Add `masterPersistenceEnabled` field to `AppSettings` in `settingsStorage.ts`
    - Add the new boolean field with default `true`
    - Update `saveSettings` to skip writing preference values when master toggle is disabled (only persist the master toggle state and individual flags)
    - Update `loadSettings` to merge the new field from defaults
    - _Requirements: 4.1, 4.4_

  - [ ]* 1.2 Write property test for settings save round trip (Property 5)
    - **Property 5: Settings save round trip**
    - **Validates: Requirements 8.3**

  - [ ]* 1.3 Write property test for individual persistence toggles (Property 4)
    - **Property 4: Individual persistence toggles control what is persisted**
    - **Validates: Requirements 4.5**

  - [x] 1.4 Extend `Toast` interface with optional `action` field in `Toast.tsx`
    - Add `action?: { label: string; onClick: () => void }` to the `Toast` interface
    - Render an action button next to the close button when `action` is present
    - Action button calls `action.onClick` then dismisses the toast
    - _Requirements: 13.2_

  - [x] 1.5 Update `useToast.ts` to accept optional action parameter
    - Extend `showToast` signature to accept `action?: { label: string; onClick: () => void }`
    - Pass the action through to the created toast object
    - _Requirements: 13.2_

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Redesign SettingsWindow with section navigation and grouped controls
  - [x] 3.1 Restructure `SettingsWindow.tsx` layout with vertical tab navigation
    - Add `SettingsSection` type and `activeSection` state
    - Create `<nav role="tablist" aria-orientation="vertical">` with Playback, Display, Persistence tab buttons (`role="tab"`)
    - Render each section as `<div role="tabpanel">` shown/hidden based on `activeSection`
    - Position diagnostics bug icon (🐛) at bottom of nav column, subtle color, tooltip "Diagnostics", `aria-label="Open diagnostics"`
    - Remove manifest download action from settings
    - Keep existing Save/Cancel footer with dirty-state tracking
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 5.1, 5.2, 5.3, 5.4, 5.5, 8.1, 8.2_

  - [x] 3.2 Populate Playback section controls
    - Transition Style (select) — renamed from "Transition Effect"
    - Slide Timing (range/number input for delay)
    - Include Videos (toggle)
    - Sort Order (select) — renamed from "Sort Mode"
    - Mute Audio (toggle) — renamed from "Mute State"
    - Add plain-language description beneath each label
    - _Requirements: 1.3, 3.1, 3.2, 3.4, 3.5_

  - [x] 3.3 Populate Display section controls
    - Background Blur (toggle)
    - Scale to Fit (toggle) — renamed from "Fit to Window"
    - Zoom Level (range slider)
    - Add plain-language description beneath each label
    - _Requirements: 1.4, 3.3, 3.5_

  - [x] 3.4 Populate Persistence section with master toggle and opt-out toggles
    - Master toggle: "Remember My Settings" (bound to `masterPersistenceEnabled`)
    - When enabled: show individual opt-out toggles for each preference
    - When disabled: hide individual opt-out toggles
    - _Requirements: 1.5, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 3.5 Write property test for section navigation (Property 1)
    - **Property 1: Section navigation displays correct content and active state**
    - **Validates: Requirements 2.2, 2.3, 2.4**

  - [ ]* 3.6 Write property test for descriptive text on controls (Property 2)
    - **Property 2: All setting controls have descriptive text**
    - **Validates: Requirements 3.5**

  - [ ]* 3.7 Write property test for master persistence toggle visibility (Property 3)
    - **Property 3: Master persistence toggle controls individual toggle visibility**
    - **Validates: Requirements 4.3**

  - [ ]* 3.8 Write property test for settings cancel (Property 6)
    - **Property 6: Settings cancel discards changes**
    - **Validates: Requirements 8.4**

  - [ ]* 3.9 Write property test for ARIA attributes (Property 9)
    - **Property 9: Settings ARIA attributes**
    - **Validates: Requirements 7.3**

- [x] 4. Style SettingsWindow with section nav layout and theme
  - [x] 4.1 Update `SettingsWindow.css` for two-column layout
    - Widen modal max-width to accommodate nav + content columns
    - Style vertical tab list with glassmorphism background
    - Style active tab with accent color indicator
    - Style tab panels with consistent padding
    - Style diagnostics bug icon: subtle color (few shades darker than background), positioned lower-left of nav
    - Ensure all styles use existing CSS custom properties (--glass-bg-elevated, --glass-border, --accent, etc.)
    - Add description text styles beneath labels
    - _Requirements: 6.1, 6.2, 6.3, 5.2_

  - [x] 4.2 Add keyboard navigation for section tabs
    - Arrow Up/Down moves focus between tabs, wrapping at boundaries
    - Tab key moves focus into the active panel
    - Focus trapping within the settings modal (Tab wraps from last to first, Shift+Tab wraps from first to last)
    - Escape closes without saving
    - Focus first interactive element on open
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

  - [ ]* 4.3 Write property test for keyboard navigation (Property 7)
    - **Property 7: Settings keyboard navigation**
    - **Validates: Requirements 7.1**

  - [ ]* 4.4 Write property test for focus trapping (Property 8)
    - **Property 8: Settings focus trapping**
    - **Validates: Requirements 7.4**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Redesign PlaylistWindow header, toolbar, and file list
  - [x] 6.1 Simplify `PlaylistWindow.tsx` header and add toolbar row
    - Header row: title with count, search input, view mode toggle, close button only
    - Toolbar row below header: "Show All" button (when folder filter active), "Add Folder" button
    - Remove duplicate "Add Folder" button from sidebar header
    - Sidebar header: "Folders" label only
    - _Requirements: 9.1, 9.2, 9.3, 10.1, 10.2_

  - [x] 6.2 Add media-type icons and visual hierarchy to file list
    - Replace numeric index with media-type icon (🖼️ for Image, 🎬 for Video, use appropriate icon for Gif)
    - Set file name font size to minimum 14px
    - Add subfolder grouping headers when no folder filter is active
    - Highlight current file with accent left-border and background
    - Hover-reveal play and remove action buttons
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 6.3 Write property test for media-type icons (Property 10)
    - **Property 10: File list media-type icons**
    - **Validates: Requirements 11.1**

  - [ ]* 6.4 Write property test for current file highlighting (Property 11)
    - **Property 11: Current file highlighting**
    - **Validates: Requirements 11.4**

- [x] 7. Improve thumbnail grid readability
  - [x] 7.1 Update `PlaylistWindow.css` thumbnail grid styles
    - Minimum card width 140px (110px below 480px viewport)
    - 12px gap between cards
    - File name font size minimum 12px
    - Index font size minimum 11px
    - File name: max 2 lines with ellipsis overflow
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 7.2 Update `PlaylistWindow.css` header and toolbar styles
    - Single-row header at 768px+ viewports
    - Stacked search on second row below 768px
    - Toolbar row styling with proper spacing
    - _Requirements: 9.3, 9.4_

- [x] 8. Implement toast+undo removal and inline folder confirmation
  - [x] 8.1 Replace file removal confirmation dialog with toast+undo in `PlaylistWindow.tsx`
    - On file remove: immediately remove from playlist, show toast with file name and "Undo" action button
    - Store `PendingUndo` state (removed item, original index, toast ID)
    - On undo: re-insert file at `Math.min(originalIndex, playlist.length)`
    - Toast auto-dismisses after 5 seconds, clearing pending undo state
    - Only one pending undo at a time (new removal finalizes previous)
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 8.2 Replace folder removal overlay dialog with inline confirmation in `FolderTree.tsx`
    - On folder remove click: show inline "Remove? Yes / No" replacing folder name in the sidebar row
    - Escape or click-away dismisses the inline confirmation
    - Remove the full-screen `playlist-confirm-overlay` dialog
    - Replace `pendingRemove` state with `pendingFolderRemove: string | null`
    - _Requirements: 13.5_

  - [ ]* 8.3 Write property test for file removal with toast (Property 12)
    - **Property 12: File removal with toast and no dialog**
    - **Validates: Requirements 13.1, 13.2**

  - [ ]* 8.4 Write property test for file removal undo round trip (Property 13)
    - **Property 13: File removal undo round trip**
    - **Validates: Requirements 13.3**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Enhance folder sidebar visual treatment
  - [x] 10.1 Update `FolderTree.tsx` with expanded/collapsed icons and tree-line connectors
    - Use 📂 for expanded folders, 📁 for collapsed folders
    - Add CSS classes for tree-line connectors (`folder-tree-connector-vertical`, `folder-tree-connector-horizontal`)
    - Apply accent color background on selected folder row
    - Display file count badge next to folder name (already exists, verify styling)
    - Hover-reveal remove button (already exists, keep behavior)
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 10.2 Add tree-line connector CSS to `PlaylistWindow.css`
    - Use `::before` pseudo-elements on child items for vertical and horizontal connector lines
    - Indent child folders with visible connectors
    - Style accent-colored selection background
    - _Requirements: 14.4_

  - [ ]* 10.3 Write property test for folder node rendering (Property 14)
    - **Property 14: Folder node rendering**
    - **Validates: Requirements 14.1, 14.2, 14.3**

- [x] 11. Add playlist keyboard and accessibility support
  - [x] 11.1 Add focus trapping and keyboard navigation to `PlaylistWindow.tsx`
    - Focus trap within the playlist modal (Tab wraps)
    - Escape closes the playlist
    - Arrow key navigation in file list and thumbnail grid
    - Focus search input on open
    - Add appropriate ARIA roles and labels for folder tree, file list, thumbnail grid, and controls
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ]* 11.2 Write property test for playlist focus trapping (Property 15)
    - **Property 15: Playlist focus trapping**
    - **Validates: Requirements 15.1**

  - [ ]* 11.3 Write property test for playlist ARIA attributes (Property 16)
    - **Property 16: Playlist ARIA attributes**
    - **Validates: Requirements 15.3**

  - [ ]* 11.4 Write property test for playlist keyboard navigation (Property 17)
    - **Property 17: Playlist list and grid keyboard navigation**
    - **Validates: Requirements 15.4**

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests use `fast-check` (already in devDependencies) with `vitest`
- All styling uses existing CSS custom properties for theme consistency
- The design modifies existing components — no new architectural patterns introduced
