/**
 * GIF playback for SlideShowBob.
 *
 * Layered so each part can be tested on its own:
 *  - GifParser          GIF87a/89a container parse. No pixel decoding (fast).
 *  - decodeLzw          LZW decode of one frame into palette indices.
 *  - GifCompositor      Browser-exact RGBA compositing: disposal 0-3, transparency,
 *                       per-frame palette scoping, interlacing, clipping to the screen.
 *  - GifTimeline        Absolute frame timeline with browser delay clamping.
 *  - Frame sources      WebCodecs ImageDecoder (preferred, decodes off the main thread)
 *                       or the JS decoder above (Safari fallback), both producing
 *                       ready-to-draw frames ahead of the playhead.
 *  - GifPlayer          rAF-driven playback onto a devicePixelRatio-aware canvas.
 */

// ============================================================================
// Types
// ============================================================================

export interface GifFrame {
  index: number;
  /** Effective display time in ms, after browser-style clamping. */
  delay: number;
  /** Disposal method: 0 unspecified, 1 keep, 2 restore to background, 3 restore to previous. */
  disposal: number;
  /** Transparent palette index, or -1 when the frame has no transparency. */
  transparentIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
  interlaced: boolean;
  /** RGB triples. The frame's local table if present, otherwise the global table. */
  palette: Uint8Array | null;
  minCodeSize: number;
  /** Concatenated LZW data sub-blocks (decoded lazily by the compositor). */
  lzwData: Uint8Array;
}

export interface GifMetadata {
  width: number;
  height: number;
  globalPalette: Uint8Array | null;
  frameCount: number;
  isAnimated: boolean;
  /** Sum of effective (clamped) frame delays, in ms. */
  totalDuration: number;
  /** NETSCAPE2.0 loop count (0 = infinite). */
  loopCount: number;
  /** Effective (clamped) delay of each frame, in ms. */
  frameDelays: number[];
  frames: GifFrame[];
}

// ============================================================================
// Timing
// ============================================================================

/**
 * Browser delay clamping. Chromium, WebKit and Gecko all play a frame delay of
 * 10 ms or less (0 or 1 centisecond) as 100 ms.
 */
export function clampGifDelay(ms: number): number {
  return ms <= 10 ? 100 : ms;
}

/** Absolute timeline over a sequence of frame delays. */
export class GifTimeline {
  /** Start time (ms) of each frame. */
  readonly starts: Float64Array;
  /** Total duration (ms) of one cycle. */
  readonly duration: number;

  constructor(delays: readonly number[]) {
    this.starts = new Float64Array(delays.length);
    let t = 0;
    for (let i = 0; i < delays.length; i++) {
      this.starts[i] = t;
      t += delays[i];
    }
    this.duration = t;
  }

  /** Index of the frame visible at `ms` into the cycle (clamped to the last frame). */
  frameAt(ms: number): number {
    const starts = this.starts;
    if (starts.length === 0 || ms <= 0) return 0;
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= ms) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}

// ============================================================================
// Parser
// ============================================================================

class GifTruncatedError extends Error {
  constructor() {
    super('Unexpected end of GIF data');
  }
}

/** Parses the GIF container. Pixel data stays LZW-compressed until composited. */
export class GifParser {
  private pos = 0;

  constructor(private readonly data: Uint8Array) {}

  private u8(): number {
    if (this.pos >= this.data.length) throw new GifTruncatedError();
    return this.data[this.pos++];
  }

  private u16(): number {
    const lo = this.u8();
    return lo | (this.u8() << 8);
  }

  private bytes(n: number): Uint8Array {
    if (this.pos + n > this.data.length) throw new GifTruncatedError();
    const out = this.data.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  private subBlocks(): Uint8Array {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const n = this.u8();
      if (n === 0) break;
      chunks.push(this.bytes(n));
      total += n;
    }
    if (chunks.length === 1) return chunks[0];
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }

  private skipSubBlocks(): void {
    for (;;) {
      const n = this.u8();
      if (n === 0) return;
      this.bytes(n);
    }
  }

