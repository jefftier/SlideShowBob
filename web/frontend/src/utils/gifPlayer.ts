/**
 * GIF Player Module - Built from Scratch
 * 
 * A comprehensive, extensible module for detecting, parsing, and playing animated GIFs.
 * Built from scratch based on GIF89a specification without external dependencies.
 * 
 * Features:
 * - Detect if GIF is still or animated
 * - Understand GIF animation duration
 * - Control start and stop of GIF playback
 * - Frame-by-frame rendering to canvas
 * - Extensible architecture for integration with video players
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface GifFrame {
  /** Frame index (0-based) */
  index: number;
  /** Delay before this frame in milliseconds */
  delay: number;
  /** Frame disposal method (0-3) */
  disposal: number;
  /** Whether frame has transparency */
  transparent: boolean;
  /** Transparent color index (if transparent) */
  transparentIndex?: number;
  /** Frame dimensions */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Frame image data (RGBA pixels) */
  pixels?: ImageData;
}

export interface GifMetadata {
  /** Total width of GIF */
  width: number;
  /** Total height of GIF */
  height: number;
  /** Whether GIF has global color table */
  hasGlobalColorTable: boolean;
  /** Global color table (RGB values) */
  globalColorTable?: number[][];
  /** Number of colors in global color table */
  colorTableSize: number;
  /** Background color index */
  backgroundColorIndex: number;
  /** Pixel aspect ratio */
  pixelAspectRatio: number;
  /** Number of frames in GIF */
  frameCount: number;
  /** Whether GIF is animated (has more than 1 frame) */
  isAnimated: boolean;
  /** Total animation duration in milliseconds */
  totalDuration: number;
  /** Loop count (0 = infinite, >0 = number of loops) */
  loopCount: number;
  /** Frame delays in milliseconds */
  frameDelays: number[];
  /** All frame metadata */
  frames: GifFrame[];
}

export interface GifPlayerOptions {
  /** Canvas element to render to (optional) */
  canvas?: HTMLCanvasElement;
  /** Whether to auto-play on load */
  autoPlay?: boolean;
  /** Playback speed multiplier (1.0 = normal speed) */
  speed?: number;
  /** Whether to loop animation */
  loop?: boolean;
  /** Callback when frame changes */
  onFrameChange?: (frameIndex: number) => void;
  /** Callback when animation completes */
  onComplete?: () => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export type GifPlayerState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'stopped';

// ============================================================================
// GIF Parser - Built from Scratch
// ============================================================================

/**
 * Reads a byte from the data array at the current position
 */
class ByteReader {
  private data: Uint8Array;
  private position: number;
  private bitBuffer: number = 0;
  private bitCount: number = 0;

  constructor(data: Uint8Array) {
    this.data = data;
    this.position = 0;
  }

  readByte(): number {
    if (this.position >= this.data.length) {
      throw new Error('Unexpected end of GIF data');
    }
    return this.data[this.position++];
  }

  readUint16(): number {
    const low = this.readByte();
    const high = this.readByte();
    return low | (high << 8);
  }

  readBytes(count: number): Uint8Array {
    const bytes = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      bytes[i] = this.readByte();
    }
    return bytes;
  }

  readSubBlock(): Uint8Array {
    const size = this.readByte();
    if (size === 0) {
      return new Uint8Array(0);
    }
    return this.readBytes(size);
  }

  readDataSubBlocks(): Uint8Array {
    const chunks: Uint8Array[] = [];
    let size = this.readByte();
    while (size > 0) {
      chunks.push(this.readBytes(size));
      size = this.readByte();
    }
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  getPosition(): number {
    return this.position;
  }

  setPosition(pos: number): void {
    this.position = pos;
  }

  skip(count: number): void {
    this.position += count;
  }

  getLength(): number {
    return this.data.length;
  }

  hasMore(): boolean {
    return this.position < this.data.length;
  }
}

/**
 * LZW Decompression - Core GIF decoding algorithm
 */
class LZWDecoder {
  private data: Uint8Array;
  private position: number;
  private bitBuffer: number = 0;
  private bitCount: number = 0;

  constructor(data: Uint8Array) {
    this.data = data;
    this.position = 0;
  }

