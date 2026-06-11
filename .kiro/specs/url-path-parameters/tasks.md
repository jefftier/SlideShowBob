# Implementation Plan: URL Path Parameters

## Overview

Implement URL parameter support for SlideShowBob, enabling bookmarkable/shareable URLs that specify a full filesystem path (`?path=`), optional file filters (`?file=`), and autoplay (`?autoplay=true`). The implementation introduces three new modules (URL Parameter Parser, Folder Resolver, File Filter), upgrades the IndexedDB schema to store full paths with a new index, and wires everything into App.tsx with URL sync via `history.replaceState`.

## Tasks

- [x] 1. IndexedDB schema migration and directory storage updates
  - [x] 1.1 Upgrade IndexedDB schema to version 2 with fullPath field and index
    - Bump `DB_VERSION` to 2 in `src/utils/directoryStorage.ts`
    - Add `onupgradeneeded` handler for version 1→2: create `fullPath` index on the `directoryHandles` store (non-unique, sparse — allows records without fullPath)
    - Update `saveDirectoryHandle` to accept an optional `fullPath` parameter and store it alongside the handle record
    - Add `loadDirectoryHandleByFullPath(fullPath: string)` function that queries the fullPath index
    - Add `loadDirectoryHandleByFolderName(folderName: string)` function (wraps existing key lookup)
    - Ensure backward compatibility: existing records without `fullPath` still load and match by folderName
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 1.2 Update useFolderPersistence hook to support fullPath
    - Extend `persistFolder` to accept an optional `fullPath` parameter and pass it through to `saveDirectoryHandle`
    - Expose `loadHandleByFullPath` and `loadHandleByFolderName` methods from the hook
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 1.3 Write unit tests for IndexedDB schema migration
    - Test that opening DB at version 2 creates the fullPath index
    - Test that records saved at version 1 (no fullPath) still load correctly
    - Test that `loadDirectoryHandleByFullPath` returns the correct record
    - Test that `loadDirectoryHandleByFolderName` still works for legacy records
    - _Requirements: 8.3, 8.4_