  parse(): GifMetadata {
    const signature = String.fromCharCode(...this.bytes(6));
    if (signature !== 'GIF87a' && signature !== 'GIF89a') {
      throw new Error(`Invalid GIF format: ${signature}`);
    }

    const width = this.u16();
    const height = this.u16();
    const packed = this.u8();
    this.u8(); // background color index: ignored by browsers (disposed areas are transparent)
    this.u8(); // pixel aspect ratio: ignored by browsers
    const globalPalette = packed & 0x80 ? this.bytes(3 * (2 << (packed & 7))) : null;

    const frames: GifFrame[] = [];
    let loopCount = 0;
    let gce: { disposal: number; delay: number; transparentIndex: number } | null = null;

    try {
      blocks: while (this.pos < this.data.length) {
        const block = this.u8();
        switch (block) {
          case 0x21: {
            const label = this.u8();
            if (label === 0xf9) {
              // Graphic Control Extension (applies to the next image only)
              const sub = this.subBlocks();
              if (sub.length >= 4) {
                let disposal = (sub[0] >> 2) & 7;
                // Chromium treats method 4 as "restore to previous"; other values as unspecified.
                if (disposal === 4) disposal = 3;
                else if (disposal > 4) disposal = 0;
                gce = {
                  disposal,
                  delay: clampGifDelay((sub[1] | (sub[2] << 8)) * 10),
                  transparentIndex: sub[0] & 1 ? sub[3] : -1,
                };
              }
            } else if (label === 0xff) {
              const idLen = this.u8();
              const id = String.fromCharCode(...this.bytes(idLen));
              const sub = this.subBlocks();
              if ((id === 'NETSCAPE2.0' || id === 'ANIMEXTS1.0') && sub.length >= 3 && sub[0] === 1) {
                loopCount = sub[1] | (sub[2] << 8);
              }
            } else {
              this.skipSubBlocks();
            }
            break;
          }
          case 0x2c: {
            const left = this.u16();
            const top = this.u16();
            const w = this.u16();
            const h = this.u16();
            const p = this.u8();
            // A local color table applies only to this image; later frames go back to the global one.
            const palette = p & 0x80 ? this.bytes(3 * (2 << (p & 7))) : globalPalette;
            const minCodeSize = this.u8();
            const lzwData = this.subBlocks();
            const g = gce ?? { disposal: 0, delay: clampGifDelay(0), transparentIndex: -1 };
            gce = null;
            frames.push({
              index: frames.length,
              delay: g.delay,
              disposal: g.disposal,
              transparentIndex: g.transparentIndex,
              left,
              top,
              width: w,
              height: h,
              interlaced: (p & 0x40) !== 0,
              palette,
              minCodeSize,
              lzwData,
            });
            break;
          }
          default:
            // 0x3B trailer, or an unknown block: stop like browsers do.
            break blocks;
        }
      }
    } catch (e) {
      // Truncated files: keep whatever complete frames were read (browsers do the same).
      if (!(e instanceof GifTruncatedError) || frames.length === 0) throw e;
    }

    const frameDelays = frames.map(f => f.delay);
    return {
      width,
      height,
      globalPalette,
      frameCount: frames.length,
      isAnimated: frames.length > 1,
      totalDuration: frameDelays.reduce((a, b) => a + b, 0),
      loopCount,
      frameDelays,
      frames,
    };
  }
}

// ============================================================================
// LZW
// ============================================================================

const LZW_MAX_CODES = 4096;
// Reused across calls: decoding is synchronous and single-threaded.
const lzwPrefix = new Int16Array(LZW_MAX_CODES);
const lzwSuffix = new Uint8Array(LZW_MAX_CODES);
const lzwStack = new Uint8Array(LZW_MAX_CODES + 1);

/**
 * Decodes GIF LZW data into palette indices.
 * Returns the number of pixels written (less than `pixelCount` for truncated data).
 */
