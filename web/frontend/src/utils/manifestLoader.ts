// Utility for loading and validating manifest files

import { SlideshowManifest, ManifestValidationResult, ManifestItem } from '../types/manifest';
import { MediaItem } from '../types/media';

const MANIFEST_VERSION = '1.0';

/**
 * Validates a manifest file structure
 */
export function validateManifest(data: any): ManifestValidationResult {
  try {
    // Check if it's an object
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Manifest must be a JSON object' };
    }

    // Check version (make it optional, default to "1.0")
    let version = data.version;
    if (!version) {
      version = '1.0'; // Default version if not specified
    } else if (typeof version !== 'string') {
      return { valid: false, error: 'Manifest version must be a string' };
    }

    // Check items array
    if (!Array.isArray(data.items)) {
      return { valid: false, error: 'Manifest must have an items array' };
    }

    if (data.items.length === 0) {
      return { valid: false, error: 'Manifest items array cannot be empty' };
    }

    // Validate each item
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (!item || typeof item !== 'object') {
        return { valid: false, error: `Item ${i + 1} must be an object` };
      }
      if (!item.file || typeof item.file !== 'string') {
        return { valid: false, error: `Item ${i + 1} must have a file field (string)` };
      }
      if (item.delay !== undefined && (typeof item.delay !== 'number' || item.delay < 0)) {
        return { valid: false, error: `Item ${i + 1} delay must be a non-negative number` };
      }
      if (item.zoom !== undefined && (typeof item.zoom !== 'number' || item.zoom <= 0)) {
        return { valid: false, error: `Item ${i + 1} zoom must be a positive number` };
      }
      if (item.fit !== undefined && typeof item.fit !== 'boolean') {
        return { valid: false, error: `Item ${i + 1} fit must be a boolean` };
      }
    }

    // Validate optional fields
    if (data.defaultDelay !== undefined && (typeof data.defaultDelay !== 'number' || data.defaultDelay < 0)) {
      return { valid: false, error: 'defaultDelay must be a non-negative number' };
    }

    const manifest: SlideshowManifest = {
      version: version,
      name: data.name,
      defaultDelay: data.defaultDelay,
      items: data.items.map((item: any) => ({
        file: item.file,
        delay: item.delay,
        zoom: item.zoom,
        fit: item.fit
      }))
    };

    return { valid: true, manifest };
  } catch (error) {
    return { valid: false, error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

/**
 * Finds all JSON files in a directory that might be manifest files
 */
export async function findManifestFiles(
  dirHandle: FileSystemDirectoryHandle
): Promise<{ name: string; handle: FileSystemFileHandle }[]> {
  const manifestFiles: { name: string; handle: FileSystemFileHandle }[] = [];

  try {
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === 'file' && name.toLowerCase().endsWith('.json')) {
        manifestFiles.push({ name, handle: handle as FileSystemFileHandle });
      }
    }
  } catch (error) {
    console.error('Error scanning for manifest files:', error);
  }

  return manifestFiles;
}

/**
 * Loads and validates a manifest file
 */
export async function loadManifestFile(
  fileHandle: FileSystemFileHandle
): Promise<ManifestValidationResult> {
  try {
    const file = await fileHandle.getFile();
    const text = await file.text();
    
    // Try to parse JSON - this will catch syntax errors like trailing commas
    let data: any;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      return {
        valid: false,
        error: `JSON syntax error: ${parseError instanceof Error ? parseError.message : 'Invalid JSON format'}`
      };
    }
    
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

