# Software Design Document (SDD)

## Overview

This document specifies a single‑page, browser-based slideshow application that loads local media (images + videos) into a playlist and provides deterministic playback, configurable transitions, and a “glass” style UI with multiple panels and dialogs.

This SDD is written to enable a senior developer to **rebuild the product from scratch** so that it **looks and operates the same** as the current implementation, with two explicit deltas:

- **No product name anywhere**: remove/avoid all branding/name strings in UI, manifests, titles, storage keys, etc.
- **No GIF playback**: animated GIF support is removed entirely; `.gif` inputs must be rejected/skipped with user feedback.

The SDD intentionally **does not prescribe a tech stack**. The implementer should choose appropriate technologies.

## Goals

- **Pixel/behavior parity** with the existing product’s UI, menus, panels, and playback rules.
- **Deterministic playback**: no stacked timers, no racey advance logic, predictable media progression.
- **Local-first**: users load local folders/files; the app does not upload media.
- **Presenter-friendly UX**: fullscreen, minimal chrome during playback, keyboard-first controls, and robust error handling.

## Non-goals / Out of scope

- Multi-user, collaboration, accounts, cloud sync.
- Remote media URLs/streaming.
- Editing media (trimming, cropping, annotating).
- Animated GIF playback (explicitly removed).

## Personas

- **Presenter**: Runs a slideshow during a meeting or demo; wants fullscreen, minimal distractions, predictable timing.
- **Reviewer**: Browses a media set; uses playlist editor to search, filter by folders, and jump to items.
- **Operator**: Curates playlists via manifests; wants exact ordering, per-item delays, and reduced UI while presenting.

## Glossary

- **Playlist**: In-memory ordered list of media items (images/videos) currently available for playback.
- **Manifest mode**: Optional mode where a manifest file drives playlist content and per-item settings.
- **Root folder**: A top-level folder the user added; used to group items and drive folder tree UI.
- **Relative path**: Path of a media item within its root folder (used for folder tree + manifest matching).

---

## Product requirements (functional)

### FR-0: Branding / name removal (hard requirement)

- The application **must not display any product name** in:
  - UI text (headers, empty states, dialogs, buttons, tooltips)
  - Document title, meta tags, icons (if any include text)
  - Persistent storage keys (local storage, indexed DB keys, etc.)
  - Sample/templated manifest content (if provided)
- Use generic wording such as “Playlist”, “Settings”, “Add Folder”, etc.

### FR-1: Supported media types

- **Supported**:
  - **Images**: common raster formats (e.g., JPG/JPEG, PNG, BMP, TIFF, WEBP)
  - **Videos**: common formats (e.g., MP4, WEBM, OGG; optionally additional formats as supported by the runtime)
- **Not supported**:
  - **GIF**: `.gif` files must be treated as unsupported and **must never animate** (no decode, no playback, no first-frame rendering policy).

#### FR-1.1: GIF rejection behavior (required)

- When scanning a folder or processing a drag-drop payload:
  - `.gif` files must be **skipped** (not added to playlist).
  - The user must receive **clear feedback** (non-blocking) that GIFs were rejected.
  - Feedback should be summarized (e.g., “Skipped 12 unsupported GIF files.”) to avoid spamming.

### FR-2: Core surfaces and layout

The application has these primary surfaces:

- **Media display surface**: fills the viewport; shows the current image or video.
- **Floating toolbar**: a glass-style control bar that is draggable and shows playback/utility actions.
- **Playlist editor window (modal)**: searchable list + thumbnail grid, with folder tree sidebar and actions.
- **Settings window (modal)**: sectioned settings with a save/cancel footer and persistence options.
- **Keyboard shortcuts help (modal)**.
- **Diagnostics panel (modal)**: event log viewer with copy/clear.
- **Manifest dialogs**:
  - **Manifest detected** dialog (choose to enter manifest mode or ignore).
  - **Multiple manifests** selection dialog.
- **Update prompt**: persistent toast/banner prompting reload when an update is available.
- **Global loading overlay** while scanning folders.
- **Empty state** when no media is loaded.

### FR-3: Media loading & playlist construction

#### FR-3.1: Add folder (primary)

- User can click **“Add Folder”** (empty state and playlist window) and **“Change folder”** (toolbar menu) to choose a folder.
- Folder scanning rules:
  - Recursively scan subfolders.
  - Skip OS/resource fork artifacts (e.g., macOS `._*` files).
  - Build playlist items with:
    - file name
    - media type (image/video)
    - last modified timestamp (if available)
    - root folder name
    - relative path within root
  - Create object URLs (or equivalent local references) to play files without uploading.

