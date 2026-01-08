# GIF Player Module - Built from Scratch

## Overview

A comprehensive, extensible JavaScript/TypeScript module for detecting, parsing, and playing animated GIFs. Built entirely from scratch based on the GIF89a specification without any external dependencies.

## Features

✅ **Detect if GIF is still or animated** - Accurately identifies single-frame vs multi-frame GIFs  
✅ **Understand GIF animation duration** - Calculates total duration and per-frame delays  
✅ **Control start and stop** - Full playback control with play, pause, stop, and seek  
✅ **Frame-by-frame rendering** - Renders to canvas with proper disposal methods  
✅ **Extensible architecture** - Easy to integrate with video players and other media systems  
✅ **Zero dependencies** - Pure JavaScript implementation  

## Core Components

### 1. GifParser
Parses GIF files from scratch, implementing:
- GIF89a format parsing
- LZW decompression algorithm
- Color table management
- Frame extraction with timing
- Animation loop detection (NETSCAPE 2.0 extension)

### 2. GifPlayer
Main player class providing:
- Playback control (play, pause, stop)
- Frame seeking (by index or time)
- Speed control
- Loop control
- Canvas rendering
- Event callbacks

### 3. Convenience Functions
Quick utility functions:
- `isGifAnimated()` - Fast animation detection
- `getGifDuration()` - Quick duration check
- `getGifMetadata()` - Full metadata extraction
- `createGifPlayerOnce()` - Creates a player configured to play once and stop (no looping)
- `createGifPlayerForSlideshow()` - Creates a player configured for slideshow use

## Usage Examples

### Basic Usage

```typescript
import { GifPlayer } from './utils/gifPlayer';

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const player = new GifPlayer({
  canvas,
  autoPlay: true,
  loop: true,
  onFrameChange: (frameIndex) => console.log(`Frame: ${frameIndex}`),
  onComplete: () => console.log('Done!')
});

await player.loadFromFile(file);
```

### Quick Detection

```typescript
import { isGifAnimated, getGifDuration } from './utils/gifPlayer';

const animated = await isGifAnimated(file);
const duration = await getGifDuration(file);
```

### Standalone Player - Play Once and Stop

```typescript
import { createGifPlayerOnce } from './utils/gifPlayer';

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

// Create player that plays once and stops (no looping)
const player = createGifPlayerOnce(canvas, {
  autoPlay: true,
  onComplete: () => {
    console.log('GIF finished playing - now stopped');
  }
});

await player.loadFromFile(file);
// GIF will play once automatically, then stop at the last frame
```

### Integration with Video Player

```typescript
import { createGifPlayerOnce } from './utils/gifPlayer';

class MediaPlayer {
  private gifPlayer: GifPlayer | null = null;
  private videoElement: HTMLVideoElement | null = null;

  async loadMedia(file: File) {
    if (file.type === 'image/gif') {
      // Use convenience function for one-time playback
      this.gifPlayer = createGifPlayerOnce(this.canvas, {
        autoPlay: true,
        onComplete: () => this.onMediaEnd()
      });
      await this.gifPlayer.loadFromFile(file);
    } else {
      // Handle video
      this.videoElement = document.createElement('video');
      this.videoElement.src = URL.createObjectURL(file);
      this.videoElement.onended = () => this.onMediaEnd();
      this.videoElement.play();
    }
  }

  play() {
    this.gifPlayer?.play();
    this.videoElement?.play();
  }

  private onMediaEnd() {
    console.log('Media playback completed');
  }
}
```

## API Reference

### GifPlayer Class

#### Constructor
```typescript
new GifPlayer(options?: GifPlayerOptions)
```

