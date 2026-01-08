# GIF Looping Limitation

## Issue
GIFs rendered using `<img>` tags will loop infinitely by default - this is browser behavior and cannot be prevented with HTML/CSS when using the `<img>` tag.

## Current Solution
We've reverted to using `<img>` tags for GIFs because:
1. `<video>` tags cannot load GIF files (only video formats like MP4, WebM)
2. Attempting to load GIFs as videos causes continuous load errors

## Current Behavior
- ✅ GIFs advance after one cycle (via timeout based on parsed duration)
- ❌ GIFs will visually loop infinitely (browser behavior with `<img>` tags)
- ✅ Slideshow advances correctly after one cycle

## Future Solutions

### Option 1: Canvas-Based Rendering (Recommended)
Use `gifuct-js` (already in use) to decode GIF frames and render them on a canvas, giving full control over playback:
- Decode GIF frames using `gifuct.decompressFrames()`
- Render frames on canvas with controlled timing
- Stop after one cycle
- Pros: Full control, no looping
- Cons: More complex, requires frame-by-frame rendering

### Option 2: Server-Side Conversion
Convert GIFs to MP4 videos on the server:
- Pros: Can use `<video>` tag with `loop={false}`
- Cons: Requires server processing, larger files, conversion overhead

### Option 3: Accept Visual Looping
Keep current approach:
- Pros: Simple, works now
- Cons: GIFs loop visually (but advance correctly)

## Recommendation
For now, we accept that GIFs will loop visually but advance correctly. If preventing visual looping is critical, implement Option 1 (canvas-based rendering) using the existing `gifuct-js` library.

