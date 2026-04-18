# Requirements Document

## Introduction

Redesign the SlideShowBob Settings panel and Playlist panel to improve information architecture, navigation, terminology, and overall UX across both surfaces. The Settings page currently presents a flat list of controls with developer-facing labels, an unintuitive per-field "remember" toggle bank, a misplaced manifest download action, and no section navigation. The Playlist page suffers from an overloaded header that wraps badly on small screens, duplicate "Add Folder" buttons, a flat file list lacking visual hierarchy, cramped thumbnail cards with tiny text, and a heavy confirmation dialog for quick removal actions. This redesign groups settings into logical categories with section navigation, simplifies persistence, uses user-friendly labels, and improves the playlist layout with a cleaner header, better visual hierarchy, and lighter interaction patterns.

## Glossary

- **Settings_Panel**: The modal dialog that displays application preferences and configuration options
- **Section_Nav**: The navigation element (sidebar or tab bar) that allows users to jump between settings categories
- **Playback_Section**: The settings group containing slideshow playback controls (transition style, slide timing, media options)
- **Display_Section**: The settings group containing visual display controls (background blur, scaling mode, zoom)
- **Persistence_Section**: The settings group controlling which preferences are remembered between sessions
- **Diagnostics_Icon**: A subtle bug-shaped icon positioned in the lower-left corner of the Settings_Panel that opens the diagnostics panel
- **Playlist_Panel**: The modal dialog that displays the media playlist with folder sidebar and content area
- **Playlist_Header**: The top bar of the Playlist_Panel containing title, search, view controls, and actions
- **Playlist_Toolbar**: A secondary action bar below the Playlist_Header that houses folder and filter actions separately from search and view controls
- **Playlist_File_List**: The list view of media files in the Playlist_Panel content area
- **Playlist_Thumbnail_Grid**: The grid view of media file thumbnails in the Playlist_Panel content area
- **Folder_Sidebar**: The resizable left panel in the Playlist_Panel showing the folder tree navigation
- **Removal_Toast**: A lightweight, auto-dismissing notification confirming file or folder removal with an undo option
- **User**: A person operating the SlideShowBob application

## Requirements

### Requirement 1: Grouped Information Architecture

**User Story:** As a User, I want settings organized into logical groups, so that I can find and understand related options without scrolling through a flat list.

#### Acceptance Criteria

1. THE Settings_Panel SHALL organize all settings into the following named sections: Playback, Display, and Persistence
2. WHEN the Settings_Panel opens, THE Settings_Panel SHALL display the Playback section by default
3. THE Playback_Section SHALL contain controls for transition style, slide timing, video inclusion, sort order, and audio mute
4. THE Display_Section SHALL contain controls for background blur, scaling mode, and zoom level
5. THE Persistence_Section SHALL contain controls for choosing which preferences are remembered between sessions

### Requirement 2: Section Navigation

**User Story:** As a User, I want to jump directly to a settings category, so that I do not have to scroll through unrelated options.

#### Acceptance Criteria

1. THE Settings_Panel SHALL display a Section_Nav element listing all section names
2. WHEN the User activates a section name in the Section_Nav, THE Settings_Panel SHALL scroll to or display the corresponding section content
3. THE Section_Nav SHALL visually indicate which section is currently active
4. THE Section_Nav SHALL remain visible while the User browses any section

### Requirement 3: User-Friendly Terminology

**User Story:** As a User, I want labels written in plain language, so that I understand each setting without needing developer knowledge.

#### Acceptance Criteria

1. THE Settings_Panel SHALL label the transition control as "Transition Style" instead of "Transition Effect"
2. THE Settings_Panel SHALL label the mute control as "Mute Audio" instead of "Mute State"
3. THE Settings_Panel SHALL label the fit-to-window control as "Scale to Fit" instead of "Fit to Window"
4. THE Settings_Panel SHALL label the sort control as "Sort Order" instead of "Sort Mode"
5. WHEN a setting label is displayed, THE Settings_Panel SHALL show a brief plain-language description beneath or beside the label explaining what the setting does

### Requirement 4: Simplified Persistence Model

**User Story:** As a User, I want a simple way to control whether my settings are remembered, so that I do not have to manage eight individual "remember" toggles.

#### Acceptance Criteria