  private readBits(count: number): number {
    while (this.bitCount < count) {
      if (this.position >= this.data.length) {
        throw new Error('Unexpected end of LZW data');
      }
      this.bitBuffer |= this.data[this.position++] << this.bitCount;
      this.bitCount += 8;
    }
    const result = this.bitBuffer & ((1 << count) - 1);
    this.bitBuffer >>= count;
    this.bitCount -= count;
    return result;
  }

  decode(minCodeSize: number, pixelCount: number): Uint8Array {
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let codeMask = (1 << codeSize) - 1;

    const output: number[] = [];
    const dictionary: number[][] = [];

    // Initialize dictionary
    for (let i = 0; i < clearCode; i++) {
      dictionary[i] = [i];
    }
    dictionary[clearCode] = [];
    dictionary[endCode] = [];

    let oldCode = -1;
    let nextCode = endCode + 1;

    while (output.length < pixelCount) {
      const code = this.readBits(codeSize);
      
      if (code === clearCode) {
        // Reset dictionary
        codeSize = minCodeSize + 1;
        codeMask = (1 << codeSize) - 1;
        nextCode = endCode + 1;
        oldCode = -1;
        continue;
      }

      if (code === endCode) {
        break;
      }

      let sequence: number[];
      if (code < nextCode) {
        sequence = dictionary[code].slice();
      } else {
        if (oldCode >= 0 && oldCode < dictionary.length) {
          sequence = dictionary[oldCode].slice();
          if (sequence.length > 0) {
            sequence.push(sequence[0]);
          }
        } else {
          sequence = [];
        }
      }

      // Output sequence
      for (const pixel of sequence) {
        output.push(pixel);
        if (output.length >= pixelCount) break;
      }

      // Add to dictionary
      if (oldCode >= 0 && nextCode < 4096) {
        const newSequence = dictionary[oldCode].slice();
        if (sequence.length > 0) {
          newSequence.push(sequence[0]);
        }
        dictionary[nextCode] = newSequence;

        nextCode++;
        if (nextCode >= (1 << codeSize) && codeSize < 12) {
          codeSize++;
          codeMask = (1 << codeSize) - 1;
        }
      }

      oldCode = code;
    }

    return new Uint8Array(output);
  }
}

/**
 * Parses a GIF file from scratch
 */
export class GifParser {
  private reader: ByteReader;
  private metadata: Partial<GifMetadata> = {};

  constructor(data: Uint8Array) {
    this.reader = new ByteReader(data);
  }

