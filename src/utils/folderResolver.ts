// Folder Resolver: matches a parsed path to a persisted directory handle or triggers directory picker

import { loadDirectoryHandleByFullPath, loadDirectoryHandleByFolderName } from './directoryStorage';

export interface FolderResolution {
  handle: FileSystemDirectoryHandle;
  folderName: string;
  fullPath: string;
  source: 'fullPath' | 'folderName' | 'picker';
}

export interface FolderResolverOptions {
  path: string;
  onStatusChange: (message: string) => void;
  onPromptUser: (message: string) => void;
}

/**
 * Extract the last path segment (folder name) from a full filesystem path.
 */
function extractFolderName(path: string): string {
  // Remove trailing slashes, then grab the last segment
  const trimmed = path.replace(/[/\\]+$/, '');
  const segments = trimmed.split(/[/\\]/);
  return segments[segments.length - 1] || trimmed;
}

/**
 * Query permission on a directory handle safely.
 * Returns 'granted', 'prompt', or 'denied'.
 */
async function queryHandlePermission(
  handle: FileSystemDirectoryHandle
): Promise<PermissionState> {
  const h = handle as any;
  if (h.queryPermission && typeof h.queryPermission === 'function') {
    return await h.queryPermission({ mode: 'read' });
  }
  // If queryPermission is not available, assume prompt is needed
  return 'prompt';
}

/**
 * Request read permission on a directory handle.
 * Returns the resulting permission state.
 */
async function requestHandlePermission(
  handle: FileSystemDirectoryHandle
): Promise<PermissionState> {
  const h = handle as any;
  if (h.requestPermission && typeof h.requestPermission === 'function') {
    return await h.requestPermission({ mode: 'read' });
  }
  return 'denied';
}

/**
 * Attempt to use a matched handle, checking and requesting permission as needed.
 * Returns the handle if permission is granted, or throws if denied.
 * Throws a DOMException with name 'SecurityError' if permission is 'prompt'
 * and cannot be requested (e.g., no user gesture context).
 */
async function resolveWithPermission(
  handle: FileSystemDirectoryHandle,
  folderName: string,
  fullPath: string,
  source: 'fullPath' | 'folderName',
  options: FolderResolverOptions
): Promise<FolderResolution> {
  const permission = await queryHandlePermission(handle);

  if (permission === 'granted') {
    return { handle, folderName, fullPath, source };
  }

  if (permission === 'prompt') {
    options.onStatusChange(`Requesting access to "${folderName}"…`);
    try {
      const result = await requestHandlePermission(handle);
      if (result === 'granted') {
        return { handle, folderName, fullPath, source };
      }
    } catch (err) {
      // requestPermission may throw if no user gesture is active
      // Re-throw as-is so the caller can detect SecurityError/AbortError
      throw err;
    }
    // Permission denied by user — throw a DOMException so caller can
    // distinguish "needs gesture" from "user explicitly denied"
    throw new DOMException(`Access denied for ${options.path}`, 'SecurityError');
  }

  // permission === 'denied'
  throw new Error(`Access denied for ${options.path}`);
}

/**
 * Resolve a filesystem path to a usable FileSystemDirectoryHandle.
 *
 * Two-tier matching:
 * 1. Query IndexedDB for a record matching the full path
 * 2. Extract the last path segment and query by folder name as fallback
 * 3. If neither matches, prompt the user to select the folder via directory picker
 */
export async function resolveFolder(
  options: FolderResolverOptions
): Promise<FolderResolution> {
  const { path, onStatusChange, onPromptUser } = options;
  const folderName = extractFolderName(path);

  // Tier 1: full path match
  const fullPathRecord = await loadDirectoryHandleByFullPath(path);
  if (fullPathRecord) {
    return resolveWithPermission(
      fullPathRecord.handle,
      fullPathRecord.folderName,
      path,
      'fullPath',
      options
    );
  }

  // Tier 2: folder name fallback
  const folderNameRecord = await loadDirectoryHandleByFolderName(folderName);
  if (folderNameRecord) {
    return resolveWithPermission(
      folderNameRecord.handle,
      folderNameRecord.folderName,
      path,
      'folderName',
      options
    );
  }

  // Tier 3: no match — prompt user and open directory picker
  onPromptUser(`This URL wants to open ${path} — please select this folder`);
  onStatusChange(`Waiting for folder selection…`);

  const handle = await (window as any).showDirectoryPicker({ mode: 'read' }) as FileSystemDirectoryHandle;
  return {
    handle,
    folderName: handle.name,
    fullPath: path,
    source: 'picker',
  };
}