1. THE Persistence_Section SHALL present a single master toggle labeled "Remember My Settings" that enables or disables persistence for all preferences at once
2. WHEN the master toggle is enabled, THE Settings_Panel SHALL display individual opt-out toggles for each preference so the User can exclude specific items
3. WHEN the master toggle is disabled, THE Settings_Panel SHALL hide the individual opt-out toggles
4. THE Persistence_Section SHALL default the master toggle to enabled with all individual preferences remembered
5. WHEN the User disables an individual preference toggle, THE Settings_Panel SHALL stop persisting that specific preference while continuing to persist all other enabled preferences


### Requirement 5: Subtle Diagnostics Access

**User Story:** As a User, I want access to diagnostics without it cluttering the settings interface, so that the panel stays focused on preferences while power users can still reach diagnostics when needed.

#### Acceptance Criteria

1. THE Settings_Panel SHALL display a Diagnostics_Icon as a small bug-shaped icon in the lower-left corner of the panel
2. THE Diagnostics_Icon SHALL be rendered in a color only a few shades darker than the Settings_Panel background, making the icon subtle and not visually prominent
3. WHEN the User activates the Diagnostics_Icon, THE Settings_Panel SHALL open the diagnostics panel and close the settings modal
4. THE Diagnostics_Icon SHALL include a tooltip reading "Diagnostics" that appears on hover
5. THE Diagnostics_Icon SHALL have an accessible label of "Open diagnostics" for screen readers

### Requirement 6: Visual Consistency with App Theme

**User Story:** As a User, I want the redesigned settings page to match the existing glassmorphism dark theme, so that the experience feels cohesive.

#### Acceptance Criteria

1. THE Settings_Panel SHALL use the existing CSS custom properties (--glass-bg-elevated, --glass-border, --glass-blur, --accent, --text-primary, --text-secondary) for all surfaces, borders, and text
2. THE Settings_Panel SHALL maintain the existing modal overlay with backdrop blur
3. THE Section_Nav SHALL use the same glassmorphism styling as other elevated surfaces in the application
4. THE Settings_Panel SHALL support both dark and light color schemes via the existing prefers-color-scheme media query tokens

### Requirement 7: Keyboard and Accessibility Support

**User Story:** As a User navigating with a keyboard or assistive technology, I want the settings page to be fully operable without a mouse, so that I can configure the application regardless of input method.

#### Acceptance Criteria

1. THE Section_Nav SHALL be navigable using Tab and arrow keys
2. WHEN the User presses Escape while the Settings_Panel is open, THE Settings_Panel SHALL close without saving changes
3. THE Settings_Panel SHALL use appropriate ARIA roles and labels for the navigation, sections, toggles, and buttons
4. THE Settings_Panel SHALL trap focus within the modal while it is open
5. WHEN the Settings_Panel opens, THE Settings_Panel SHALL move focus to the first interactive element

### Requirement 8: Save and Cancel Behavior

**User Story:** As a User, I want clear save and cancel actions, so that I know whether my changes will be applied.

#### Acceptance Criteria

1. THE Settings_Panel SHALL display a "Save" button and a "Cancel" button in the footer
2. THE Settings_Panel SHALL disable the "Save" button when no changes have been made
3. WHEN the User activates "Save", THE Settings_Panel SHALL persist all changed settings and close the modal
4. WHEN the User activates "Cancel", THE Settings_Panel SHALL discard all unsaved changes and close the modal
5. IF a save operation fails, THEN THE Settings_Panel SHALL display an error message and keep the modal open so the User can retry

### Requirement 9: Playlist Header Simplification

**User Story:** As a User, I want a clean, uncluttered playlist header, so that controls do not wrap or overlap on smaller screens.

#### Acceptance Criteria

1. THE Playlist_Header SHALL contain only the playlist title with item count, the search input, the view mode toggle (list/thumbnail), and the close button
2. THE Playlist_Panel SHALL display a Playlist_Toolbar below the Playlist_Header containing the "Show All" button and the "Add Folder" button
3. THE Playlist_Header SHALL remain on a single row without wrapping at viewport widths of 768px and above
4. WHEN the viewport width is below 768px, THE Playlist_Header SHALL stack the search input on a second row while keeping the title and close button on the first row

### Requirement 10: Single Add Folder Entry Point

