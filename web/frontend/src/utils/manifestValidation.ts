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
 * Rejects path traversal, absolute paths, and URLs
 * 
 * @param path - The path to validate
 * @param itemIndex - Optional index for error messages
 * @returns Error message if invalid, undefined if valid
 */
export function validateMediaPath(path: string, itemIndex?: number): string | undefined {
  if (typeof path !== 'string' || path.length === 0) {
    return itemIndex !== undefined 
      ? `Item ${itemIndex + 1}: file path must be a non-empty string`
      : 'File path must be a non-empty string';
  }

  // Normalize separators to '/' for consistent checking
  const normalized = path.replace(/\\/g, '/');

  // Reject path traversal sequences
  if (normalized.includes('../') || normalized.includes('..\\') || normalized === '..' || normalized.startsWith('../')) {
    return itemIndex !== undefined
      ? `Item ${itemIndex + 1}: Unsafe path (path traversal detected): ${path}`
      : `Unsafe path (path traversal detected): ${path}`;
  }

  // Reject absolute paths (Unix-style)
  if (normalized.startsWith('/')) {
    return itemIndex !== undefined
      ? `Item ${itemIndex + 1}: Absolute path not allowed: ${path}`
      : `Absolute path not allowed: ${path}`;
  }

  // Reject absolute paths (Windows-style)
  // Match patterns like C:\ or C:/ or D:\ etc.
  if (/^[A-Za-z]:[\/\\]/.test(normalized)) {
    return itemIndex !== undefined
      ? `Item ${itemIndex + 1}: Windows absolute path not allowed: ${path}`
      : `Windows absolute path not allowed: ${path}`;
  }

  // Reject URLs (http, https, data, blob, file protocols)
  const urlPattern = /^(https?|data|blob|file):/i;
  if (urlPattern.test(normalized.trim())) {
    return itemIndex !== undefined
      ? `Item ${itemIndex + 1}: URL paths not allowed: ${path}`
      : `URL paths not allowed: ${path}`;
  }

  // Reject paths that start with backslash (Windows network or absolute)
  if (normalized.startsWith('\\')) {
    return itemIndex !== undefined
      ? `Item ${itemIndex + 1}: Network/absolute path not allowed: ${path}`
      : `Network/absolute path not allowed: ${path}`;
  }

  // Path is valid (relative within folder scope)
  return undefined;
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
      file: itemObj.file,
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