  /**
   * Parse the entire GIF file
   */
  parse(): GifMetadata {
    // Read GIF header
    const signature = String.fromCharCode(
      this.reader.readByte(),
      this.reader.readByte(),
      this.reader.readByte()
    );
    const version = String.fromCharCode(
      this.reader.readByte(),
      this.reader.readByte(),
      this.reader.readByte()
    );

    if (signature !== 'GIF' || (version !== '87a' && version !== '89a')) {
      throw new Error(`Invalid GIF format: ${signature}${version}`);
    }

    // Read Logical Screen Descriptor
    const width = this.reader.readUint16();
    const height = this.reader.readUint16();
    
    const packed = this.reader.readByte();
    const hasGlobalColorTable = (packed & 0x80) !== 0;
    const colorResolution = ((packed & 0x70) >> 4) + 1;
    const sortFlag = (packed & 0x08) !== 0;
    const globalColorTableSize = 2 << (packed & 0x07);
    
    const backgroundColorIndex = this.reader.readByte();
    const pixelAspectRatio = this.reader.readByte();

    this.metadata = {
      width,
      height,
      hasGlobalColorTable,
      colorTableSize: globalColorTableSize,
      backgroundColorIndex,
      pixelAspectRatio,
      frameCount: 0,
      isAnimated: false,
      totalDuration: 0,
      loopCount: 0,
      frameDelays: [],
      frames: []
    };

    // Read Global Color Table
    let globalColorTable: number[][] | undefined;
    if (hasGlobalColorTable) {
      globalColorTable = [];
      for (let i = 0; i < globalColorTableSize; i++) {
        const r = this.reader.readByte();
        const g = this.reader.readByte();
        const b = this.reader.readByte();
        globalColorTable.push([r, g, b]);
      }
      this.metadata.globalColorTable = globalColorTable;
    }

    // Parse blocks
    let currentColorTable = globalColorTable;
    let frameIndex = 0;
    let totalDuration = 0;
    const frameDelays: number[] = [];

    while (this.reader.hasMore()) {
      const blockType = this.reader.readByte();

      if (blockType === 0x21) {
        // Extension block
        const extensionType = this.reader.readByte();
        
        if (extensionType === 0xF9) {
          // Graphics Control Extension (GCE)
          const blockSize = this.reader.readByte();
          if (blockSize !== 4) {
            this.reader.skip(blockSize);
            this.reader.readByte(); // Terminator
            continue;
          }

          const packed = this.reader.readByte();
          const disposal = (packed >> 2) & 0x07;
          const transparent = (packed & 0x01) !== 0;
          
          const delay = this.reader.readUint16();
          const transparentIndex = this.reader.readByte();
          this.reader.readByte(); // Terminator

          // Store GCE data for next image
          (this.reader as any).pendingGCE = {
            disposal,
            transparent,
            delay: delay * 10, // Convert to milliseconds
            transparentIndex: transparent ? transparentIndex : undefined
          };
        } else if (extensionType === 0xFF) {
          // Application Extension (NETSCAPE 2.0 for loops)
          const blockSize = this.reader.readByte();
          const appData = this.reader.readBytes(blockSize);
          const appIdentifier = String.fromCharCode(...Array.from(appData.slice(0, 11)));
          
          if (appIdentifier === 'NETSCAPE2.0') {
            const subBlock = this.reader.readSubBlock();
            if (subBlock.length >= 3 && subBlock[0] === 0x01) {
              const loopCount = subBlock[1] | (subBlock[2] << 8);
              this.metadata.loopCount = loopCount;
            }
            this.reader.readByte(); // Terminator
          } else {
            // Skip unknown application extension
            this.reader.readDataSubBlocks();
          }
        } else {
          // Skip other extension types
          this.reader.readDataSubBlocks();
        }
      } else if (blockType === 0x2C) {
        // Image Descriptor
        const left = this.reader.readUint16();
        const top = this.reader.readUint16();
        const width = this.reader.readUint16();
        const height = this.reader.readUint16();
        
        const packed = this.reader.readByte();
        const hasLocalColorTable = (packed & 0x80) !== 0;
        const interlace = (packed & 0x40) !== 0;
        const sortFlag = (packed & 0x20) !== 0;
        const localColorTableSize = 2 << (packed & 0x07);

        // Use local color table if present, otherwise global
        if (hasLocalColorTable) {
          currentColorTable = [];
          for (let i = 0; i < localColorTableSize; i++) {
            const r = this.reader.readByte();
            const g = this.reader.readByte();
            const b = this.reader.readByte();
            currentColorTable.push([r, g, b]);
          }
        }

        const pendingGCE = (this.reader as any).pendingGCE || {
          disposal: 0,
          transparent: false,
          delay: 100, // Default 100ms
          transparentIndex: undefined
        };
        (this.reader as any).pendingGCE = null;

        const minCodeSize = this.reader.readByte();
        const imageData = this.reader.readDataSubBlocks();

        // Decode LZW compressed image data
        const decoder = new LZWDecoder(imageData);
        const pixels = decoder.decode(minCodeSize, width * height);

        // Handle interlace if needed
        let deinterlacedPixels = pixels;
        if (interlace) {
          deinterlacedPixels = this.deinterlace(pixels, width, height);
        }

        const delay = pendingGCE.delay;
        frameDelays.push(delay);
        totalDuration += delay;

        const frame: GifFrame = {
          index: frameIndex++,
          delay,
          disposal: pendingGCE.disposal,
          transparent: pendingGCE.transparent,
          transparentIndex: pendingGCE.transparentIndex,
          left,
          top,
          width,
          height,
          pixels: undefined // Will be set when rendering
        };

        // Store pixel data and color table for rendering
        (frame as any).pixelData = deinterlacedPixels;
        (frame as any).colorTable = currentColorTable || globalColorTable || [];

        this.metadata.frames!.push(frame);
      } else if (blockType === 0x3B) {
        // Trailer - end of GIF
        break;
      } else {
        // Unknown block type, skip
        break;
      }
    }

    this.metadata.frameCount = frameIndex;
    this.metadata.isAnimated = frameIndex > 1;
    this.metadata.totalDuration = totalDuration;
    this.metadata.frameDelays = frameDelays;

    return this.metadata as GifMetadata;
  }