#### FR-3.2: Drag & drop (required enhancement)

Users must be able to drag and drop **files and folders** onto the application.

- **Drop target**: anywhere on the main app surface.
- **Accepted payloads**:
  - individual files
  - folders (recursive scan)
- **De-duplication**: if an item already exists in the playlist (same identity/path), it is **skipped silently**.
- **Ordering**: new items are appended, then the **current sort mode** is applied to the merged playlist.
- Must apply the same “unsupported file” and `.gif` rejection rules as folder scanning.

#### FR-3.3: Manifest discovery and manifest mode

When adding a folder:

- If one or more JSON files exist at the **folder root**, they are treated as potential manifest files.
- For each manifest file:
  - Enforce maximum allowed size before reading (DoS protection).
  - Validate strict schema and path safety rules.
- If **exactly one valid** manifest exists:
  - Scan folder media normally, then match manifest items to available media.
  - If some items match, show **Manifest detected** dialog (see FR-7).
  - If nothing matches, proceed with normal loading (and show a warning).
- If **multiple valid** manifests exist:
  - Show **Manifest selection** dialog listing each manifest file name and how many items match.

**Manifest mode behavior**:

- Playlist becomes **only the manifest-matched items**, in manifest order.
- Per-item settings may be attached:
  - per-item delay override
  - per-item zoom override
  - per-item fit override
- If manifest specifies a default delay, it is used when an item has no override.
- Starting playback in manifest mode triggers **automatic fullscreen** entry.
- UI is “reduced” (still includes toolbar, but may be auto-hidden; see FR-5 and FR-6).
- There must be an **Exit manifest mode** action.

### FR-4: Sorting

The playlist can be sorted by:

- Name (A–Z)
- Name (Z–A)
- Date (Oldest first)
- Date (Newest first)
- Random shuffle (Fisher–Yates)

Sorting should attempt to preserve the currently selected item:

- If the current item still exists after sorting, keep it selected and update index accordingly.
- If not found, select the first item.
- Display transient status feedback “Sorted: {mode}”.

### FR-5: Playback & advancement rules (deterministic)

Playback must follow these rules precisely.

#### FR-5.1: Manual navigation

- **Next** and **Previous** are available via:
  - Toolbar buttons
  - Keyboard shortcuts (see FR-10)
  - Clicking on media surface (see FR-5.4)
- Manual navigation clears any running slideshow timer (so the next timer run is not based on stale state).

#### FR-5.2: Play/Pause

- When user presses Play:
  - Slideshow enters “playing” state.
  - If there is a valid playlist and delay is \(>0\), autoplay begins.
- When Paused:
  - Any running timers stop.
  - Toolbar/cursor auto-hide is disabled and visibility is restored.

#### FR-5.3: Advancement by media type

- **Images**:
  - Advance only after the image has **successfully loaded** and has remained visible for at least `delayMs`.
  - The delay timer starts counting from **load completion timestamp**, not from “navigation start”.
  - A frequent check interval (e.g., 100ms) is used so the app advances close to the exact delay boundary.
- **Videos**:
  - Do **not** advance using the delay timer.
  - Advance immediately on the video “ended” event.
- **GIF**:
  - Not supported and must never reach playback/advancement logic.

#### FR-5.4: Click-to-advance on media surface

- Clicking the media surface advances to **Next**.
- When “fit to window” is disabled and panning is possible:
  - A quick click (short duration + minimal movement) still advances.
  - A drag gesture pans and does not advance.

### FR-6: Fullscreen, cursor, and toolbar auto-hide

#### FR-6.1: Fullscreen

- Fullscreen toggle is available via toolbar and keyboard.
- Escape exits fullscreen.
- In manifest mode: when slideshow starts, the app automatically requests fullscreen (if not already).

#### FR-6.2: Auto-hide during playback (idle timer)

When slideshow is playing:

- After 5 seconds of inactivity:
  - Toolbar becomes hidden.
  - Cursor becomes hidden.
- Any user activity shows toolbar and cursor again.
- If any dialog/menu is open, idle auto-hide is paused.

#### FR-6.3: Manifest mode fullscreen hover behavior (when not playing)

When in manifest mode + fullscreen **and not playing**:

- Cursor hides after 2 seconds without mouse movement.
- Toolbar is hidden by default, and becomes visible when the mouse is within 100px of the bottom edge of the viewport; hides otherwise.

### FR-7: Dialogs

#### FR-7.1: Manifest detected dialog

Dialog content:

- Title: “Slideshow Playlist Detected”
- Shows manifest filename, item count, and a warning list of missing files (top 5 + “and N more”).
- Explains manifest mode bullets:
  - Only files in playlist are shown
  - Custom delays per file (if specified)
  - Automatic fullscreen when slideshow starts
  - Reduced UI controls

Actions:

- Secondary: “Ignore Manifest”
- Primary: “Load in Manifest Mode”

#### FR-7.2: Manifest selection dialog

Dialog content:

- Title: “Multiple Playlist Files Found”
- Lists each manifest file as a button with name and matched item count.

Actions:

- Secondary: “Ignore All”

#### FR-7.3: Settings dialog

- Title: “Settings”
- Vertical tablist sections:
  - Playback
  - Display
  - Persistence
- Footer buttons:
  - Cancel (reverts unsaved changes, closes)
  - Save (enabled only when changes exist; saves and closes)
- Keyboard behavior:
  - Escape cancels/closes
  - Focus is trapped in the modal
  - ArrowUp/ArrowDown cycles tabs and switches sections

Playback section:

- Transition Style: select one of `Fade`, `Push`, `Wipe`, `Morph`, `Zoom`
- Slide Timing: numeric input min 500ms, max 30000ms, step 100ms
- Include Videos: toggle
- Sort Order: select same modes as FR-4
- Mute Audio: toggle

Display section:

- Background Blur: toggle (controls blurred background fill behind non-aspect-matching media)
- Scale to Fit: toggle
- Zoom Level: range slider 0.5–3.0 step 0.1 + display “x×”

Persistence section:

- “Remember My Settings” master toggle
- When enabled, show “Individual Preferences” toggles:
  - Slide Delay
  - Include Videos
  - Sort Order
  - Mute Audio
  - Scale to Fit
  - Zoom Level
  - Transition Style
  - Loaded Folders

Diagnostics entry point:

- A small diagnostics button (bug icon) in the nav column opens Diagnostics and closes Settings.

#### FR-7.4: Playlist editor window

- Title: “Playlist ({N} items)”
- Header controls:
  - Search input with placeholder `Search... (Ctrl+F)` and clear “×”
  - View mode toggle buttons: List “☰” and Thumbnails “⊞”
  - Close “×” button (Esc)
- Toolbar row:
  - “Show All” button appears when a folder filter is active
  - “Add Folder” button (plus icon + label)
- Body layout:
  - Left sidebar folder tree titled “Folders”
  - Resizable divider (200–400px width)
  - Right content area shows either:
    - List view (selectable rows)
    - Thumbnail grid (virtualized/lazy thumbnail loading)

List view item row:

- Shows media type icon (image/video), file name (with highlighted search matches), and type label.
- Row actions:
  - Optional “▶” play-from-here button (starts playback and closes playlist window)
  - “×” remove button (removes with undo; see FR-8)

Folder tree:

- Root nodes are the root folders the user added.
- Nested nodes represent subfolders.
- Selecting a folder filters the list to that folder.
- First folder is expanded by default on first open.

Keyboard behavior:

- Focus trap in modal, Escape closes
- Arrow keys navigate list/grid focus
- Ctrl/Cmd+F focuses search

#### FR-7.5: Keyboard shortcuts help

- Title: “Keyboard Shortcuts”
- Content is grouped by category and shows `<kbd>` chips.
- Close via Esc or clicking outside.

#### FR-7.6: Diagnostics panel

- Title: “Diagnostics”
- Shows last 20 events (most recent first), auto-refresh every second when enabled.
- Controls:
  - Auto-refresh checkbox
  - “Copy to Clipboard”
  - “Clear” (with confirmation)
  - Close “×”

#### FR-7.7: Update prompt

- Non-modal prompt: “Update available. Reload to update.”
- Actions: Reload, Dismiss

### FR-8: Removal with undo (playlist window)

When removing an individual file from the playlist editor:

- Show a toast “Removed {filename}” with an **Undo** action.
- The item is hidden immediately but removal is only finalized after 5 seconds.
- Only one pending undo may exist; removing another file finalizes the previous pending undo first.

Removing a root folder removes all its items and provides a success message with count.

### FR-9: Error handling & retry policy (playback)

When media fails to load:

- The app retries the current item up to **3 attempts**, with an exponential-ish delay starting at 1s (implementation-defined but must match behavior).
- During a pending retry:
  - Slideshow advancement is **gated** (must not advance to next item simply due to timer).
- If max retries reached:
  - Show an error toast indicating the item is skipped.
  - Advance to next item after a short delay (about 1s) to allow user to see the error state.
- Log diagnostics events for:
  - retries scheduled
  - final skip after max retries
  - media load success
  - media load error

