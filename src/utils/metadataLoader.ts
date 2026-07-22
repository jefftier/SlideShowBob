// Loads the optional per-folder metadata.json sidecar file produced by companion
// downloader tools (e.g. a Reddit media downloader). Mirrors manifestLoader.ts's
// approach: enforce a size limit, parse defensively, and never throw for the
// "file doesn't exist" case - a missing metadata.json just means no metadata
// is available for that folder, not an error.

import { MediaMetadataMap } from '../types/metadata';
import { validateMetadataMap, MAX_METADATA_SIZE } from './metadataValidation';

export const METADATA_FILE_NAME = 'metadata.json';

type FileSystemDirectoryHandle = any;

export interface MetadataLoadResult {
  metadata: MediaMetadataMap;
  error?: string;
}

/**
 * Attempts to load and validate metadata.json directly inside the given directory
 * handle (not recursive - metadata.json lives alongside the files it describes,
 * so each folder level is checked independently by the caller).
 *
 * Returns an empty map (no error) when the file simply doesn't exist - that's the
 * expected state for folders where the "Save media metadata" option was never
 * enabled upstream. Returns an empty map with an error message for cases where
 * the file exists but couldn't be read/parsed/validated, so callers can decide
 * whether to surface a toast without blocking folder loading.
 */
export async function loadFolderMetadata(
  dirHandle: FileSystemDirectoryHandle
): Promise<MetadataLoadResult> {
  let fileHandle: any;
  try {
    fileHandle = await dirHandle.getFileHandle(METADATA_FILE_NAME);
  } catch {
    // No metadata.json in this folder - normal, not an error.
    return { metadata: {} };
  }

  try {
    const file = await fileHandle.getFile();

    if (file.size > MAX_METADATA_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const maxMB = (MAX_METADATA_SIZE / (1024 * 1024)).toFixed(2);
      return {
        metadata: {},
        error: `metadata.json too large: ${sizeMB} MB (maximum allowed: ${maxMB} MB)`,
      };
    }

    const text = await file.text();

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { metadata: {}, error: 'metadata.json contains invalid JSON' };
    }

    const metadata = validateMetadataMap(data);
    return { metadata };
  } catch (error) {
    return {
      metadata: {},
      error: error instanceof Error ? error.message : 'Failed to read metadata.json',
    };
  }
}