export function decodeLzw(data: Uint8Array, minCodeSize: number, out: Uint8Array, pixelCount: number): number {
  if (minCodeSize < 1 || minCodeSize > 11) return 0;
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let codeMask = (1 << codeSize) - 1;
  let next = eoi + 1;
  let old = -1;
  let first = 0;
  for (let i = 0; i < clear; i++) {
    lzwPrefix[i] = -1;
    lzwSuffix[i] = i;
  }

  let pos = 0;
  let bits = 0;
  let buf = 0;
  let outPos = 0;

  while (outPos < pixelCount) {
    while (bits < codeSize) {
      if (pos >= data.length) return outPos;
      buf |= data[pos++] << bits;
      bits += 8;
    }
    const code = buf & codeMask;
    buf >>>= codeSize;
    bits -= codeSize;

    if (code === clear) {
      codeSize = minCodeSize + 1;
      codeMask = (1 << codeSize) - 1;
      next = eoi + 1;
      old = -1;
      continue;
    }
    if (code === eoi) break;

    if (old === -1) {
      if (code >= clear) break; // corrupt: first code after a clear must be a literal
      out[outPos++] = code;
      first = code;
      old = code;
      continue;
    }

    let c = code;
    let sp = 0;
    if (code >= next) {
      if (code > next) break; // corrupt
      // KwKwK: previous sequence + its own first pixel
      lzwStack[sp++] = first;
      c = old;
    }
    while (c >= clear) {
      lzwStack[sp++] = lzwSuffix[c];
      c = lzwPrefix[c];
    }
    first = c;
    lzwStack[sp++] = c;
    while (sp > 0 && outPos < pixelCount) out[outPos++] = lzwStack[--sp];

    if (next < LZW_MAX_CODES) {
      lzwPrefix[next] = old;
      lzwSuffix[next] = first;
      next++;
      if (next > codeMask && codeSize < 12) {
        codeSize++;
        codeMask = (1 << codeSize) - 1;
      }
    }
    old = code;
  }
  return outPos;
}

// ============================================================================
// Compositor
// ============================================================================

/**
 * Composites frames in sequence onto an RGBA logical screen exactly like browsers:
 * - the screen starts (and every cycle restarts) fully transparent; the background color is ignored
 * - disposal 2 clears the previous frame's rect to transparent black
 * - disposal 3 restores the screen to its state from just before the previous frame was drawn
 * - transparent pixels leave the underlying pixels untouched
 * - frame patches are clipped to the logical screen
 */
export class GifCompositor {
  readonly width: number;
  readonly height: number;
  /** RGBA pixels of the logical screen after the last `step()`. */
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
  private readonly px32: Uint32Array;
  private readonly pal32 = new Uint32Array(256);
  private readonly pal8 = new Uint8Array(this.pal32.buffer);
  private snapshot: Uint32Array | null = null;
  private indices = new Uint8Array(0);
  private nextIndex = 0;
  private prev: GifFrame | null = null;

  constructor(private readonly meta: GifMetadata) {
    this.width = meta.width;
    this.height = meta.height;
    this.pixels = new Uint8ClampedArray(meta.width * meta.height * 4);
    this.px32 = new Uint32Array(this.pixels.buffer);
  }

  /** Index of the frame the next `step()` will composite. */
  get next(): number {
    return this.nextIndex;
  }

  reset(): void {
    this.px32.fill(0);
    this.nextIndex = 0;
    this.prev = null;
  }

  /** Composites the next frame (wrapping to frame 0 after the last) and returns its index. */
  step(): number {
    if (this.nextIndex >= this.meta.frameCount || this.nextIndex === 0) this.reset();
    const i = this.nextIndex;
    const frame = this.meta.frames[i];
    const prev = this.prev;

    if (prev) {
      if (prev.disposal === 2) this.clearRect(prev);
      else if (prev.disposal === 3 && this.snapshot) this.px32.set(this.snapshot);
    }
    if (frame.disposal === 3) {
      if (!this.snapshot) this.snapshot = new Uint32Array(this.px32.length);
      this.snapshot.set(this.px32);
    }
    this.blit(frame);

    this.prev = frame;
    this.nextIndex = i + 1;
    return i;
  }

  private clearRect(f: GifFrame): void {
    const W = this.width;
    if (f.left >= W) return;
    const x1 = Math.min(f.left + f.width, W);
    const y1 = Math.min(f.top + f.height, this.height);
    for (let y = f.top; y < y1; y++) {
      this.px32.fill(0, y * W + f.left, y * W + x1);
    }
  }