**User Story:** As a User, I want one clear place to add folders, so that I am not confused by duplicate buttons performing the same action.

#### Acceptance Criteria

1. THE Playlist_Panel SHALL display exactly one "Add Folder" button, located in the Playlist_Toolbar
2. THE Folder_Sidebar header SHALL display the "Folders" label without a duplicate add-folder button
3. WHEN the User activates the "Add Folder" button, THE Playlist_Panel SHALL open the folder picker dialog

### Requirement 11: File List Visual Hierarchy

**User Story:** As a User, I want the file list to clearly distinguish items and show relevant information at a glance, so that I can scan and navigate the playlist efficiently.

#### Acceptance Criteria

1. THE Playlist_File_List SHALL display each file with a media-type icon (image or video) instead of a plain numeric index
2. THE Playlist_File_List SHALL display the file name at a minimum font size of 14px
3. THE Playlist_File_List SHALL visually group files by subfolder using a subtle separator or indented heading when a folder filter is not active
4. THE Playlist_File_List SHALL highlight the currently playing file with a distinct left-border accent and background color
5. WHEN the User hovers over a file row, THE Playlist_File_List SHALL reveal the play and remove action buttons for that row

### Requirement 12: Thumbnail Grid Readability

**User Story:** As a User browsing thumbnails, I want card text to be legible and cards to have adequate spacing, so that I can identify files without straining.

#### Acceptance Criteria

1. THE Playlist_Thumbnail_Grid SHALL display file names at a minimum font size of 12px
2. THE Playlist_Thumbnail_Grid SHALL display index numbers at a minimum font size of 11px
3. THE Playlist_Thumbnail_Grid SHALL use a minimum card width of 140px with at least 12px gap between cards
4. THE Playlist_Thumbnail_Grid SHALL display the file name on a maximum of two lines with ellipsis overflow for longer names
5. WHEN the viewport width is below 480px, THE Playlist_Thumbnail_Grid SHALL use a minimum card width of 110px

### Requirement 13: Lightweight Removal Confirmation

**User Story:** As a User, I want to remove files or folders quickly without a blocking dialog, so that playlist management feels fast and forgiving.

#### Acceptance Criteria

1. WHEN the User removes a single file, THE Playlist_Panel SHALL remove the file immediately without showing a confirmation dialog
2. WHEN a file is removed, THE Playlist_Panel SHALL display a Removal_Toast showing the removed file name and an "Undo" action
3. WHEN the User activates "Undo" on the Removal_Toast, THE Playlist_Panel SHALL restore the removed file to its original position
4. THE Removal_Toast SHALL auto-dismiss after 5 seconds if the User does not interact with the toast
5. WHEN the User removes a folder, THE Playlist_Panel SHALL show a brief inline confirmation prompt within the Folder_Sidebar rather than a full-screen overlay dialog

### Requirement 14: Folder Sidebar Visual Treatment

**User Story:** As a User, I want the folder sidebar to clearly communicate structure and selection state, so that I can navigate the folder tree confidently.

#### Acceptance Criteria

1. THE Folder_Sidebar SHALL display folder icons that visually distinguish expanded folders from collapsed folders
2. THE Folder_Sidebar SHALL highlight the selected folder with the application accent color background
3. THE Folder_Sidebar SHALL display file counts next to each folder name
4. THE Folder_Sidebar SHALL indent child folders with a visible tree-line connector to convey hierarchy
5. WHEN the User hovers over a folder row, THE Folder_Sidebar SHALL reveal the remove action for that folder

### Requirement 15: Playlist Keyboard and Accessibility Support

**User Story:** As a User navigating with a keyboard or assistive technology, I want the playlist panel to be fully operable without a mouse, so that I can manage my playlist regardless of input method.

#### Acceptance Criteria

1. THE Playlist_Panel SHALL trap focus within the modal while it is open
2. WHEN the User presses Escape while the Playlist_Panel is open, THE Playlist_Panel SHALL close
3. THE Playlist_Panel SHALL use appropriate ARIA roles and labels for the folder tree, file list, thumbnail grid, and all interactive controls
4. THE Playlist_File_List and Playlist_Thumbnail_Grid SHALL be navigable using arrow keys
5. WHEN the Playlist_Panel opens, THE Playlist_Panel SHALL move focus to the search input