### FR-10: Inputs and shortcuts (global)

Global keyboard shortcuts (disabled when typing in inputs/textareas):

- ArrowLeft: Previous
- ArrowRight: Next
- Space: Play/Pause
- F: Toggle fullscreen
- Escape:
  - exit fullscreen (if active)
  - close playlist/settings if open
- `+` / `=`: zoom in (clamped)
- `-` / `_`: zoom out (clamped)
- `0`: reset zoom and fit-to-window
- `?` (or Shift+`/`): open shortcuts help
- `P`: open playlist window
- `,`: open settings window
- Ctrl+Alt+D: toggle diagnostics panel

Mouse/touch behavior:

- Click on media: Next (see FR-5.4)
- Pan when zoomed and fit is disabled.

---

## Data & state model (conceptual)

### Media item

- **identity**: stable key derived from root folder + relative path (or absolute path equivalent)
- **fields**:
  - file name
  - media type (image/video)
  - modified timestamp
  - root folder name
  - relative path
  - local reference handle (file reference or object URL)
  - optional manifest overrides: delay, zoom, fit

### Settings

Settings are stored locally (no server):

- playback: delay, include videos, sort mode, mute, transition
- display: fit, zoom, background blur
- persistence: master toggle + per-setting save flags + save folders toggle

### Persistent storage

- Settings are persisted in local key/value storage.
- Folder handles may be persisted (where the browser supports it) to restore folders on load.
- Storage failures must not crash the app; fall back to defaults / in-memory behavior with warnings.

---

## UI/UX parity requirements

### Visual style (high level)

- “Glass” UI: translucent panels with blur, rounded corners, subtle borders/shadows.
- Floating toolbar: bottom center by default; draggable with a visible “grip” element.
- Menus are rendered as floating popovers with menuitems and “active” checkmarks.
- Loading overlay uses a spinner and “Loading...” text.
- Empty state is centered with primary button “Add Folder”.

### Toolbar specifics

Toolbar shows:

- Previous button
- Play/Pause button (icon changes)
- Next button
- Fullscreen toggle button (icon changes)
- More options (kebab) button
- Count label: “{currentIndex+1} / {totalCount}”

More options menu items (in order):

- Restart from beginning
- Fit to window (toggle)
- Zoom row: zoom out button, percent value, zoom in button
- Include Videos (toggle)
- Mute/Unmute
- Divider
- Change folder
- Playlist editor
- Sort (opens sort menu)
- Settings
- Keyboard shortcuts (if available)
- Slide delay (ms) number input
- (In manifest mode) Exit manifest mode

Sort menu items:

- Name (A–Z)
- Name (Z–A)
- Date (Oldest First)
- Date (Newest First)
- Random

**Note for GIF removal**: any UI text that references GIF must be removed or renamed (e.g., “Include GIF / MP4” becomes “Include Videos”).

---

## User stories (with acceptance criteria)

### Epic A: Load and manage media

**US-A1: Add a folder**

- As a user, I can add a folder of media so that I can build a slideshow.
- **Acceptance criteria**
  - Given the empty state, when I click “Add Folder” and select a folder, the app scans recursively and loads supported media into the playlist.
  - Unsupported files (including `.gif`) are skipped; I receive summarized feedback for GIF skips.
  - The first playlist item becomes the current media.
  - A global progress overlay appears during scanning, including a progress indicator and status text.

**US-A2: Drag & drop files/folders**

- As a user, I can drag & drop files or folders onto the app to add them to the playlist.
- **Acceptance criteria**
  - Dropping anywhere on the main surface adds supported media.
  - Duplicates are skipped silently.
  - New items are appended and the current sort mode is applied to the merged playlist.
  - Dropped GIF files are rejected with summarized feedback.

**US-A3: Browse and edit playlist**

- As a user, I can open a playlist editor to search, filter by folders, and manage items.
- **Acceptance criteria**
  - Pressing `P` or using the toolbar opens the playlist modal.
  - Search highlights matches and filters results.
  - Folder tree filters the list to a subfolder path.
  - I can switch between list and thumbnail views.
  - Thumbnails load lazily and do not lock up the UI on large playlists.

**US-A4: Remove an item with undo**

- As a user, I can remove an item and undo within a short time.
- **Acceptance criteria**
  - Clicking remove hides the item immediately and shows a toast with Undo for ~5 seconds.
  - Clicking Undo restores the item with no playlist corruption.
  - If I remove another file while Undo is pending, the prior pending removal is finalized first.

**US-A5: Remove a folder**

- As a user, I can remove a root folder and all its media from the playlist.
- **Acceptance criteria**
  - Removing a folder removes all its items and updates the current media/index deterministically.