  private blit(f: GifFrame): void {
    const pal = f.palette;
    const fw = f.width;
    const fh = f.height;
    if (!pal || fw === 0 || fh === 0) return;

    // Palette -> packed RGBA (shared byte layout with px32, so endianness-agnostic).
    // 0 marks "leave the pixel alone": the transparent index and out-of-palette indices.
    const colors = Math.min(256, (pal.length / 3) | 0);
    const pal8 = this.pal8;
    this.pal32.fill(0);
    for (let c = 0; c < colors; c++) {
      pal8[c * 4] = pal[c * 3];
      pal8[c * 4 + 1] = pal[c * 3 + 1];
      pal8[c * 4 + 2] = pal[c * 3 + 2];
      pal8[c * 4 + 3] = 255;
    }
    if (f.transparentIndex >= 0) this.pal32[f.transparentIndex] = 0;

    const n = fw * fh;
    if (this.indices.length < n) this.indices = new Uint8Array(n);
    const src = this.indices;
    const count = decodeLzw(f.lzwData, f.minCodeSize, src, n);
    const fullRows = Math.floor(count / fw);
    const rem = count - fullRows * fw;
    const rows = fullRows + (rem > 0 ? 1 : 0);

    const W = this.width;
    const H = this.height;
    const px32 = this.px32;
    const pal32 = this.pal32;

    // Interlaced rows arrive in 4 passes: every 8th from 0, every 8th from 4, every 4th from 2, every 2nd from 1.
    let y = 0;
    let pass = 0;
    const passStart = [0, 4, 2, 1];
    const passStep = [8, 8, 4, 2];

    for (let r = 0; r < rows; r++) {
      const row = f.interlaced ? y : r;
      const dy = f.top + row;
      if (dy < H) {
        const rowLen = r < fullRows ? fw : rem;
        const maxX = Math.min(rowLen, W - f.left);
        const s = r * fw;
        const d = dy * W + f.left;
        for (let x = 0; x < maxX; x++) {
          const c = pal32[src[s + x]];
          if (c !== 0) px32[d + x] = c;
        }
      }
      if (f.interlaced) {
        y += passStep[pass];
        while (y >= fh && pass < 3) {
          pass++;
          y = passStart[pass];
        }
      }
    }
  }
}

// ============================================================================
// Frame sources
// ============================================================================

/** Supplies fully composited, ready-to-draw frames. */
export interface GifFrameSource {
  /** Set when decoding failed; the player reports it (or falls back to another source). */
  readonly error: unknown;
  /** Returns frame `index` if decoded, else null. Either way, decoding of it and a few frames after it is scheduled. */
  frame(index: number): CanvasImageSource | null;
  /** Frames before `index` won't be needed again (unless playback restarts) and may be freed. */
  release(index: number): void;
  close(): void;
}

const LOOKAHEAD_FRAMES = 3;
/** Keep every decoded frame when the whole animation fits in this many bytes of RGBA. */
const JS_CACHE_BUDGET_BYTES = 256 * 1024 * 1024;

/**
 * Pure-JS source (used where WebCodecs ImageDecoder is unavailable, e.g. Safari).
 * Composites frames in order ahead of the playhead and turns each into an ImageBitmap,
 * so the playback tick only ever calls drawImage.
 */
export class JsGifSource implements GifFrameSource {
  error: unknown = null;
  private readonly bitmaps: (ImageBitmap | null)[];
  private readonly compositor: GifCompositor;
  private readonly imageData: ImageData;
  private readonly keepAll: boolean;
  private wanted = 0;
  private busy = false;
  private closed = false;

  constructor(private readonly meta: GifMetadata) {
    this.bitmaps = new Array(meta.frameCount).fill(null);
    this.compositor = new GifCompositor(meta);
    this.imageData = new ImageData(this.compositor.pixels, meta.width, meta.height);
    this.keepAll = meta.width * meta.height * 4 * meta.frameCount <= JS_CACHE_BUDGET_BYTES;
  }

  frame(index: number): CanvasImageSource | null {
    this.wanted = index;
    void this.pump();
    return this.bitmaps[index] ?? null;
  }

  release(index: number): void {
    if (this.keepAll) return;
    for (let i = 0; i < index; i++) {
      this.bitmaps[i]?.close();
      this.bitmaps[i] = null;
    }
  }

  close(): void {
    this.closed = true;
    for (const b of this.bitmaps) b?.close();
    this.bitmaps.fill(null);
  }

  private nextMissing(): number {
    const end = this.keepAll ? this.meta.frameCount : Math.min(this.meta.frameCount, this.wanted + LOOKAHEAD_FRAMES + 1);
    for (let i = this.wanted; i < end; i++) {
      if (!this.bitmaps[i]) return i;
    }
    return -1;
  }

