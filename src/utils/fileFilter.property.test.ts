import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { filterMediaByFileList } from './fileFilter';
import { MediaItem, MediaType } from '../types/media';

/**
 * Property-based tests for File Filter module.
 *
 * Feature: url-path-parameters
 */

// File name generator: valid file names (no separators, ≤255 chars)
const validFileName = fc.string({
  unit: fc.integer({ min: 0x20, max: 0x7e })
    .filter(n => n !== 0x2f /* / */ && n !== 0x5c /* \ */)
    .map(n => String.fromCharCode(n)),
  minLength: 1,
  maxLength: 50,
});

// Media item generator (minimal shape for testing)
const mediaItem = (fileName: string, subfolder?: string): MediaItem => ({
  fileName,
  filePath: `/some/path/${subfolder ?? 'root'}/${fileName}`,
  type: MediaType.Image,
  folderName: 'testFolder',
  relativePath: subfolder ? `${subfolder}/${fileName}` : fileName,
});

// Generate a list of media items from a list of file names (possibly with duplicates for subfolders)
const mediaItemArb = validFileName.chain(name =>
  fc.constantFrom('folderA', 'folderB', 'folderC').map(folder => mediaItem(name, folder))
);

describe('Feature: url-path-parameters, Property 3: File filter correctness', () => {
  /**
   * Property 3: File filter correctness
   *
   * Output contains only items whose fileName matches a filter entry (case-insensitive),
   * no extras.
   *
   * **Validates: Requirements 4.1, 4.5**
   */
  it('output contains only items whose fileName matches a filter entry (case-insensitive)', () => {
    fc.assert(
      fc.property(
        fc.array(mediaItemArb, { minLength: 0, maxLength: 30 }),
        fc.array(validFileName, { minLength: 0, maxLength: 20 }),
        (items, fileList) => {
          const result = filterMediaByFileList(items, fileList);

          // Every matched item must have its fileName in the filter list (case-insensitive)
          const filterSet = new Set(fileList.map(f => f.toLowerCase()));
          for (const item of result.matched) {
            expect(filterSet.has(item.fileName.toLowerCase())).toBe(true);
          }

          // No items outside the filter list should appear
          const matchedFileNames = result.matched.map(m => m.fileName.toLowerCase());
          for (const name of matchedFileNames) {
            expect(filterSet.has(name)).toBe(true);
          }

          // All items in the input that match the filter should be in the output
          const matchedSet = new Set(result.matched.map(m => m.filePath));
          for (const item of items) {
            if (filterSet.has(item.fileName.toLowerCase())) {
              expect(matchedSet.has(item.filePath)).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: url-path-parameters, Property 4: File filter ordering', () => {
  /**
   * Property 4: File filter ordering
   *
   * Matched output is ordered by first-occurrence position of file name in filter list.
   *
   * **Validates: Requirements 4.2, 4.7**
   */
  it('matched output follows first-occurrence order of file names in the filter list', () => {
    fc.assert(
      fc.property(
        fc.array(mediaItemArb, { minLength: 0, maxLength: 30 }),
        fc.array(validFileName, { minLength: 1, maxLength: 20 }),
        (items, fileList) => {
          const result = filterMediaByFileList(items, fileList);

          if (result.matched.length <= 1) return; // trivially ordered

          // Build a map from lowercase file name -> first-occurrence index in fileList
          const firstOccurrence = new Map<string, number>();
          for (let i = 0; i < fileList.length; i++) {
            const key = fileList[i].toLowerCase();
            if (!firstOccurrence.has(key)) {
              firstOccurrence.set(key, i);
            }
          }

          // Verify ordering: each matched item's position index should be non-decreasing
          let lastIndex = -1;
          for (const item of result.matched) {
            const idx = firstOccurrence.get(item.fileName.toLowerCase());
            if (idx === undefined) {
              // Should not happen given Property 3, but guard
              expect(idx).toBeDefined();
              continue;
            }
            expect(idx).toBeGreaterThanOrEqual(lastIndex);
            lastIndex = idx;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: url-path-parameters, Property 5: File filter includes all subfolder matches', () => {
  /**
   * Property 5: File filter includes all subfolder matches
   *
   * When multiple items share the same fileName, all are included.
   *
   * **Validates: Requirements 4.6**
   */
  it('includes all items that share the same fileName across different subfolders', () => {
    // Use a generator that ensures at least one file name appears in multiple subfolders
    const subfolders = ['photos', 'backup', 'archive', 'recent', 'misc'];

    fc.assert(
      fc.property(
        validFileName,
        fc.subarray(subfolders, { minLength: 2, maxLength: 5 }),
        fc.array(mediaItemArb, { minLength: 0, maxLength: 10 }),
        (sharedName, folders, extraItems) => {
          // Create multiple items with the same fileName in different subfolders
          const sharedItems = folders.map(folder => mediaItem(sharedName, folder));

          // Combine with extra random items
          const allItems = [...sharedItems, ...extraItems];

          // Filter by the shared file name
          const result = filterMediaByFileList(allItems, [sharedName]);

          // All items with that fileName (case-insensitive) must be in the result
          const expectedCount = allItems.filter(
            item => item.fileName.toLowerCase() === sharedName.toLowerCase()
          ).length;

          const actualCount = result.matched.filter(
            item => item.fileName.toLowerCase() === sharedName.toLowerCase()
          ).length;

          expect(actualCount).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});
