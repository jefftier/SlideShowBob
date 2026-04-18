# Requirements Document

## Introduction

A set of UI polish improvements to the SlideShowBob toolbar and site-wide text readability. The changes cover four areas: increasing toolbar transparency, repositioning the media count indicator, fixing low-contrast text across the application, and auto-hiding the toolbar during idle slideshow playback.

## Glossary

- **Toolbar**: The draggable, fixed-position control bar (`toolbar-shell`) containing playback controls, menus, and the media count footer.
- **Glass_Bar**: The translucent inner container (`.glass-bar`) that holds the toolbar icon buttons.
- **Media_Count**: The `toolbar-count` element displaying the current index and total count (e.g. "3 / 42").
- **Toolbar_Footer**: The footer row beneath the Glass_Bar that currently holds the status text and Media_Count side by side.
- **Toolbar_Icons**: The SVG icon buttons inside the Glass_Bar (previous, play/pause, next, fullscreen, more, minimize/expand).
- **Slideshow_Playback**: The state where `isPlaying` is true and media items are being automatically advanced.
- **Idle_Period**: A continuous span of time with no mouse movement and no keyboard input.
- **Glass_Menu**: The dropdown menus (sort menu, more menu) rendered via portal from the toolbar.
- **Playlist_Window**: The modal overlay for browsing and managing the media playlist.
- **Settings_Window**: The modal overlay for configuring application settings.
- **Keyboard_Shortcuts_Help**: The modal overlay listing available keyboard shortcuts.
- **Diagnostics_Panel**: The modal overlay showing event logs and diagnostics.
- **Manifest_Dialog**: The modal dialogs for manifest file selection and mode confirmation.
- **WCAG_AA**: Web Content Accessibility Guidelines level AA, requiring a minimum contrast ratio of 4.5:1 for normal text and 3:1 for large text.
- **Media_Container**: The parent element (`.media-display`) that holds the displayed image or video and defines the available viewport area.
- **Foreground_Media**: The primary image or video rendered centered within the Media_Container using aspect-fit (no cropping), preserving its original aspect ratio.
- **Background_Fill**: A duplicate of the Foreground_Media rendered behind it, scaled to fully cover the Media_Container using aspect-fill, with a heavy blur and optional brightness reduction applied.
- **Letterboxing**: Horizontal black bars appearing above and below media whose aspect ratio is wider than the Media_Container.
- **Pillarboxing**: Vertical black bars appearing to the left and right of media whose aspect ratio is narrower than the Media_Container.

## Requirements

### Requirement 1: Increase Toolbar Transparency

**User Story:** As a user, I want the toolbar to be more transparent, so that it obscures less of the media content behind it.

#### Acceptance Criteria

1. THE Glass_Bar SHALL render with a background opacity approximately 20% lower than the current value (current `--glass-bg` is `rgba(28, 28, 30, 0.72)`; target is approximately `rgba(28, 28, 30, 0.56)`).
2. THE Glass_Bar SHALL maintain its existing backdrop blur effect (`backdrop-filter: blur(var(--glass-blur))`) at the current intensity.
3. THE Toolbar_Icons SHALL retain their current size, spacing, and position within the Glass_Bar.
4. THE Glass_Bar SHALL remain visually distinguishable from the background content at the reduced opacity.
5. WHILE the light color scheme is active (`prefers-color-scheme: light`), THE Glass_Bar SHALL also render with a background opacity approximately 20% lower than its current light-mode value (current `rgba(255, 255, 255, 0.72)`; target is approximately `rgba(255, 255, 255, 0.56)`).

### Requirement 2: Reposition Media Count to Bottom-Right Corner

**User Story:** As a user, I want the media count displayed in the bottom-right corner of the toolbar, so that it is visible as an overlay without affecting the toolbar layout or icon positions.

#### Acceptance Criteria

1. THE Media_Count SHALL be positioned in the bottom-right corner of the Toolbar shell container, overlaid on top of the existing toolbar content.
2. THE Media_Count SHALL use absolute or fixed positioning relative to the Toolbar shell so that it does not shift or displace any Toolbar_Icons.
3. THE Toolbar SHALL maintain its current dimensions and not change in width or height as a result of the Media_Count repositioning.
4. THE Toolbar_Icons SHALL remain in their current positions and sizes after the Media_Count is repositioned.
5. THE Media_Count SHALL remain readable against the toolbar background at the new position, with sufficient contrast to meet WCAG_AA guidelines for normal-sized text.
6. WHEN the Toolbar is in minimized state, THE Media_Count SHALL still appear in the bottom-right corner of the Toolbar shell.

### Requirement 3: Fix Low-Contrast Text Across the Site

**User Story:** As a user, I want all text across the application to have sufficient contrast against its background, so that I can read it comfortably.

#### Acceptance Criteria

