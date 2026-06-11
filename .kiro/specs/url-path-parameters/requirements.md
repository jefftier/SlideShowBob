# Requirements Document

## Introduction

This feature enables users to pass a full filesystem path and optional file filters via URL parameters to SlideShowBob. When the app loads with these parameters, it attempts to open the specified folder (using previously-persisted directory handles or prompting for access) and optionally filters the playlist to specific files. This supports bookmarkable slideshow URLs and automated kiosk-style deployments where the slideshow target is defined in the URL.

**Important constraint:** Browsers enforce the File System Access API security model, which requires user interaction to grant directory access. URL parameters can reference folders that have already been granted persistent access (stored in IndexedDB) or trigger a directory picker pre-populated with context. The app cannot silently access arbitrary file system paths without prior user permission.

## Glossary

- **URL_Parameter_Parser**: The module responsible for reading and validating URL search parameters on app load
- **Folder_Resolver**: The module responsible for matching a URL-specified path to a persisted directory handle or prompting the user to grant access
- **File_Filter**: The module responsible for filtering loaded media items to only those specified in URL parameters
- **App**: The main SlideShowBob application component
- **Full_Path**: A complete filesystem path (e.g., `/Users/jeff/Pictures/Vacation Photos`) passed via the `path` URL parameter; used both as a display hint for the user and as the primary matching key in IndexedDB
- **Folder_Name**: The last segment of a filesystem path (e.g., `Vacation Photos` from `/Users/jeff/Pictures/Vacation Photos`); used as a fallback matching key for backward compatibility

## Requirements

### Requirement 1: Parse path parameter from URL

**User Story:** As a user, I want to specify a full filesystem path in the URL, so that the app opens that folder automatically on load.

#### Acceptance Criteria

1. WHEN the URL contains a `path` query parameter, THE URL_Parameter_Parser SHALL extract the full path value and pass it to the Folder_Resolver
2. WHEN the URL contains a `path` query parameter with an empty value or a value that contains only whitespace characters after URI decoding, THE URL_Parameter_Parser SHALL ignore the parameter and load the app with default behavior (no folder pre-selected, user must pick manually)
3. WHEN the URL contains a `path` query parameter, THE URL_Parameter_Parser SHALL decode URI-encoded characters (using standard percent-decoding) in the path parameter value before passing it to the Folder_Resolver
4. WHEN the URL contains multiple `path` query parameters, THE URL_Parameter_Parser SHALL use only the first value
5. WHEN the app loads, THE URL_Parameter_Parser SHALL complete URL parameter extraction within 100 milliseconds of page initialization

### Requirement 2: Parse file filter parameters from URL

**User Story:** As a user, I want to specify individual file names in the URL, so that the slideshow only shows those specific files from the folder.

#### Acceptance Criteria

1. WHEN the URL contains one or more `file` query parameters, THE URL_Parameter_Parser SHALL extract all file name values into an ordered list, preserving duplicates and maintaining URL order, up to a maximum of 100 file parameters
2. WHEN a `file` parameter is present without a `path` parameter, THE URL_Parameter_Parser SHALL ignore the file parameters and load the app with default behavior
3. THE URL_Parameter_Parser SHALL decode URI-encoded characters in each file parameter value
4. WHEN a `file` parameter has an empty value, THE URL_Parameter_Parser SHALL exclude that entry from the file list
5. WHEN all `file` parameter values are empty (resulting in an empty list after exclusions), THE URL_Parameter_Parser SHALL treat the result as if no file parameters were specified and load all media from the folder
6. WHEN duplicate file name values exist across multiple `file` parameters, THE URL_Parameter_Parser SHALL retain only the first occurrence and preserve its position in the ordered list

### Requirement 3: Resolve folder from persisted handles

**User Story:** As a user, I want the app to automatically use a folder I previously granted access to, so that bookmarked URLs work seamlessly.

#### Acceptance Criteria

1. WHEN a full path from the URL matches the stored full path of a persisted directory handle in IndexedDB and read permission is already granted (queryPermission returns "granted"), THE Folder_Resolver SHALL use that handle to load media without any user interaction
2. WHEN no full-path match is found, THE Folder_Resolver SHALL extract the last path segment (folder name) from the URL path and attempt to match it against persisted directory handles by folder name for backward compatibility
3. WHEN a persisted directory handle is matched (by either full path or folder name) but read permission is not currently granted (queryPermission returns "prompt"), THE Folder_Resolver SHALL call `requestPermission` on the handle to trigger the browser permission prompt
4. WHEN the user grants permission via the browser prompt, THE Folder_Resolver SHALL proceed to load media from that directory handle
5. WHEN the user denies the permission prompt, THE App SHALL display an error toast notification stating that access was denied for the specified folder and fall back to default behavior (no folder loaded)
6. WHEN no persisted directory handle matches either the full path or the folder name from the URL, THE App SHALL display a prompt message indicating which path the URL wants to open (e.g., "This URL wants to open /Users/jeff/Pictures/Vacation Photos — please select this folder") and open the directory picker so the user can select the folder; once selected, THE App SHALL persist the new handle in IndexedDB with the full path from the URL so subsequent loads of the same URL work automatically
7. WHILE the Folder_Resolver is waiting for user interaction (permission prompt or directory picker), THE App SHALL display a status message indicating which folder access is being requested

