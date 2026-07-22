// Types for the optional per-folder metadata.json produced by companion downloader
// tools (e.g. a Reddit media downloader). See docs/ for the full field reference.
//
// metadata.json is a flat JSON object keyed by file basename, living alongside the
// media files it describes. It's opt-in on the producer side, may be missing or
// stale, and has no schema versioning - so all fields here are optional and any
// unrecognized keys are preserved defensively (see metadataValidation.ts) rather
// than assumed to be a fixed shape.

export interface MediaMetadataEntry {
  subreddit?: string;
  author?: string;
  title?: string;
  postId?: string;
  permalink?: string;
  createdUtc?: number;
  score?: number;
  nsfw?: boolean;
  sourceType?: string;
  sourceName?: string;
  mediaType?: string;
  galleryIndex?: number;
  sourceUrl?: string;
  // Any additional primitive fields present in the JSON that aren't part of the
  // known schema above. Kept so "show everything found" mode can still display them.
  [extra: string]: string | number | boolean | undefined;
}

// Flat map: file basename -> metadata entry
export type MediaMetadataMap = Record<string, MediaMetadataEntry>;

// How the FileNameOverlay decides which metadata fields to render
export type MetadataOverlayMode = 'off' | 'smart' | 'custom' | 'all';

export interface MetadataFieldDescriptor {
  key: string;
  label: string;
  /** Whether this field's formatted value reads fine standalone (no "Label:" prefix needed) */
  standalone?: boolean;
  format?: (value: string | number | boolean) => string;
}

function formatUnixTimestamp(value: string | number | boolean): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  try {
    return new Date(value * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

// Known fields, in the order they should be considered/displayed.
export const KNOWN_METADATA_FIELDS: MetadataFieldDescriptor[] = [
  { key: 'title', label: 'Title', standalone: true },
  { key: 'subreddit', label: 'Subreddit', standalone: true, format: (v) => (v ? `r/${v}` : '') },
  { key: 'author', label: 'Author', standalone: true, format: (v) => (v ? `u/${v}` : '') },
  { key: 'score', label: 'Score', standalone: true, format: (v) => (typeof v === 'number' ? `\u25B2 ${v}` : String(v)) },
  { key: 'nsfw', label: 'NSFW', standalone: true, format: (v) => (v === true ? 'NSFW' : '') },
  { key: 'createdUtc', label: 'Posted', format: formatUnixTimestamp },
  { key: 'sourceName', label: 'Source' },
  { key: 'sourceType', label: 'Source Type' },
  { key: 'mediaType', label: 'Media Type' },
  { key: 'postId', label: 'Post ID' },
  { key: 'galleryIndex', label: 'Gallery Position', format: (v) => (typeof v === 'number' ? `#${v + 1}` : String(v)) },
  { key: 'permalink', label: 'Permalink' },
  { key: 'sourceUrl', label: 'Source URL' },
];

// Curated preset used by the "smart" mode - a small, safe default that reads well
// without configuration.
export const SMART_DEFAULT_FIELDS = ['title', 'subreddit'];

export function getFieldDescriptor(key: string): MetadataFieldDescriptor | undefined {
  return KNOWN_METADATA_FIELDS.find((f) => f.key === key);
}

/**
 * Converts an arbitrary field key (e.g. "created_utc", "cameraModel", "lens-type")
 * into a readable label, for fields that aren't part of the curated known-field
 * list. Downloader tools other than the reddit one may use entirely different
 * field names, so this is the fallback for anything the user discovers via
 * upload or types in manually.
 */
export function humanizeFieldKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase -> "camel Case"
    .replace(/[_-]+/g, ' ') // snake_case / kebab-case -> spaces
    .trim();
  if (!spaced) return key;
  return spaced
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function getFieldLabel(key: string): string {
  return getFieldDescriptor(key)?.label ?? humanizeFieldKey(key);
}

export function formatFieldValue(key: string, value: string | number | boolean): string {
  const descriptor = getFieldDescriptor(key);
  if (descriptor?.format) {
    return descriptor.format(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/**
 * Extracts the union of field keys present across all entries of a metadata map
 * (e.g. an uploaded sample metadata.json). Used to let users discover which
 * fields exist in their own downloader's schema, since it can differ entirely
 * from the reddit-downloader field set this app ships known labels for.
 */
export function extractFieldKeys(metadataMap: MediaMetadataMap): string[] {
  const keys = new Set<string>();
  for (const entry of Object.values(metadataMap)) {
    for (const [key, value] of Object.entries(entry)) {
      if (value !== undefined) keys.add(key);
    }
  }
  return Array.from(keys);
}