### Epic B: Playback and presentation

**US-B1: Start/pause slideshow**

- As a presenter, I can start and pause the slideshow.
- **Acceptance criteria**
  - Space toggles play/pause.
  - When playing, the app advances images according to FR-5.3.
  - When paused, no timers remain active and the toolbar/cursor are visible.

**US-B2: Advance manually**

- As a presenter, I can go next/previous at any time.
- **Acceptance criteria**
  - Arrow keys and toolbar buttons navigate immediately.
  - Manual navigation clears any existing timer so timing remains correct.

**US-B3: Videos play to completion**

- As a presenter, I want videos to play fully before advancing.
- **Acceptance criteria**
  - Video delay setting does not force early advancement.
  - On video ended event, the app advances immediately when playing.

**US-B4: Fullscreen**

- As a presenter, I can toggle fullscreen to eliminate distractions.
- **Acceptance criteria**
  - Fullscreen toggle exists in toolbar and keyboard.
  - Escape exits fullscreen.

**US-B5: Auto-hide chrome during playback**

- As a presenter, the UI hides when I’m not interacting.
- **Acceptance criteria**
  - After inactivity, toolbar and cursor hide.
  - Moving mouse shows them again.
  - Opening any modal/menu pauses auto-hide behavior.

### Epic C: Settings and persistence

**US-C1: Configure playback and display**

- As a user, I can tune timing, transitions, and display behavior.
- **Acceptance criteria**
  - Settings modal shows Playback/Display/Persistence sections with parity controls.
  - Save persists changes locally; Cancel reverts.

**US-C2: Persistence controls**

- As a user, I can choose which preferences and folders persist across reloads.
- **Acceptance criteria**
  - Master toggle disables value persistence while still storing the toggle/flags themselves.
  - Disabling folder persistence clears saved folder handles (where supported).

### Epic D: Manifests

**US-D1: Detect a manifest**

- As an operator, when a folder contains a valid manifest, I’m prompted to use it.
- **Acceptance criteria**
  - Manifest detected dialog appears with correct content and actions.
  - “Load in Manifest Mode” replaces playlist with manifest items only.
  - Missing files are reported.

**US-D2: Multiple manifests**

- As an operator, I can choose among multiple manifests.
- **Acceptance criteria**
  - Selection dialog lists manifests and matched counts.
  - Choosing a manifest enters manifest mode with that playlist.

### Epic E: Diagnostics & resilience

**US-E1: View diagnostics**

- As a developer/operator, I can view recent diagnostic events.
- **Acceptance criteria**
  - Diagnostics panel shows last 20 events with auto-refresh.
  - Copy produces readable log lines.
  - Clear prompts for confirmation.

**US-E2: Handle media errors gracefully**

- As a presenter, the slideshow recovers from transient load failures.
- **Acceptance criteria**
  - Retries occur up to 3 times with gating so the slideshow doesn’t advance prematurely.
  - After max retries, item is skipped and an error message is shown.

---

## Non-functional requirements

### Performance

- Must handle large folders (thousands of files) without freezing the UI:
  - scanning should report progress
  - thumbnail generation is lazy/virtualized
- Avoid leaking local reference URLs/handles; ensure proper cleanup when items/folders are removed.

### Accessibility

- Modals must trap focus and support keyboard-only operation.
- Buttons have accessible labels; menus use roles (`menu`, `menuitem`) where applicable.

### Privacy & security

- Local media must not be uploaded.
- Manifest parsing must include:
  - file size limits
  - strict JSON/schema validation
  - safe path validation (no traversal)

### Reliability

- Timer discipline: exactly one advancing timer at a time; no stacked timers.
- Storage failures degrade gracefully with warnings, never hard-crash.

---

## Parity test plan (definition of “done”)

The rebuild is considered complete only when:

- **UI parity**
  - Toolbar layout, menu structure, labels (excluding removed name/GIF references), dialogs, and modals match.
  - Visual style matches the “glass” look and responsive behavior.
- **Behavior parity**
  - Image delay is measured from load completion.
  - Videos advance on ended; delay does not affect them.
  - Auto-hide and cursor behavior matches in playing vs manifest fullscreen scenarios.
  - Playlist editor behavior (search, folder tree, view toggle, undo) matches.
  - Diagnostics behave the same (last 20, copy, clear).
- **GIF removal**
  - `.gif` is rejected everywhere (folder scans, drag/drop, manifests).
  - No UI strings reference GIF.
- **No name**
  - No branding/name present anywhere in UI or persisted keys/artifacts.

