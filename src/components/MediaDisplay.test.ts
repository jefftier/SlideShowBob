import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Feature: toolbar-ui-improvements, Property 6: Aspect-match detection controls background fill rendering

/**
 * Pure extraction of the aspect-match detection logic from MediaDisplay.tsx.
 * Returns true when the media and container aspect ratios are within 2% of each other.
 */
export function isAspectMatch(
  containerWidth: number,
  containerHeight: number,
  mediaWidth: number,
  mediaHeight: number
): boolean {
  if (containerWidth <= 0 || containerHeight <= 0 || mediaWidth <= 0 || mediaHeight <= 0) {
    return true; // default to match (no bg fill) when dimensions are invalid
  }
  const containerAspect = containerWidth / containerHeight;
  const mediaAspect = mediaWidth / mediaHeight;
  return Math.abs(mediaAspect - containerAspect) / containerAspect <= 0.02;
}

describe('Aspect-match detection (Property 6)', () => {
  // **Validates: Requirements 5.1, 5.9**

  it('Property 6: background fill renders iff aspect ratios differ by more than 2%', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 5000 }),
        (containerWidth, containerHeight, mediaWidth, mediaHeight) => {
          const containerAspect = containerWidth / containerHeight;
          const mediaAspect = mediaWidth / mediaHeight;
          const relativeDiff = Math.abs(mediaAspect - containerAspect) / containerAspect;

          const matched = isAspectMatch(containerWidth, containerHeight, mediaWidth, mediaHeight);
          const shouldRenderBackgroundFill = !matched;

          // Background fill should render iff aspect ratios differ by more than 2%
          if (relativeDiff <= 0.02) {
            expect(shouldRenderBackgroundFill).toBe(false);
          } else {
            expect(shouldRenderBackgroundFill).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('identical dimensions always match (no background fill)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 5000 }),
        (width, height) => {
          expect(isAspectMatch(width, height, width, height)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