  /**
   * Deinterlace an interlaced image
   */
  private deinterlace(pixels: Uint8Array, width: number, height: number): Uint8Array {
    const result = new Uint8Array(width * height);
    const passes = [
      { start: 0, step: 8 },
      { start: 4, step: 8 },
      { start: 2, step: 4 },
      { start: 1, step: 2 }
    ];

    let sourceIndex = 0;
    for (const pass of passes) {
      for (let y = pass.start; y < height; y += pass.step) {
        const destIndex = y * width;
        for (let x = 0; x < width; x++) {
          result[destIndex + x] = pixels[sourceIndex++];
        }
      }
    }

    return result;
  }
}

// ============================================================================
// GIF Player - Main Class
// ============================================================================

/**
 * GIF Player - Extensible module for playing animated GIFs
 */
export class GifPlayer {
  private metadata: GifMetadata | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private currentFrame: number = 0;
  private frameTimeout: number | null = null;
  private state: GifPlayerState = 'idle';
  private options: Required<GifPlayerOptions>;
  private animationFrameId: number | null = null;
  private startTime: number = 0;
  private pausedTime: number = 0;
  private accumulatedPauseTime: number = 0;

  constructor(options: GifPlayerOptions = {}) {
    this.options = {
      canvas: options.canvas || null as any,
      autoPlay: options.autoPlay ?? false,
      speed: options.speed ?? 1.0,
      loop: options.loop ?? true,
      onFrameChange: options.onFrameChange || (() => {}),
      onComplete: options.onComplete || (() => {}),
      onError: options.onError || ((err) => console.error('GIF Player Error:', err))
    };

    if (this.options.canvas) {
      this.setCanvas(this.options.canvas);
    }
  }