### Requirement 4: Apply file filter to loaded media

**User Story:** As a user, I want the slideshow to show only the files I specified in the URL, so that I can create targeted slideshows of specific images.

#### Acceptance Criteria

1. WHEN file parameters are specified and the folder is successfully loaded, THE File_Filter SHALL reduce the playlist to only media items whose file names match the specified file list, comparing against each media item's file name (not its full relative path)
2. WHEN file parameters are specified, THE File_Filter SHALL preserve the order of files as specified in the URL parameters, placing matched items in the same sequence as their corresponding entries in the file parameter list
3. WHEN none of the specified file names match any loaded media items, THE App SHALL display a warning message listing the files that could not be found and SHALL leave the playlist empty
4. WHEN some specified file names match and others do not, THE App SHALL display the matched files in the playlist and show a warning indicating which files were not found
5. WHEN file parameters are specified, THE File_Filter SHALL perform case-insensitive file name matching (e.g., "Photo.JPG" matches "photo.jpg")
6. WHEN a file name specified in the URL parameters matches multiple media items (e.g., same file name in different subfolders), THE File_Filter SHALL include all matching media items in the playlist grouped at the position of that file entry
7. WHEN the same file name appears more than once in the URL parameters, THE File_Filter SHALL include the matching media item only once at the position of its first occurrence

### Requirement 5: Auto-play on URL-driven load

**User Story:** As a user, I want the slideshow to start playing automatically when loaded via URL parameters, so that kiosk deployments work hands-free.

#### Acceptance Criteria

1. WHEN the URL contains an `autoplay` query parameter set to `true` and the playlist contains at least one item after folder loading and file filtering complete, THE App SHALL start slideshow playback automatically within 1 second of the playlist being populated
2. WHEN the `autoplay` parameter is absent or set to any value other than `true`, THE App SHALL load the folder and files without starting automatic playback
3. WHEN autoplay is requested but the playlist is empty after file filtering, THE App SHALL not start playback and SHALL display a warning toast notification indicating that no media files are available to play
4. WHEN autoplay is requested and folder resolution requires a user permission prompt, THE App SHALL start playback automatically after the user grants permission and the playlist is populated
5. IF autoplay is requested and the first media item is a video that the browser blocks from auto-playing due to autoplay policy, THEN THE App SHALL start the slideshow in a playing state with the video muted

### Requirement 6: URL parameter validation and error handling

**User Story:** As a user, I want clear feedback when my URL parameters are invalid, so that I can correct the URL.

#### Acceptance Criteria

1. WHEN the `path` parameter value contains path traversal sequences (`..` as a path segment, or its percent-encoded equivalents), THE URL_Parameter_Parser SHALL reject the value, discard any associated `file` parameters, display an error toast notification indicating the path is invalid, and load the app with default behavior
2. WHEN a `file` parameter value contains path separator characters (forward slash `/` or backslash `\`), THE URL_Parameter_Parser SHALL exclude that file entry from the file list and display a warning toast notification indicating which file entry was rejected
3. WHEN a `file` parameter value exceeds 255 characters, THE URL_Parameter_Parser SHALL exclude that file entry from the file list and display a warning toast notification indicating the file name exceeds the maximum length
4. IF an unexpected error occurs during URL parameter processing, THEN THE App SHALL fall back to default behavior and display an error toast notification indicating that URL parameters could not be processed

### Requirement 7: URL reflects current state

**User Story:** As a user, I want to be able to copy the current URL and share it, so that others can open the same slideshow configuration.

#### Acceptance Criteria

1. WHEN a folder is added to the playlist (either via URL parameter on page load or via the directory picker) and the full path is known (either from the URL or stored alongside the handle), THE App SHALL update the browser URL to include a `path` query parameter with the full filesystem path
2. WHEN a folder is added but no full path is known (legacy handle with only folder name), THE App SHALL update the browser URL to include a `path` query parameter with the folder name as a fallback
3. WHEN file filtering is active (one or more specific files are selected within a folder), THE App SHALL include a `file` query parameter in the URL for each filtered file name
4. THE App SHALL update the URL using `history.replaceState` so that URL changes do not add new browser history entries and do not trigger a page reload
5. WHEN all folders are removed from the playlist, THE App SHALL remove all `path` and `file` query parameters from the URL, resulting in a bare path with no slideshow-related query parameters
6. IF a `path` or `file` parameter value contains characters that are not valid in a URL, THEN THE App SHALL percent-encode the value when writing to the URL and decode it when reading from the URL

### Requirement 8: IndexedDB schema stores full path

**User Story:** As a user, I want the app to remember the full path associated with each persisted folder handle, so that URL-based lookups match reliably across sessions.

#### Acceptance Criteria

1. WHEN a directory handle is persisted to IndexedDB (after the user selects a folder via the directory picker while a `path` URL parameter is present), THE App SHALL store the full path from the URL alongside the handle record
2. WHEN a directory handle is persisted without a `path` URL parameter present (e.g., user adds a folder manually without URL context), THE App SHALL store only the folder name (handle.name) as the key, with no full path stored
3. WHEN loading persisted handles from IndexedDB, THE Folder_Resolver SHALL read both the full path field (if present) and the folder name for matching purposes
4. THE App SHALL maintain backward compatibility with existing IndexedDB records that do not have a full path field by treating those records as having only a folder name key
