// Manifest validation with security hardening
// Implements size limits and strict schema validation
// Note: Path traversal protection is in PR6b

import { SlideshowManifest, ManifestItem } from '../types/manifest';

/**
 * Maximum allowed manifest file size in bytes (1,000,000 bytes)
 * Configurable constant for DoS protection
 */
export const MAX_MANIFEST_SIZE = 1_000_000; // 1,000,000 bytes

/**
 * Validates that a media file path is safe and relative
 * Rejects path traversal, absolute paths, Windows drive paths, and URLs
 * 
 * @param path - The path to validate
 * @returns The validated path (normalized) or throws with specific error message
 * @throws Error with specific message if path is unsafe
 */
export function validateMediaPath(path: string): string {
  // Trim whitespace
  const trimmed = path.trim();
  
  // Reject if empty after trimming
  if (trimmed.length === 0) {
    throw new Error('Unsafe path: empty path not allowed');
  }
  
  // Normalize backslashes to forward slashes for validation checks
  const normalized = trimmed.replace(/\\/g, '/');
  
  // Reject if contains null bytes or weird control chars
  if (/[\0\r\n\t]/.test(trimmed)) {
    throw new Error('Unsafe path: contains null bytes or control characters');
  }
  
  // Reject if contains ".." as a path segment
  // Check for: "/../", startsWith("../"), endsWith("/.."), or equals("..")
  // After normalization, all backslashes are forward slashes, so we only need to check for "/"
  if (normalized.includes('/../') || 
      normalized.startsWith('../') || 
      normalized.endsWith('/..') || 
      normalized === '..') {
    throw new Error("Unsafe path: contains '..' segment");
  }
  
  // Reject if starts with "/" or "\" (absolute)
  // Check the trimmed path before normalization to catch both cases
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) {
    throw new Error('Unsafe path: absolute paths not allowed');
  }
  
  // Reject if matches Windows drive prefix: /^[a-zA-Z]:[\\/]/
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    throw new Error('Unsafe path: Windows drive paths not allowed');
  }
  
  // Reject if starts with a URL scheme (case-insensitive): /^[a-zA-Z][a-zA-Z0-9+.-]*:/
  // This blocks http:, https:, data:, blob:, file:, etc.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    throw new Error('Unsafe path: URL schemes not allowed');
  }
  
  // Return the original path (validated)
  return trimmed;
}

/**
 * Validates manifest schema with strict type checking
 * Rejects unknown keys to prevent silent typos
 * 
 * @param data - The parsed JSON data to validate
 * @returns Validated manifest or throws descriptive error
 */
export function validateManifest(data: unknown): SlideshowManifest {
  // Check if it's an object
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Manifest must be a JSON object');
  }

  const obj = data as Record<string, unknown>;

  // Define allowed top-level keys
  const allowedTopKeys = new Set(['version', 'name', 'defaultDelay', 'items']);
  
  // Check for unknown top-level keys
  for (const key of Object.keys(obj)) {
    if (!allowedTopKeys.has(key)) {
      throw new Error(`Unknown manifest field: "${key}". Allowed fields: version, name, defaultDelay, items`);
    }
  }

  // Validate version (optional, defaults to "1.0")
  let version: string;
  if (obj.version === undefined) {
    version = '1.0';
  } else if (typeof obj.version !== 'string') {
    throw new Error('Manifest version must be a string');
  } else {
    version = obj.version;
  }

  // Validate name (optional)
  let name: string | undefined;
  if (obj.name !== undefined) {
    if (typeof obj.name !== 'string') {
      throw new Error('Manifest name must be a string');
    }
    name = obj.name;
  }

  // Validate defaultDelay (optional)
  let defaultDelay: number | undefined;
  if (obj.defaultDelay !== undefined) {
    if (typeof obj.defaultDelay !== 'number' || !Number.isFinite(obj.defaultDelay) || obj.defaultDelay < 0) {
      throw new Error('defaultDelay must be a non-negative number');
    }
    defaultDelay = obj.defaultDelay;
  }

  // Validate items array (required)
  if (!Array.isArray(obj.items)) {
    throw new Error('Manifest must have an items array');
  }

  if (obj.items.length === 0) {
    throw new Error('Manifest items array cannot be empty');
  }

  // Validate each item
  const validatedItems: ManifestItem[] = [];
  const allowedItemKeys = new Set(['file', 'delay', 'zoom', 'fit']);

  for (let i = 0; i < obj.items.length; i++) {
    const item = obj.items[i];

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`items[${i}] must be an object`);
    }

    const itemObj = item as Record<string, unknown>;

    // Check for unknown item keys
    for (const key of Object.keys(itemObj)) {
      if (!allowedItemKeys.has(key)) {
        throw new Error(`items[${i}].${key}: Unknown field. Allowed fields: file, delay, zoom, fit`);
      }
    }

    // Validate file (required)
    if (!itemObj.file || typeof itemObj.file !== 'string') {
      throw new Error(`items[${i}].file must be a string`);
    }
    
    // Validate file path safety (path traversal, absolute paths, URLs, etc.)
    let validatedFilePath: string;
    try {
      validatedFilePath = validateMediaPath(itemObj.file);
    } catch (error) {
      throw new Error(`items[${i}].file: ${error instanceof Error ? error.message : 'Unsafe path'}`);
    }

    // Validate delay (optional)
    let delay: number | undefined;
    if (itemObj.delay !== undefined) {
      if (typeof itemObj.delay !== 'number' || !Number.isFinite(itemObj.delay) || itemObj.delay < 0) {
        throw new Error(`items[${i}].delay must be a non-negative number`);
      }
      delay = itemObj.delay;
    }

    // Validate zoom (optional)
    let zoom: number | undefined;
    if (itemObj.zoom !== undefined) {
      if (typeof itemObj.zoom !== 'number' || !Number.isFinite(itemObj.zoom) || itemObj.zoom <= 0) {
        throw new Error(`items[${i}].zoom must be a positive number`);
      }
      zoom = itemObj.zoom;
    }

    // Validate fit (optional)
    let fit: boolean | undefined;
    if (itemObj.fit !== undefined) {
      if (typeof itemObj.fit !== 'boolean') {
        throw new Error(`items[${i}].fit must be a boolean`);
      }
      fit = itemObj.fit;
    }

    validatedItems.push({
      file: validatedFilePath,
      delay,
      zoom,
      fit
    });
  }

  // Construct validated manifest
  const manifest: SlideshowManifest = {
    version,
    name,
    defaultDelay,
    items: validatedItems
  };

  return manifest;
}