#### Methods
- `loadFromFile(file: File): Promise<GifMetadata>`
- `loadFromUrl(url: string): Promise<GifMetadata>`
- `loadFromArrayBuffer(buffer: ArrayBuffer): Promise<GifMetadata>`
- `play(): void` - Start/resume playback
- `pause(): void` - Pause playback
- `stop(): void` - Stop and reset to frame 0
- `seekToFrame(index: number): void` - Seek to specific frame
- `seekToTime(timeMs: number): void` - Seek to specific time
- `setSpeed(speed: number): void` - Set playback speed (0.1-10x)
- `setLoop(loop: boolean): void` - Enable/disable looping
- `getMetadata(): GifMetadata | null` - Get parsed metadata
- `isAnimated(): boolean` - Check if GIF is animated
- `getDuration(): number` - Get total duration in ms
- `getState(): GifPlayerState` - Get current state
- `getCurrentFrame(): number` - Get current frame index
- `dispose(): void` - Clean up resources

### Convenience Functions

#### `createGifPlayerOnce(canvas?, options?)`
Creates a GIF player configured to play once and stop (no looping). Perfect for standalone GIF viewing outside of slideshow context.

```typescript
const player = createGifPlayerOnce(canvas, {
  autoPlay: true,
  onComplete: () => console.log('GIF finished')
});
```

#### `createGifPlayerForSlideshow(canvas?, options?)`
Creates a GIF player configured for slideshow use (plays one complete cycle then stops).

```typescript
const player = createGifPlayerForSlideshow(canvas, {
  autoPlay: true,
  onComplete: () => advanceToNextSlide()
});
```

#### `isGifAnimated(file: File | string): Promise<boolean>`
Quickly check if a GIF is animated.

#### `getGifDuration(file: File | string): Promise<number>`
Get the total duration of a GIF in milliseconds.

#### `getGifMetadata(file: File | string): Promise<GifMetadata>`
Get full metadata for a GIF file.

### GifMetadata Interface

```typescript
interface GifMetadata {
  width: number;
  height: number;
  frameCount: number;
  isAnimated: boolean;
  totalDuration: number; // milliseconds
  loopCount: number; // 0 = infinite, >0 = number of loops
  frameDelays: number[]; // milliseconds per frame
  frames: GifFrame[];
  // ... more properties
}
```

## Integration with Slideshow

The module is designed to integrate seamlessly with the existing slideshow:

1. **Replace current gifParser.ts** - The new module provides all the same functionality plus more
2. **Use in MediaDisplay component** - Can render GIFs to canvas instead of `<img>` tags
3. **Better completion detection** - More accurate timing than timeout-based approach
4. **Frame control** - Can seek, pause, and control playback precisely

## Technical Details

### GIF Format Support
- ✅ GIF87a and GIF89a formats
- ✅ Global and local color tables
- ✅ Interlaced images
- ✅ Transparency
- ✅ Frame disposal methods
- ✅ Graphics Control Extensions (GCE)
- ✅ NETSCAPE 2.0 loop extension
- ✅ LZW compression/decompression

### Performance
- Parses GIF structure efficiently
- Decodes frames on-demand (can be optimized for pre-decoding)
- Uses canvas for efficient rendering
- Memory-efficient frame management

## File Structure

```
web/frontend/src/utils/
  ├── gifPlayer.ts          # Main module (GifParser, GifPlayer)
  └── gifPlayer.example.ts  # Usage examples
```

## Play Once vs Looping

### Play Once (No Loop)
For standalone GIF viewing or slideshow use, create a player that plays once and stops:

```typescript
import { createGifPlayerOnce } from './utils/gifPlayer';

const player = createGifPlayerOnce(canvas, {
  autoPlay: true,
  onComplete: () => {
    console.log('GIF finished - stopped at last frame');
  }
});
```

### Continuous Looping
For continuous playback, use the default constructor with `loop: true`:

```typescript
const player = new GifPlayer({
  canvas,
  autoPlay: true,
  loop: true // Will loop continuously
});
```

## Next Steps

1. ✅ **Replace existing gifParser.ts** - Done! Now uses new module
2. **Update MediaDisplay.tsx** - Optionally use canvas rendering
3. **Test with various GIFs** - Ensure compatibility with edge cases
4. **Optimize if needed** - Add frame caching for large GIFs

## Notes

- Built entirely from scratch following GIF89a specification
- No external dependencies (removed `gifuct-js`)
- Fully typed with TypeScript
- Extensible for future enhancements
- **Play once functionality** - Use `createGifPlayerOnce()` for standalone viewing

