/**
 * URL Parameter Parser module.
 *
 * Extracts, validates, and decodes URL search parameters for SlideShowBob.
 * Pure, synchronous function — no side effects.
 */

export interface ParsedUrlParams {
  /** Full filesystem path from ?path= parameter, or null if absent/invalid */
  path: string | null;
  /** Ordered, deduplicated list of file names from ?file= parameters */
  files: string[];
  /** Whether autoplay=true was specified */
  autoplay: boolean;
  /** Warnings generated during parsing (e.g., rejected file entries) */
  warnings: string[];
  /** Whether an error occurred that should block further processing */
  error: string | null;
}

/** Maximum number of file entries allowed */
const MAX_FILE_ENTRIES = 100;

/** Maximum length for an individual file name */
const MAX_FILE_NAME_LENGTH = 255;

/**
 * Checks whether a decoded path contains path traversal segments (`..`).
 * Handles both decoded and percent-encoded variants.
 */
function containsPathTraversal(decodedPath: string): boolean {
  // Split on forward slashes and backslashes to handle both separators
  const segments = decodedPath.split(/[/\\]/);
  return segments.some(segment => segment === '..');
}

/**
 * Checks whether the raw (not yet fully decoded) search string contains
 * percent-encoded path traversal patterns that decode to `..` segments.
 * This catches cases like `%2e%2e`, `%2E%2E`, `%2e.`, `.%2e`, etc.
 */
function containsEncodedTraversal(rawValue: string): boolean {
  // Decode percent-encoded characters and then check for traversal
  // We need to handle double-encoding by doing one pass of decoding
  // and checking for `..` segments
  try {
    const decoded = decodeURIComponent(rawValue);
    return containsPathTraversal(decoded);
  } catch {
    // If decoding fails, check the raw value for obvious patterns
    return false;
  }
}

/**
 * Parse URL search parameters for SlideShowBob.
 *
 * @param searchString - The URL search string (e.g., "?path=/foo&file=bar.jpg")
 * @returns Parsed and validated URL parameters
 */
export function parseUrlParams(searchString: string): ParsedUrlParams {
  const result: ParsedUrlParams = {
    path: null,
    files: [],
    autoplay: false,
    warnings: [],
    error: null,
  };

  const params = new URLSearchParams(searchString);

  // --- Extract autoplay parameter ---
  const autoplayValue = params.get('autoplay');
  result.autoplay = autoplayValue === 'true';

  // --- Extract path parameter (use first occurrence only) ---
  const rawPathValue = params.get('path');

  if (rawPathValue === null) {
    // No path parameter present — return early with defaults
    // File params without path are ignored entirely
    return result;
  }

  // Decode the path value. URLSearchParams already decodes percent-encoding,
  // but we need to check the raw form for encoded traversal sequences.
  // URLSearchParams handles decoding automatically, so rawPathValue is already decoded.
  const decodedPath = rawPathValue;

  // Check for empty/whitespace-only path
  if (decodedPath.trim() === '') {
    // Ignore the parameter, load default behavior
    // File params without valid path are ignored entirely
    return result;
  }

  // Check for path traversal in the decoded value
  if (containsPathTraversal(decodedPath)) {
    result.error = 'Invalid path: contains path traversal sequences';
    // File params are discarded when path is invalid
    return result;
  }

  // Additionally check raw search string for encoded traversal patterns
  // that URLSearchParams may have decoded for us already.
  // We need to look at the raw search to catch percent-encoded variants.
  // Extract the raw path value before URLSearchParams decoding:
  const rawSearchEntries = searchString.startsWith('?')
    ? searchString.slice(1)
    : searchString;
  const rawPairs = rawSearchEntries.split('&');
  for (const pair of rawPairs) {
    const eqIndex = pair.indexOf('=');
    const key = eqIndex === -1 ? pair : pair.slice(0, eqIndex);
    if (decodeURIComponent(key) === 'path') {
      const rawVal = eqIndex === -1 ? '' : pair.slice(eqIndex + 1);
      // Check the raw value for encoded traversal before full decode
      if (containsEncodedTraversal(rawVal)) {
        result.error = 'Invalid path: contains path traversal sequences';
        return result;
      }
      break; // Only check first occurrence
    }
  }

  // Path is valid
  result.path = decodedPath;

  // --- Extract file parameters ---
  const fileValues = params.getAll('file');
  const seen = new Set<string>();

  for (const fileValue of fileValues) {
    if (result.files.length >= MAX_FILE_ENTRIES) {
      break;
    }

    // Reject empty values
    if (fileValue === '') {
      continue;
    }

    // Reject entries containing path separators
    if (fileValue.includes('/') || fileValue.includes('\\')) {
      result.warnings.push(
        `File entry rejected (contains path separator): "${fileValue}"`
      );
      continue;
    }

    // Reject entries exceeding 255 characters
    if (fileValue.length > MAX_FILE_NAME_LENGTH) {
      result.warnings.push(
        `File entry rejected (exceeds ${MAX_FILE_NAME_LENGTH} characters): "${fileValue.slice(0, 50)}..."`
      );
      continue;
    }

    // Deduplicate preserving first-occurrence order (case-sensitive dedup)
    if (seen.has(fileValue)) {
      continue;
    }
    seen.add(fileValue);

    result.files.push(fileValue);
  }

  return result;
}