  /**
   * Set the canvas element for rendering
   */
  setCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!this.ctx) {
      throw new Error('Failed to get 2D rendering context from canvas');
    }
  }

  /**
   * Load a GIF from a File object
   */
  async loadFromFile(file: File): Promise<GifMetadata> {
    return this.loadFromArrayBuffer(await file.arrayBuffer());
  }

  /**
   * Load a GIF from a URL
   */
  async loadFromUrl(url: string): Promise<GifMetadata> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch GIF: ${response.statusText}`);
    }
    return this.loadFromArrayBuffer(await response.arrayBuffer());
  }

  /**
   * Load a GIF from an ArrayBuffer
   */
  async loadFromArrayBuffer(arrayBuffer: ArrayBuffer): Promise<GifMetadata> {
    this.setState('loading');
    
    try {
      const data = new Uint8Array(arrayBuffer);
      const parser = new GifParser(data);
      this.metadata = parser.parse();

      if (this.canvas) {
        this.canvas.width = this.metadata.width;
        this.canvas.height = this.metadata.height;
        this.renderFrame(0);
      }

      this.setState('ready');

      if (this.options.autoPlay && this.metadata.isAnimated) {
        this.play();
      }

      return this.metadata;
    } catch (error) {
      this.setState('idle');
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.onError(err);
      throw err;
    }
  }

  /**
   * Get current metadata
   */
  getMetadata(): GifMetadata | null {
    return this.metadata;
  }

  /**
   * Check if GIF is animated
   */
  isAnimated(): boolean {
    return this.metadata?.isAnimated ?? false;
  }

  /**
   * Get total duration in milliseconds
   */
  getDuration(): number {
    return this.metadata?.totalDuration ?? 0;
  }

  /**
   * Get current state
   */
  getState(): GifPlayerState {
    return this.state;
  }

  /**
   * Get current frame index
   */
  getCurrentFrame(): number {
    return this.currentFrame;
  }

  /**
   * Start playing the GIF
   */
  play(): void {
    if (!this.metadata || !this.metadata.isAnimated) {
      return;
    }

    if (this.state === 'playing') {
      return;
    }

    if (this.state === 'paused') {
      // Resume from pause
      this.accumulatedPauseTime += performance.now() - this.pausedTime;
    } else {
      // Start from beginning or current frame
      this.accumulatedPauseTime = 0;
      this.startTime = performance.now();
    }

    this.setState('playing');
    this.scheduleNextFrame();
  }

  /**
   * Stop playing the GIF
   */
  stop(): void {
    this.cancelFrame();
    this.currentFrame = 0;
    this.accumulatedPauseTime = 0;
    this.setState('stopped');
    
    if (this.canvas && this.metadata) {
      this.renderFrame(0);
    }
  }

  /**
   * Pause playing the GIF
   */
  pause(): void {
    if (this.state !== 'playing') {
      return;
    }

    this.cancelFrame();
    this.pausedTime = performance.now();
    this.setState('paused');
  }

  /**
   * Seek to a specific frame
   */
  seekToFrame(frameIndex: number): void {
    if (!this.metadata) {
      return;
    }

    const clampedFrame = Math.max(0, Math.min(frameIndex, this.metadata.frameCount - 1));
    this.currentFrame = clampedFrame;
    
    if (this.canvas) {
      this.renderFrame(clampedFrame);
    }

    this.options.onFrameChange(clampedFrame);
  }

  /**
   * Seek to a specific time (milliseconds)
   */
  seekToTime(timeMs: number): void {
    if (!this.metadata) {
      return;
    }

    let accumulated = 0;
    for (let i = 0; i < this.metadata.frameCount; i++) {
      const frameDelay = this.metadata.frameDelays[i];
      if (timeMs < accumulated + frameDelay) {
        this.seekToFrame(i);
        return;
      }
      accumulated += frameDelay;
    }

    // Seek to last frame if time exceeds duration
    this.seekToFrame(this.metadata.frameCount - 1);
  }

  /**
   * Set playback speed
   */
  setSpeed(speed: number): void {
    this.options.speed = Math.max(0.1, Math.min(10, speed));
    if (this.state === 'playing') {
      this.cancelFrame();
      this.scheduleNextFrame();
    }
  }

  /**
   * Set loop mode
   */
  setLoop(loop: boolean): void {
    this.options.loop = loop;
  }

  /**
   * Dispose of the player and clean up resources
   */
  dispose(): void {
    this.stop();
    this.metadata = null;
    this.canvas = null;
    this.ctx = null;
    this.setState('idle');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private setState(newState: GifPlayerState): void {
    this.state = newState;
  }

  private scheduleNextFrame(): void {
    if (!this.metadata || this.state !== 'playing') {
      return;
    }

    const frame = this.metadata.frames[this.currentFrame];
    if (!frame) {
      return;
    }

    const delay = frame.delay / this.options.speed;
    
    this.frameTimeout = window.setTimeout(() => {
      this.advanceFrame();
    }, delay);
  }

  private advanceFrame(): void {
    if (!this.metadata || this.state !== 'playing') {
      return;
    }

    // Render current frame
    if (this.canvas) {
      this.renderFrame(this.currentFrame);
    }

    this.options.onFrameChange(this.currentFrame);

    // Move to next frame
    this.currentFrame++;

    // Check if animation is complete
    if (this.currentFrame >= this.metadata.frameCount) {
      if (this.options.loop && this.metadata.loopCount !== 1) {
        // Loop animation
        this.currentFrame = 0;
        this.accumulatedPauseTime = 0;
        this.startTime = performance.now();
        this.scheduleNextFrame();
      } else {
        // Animation complete
        this.setState('stopped');
        this.options.onComplete();
      }
      return;
    }

    // Schedule next frame
    this.scheduleNextFrame();
  }

  private cancelFrame(): void {
    if (this.frameTimeout !== null) {
      clearTimeout(this.frameTimeout);
      this.frameTimeout = null;
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private renderFrame(frameIndex: number): void {
    if (!this.metadata || !this.ctx || !this.canvas) {
      return;
    }

    const frame = this.metadata.frames[frameIndex];
    if (!frame) {
      return;
    }

    const pixelData = (frame as any).pixelData as Uint8Array;
    const colorTable = (frame as any).colorTable as number[][];

    if (!pixelData || !colorTable) {
      return;
    }

    // Handle frame disposal
    if (frameIndex > 0) {
      const prevFrame = this.metadata.frames[frameIndex - 1];
      if (prevFrame) {
        switch (prevFrame.disposal) {
          case 2: // Restore to background
            this.ctx.clearRect(
              prevFrame.left,
              prevFrame.top,
              prevFrame.width,
              prevFrame.height
            );
            break;
          case 3: // Restore to previous
            // This would require storing previous frame state
            // For simplicity, we'll just clear
            this.ctx.clearRect(
              prevFrame.left,
              prevFrame.top,
              prevFrame.width,
              prevFrame.height
            );
            break;
        }
      }
    } else {
      // First frame - clear canvas
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Create ImageData for this frame
    const imageData = this.ctx.createImageData(frame.width, frame.height);
    const bgColor = colorTable[this.metadata.backgroundColorIndex] || [0, 0, 0];

    for (let i = 0; i < pixelData.length; i++) {
      const colorIndex = pixelData[i];
      const color = colorTable[colorIndex] || bgColor;
      const pixelOffset = i * 4;

      // Check transparency
      if (frame.transparent && frame.transparentIndex !== undefined && colorIndex === frame.transparentIndex) {
        imageData.data[pixelOffset] = 0;     // R
        imageData.data[pixelOffset + 1] = 0; // G
        imageData.data[pixelOffset + 2] = 0; // B
        imageData.data[pixelOffset + 3] = 0; // A (transparent)
      } else {
        imageData.data[pixelOffset] = color[0];     // R
        imageData.data[pixelOffset + 1] = color[1]; // G
        imageData.data[pixelOffset + 2] = color[2]; // B
        imageData.data[pixelOffset + 3] = 255;      // A (opaque)
      }
    }

    // Draw frame to canvas
    this.ctx.putImageData(imageData, frame.left, frame.top);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick function to detect if a GIF is animated
 */
export async function isGifAnimated(file: File | string): Promise<boolean> {
  try {
    const arrayBuffer = typeof file === 'string'
      ? await (await fetch(file)).arrayBuffer()
      : await file.arrayBuffer();
    
    const parser = new GifParser(new Uint8Array(arrayBuffer));
    const metadata = parser.parse();
    return metadata.isAnimated;
  } catch {
    return false;
  }
}

/**
 * Quick function to get GIF duration
 */
export async function getGifDuration(file: File | string): Promise<number> {
  try {
    const arrayBuffer = typeof file === 'string'
      ? await (await fetch(file)).arrayBuffer()
      : await file.arrayBuffer();
    
    const parser = new GifParser(new Uint8Array(arrayBuffer));
    const metadata = parser.parse();
    return metadata.totalDuration;
  } catch {
    return 0;
  }
}

/**
 * Quick function to get GIF metadata
 */
export async function getGifMetadata(file: File | string): Promise<GifMetadata> {
  const arrayBuffer = typeof file === 'string'
    ? await (await fetch(file)).arrayBuffer()
    : await file.arrayBuffer();
  
  const parser = new GifParser(new Uint8Array(arrayBuffer));
  return parser.parse();
}

/**
 * Creates a GIF player configured to play once and stop (no looping).
 * Perfect for standalone GIF viewing outside of slideshow context.
 * 
 * @param canvas - Canvas element to render to (optional, can be set later)
 * @param options - Additional player options
 * @returns GifPlayer instance configured for one-time playback
 * 
 * @example
 * ```typescript
 * const canvas = document.createElement('canvas');
 * const player = createGifPlayerOnce(canvas, {
 *   autoPlay: true,
 *   onComplete: () => console.log('GIF finished playing')
 * });
 * await player.loadFromFile(gifFile);
 * ```
 */
export function createGifPlayerOnce(
  canvas?: HTMLCanvasElement,
  options?: Omit<GifPlayerOptions, 'loop'>
): GifPlayer {
  return new GifPlayer({
    canvas: canvas || undefined,
    loop: false, // Play once, then stop
    ...options
  });
}

/**
 * Creates a GIF player configured for slideshow use (plays once per cycle).
 * This is the default behavior for slideshows - plays one complete cycle then stops.
 * 
 * @param canvas - Canvas element to render to (optional, can be set later)
 * @param options - Additional player options
 * @returns GifPlayer instance configured for slideshow playback
 */
export function createGifPlayerForSlideshow(
  canvas?: HTMLCanvasElement,
  options?: Omit<GifPlayerOptions, 'loop'>
): GifPlayer {
  return new GifPlayer({
    canvas: canvas || undefined,
    loop: false, // Play once per slideshow cycle
    ...options
  });
}
