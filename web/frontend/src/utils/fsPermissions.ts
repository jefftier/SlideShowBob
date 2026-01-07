/**
 * File System Access API Permission Utilities
 * 
 * Provides utilities for checking and asserting read permissions on
 * FileSystemDirectoryHandle and FileSystemFileHandle objects.
 * 
 * This module handles permission detection without triggering re-authentication
 * prompts (that's handled in PR8b).
 */

// Type guard for FileSystemHandle with queryPermission
interface FileSystemHandleWithPermission {
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

/**
 * Checks if a handle has read permission without requesting it
 * @param handle FileSystemDirectoryHandle or FileSystemFileHandle to check
 * @returns Promise<boolean> - true if permission is granted, false otherwise
 */
export async function hasReadPermission(
  handle: FileSystemDirectoryHandle | FileSystemFileHandle | FileSystemHandleWithPermission
): Promise<boolean> {
  try {
    // queryPermission is available on FileSystemHandle (parent interface)
    const handleWithPermission = handle as FileSystemHandleWithPermission;
    if (handleWithPermission.queryPermission && typeof handleWithPermission.queryPermission === 'function') {
      const permission = await handleWithPermission.queryPermission({ mode: 'read' });
      // Only return true if explicitly granted
      // "prompt" or "denied" both mean we don't have permission
      return permission === 'granted';
    }
    // If queryPermission is not available, assume no permission
    // (older browsers or handles that don't support it)
    return false;
  } catch (error) {
    // On any error, assume no permission (fail-safe)
    console.warn('Error checking permission:', error);
    return false;
  }
}

/**
 * Asserts that a handle has read permission, throwing if not
 * @param handle FileSystemDirectoryHandle or FileSystemFileHandle to check
 * @param contextLabel Human-readable label for error message (e.g., "folder 'Photos'")
 * @throws Error if permission is not granted
 */
export async function assertReadPermission(
  handle: FileSystemDirectoryHandle | FileSystemFileHandle | FileSystemHandleWithPermission,
  contextLabel: string
): Promise<void> {
  const hasPermission = await hasReadPermission(handle);
  if (!hasPermission) {
    throw new Error(`Permission denied for ${contextLabel}`);
  }
}

