// Validation for the optional per-folder metadata.json file (produced by companion
// downloader tools, e.g. a Reddit media downloader). Mirrors the defensive posture
// of manifestValidation.ts: enforce a size limit before parsing, and validate types
// per-entry without throwing on unknown/missing fields (there's no schema versioning
// guarantee upstream, so unknown keys are preserved rather than rejected).

import { MediaMetadataEntry, MediaMetadataMap } from '../types/metadata';

/**
 * Maximum allowed metadata.json file size in bytes (2,000,000 bytes).
 * Metadata files can grow large for folders with many downloads, so this is
 * a bit more generous than the manifest limit, but still bounded for DoS protection.
 */
export const MAX_METADATA_SIZE = 2_000_000;

const KNOWN_STRING_FIELDS = new Set([
  'subreddit', 'author', 'title', 'postId', 'permalink', 'sourceType', 'sourceName', 'mediaType', 'sourceUrl',
]);
const KNOWN_NUMBER_FIELDS = new Set(['createdUtc', 'score', 'galleryIndex']);
const KNOWN_BOOLEAN_FIELDS = new Set(['nsfw']);

/**
 * Validates a single metadata entry. Known fields are type-checked and dropped
 * (rather than throwing) if they don't match the expected type - a malformed
 * field for one file shouldn't take down the whole metadata set. Unknown fields
 * are preserved as-is (as long as they're primitives) so "show everything found"
 * mode keeps working as the producer's schema evolves.
 */
function validateEntry(data: unknown): MediaMetadataEntry | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  const obj = data as Record<string, unknown>;
  const entry: MediaMetadataEntry = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (KNOWN_STRING_FIELDS.has(key)) {
      if (typeof value === 'string') entry[key] = value;
      continue;
    }
    if (KNOWN_NUMBER_FIELDS.has(key)) {
      if (typeof value === 'number' && Number.isFinite(value)) entry[key] = value;
      continue;
    }
    if (KNOWN_BOOLEAN_FIELDS.has(key)) {
      if (typeof value === 'boolean') entry[key] = value;
      continue;
    }

    // Unknown field: keep it if it's a primitive we can safely render as text.
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      entry[key] = value;
    }
    // Silently drop unknown object/array values - not safe to render inline.
  }

  return entry;
}

/**
 * Validates the top-level metadata.json shape: a flat object keyed by file
 * basename, each value an entry object. Returns a map of only the entries
 * that parsed as valid objects; invalid entries are skipped defensively
 * rather than failing the whole file.
 */
export function validateMetadataMap(data: unknown): MediaMetadataMap {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('metadata.json must be a JSON object keyed by file name');
  }

  const obj = data as Record<string, unknown>;
  const result: MediaMetadataMap = {};

  for (const [fileName, value] of Object.entries(obj)) {
    // Reject empty/whitespace-only keys defensively - not a valid basename.
    if (!fileName || !fileName.trim()) continue;

    const entry = validateEntry(value);
    if (entry) {
      result[fileName] = entry;
    }
    // Entries that aren't objects are skipped (defensive, not an error for the whole file)
  }

  return result;
}
