// Utility for loading and validating manifest files

import { SlideshowManifest, ManifestValidationResult } from '../types/manifest';
import { MediaItem } from '../types/media';
import { validateManifest as validateManifestStrict, MAX_MANIFEST_SIZE } from './manifestValidation';
import { assertReadPermission } from './fsPermissions';

const MANIFEST_VERSION = '1.0';

/**
 * Validates a manifest file structure
 * Wrapper around strict validation that returns ManifestValidationResult
 * @deprecated Use validateManifestStrict from manifestValidation.ts for new code
 */
export function validateManifest(data: any): ManifestValidationResult {
  try {
    const manifest = validateManifestStrict(data);
    return { valid: true, manifest };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Unknown validation error' 
    };
  }
}

/**
 * Finds all JSON files in a directory that might be manifest files
 */
export async function findManifestFiles(
  dirHandle: FileSystemDirectoryHandle
): Promise<{ name: string; handle: FileSystemFileHandle }[]> {
  // Check permission before scanning
  await assertReadPermission(dirHandle, `folder "${dirHandle.name}"`);
  
  const manifestFiles: { name: string; handle: FileSystemFileHandle }[] = [];

  try {
    // Use type assertion for entries() method
    const handle = dirHandle as any;
    for await (const [name, entryHandle] of handle.entries()) {
      if (entryHandle.kind === 'file' && name.toLowerCase().endsWith('.json')) {
        manifestFiles.push({ name, handle: entryHandle as FileSystemFileHandle });
      }
    }
  } catch (error) {
    console.error('Error scanning for manifest files:', error);
  }

  return manifestFiles;
}

/**
 * Loads and validates a manifest file
 * Enforces size limits and strict validation before parsing
 */
export async function loadManifestFile(
  fileHandle: FileSystemFileHandle
): Promise<ManifestValidationResult> {
  try {
    const file = await fileHandle.getFile();
    
    // Check file size before reading (DoS protection)
    if (file.size > MAX_MANIFEST_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const maxMB = (MAX_MANIFEST_SIZE / (1024 * 1024)).toFixed(2);
      return {
        valid: false,
        error: `Manifest file too large: ${sizeMB} MB (maximum allowed: ${maxMB} MB)`
      };
    }
    
    const text = await file.text();
    
    // Try to parse JSON - this will catch syntax errors like trailing commas
    let data: any;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      return {
        valid: false,
        error: 'Invalid JSON in manifest'
      };
    }
    
    // Use strict validation (includes path safety checks)
    const result = validateManifest(data);
    if (result.valid) {
      result.fileName = fileHandle.name;
    }
    return result;
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Failed to read manifest file'
    };
  }
}

/**
 * Creates a sample manifest file content
 */
export function createSampleManifest(): string {
  const sample: SlideshowManifest = {
    version: MANIFEST_VERSION,
    name: 'Sample Slideshow',
    defaultDelay: 3000,
    items: [
      {
        file: 'image1.jpg',
        delay: 5000
      },
      {
        file: 'image2.png',
        delay: 3000,
        zoom: 1.5,
        fit: false
      },
      {
        file: 'subfolder/video.mp4',
        delay: 10000
      },
      {
        file: 'image3.jpg'
        // Uses defaultDelay
      }
    ]
  };

  return JSON.stringify(sample, null, 2);
}

/**
 * Validates and fixes common JSON issues (like trailing commas)
 * This is a helper to provide better error messages
 */
export function validateJSONSyntax(text: string): { valid: boolean; error?: string; fixed?: string } {
  try {
    JSON.parse(text);
    return { valid: true };
  } catch (error) {
    if (error instanceof SyntaxError) {
      // Try to provide helpful error message
      const message = error.message;
      if (message.includes('trailing comma') || message.includes('Unexpected token')) {
        return {
          valid: false,
          error: `JSON syntax error: ${message}. Check for trailing commas or missing quotes.`
        };
      }
      return {
        valid: false,
        error: `JSON syntax error: ${message}`
      };
    }
    return {
      valid: false,
      error: 'Invalid JSON format'
    };
  }
}

/**
 * Matches manifest items to actual media files
 */
export function matchManifestToMedia(
  manifest: SlideshowManifest,
  mediaItems: MediaItem[],
  rootFolderName: string
): { matched: MediaItem[]; missing: string[] } {
  const matched: MediaItem[] = [];
  const missing: string[] = [];

  // Create a map of media items by relative path for quick lookup
  const mediaMap = new Map<string, MediaItem>();
  for (const item of mediaItems) {
    // Normalize path separators
    const normalizedPath = item.relativePath?.replace(/\\/g, '/') || item.fileName;
    mediaMap.set(normalizedPath.toLowerCase(), item);
    // Also try with just filename
    mediaMap.set(item.fileName.toLowerCase(), item);
  }

  for (const manifestItem of manifest.items) {
    // Normalize the manifest file path
    const normalizedPath = manifestItem.file.replace(/\\/g, '/').toLowerCase();
    
    // Try exact match first
    let matchedItem = mediaMap.get(normalizedPath);
    
    // If not found, try matching by filename only
    if (!matchedItem) {
      const fileName = manifestItem.file.split(/[/\\]/).pop()?.toLowerCase() || '';
      matchedItem = mediaMap.get(fileName);
    }

    if (matchedItem) {
      // Apply manifest settings to the media item
      const itemWithSettings = { ...matchedItem };
      if (manifestItem.delay !== undefined) {
        (itemWithSettings as any).manifestDelay = manifestItem.delay;
      }
      if (manifestItem.zoom !== undefined) {
        (itemWithSettings as any).manifestZoom = manifestItem.zoom;
      }
      if (manifestItem.fit !== undefined) {
        (itemWithSettings as any).manifestFit = manifestItem.fit;
      }
      matched.push(itemWithSettings);
    } else {
      missing.push(manifestItem.file);
    }
  }

  return { matched, missing };
}