- [x] 2. URL Parameter Parser module
  - [x] 2.1 Create `src/utils/urlParams.ts` with `parseUrlParams` function
    - Extract `path` parameter: decode URI, reject empty/whitespace, reject `..` segments (including percent-encoded variants like `%2e%2e`)
    - Use only the first `path` parameter if multiple are present
    - Extract `file` parameters: decode, reject entries with `/` or `\`, reject entries >255 chars, reject empty values, deduplicate preserving first-occurrence order, cap at 100
    - Ignore `file` params when `path` is absent
    - Extract `autoplay` parameter (true only if value is exactly `"true"`)
    - Populate `warnings` array and `error` string per validation rules
    - Export `ParsedUrlParams` interface
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 6.1, 6.2, 6.3_

  - [x] 2.2 Write unit tests for `parseUrlParams`
    - Test path extraction and decoding
    - Test path with empty/whitespace values ignored
    - Test multiple `path` params uses first
    - Test `..` traversal rejection (various forms)
    - Test file param extraction, deduplication, ordering
    - Test file params without path are ignored
    - Test file entry validation (separators, length, empty)
    - Test autoplay parameter parsing
    - _Requirements: 1.1–1.4, 2.1–2.6, 6.1–6.3_

  - [x] 1.4 Write property test: path parameter round-trip (Property 1)
    - **Property 1: Path parameter round-trip**
    - For any valid filesystem path (non-empty, no whitespace-only, no `..` segments), writing via syncUrlToState then parsing via parseUrlParams produces the original path
    - **Validates: Requirements 1.1, 1.2, 1.3, 7.1, 7.6**

  - [x] 1.5 Write property test: file parameter round-trip (Property 2)
    - **Property 2: File parameter round-trip**
    - For any ordered list of valid file names (non-empty, no `/` or `\`, ≤255 chars, deduplicated), writing via syncUrlToState then parsing via parseUrlParams produces the same list
    - **Validates: Requirements 2.1, 2.3, 2.6, 7.3, 7.6**

  - [x] 1.6 Write property tests: path traversal rejection and file name validation (Properties 6, 7)
    - **Property 6: Path traversal rejection**
    - For any path containing `..` as a segment, parseUrlParams returns error non-null and path null
    - **Property 7: File name validation**
    - For any string containing `/` or `\`, or exceeding 255 chars, parseUrlParams excludes it from files and adds a warning
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 3. Folder Resolver and File Filter modules
  - [x] 3.1 Create `src/utils/folderResolver.ts` with `resolveFolder` function
    - Implement two-tier matching: query IndexedDB for fullPath match first, then extract last path segment and query by folderName as fallback
    - If handle found with `queryPermission === 'granted'`, return it immediately
    - If handle found with `queryPermission === 'prompt'`, call `requestPermission({ mode: 'read' })`
    - If no match, call `onPromptUser` with message: "This URL wants to open [path] — please select this folder" and open directory picker
    - Return `FolderResolution` with handle, folderName, fullPath, and source
    - Call `onStatusChange` while waiting for user interaction
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 3.2 Create `src/utils/fileFilter.ts` with `filterMediaByFileList` function
    - Case-insensitive comparison of `mediaItem.fileName` against each filter entry
    - Output order follows fileList order
    - Multiple items matching the same name (different subfolders) are all included at that position
    - Duplicates in fileList produce matches only at first occurrence
    - Return `{ matched, missing }` result
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 4.7_

  - [x] 3.3 Write unit tests for folderResolver
    - Test full-path match with granted permission
    - Test full-path match with prompt permission (triggers requestPermission)
    - Test folder-name fallback when no full-path match
    - Test directory picker flow when no match exists
    - Test permission denied scenario
    - _Requirements: 3.1–3.7_

  - [x] 3.4 Write unit tests for fileFilter
    - Test basic filtering and ordering
    - Test case-insensitive matching
    - Test multiple items with same file name in different subfolders
    - Test deduplication (same name in fileList only matched once)
    - Test missing files reported correctly
    - _Requirements: 4.1–4.7_

  - [x] 3.5 Write property tests for file filter (Properties 3, 4, 5)
    - **Property 3: File filter correctness**
    - Output contains only items whose fileName matches a filter entry (case-insensitive), no extras
    - **Property 4: File filter ordering**
    - Matched output is ordered by first-occurrence position of file name in filter list
    - **Property 5: File filter includes all subfolder matches**
    - When multiple items share the same fileName, all are included
    - **Validates: Requirements 4.1, 4.2, 4.5, 4.6, 4.7**

- [x] 4. App integration and URL sync
  - [x] 4.1 Create `src/utils/urlSync.ts` with `syncUrlToState` function
    - Accept `{ path, files }` state object
    - Use `history.replaceState` to update URL without navigation
    - Percent-encode path and file values for URL safety
    - Remove all slideshow params when state is empty (path is null and files is empty)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 4.2 Integrate URL parameters into App.tsx initialization flow
    - Call `parseUrlParams` early in `initializeApp`
    - If path is present, call `resolveFolder` with appropriate callbacks
    - On successful resolution, persist handle with fullPath via `persistFolder`
    - If file params present, apply `filterMediaByFileList` after media is loaded
    - If `autoplay` is true and playlist is non-empty, start playback (muted for video autoplay policy)
    - Display error/warning toasts based on `ParsedUrlParams.error` and `warnings`
    - Handle unexpected errors with fallback to default behavior
    - Call `syncUrlToState` when folders are added/removed or file filter changes
    - _Requirements: 1.1–1.5, 3.1–3.7, 4.1–4.4, 5.1–5.5, 6.4, 7.1–7.6_

  - [ ]* 4.3 Write integration test for full URL-to-playback flow
    - Mock IndexedDB, test URL with path → resolve → load → filter → autoplay
    - Test schema migration: old records without fullPath still resolve by folderName
    - Test two-tier matching: full-path match takes priority over folder-name
    - _Requirements: 3.1, 3.2, 5.1, 8.4_

- [x] 5. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Property tests use the existing `fast-check` (v4.7.0) dependency
- The IndexedDB schema migration (task 1.1) must be completed before the Folder Resolver (task 3.1) since it depends on the fullPath index
- URL sync (task 4.1) must be completed before property tests 1.4/1.5 since they test round-trip through syncUrlToState → parseUrlParams
- The `path` URL parameter accepts full filesystem paths with no length limit (only individual file names are capped at 255 chars)
- The user prompt when no handle is found uses the format: "This URL wants to open [path] — please select this folder"

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "1.6"] },
    { "id": 2, "tasks": ["1.3", "3.1", "3.2", "4.1"] },
    { "id": 3, "tasks": ["3.3", "3.4", "3.5", "1.4", "1.5"] },
    { "id": 4, "tasks": ["4.2"] },
    { "id": 5, "tasks": ["4.3"] }
  ]
}
```