1. THE Glass_Menu items (sort menu, more menu) SHALL render text with a contrast ratio of at least 4.5:1 against their background, meeting WCAG_AA for normal text.
2. THE Glass_Menu labels (`.glass-menu-label`, `.glass-menu-value`) SHALL render with a contrast ratio of at least 4.5:1 against the menu background.
3. THE Playlist_Window text elements (`.playlist-item-index`, `.playlist-item-type`, `.playlist-grid-index`, `.playlist-grid-name`, `.folder-tree-count`, `.playlist-empty`, `.playlist-empty-hint`, `.playlist-search`) SHALL render with a contrast ratio of at least 4.5:1 against their respective backgrounds.
4. THE Settings_Window text elements (`.settings-group-title`, `.settings-action-desc`, `.settings-btn-link`) SHALL render with a contrast ratio of at least 4.5:1 against the settings panel background.
5. THE Keyboard_Shortcuts_Help text elements (`.shortcuts-help-footer p`, `.key-separator`) SHALL render with a contrast ratio of at least 4.5:1 against the modal background.
6. THE Diagnostics_Panel text elements (`.diagnostics-empty-hint`, `.diagnostics-auto-refresh`, `.diagnostics-event-time`) SHALL render with a contrast ratio of at least 4.5:1 against the panel background.
7. THE Manifest_Dialog text elements (`.manifest-selection-item-count`, `.manifest-dialog-btn-secondary`) SHALL render with a contrast ratio of at least 4.5:1 against the dialog background.
8. THE Toolbar_Footer status text (`.toolbar-status`) SHALL render with a contrast ratio of at least 4.5:1 against the toolbar background.
9. THE `--text-tertiary` CSS variable SHALL be updated to a value that achieves at least 4.5:1 contrast ratio against the `--glass-bg` and `--glass-bg-elevated` backgrounds.
10. IF a text element uses a hardcoded color value (e.g. `#666`, `#888`) instead of a CSS variable, THEN THE element SHALL be updated to use an appropriate CSS variable or a color value that meets the 4.5:1 contrast ratio against its background.

### Requirement 4: Auto-Hide Toolbar During Idle Slideshow Playback

**User Story:** As a user watching a slideshow, I want the toolbar to disappear when I am not interacting with the application, so that I can enjoy an unobstructed view of the media.

#### Acceptance Criteria

1. WHILE Slideshow_Playback is active, WHEN an Idle_Period of 5 seconds elapses with no mouse movement and no keyboard input, THE Toolbar SHALL transition to a hidden state using a smooth opacity and transform animation.
2. WHILE the Toolbar is in the hidden state during Slideshow_Playback, WHEN the user moves the mouse, THE Toolbar SHALL transition back to the visible state.
3. WHILE the Toolbar is in the hidden state during Slideshow_Playback, WHEN the user presses any key, THE Toolbar SHALL transition back to the visible state.
4. WHEN the Toolbar transitions back to visible, THE 5-second Idle_Period timer SHALL reset and begin counting again from zero.
5. WHILE Slideshow_Playback is not active (paused or stopped), THE Toolbar SHALL remain visible and the auto-hide timer SHALL not run.
6. WHILE a Glass_Menu (sort menu or more menu) is open, THE auto-hide timer SHALL be paused and THE Toolbar SHALL remain visible.
7. THE auto-hide transition SHALL use a duration and easing consistent with the existing toolbar show/hide animation (`opacity 0.25s ease, transform 0.25s ease`).
8. WHEN the user stops the slideshow while the Toolbar is hidden, THE Toolbar SHALL immediately transition back to the visible state.
9. THE mouse cursor SHALL also be hidden during the Idle_Period when the Toolbar is hidden, and SHALL reappear when the Toolbar becomes visible again.

### Requirement 5: Blurred Background Fill for Aspect-Ratio Mismatch

**User Story:** As a user, I want empty space around media that does not match the container's aspect ratio to be filled with a blurred version of the same media, so that I see a polished, immersive display instead of black bars.

#### Acceptance Criteria

1. WHEN the Foreground_Media aspect ratio does not match the Media_Container aspect ratio, THE Media_Container SHALL render a Background_Fill layer behind the Foreground_Media.
2. THE Foreground_Media SHALL be rendered centered within the Media_Container using aspect-fit so that the entire image or video is visible without cropping.
3. THE Background_Fill SHALL use the same source as the Foreground_Media (same image `src` or same video `src`).
4. THE Background_Fill SHALL be scaled using aspect-fill (cover) so that it completely fills the Media_Container with no empty space.
5. THE Background_Fill SHALL have a CSS blur filter applied with an intensity high enough that background details are not individually readable (minimum `blur(20px)`).
6. THE Background_Fill SHALL optionally have reduced brightness (e.g. `brightness(0.5)`) to ensure the Foreground_Media remains the clear focal point.
7. THE Foreground_Media SHALL remain sharp, unaltered, and rendered above the Background_Fill at all times.
8. THE Background_Fill SHALL not introduce visible seams, tiling artifacts, or flickering at the edges of the Media_Container.
9. WHEN the Foreground_Media aspect ratio matches the Media_Container aspect ratio (no Letterboxing or Pillarboxing), THE Background_Fill layer SHALL not be rendered.
10. WHEN the current media changes, THE Background_Fill SHALL update to reflect the new Foreground_Media source without a visible delay or flash of the previous media.
11. WHILE a video is playing as Foreground_Media, THE Background_Fill SHALL display the same video playing in sync, so that the blurred background animates along with the foreground.
12. THE Background_Fill SHALL not interfere with click, drag, or touch interactions on the Foreground_Media.
