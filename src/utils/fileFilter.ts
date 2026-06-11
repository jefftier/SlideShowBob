import { MediaItem } from '../types/media';

export interface FilterResult {
  matched: MediaItem[];
  missing: string[];
}

/**
 * Filters and orders media items according to a file list.
 *
 * - Comparison is case-insensitive against mediaItem.fileName
 * - Output order follows fileList order
 * - Multiple items matching the same name (different subfolders) are all included at that position
 * - Duplicate entries in fileList produce matches only at the first occurrence position
 * - Unmatched file names are collected in the `missing` array
 */
export function filterMediaByFileList(
  mediaItems: MediaItem[],
  fileList: string[]
): FilterResult {
  const matched: MediaItem[] = [];
  const missing: string[] = [];

  // Track which fileList entries we've already processed (by lowercase name)
  // so that duplicates only match at first occurrence
  const seen = new Set<string>();

  // Build a lookup: lowercase fileName -> list of matching media items
  const mediaByName = new Map<string, MediaItem[]>();
  for (const item of mediaItems) {
    const key = item.fileName.toLowerCase();
    const existing = mediaByName.get(key);
    if (existing) {
      existing.push(item);
    } else {
      mediaByName.set(key, [item]);
    }
  }

  for (const entry of fileList) {
    const key = entry.toLowerCase();

    // Skip duplicate entries in fileList — only first occurrence produces matches
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const items = mediaByName.get(key);
    if (items && items.length > 0) {
      // Include all matching items at this position
      matched.push(...items);
    } else {
      missing.push(entry);
    }
  }

  return { matched, missing };
}