  private async pump(): Promise<void> {
    if (this.busy || this.closed) return;
    this.busy = true;
    try {
      for (;;) {
        const target = this.nextMissing();
        if (target < 0 || this.closed) break;
        if (target < this.compositor.next) this.compositor.reset();
        while (this.compositor.next < target) this.compositor.step(); // skipped (not cached)
        this.compositor.step();
        // createImageBitmap copies the pixels; awaiting it before the next step() keeps the buffer stable.
        const bitmap = await createImageBitmap(this.imageData);
        if (this.closed) {
          bitmap.close();
          break;
        }
        this.bitmaps[target] = bitmap;
      }
    } catch (e) {
      this.error = e;
    } finally {
      this.busy = false;
    }
  }
}

/**
 * WebCodecs ImageDecoder source (Chrome/Edge 94+, Firefox 133+). Uses the browser's own
 * GIF decoder, so compositing is identical to <img>, and decoding happens off the main thread.
 */
export class ImageDecoderSource implements GifFrameSource {
  error: unknown = null;
  private readonly frames = new Map<number, VideoFrame>();
  private readonly pending = new Set<number>();
  private closed = false;

  private constructor(private readonly decoder: ImageDecoder, private readonly frameCount: number) {}

  /** Returns null when ImageDecoder can't be used for this data (caller falls back to JsGifSource). */
  static async create(data: ArrayBuffer, meta: GifMetadata): Promise<ImageDecoderSource | null> {
    if (typeof ImageDecoder === 'undefined') return null;
    let decoder: ImageDecoder | null = null;
    try {
      if (!(await ImageDecoder.isTypeSupported('image/gif'))) return null;
      decoder = new ImageDecoder({ data, type: 'image/gif' });
      await decoder.tracks.ready;
      await decoder.completed;
      // The timeline comes from our parser; only use the browser decoder if both agree on the frames.
      if (decoder.tracks.selectedTrack?.frameCount !== meta.frameCount) {
        decoder.close();
        return null;
      }
      return new ImageDecoderSource(decoder, meta.frameCount);
    } catch {
      decoder?.close();
      return null;
    }
  }

  frame(index: number): CanvasImageSource | null {
    const end = Math.min(this.frameCount - 1, index + LOOKAHEAD_FRAMES);
    for (let i = index; i <= end; i++) this.request(i);
    return this.frames.get(index) ?? null;
  }

  release(index: number): void {
    for (const [i, f] of this.frames) {
      if (i < index) {
        f.close();
        this.frames.delete(i);
      }
    }
  }

  close(): void {
    this.closed = true;
    for (const f of this.frames.values()) f.close();
    this.frames.clear();
    try {
      this.decoder.close();
    } catch {
      // already closed
    }
  }

  private request(i: number): void {
    if (this.closed || this.frames.has(i) || this.pending.has(i)) return;
    this.pending.add(i);
    this.decoder.decode({ frameIndex: i }).then(
      ({ image }) => {
        this.pending.delete(i);
        if (this.closed) image.close();
        else this.frames.set(i, image);
      },
      (e) => {
        this.pending.delete(i);
        if (!this.closed) this.error = e;
      }
    );
  }
}

// ============================================================================
// Presentation
// ============================================================================

/** Largest canvas edge / area we allocate (stays under Safari's canvas memory limits). */
const MAX_CANVAS_EDGE = 8192;
const MAX_CANVAS_AREA = 16_000_000;

/**
 * Backing-store size for a canvas that shows a `gifW`x`gifH` image with `object-fit: contain`
 * inside a `boxW`x`boxH` CSS box, at `scale` device pixels per CSS pixel. Keeps the GIF's aspect
 * ratio so object-fit maps it 1:1 onto device pixels.
 */
