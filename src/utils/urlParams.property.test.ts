import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { parseUrlParams } from './urlParams';
import { syncUrlToState } from './urlSync';

/**
 * Property-based tests for URL Parameter Parser — path traversal rejection
 * and file name validation.
 *
 * Feature: url-path-parameters
 */

// Character arbitrary: printable chars excluding path separators, null, and dots
const safeChar = fc.integer({ min: 0x21, max: 0x7e })
  .filter(n => n !== 0x2f /* / */ && n !== 0x5c /* \ */ && n !== 0x2e /* . */)
  .map(n => String.fromCharCode(n));

// Segment generator: non-empty strings without separators, dots, or whitespace
const pathSegment = fc.string({ unit: safeChar, minLength: 1, maxLength: 20 });

// Path segment for round-trip: non-empty, no whitespace-only, no null bytes,
// no path separators, no `..` segments. Uses wider character range.
const roundTripSegmentChar = fc.integer({ min: 0x21, max: 0x7e })
  .filter(n => n !== 0x2f /* / */ && n !== 0x5c /* \ */ && n !== 0x00)
  .map(n => String.fromCharCode(n));

const roundTripSegment = fc.string({ unit: roundTripSegmentChar, minLength: 1, maxLength: 30 })
  .filter(seg => seg !== '..' && seg.trim().length > 0);