export function computeBackingSize(
  gifW: number,
  gifH: number,
  boxW: number,
  boxH: number,
  scale: number
): { width: number; height: number } {
  if (gifW <= 0 || gifH <= 0) return { width: 1, height: 1 };
  if (boxW <= 0 || boxH <= 0) return { width: gifW, height: gifH };
  const fit = Math.min(boxW / gifW, boxH / gifH);
  let w = gifW * fit * Math.max(scale, 0.01);
  let h = gifH * fit * Math.max(scale, 0.01);
  const edgeCap = Math.min(1, MAX_CANVAS_EDGE / Math.max(w, h));
  const areaCap = Math.min(1, Math.sqrt(MAX_CANVAS_AREA / (w * h)));
  const cap = Math.min(edgeCap, areaCap);
  w *= cap;
  h *= cap;
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

// ============================================================================
// Player
// ============================================================================

export interface GifPlayerOptions {
  canvas: HTMLCanvasElement;
  /** Called after each presented frame with the exact composited image (e.g. to mirror it). */
  onFrame?: (image: CanvasImageSource, index: number) => void;
  /**
   * Called once the GIF is parsed, before the backing store is first sized. Use it to give the
   * canvas its intrinsic CSS size when that isn't fixed by layout.
   */
  onMetadata?: (meta: GifMetadata) => void;
  /** Called once, when the first frame is on screen. */
  onReady?: () => void;
  /** Called once a full cycle has played (after the last frame's delay). */
  onComplete?: () => void;
  /** Runtime decode failure. Load failures reject `load()` instead. */
  onError?: (error: Error) => void;
  /** Use WebCodecs ImageDecoder when available (default true). */
  preferImageDecoder?: boolean;
}

/**
 * Plays one cycle of an animated GIF onto a canvas.
 *
 * Timing uses an absolute timeline from the first presented frame: each rAF tick shows whichever
 * frame is due, so render cost never accumulates as drift and late frames are dropped rather than
 * slowing the animation. The canvas backing store follows its CSS size x devicePixelRatio.
 */
export class GifPlayer {
  private readonly canvas: HTMLCanvasElement;
  private readonly options: GifPlayerOptions;
  private ctx: CanvasRenderingContext2D | null = null;
  private meta: GifMetadata | null = null;
  private source: GifFrameSource | null = null;
  private timeline: GifTimeline | null = null;
  private current: CanvasImageSource | null = null;
  private shown = -1;
  private rafId = 0;
  private startTime = 0;
  private lastElapsed = 0;
  private pausedElapsed = 0;
  private running = false;
  private wantPlay = true;
  private completed = false;
  private readyNotified = false;
  private disposed = false;
  private renderScale = 1;

  constructor(options: GifPlayerOptions) {
    this.options = options;
    this.canvas = options.canvas;
  }

  get width(): number {
    return this.meta?.width ?? 0;
  }

  get height(): number {
    return this.meta?.height ?? 0;
  }

  /** The image currently on screen (valid until the next frame is presented). */
  get currentImage(): CanvasImageSource | null {
    return this.current;
  }

  get currentFrame(): number {
    return this.shown;
  }

  get isComplete(): boolean {
    return this.completed;
  }

  /** Loads and starts playing. Safe to dispose at any point; a disposed player never draws. */
  async load(input: Blob | ArrayBuffer | string): Promise<void> {
    let buffer: ArrayBuffer;
    if (typeof input === 'string') {
      const response = await fetch(input);
      if (!response.ok) throw new Error(`Failed to fetch GIF: ${response.status} ${response.statusText}`);
      buffer = await response.arrayBuffer();
    } else if (input instanceof ArrayBuffer) {
      buffer = input;
    } else {
      buffer = await input.arrayBuffer();
    }
    if (this.disposed) return;

    const meta = new GifParser(new Uint8Array(buffer)).parse();
    if (meta.frameCount === 0) throw new Error('GIF contains no frames');

    const decoderSource =
      this.options.preferImageDecoder === false ? null : await ImageDecoderSource.create(buffer, meta);
    if (this.disposed) {
      decoderSource?.close();
      return;
    }
    this.start(meta, decoderSource ?? new JsGifSource(meta));
  }

  /** Starts playback from an already-parsed GIF and a frame source (used by `load`, and by tests). */
  start(meta: GifMetadata, source: GifFrameSource): void {
    if (this.disposed) {
      source.close();
      return;
    }
    this.meta = meta;
    this.source = source;
    this.timeline = new GifTimeline(meta.frameDelays);
    this.options.onMetadata?.(meta);
    if (this.disposed) return;
    this.resize();
    this.schedule();
  }

  play(): void {
    this.wantPlay = true;
    if (this.disposed || this.running || this.completed || this.shown < 0 || !this.meta?.isAnimated) return;
    this.startTime = performance.now() - this.pausedElapsed;
    this.running = true;
    this.schedule();
  }

  pause(): void {
    this.wantPlay = false;
    if (!this.running) return;
    this.pausedElapsed = Math.max(this.lastElapsed, performance.now() - this.startTime);
    this.running = false;
    this.cancel();
  }

  /** Plays another full cycle from frame 0 (e.g. when a slideshow starts on an already-finished GIF). */
  restart(): void {
    if (this.disposed || !this.source) return;
    this.cancel();
    this.running = false;
    this.completed = false;
    this.pausedElapsed = 0;
    this.lastElapsed = 0;
    this.shown = -1; // keep the current image on screen until frame 0 is ready
    this.wantPlay = true;
    this.schedule();
  }

  /** Extra scale applied on top of devicePixelRatio (e.g. the CSS zoom factor). */
  setRenderScale(scale: number): void {
    if (scale > 0 && scale !== this.renderScale) {
      this.renderScale = scale;
      this.resize();
    }
  }

  /** Re-fits the backing store to the canvas's CSS size and redraws the current frame. */
  resize(): void {
    if (this.disposed || !this.meta) return;
    const c = this.canvas;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    // With an `auto` CSS size the layout box follows the backing store, so sizing from it would
    // grow the canvas on every resize pass. Size from the intrinsic dimensions instead.
    const style = c.style as CSSStyleDeclaration | undefined;
    const autoSize = !!style && (style.width === 'auto' || style.height === 'auto');
    const { width, height } = computeBackingSize(
      this.meta.width,
      this.meta.height,
      autoSize ? this.meta.width : c.clientWidth,
      autoSize ? this.meta.height : c.clientHeight,
      dpr * this.renderScale
    );
    if (c.width !== width || c.height !== height || !this.ctx) {
      c.width = width;
      c.height = height;
      // Resizing resets context state. No willReadFrequently: keep the canvas GPU-accelerated.
      this.ctx = c.getContext('2d');
      if (this.ctx) {
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
      }
      if (this.current) this.draw(this.current);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.running = false;
    this.cancel();
    this.source?.close();
    this.source = null;
    this.current = null;
    this.ctx = null;
  }

  private schedule(): void {
    if (!this.disposed && !this.rafId) this.rafId = requestAnimationFrame(this.tick);
  }

  private cancel(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private draw(image: CanvasImageSource): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
  }

  private present(index: number, image: CanvasImageSource): void {
    this.draw(image);
    this.current = image;
    this.shown = index;
    this.options.onFrame?.(image, index);
    this.source?.release(index);
  }

  private fail(error: unknown): void {
    // ImageDecoder failed mid-playback: fall back to the JS decoder and keep the timeline.
    if (this.source instanceof ImageDecoderSource && this.meta) {
      // Closing the source closes its VideoFrames, including the one on screen: never redraw it.
      // The canvas keeps its pixels until the JS decoder presents the next frame.
      this.current = null;
      this.source.close();
      this.source = new JsGifSource(this.meta);
      this.schedule();
      return;
    }
    this.running = false;
    this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
  }

  private tick = (now: number): void => {
    this.rafId = 0;
    const source = this.source;
    const timeline = this.timeline;
    const meta = this.meta;
    if (this.disposed || !source || !timeline || !meta) return;
    if (source.error) {
      this.fail(source.error);
      return;
    }

    // Waiting for frame 0 (first load or restart)
    if (this.shown < 0) {
      const image = source.frame(0);
      if (!image) {
        this.schedule();
        return;
      }
      this.present(0, image);
      if (!this.readyNotified) {
        this.readyNotified = true;
        this.options.onReady?.();
      }
      if (meta.frameCount < 2) return; // static GIF: nothing more to do
      this.startTime = now;
      this.lastElapsed = 0;
      this.pausedElapsed = 0;
      if (this.wantPlay) {
        this.running = true;
        this.schedule();
      }
      return;
    }

    if (!this.running) return;

    // Monotonic: never step backwards if a rAF timestamp predates a resume.
    const elapsed = Math.max(this.lastElapsed, now - this.startTime);
    this.lastElapsed = elapsed;
    const last = meta.frameCount - 1;
    const ended = elapsed >= timeline.duration;
    const target = ended ? last : timeline.frameAt(elapsed);

    const image = source.frame(target);
    if (image && target !== this.shown) this.present(target, image);

    if (ended && this.shown === last) {
      this.running = false;
      this.completed = true;
      this.options.onComplete?.();
      return;
    }
    this.schedule();
  };
}

/** Parses a GIF's metadata (no pixel decoding). */
export async function getGifMetadata(file: File | string): Promise<GifMetadata> {
  const arrayBuffer = typeof file === 'string' ? await (await fetch(file)).arrayBuffer() : await file.arrayBuffer();
  return new GifParser(new Uint8Array(arrayBuffer)).parse();
}