describe('Feature: url-path-parameters, Property 1: Path parameter round-trip', () => {
  /**
   * Property 1: Path parameter round-trip
   *
   * For any valid filesystem path (non-empty, no whitespace-only, no `..` segments),
   * writing via syncUrlToState then parsing via parseUrlParams produces the original path.
   *
   * **Validates: Requirements 1.1, 1.2, 1.3, 7.1, 7.6**
   */

  beforeEach(() => {
    // Reset URL state before each test run
    window.history.replaceState(null, '', '/');
  });

  it('round-trips any valid filesystem path through syncUrlToState → parseUrlParams', () => {
    // Generator: valid filesystem paths (absolute, 1-8 segments)
    const validPath = fc.array(roundTripSegment, { minLength: 1, maxLength: 8 })
      .map(segments => '/' + segments.join('/'));

    fc.assert(
      fc.property(validPath, (path) => {
        // Reset URL state before each iteration
        window.history.replaceState(null, '', '/');

        // Write path to URL via syncUrlToState
        syncUrlToState({ path, files: [] });

        // Read it back via parseUrlParams
        const result = parseUrlParams(window.location.search);

        // Assert round-trip fidelity
        expect(result.error).toBeNull();
        expect(result.path).toBe(path);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: url-path-parameters, Property 2: File parameter round-trip', () => {
  /**
   * Property 2: File parameter round-trip
   *
   * For any ordered list of valid file names (non-empty, no `/` or `\`, ≤255 chars,
   * deduplicated), writing via syncUrlToState then parsing via parseUrlParams
   * produces the same list.
   *
   * **Validates: Requirements 2.1, 2.3, 2.6, 7.3, 7.6**
   */

  beforeEach(() => {
    // Reset URL state before each test run
    window.history.replaceState(null, '', '/');
  });

  it('round-trips any valid file list through syncUrlToState → parseUrlParams', () => {
    // Generator: valid file name characters (no `/`, `\`, or null bytes)
    const fileNameChar = fc.integer({ min: 0x21, max: 0x7e })
      .filter(n => n !== 0x2f /* / */ && n !== 0x5c /* \ */ && n !== 0x00)
      .map(n => String.fromCharCode(n));

    // Generator: valid file names (non-empty, ≤255 chars, no separators or null)
    const validFileName = fc.string({ unit: fileNameChar, minLength: 1, maxLength: 255 });

    // Generator: a valid path (required for file params to be processed)
    const validPath = fc.array(roundTripSegment, { minLength: 1, maxLength: 4 })
      .map(segments => '/' + segments.join('/'));

    // Generator: ordered list of valid file names, deduplicated, capped at 100
    const validFileList = fc.array(validFileName, { minLength: 0, maxLength: 100 })
      .map(files => {
        // Deduplicate preserving first-occurrence order
        const seen = new Set<string>();
        const deduped: string[] = [];
        for (const f of files) {
          if (!seen.has(f)) {
            seen.add(f);
            deduped.push(f);
          }
        }
        return deduped;
      });

    fc.assert(
      fc.property(validPath, validFileList, (path, files) => {
        // Reset URL state before each iteration
        window.history.replaceState(null, '', '/');

        // Write path + files to URL via syncUrlToState
        syncUrlToState({ path, files });

        // Read it back via parseUrlParams
        const result = parseUrlParams(window.location.search);

        // Assert round-trip fidelity
        expect(result.error).toBeNull();
        expect(result.path).toBe(path);
        expect(result.files).toEqual(files);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: url-path-parameters, Property 6: Path traversal rejection', () => {
  /**
   * Property 6: Path traversal rejection
   *
   * For any path containing `..` as a segment, parseUrlParams returns
   * error non-null and path null.
   *
   * **Validates: Requirements 6.1**
   */
  it('rejects any path containing `..` as a path segment', () => {
    // Generator: paths that contain at least one `..` segment
    const pathWithTraversal = fc
      .tuple(
        // Segments before the `..`
        fc.array(pathSegment, { minLength: 0, maxLength: 4 }),
        // Segments after the `..`
        fc.array(pathSegment, { minLength: 0, maxLength: 4 })
      )
      .map(([before, after]) => {
        const allSegments = [...before, '..', ...after];
        return '/' + allSegments.join('/');
      });

    fc.assert(
      fc.property(pathWithTraversal, (path) => {
        const searchString = `?path=${encodeURIComponent(path)}`;
        const result = parseUrlParams(searchString);

        expect(result.error).not.toBeNull();
        expect(result.path).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('rejects paths with `..` at various positions (beginning, middle, end)', () => {
    const positionedTraversal = fc.oneof(
      // `..` at the beginning: /../something
      pathSegment.map(seg => `/../${seg}`),
      // `..` at the end: /something/..
      pathSegment.map(seg => `/${seg}/..`),
      // `..` in the middle: /a/../b
      fc.tuple(pathSegment, pathSegment).map(([a, b]) => `/${a}/../${b}`)
    );

    fc.assert(
      fc.property(positionedTraversal, (path) => {
        const searchString = `?path=${encodeURIComponent(path)}`;
        const result = parseUrlParams(searchString);

        expect(result.error).not.toBeNull();
        expect(result.path).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: url-path-parameters, Property 7: File name validation', () => {
  /**
   * Property 7: File name validation
   *
   * For any string containing `/` or `\`, or exceeding 255 chars,
   * parseUrlParams excludes it from files and adds a warning.
   *
   * **Validates: Requirements 6.2, 6.3**
   */

  // File name part without separators
  const fileNamePart = fc.string({
    unit: fc.integer({ min: 0x20, max: 0x7e })
      .filter(n => n !== 0x2f /* / */ && n !== 0x5c /* \ */)
      .map(n => String.fromCharCode(n)),
    minLength: 0,
    maxLength: 50,
  });

  it('excludes file names containing `/` and adds a warning', () => {
    // Generator: file names that contain at least one `/`
    const fileNameWithSlash = fc
      .tuple(fileNamePart, fileNamePart)
      .map(([before, after]) => `${before}/${after}`)
      .filter(s => s.length > 0 && s.length <= 255);

    // We need a valid path for file params to be processed
    const validPath = '/test/folder';

    fc.assert(
      fc.property(fileNameWithSlash, (fileName) => {
        const searchString = `?path=${encodeURIComponent(validPath)}&file=${encodeURIComponent(fileName)}`;
        const result = parseUrlParams(searchString);

        expect(result.files).not.toContain(fileName);
        expect(result.warnings.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('excludes file names containing `\\` and adds a warning', () => {
    // Generator: file names that contain at least one `\`
    const fileNameWithBackslash = fc
      .tuple(fileNamePart, fileNamePart)
      .map(([before, after]) => `${before}\\${after}`)
      .filter(s => s.length > 0 && s.length <= 255);

    const validPath = '/test/folder';

    fc.assert(
      fc.property(fileNameWithBackslash, (fileName) => {
        const searchString = `?path=${encodeURIComponent(validPath)}&file=${encodeURIComponent(fileName)}`;
        const result = parseUrlParams(searchString);

        expect(result.files).not.toContain(fileName);
        expect(result.warnings.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('excludes file names exceeding 255 characters and adds a warning', () => {
    // Generator: strings that exceed 255 chars, without path separators
    const longFileChar = fc.integer({ min: 0x21, max: 0x7e })
      .filter(n => n !== 0x2f /* / */ && n !== 0x5c /* \ */)
      .map(n => String.fromCharCode(n));

    const longFileName = fc.string({
      unit: longFileChar,
      minLength: 256,
      maxLength: 400,
    });

    const validPath = '/test/folder';

    fc.assert(
      fc.property(longFileName, (fileName) => {
        const searchString = `?path=${encodeURIComponent(validPath)}&file=${encodeURIComponent(fileName)}`;
        const result = parseUrlParams(searchString);

        expect(result.files).not.toContain(fileName);
        expect(result.warnings.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
