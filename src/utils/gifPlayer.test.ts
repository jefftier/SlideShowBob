/// <reference types="node" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  GifParser,
  GifCompositor,
  GifTimeline,
  GifPlayer,
  ImageDecoderSource,
  clampGifDelay,
  computeBackingSize,
  type GifFrameSource,
  type GifMetadata,
} from './gifPlayer';

// ---------------------------------------------------------------------------
// Tiny GIF encoder for fixtures (4-color palettes, "uncompressed" LZW)
// ---------------------------------------------------------------------------

type RGB = [number, number, number];
interface TestFrame {
  left?: number;
  top?: number;
  width: number;
  height: number;
  /** Palette indices in display (row-major) order. */
  pixels: number[];
  delayCs?: number;
  disposal?: number;
  transparentIndex?: number;
  localPalette?: RGB[];
  interlaced?: boolean;
}

const RED: RGB = [255, 0, 0];
const GREEN: RGB = [0, 255, 0];
const BLUE: RGB = [0, 0, 255];
const WHITE: RGB = [255, 255, 255];
const PALETTE: RGB[] = [RED, GREEN, BLUE, WHITE];

function lzwEncode(indices: number[]): number[] {
  // minCodeSize 2 -> 3-bit codes. Emitting a Clear before every 2 literals keeps the code size fixed.
  const codes: number[] = [];
  for (let i = 0; i < indices.length; i += 2) {
    codes.push(4, ...indices.slice(i, i + 2));
  }
  codes.push(5);
  const bytes: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const c of codes) {
    buf |= c << bits;
    bits += 3;
    while (bits >= 8) {
      bytes.push(buf & 0xff);
      buf >>= 8;
      bits -= 8;
    }
  }
  if (bits > 0) bytes.push(buf & 0xff);
  return bytes;
}

function subBlocks(data: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 255) {
    const chunk = data.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return out;
}

function interlaceOrder(pixels: number[], w: number, h: number): number[] {
  const out: number[] = [];
  for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) {
    for (let y = start; y < h; y += step) out.push(...pixels.slice(y * w, y * w + w));
  }
  return out;
}

function buildGif(w: number, h: number, frames: TestFrame[], opts: { loop?: number; global?: RGB[] } = {}): Uint8Array {
  const global = opts.global ?? PALETTE;
  const b: number[] = [...'GIF89a'].map(c => c.charCodeAt(0));
  b.push(w & 0xff, w >> 8, h & 0xff, h >> 8, 0x80 | 1, 0, 0); // global table of 4 entries
  for (const c of global) b.push(...c);
  if (opts.loop !== undefined) {
    b.push(0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map(c => c.charCodeAt(0)), 3, 1, opts.loop & 0xff, opts.loop >> 8, 0);
  }
  for (const f of frames) {
    const t = f.transparentIndex ?? -1;
    const delay = f.delayCs ?? 10;
    b.push(0x21, 0xf9, 4, ((f.disposal ?? 0) << 2) | (t >= 0 ? 1 : 0), delay & 0xff, delay >> 8, Math.max(t, 0), 0);
    const left = f.left ?? 0;
    const top = f.top ?? 0;
    let packed = 0;
    if (f.localPalette) packed |= 0x80 | 1;
    if (f.interlaced) packed |= 0x40;
    b.push(0x2c, left & 0xff, left >> 8, top & 0xff, top >> 8, f.width & 0xff, f.width >> 8, f.height & 0xff, f.height >> 8, packed);
    if (f.localPalette) for (const c of f.localPalette) b.push(...c);
    const order = f.interlaced ? interlaceOrder(f.pixels, f.width, f.height) : f.pixels;
    b.push(2, ...subBlocks(lzwEncode(order)));
  }
  b.push(0x3b);
  return new Uint8Array(b);
}

/** RGBA at (x, y) of the compositor's screen. */
function px(c: GifCompositor, x: number, y: number): number[] {
  const i = (y * c.width + x) * 4;
  return Array.from(c.pixels.slice(i, i + 4));
}
const rgba = (c: RGB): number[] => [...c, 255];
const CLEAR = [0, 0, 0, 0];

function compose(gif: Uint8Array, steps: number): GifCompositor {
  const c = new GifCompositor(new GifParser(gif).parse());
  for (let i = 0; i < steps; i++) c.step();
  return c;
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

describe('GIF frame timing', () => {
  it('clamps delays of <= 10 ms (0 or 1 cs) to 100 ms like browsers', () => {
    expect(clampGifDelay(0)).toBe(100);
    expect(clampGifDelay(10)).toBe(100);
    expect(clampGifDelay(20)).toBe(20);
    expect(clampGifDelay(70)).toBe(70);
  });

  it('parser reports clamped per-frame delays, total duration and loop count', () => {
    const one = { width: 1, height: 1, pixels: [0] };
    const meta = new GifParser(
      buildGif(1, 1, [{ ...one, delayCs: 0 }, { ...one, delayCs: 1 }, { ...one, delayCs: 2 }, { ...one, delayCs: 5 }], { loop: 0 })
    ).parse();
    expect(meta.frameCount).toBe(4);
    expect(meta.isAnimated).toBe(true);
    expect(meta.frameDelays).toEqual([100, 100, 20, 50]);
    expect(meta.totalDuration).toBe(270);
    expect(meta.loopCount).toBe(0);
  });

  it('timeline maps elapsed time to the due frame', () => {
    const t = new GifTimeline([100, 50, 200]);
    expect(t.duration).toBe(350);
    expect(t.frameAt(-5)).toBe(0);
    expect(t.frameAt(0)).toBe(0);
    expect(t.frameAt(99.9)).toBe(0);
    expect(t.frameAt(100)).toBe(1);
    expect(t.frameAt(149)).toBe(1);
    expect(t.frameAt(150)).toBe(2);
    expect(t.frameAt(10_000)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Compositing
// ---------------------------------------------------------------------------

describe('GIF compositing', () => {
  const full = (color: number) => ({ width: 2, height: 2, pixels: [color, color, color, color] });
  const patch = (color: number, disposal: number) => ({ left: 1, top: 1, width: 1, height: 1, pixels: [color], disposal });

  it('first frame draws onto a transparent screen (background color is ignored)', () => {
    const c = compose(buildGif(2, 2, [{ left: 0, top: 0, width: 1, height: 1, pixels: [0] }]), 1);
    expect(px(c, 0, 0)).toEqual(rgba(RED));
    expect(px(c, 1, 1)).toEqual(CLEAR);
  });

  it.each([0, 1])('disposal %i keeps the previous frame underneath', disposal => {
    const gif = buildGif(2, 2, [{ ...full(0), disposal }, patch(2, 0)]);
    const c = compose(gif, 2);
    expect(px(c, 0, 0)).toEqual(rgba(RED));
    expect(px(c, 1, 1)).toEqual(rgba(BLUE));
  });

  it('disposal 2 clears the frame rect to transparent, not to the background color', () => {
    const gif = buildGif(2, 2, [full(0), patch(2, 2), { left: 0, top: 0, width: 1, height: 1, pixels: [1] }]);
    const c = compose(gif, 3);
    expect(px(c, 1, 1)).toEqual(CLEAR); // patch area cleared
    expect(px(c, 1, 0)).toEqual(rgba(RED)); // outside the rect untouched
    expect(px(c, 0, 0)).toEqual(rgba(GREEN));
  });

  it('disposal 3 restores the screen to its state before that frame was drawn', () => {
    const gif = buildGif(2, 2, [
      full(0),
      { left: 0, top: 0, width: 1, height: 1, pixels: [3], disposal: 1 }, // white stays
      patch(2, 3), // blue patch, then restore
      { left: 1, top: 0, width: 1, height: 1, pixels: [1] }, // green elsewhere
    ]);
    const c = compose(gif, 4);
    expect(px(c, 0, 0)).toEqual(rgba(WHITE)); // drawn before the disposal-3 frame: kept
    expect(px(c, 1, 1)).toEqual(rgba(RED)); // blue patch undone
    expect(px(c, 1, 0)).toEqual(rgba(GREEN));
  });

  it('transparent pixels leave underlying pixels untouched', () => {
    const gif = buildGif(2, 2, [full(0), { width: 2, height: 2, pixels: [1, 3, 3, 2], transparentIndex: 3 }]);
    const c = compose(gif, 2);
    expect(px(c, 0, 0)).toEqual(rgba(GREEN));
    expect(px(c, 1, 0)).toEqual(rgba(RED));
    expect(px(c, 0, 1)).toEqual(rgba(RED));
    expect(px(c, 1, 1)).toEqual(rgba(BLUE));
  });

  it('a transparent first frame stays transparent where nothing is drawn', () => {
    const c = compose(buildGif(2, 1, [{ width: 2, height: 1, pixels: [3, 1], transparentIndex: 3 }]), 1);
    expect(px(c, 0, 0)).toEqual(CLEAR);
    expect(px(c, 1, 0)).toEqual(rgba(GREEN));
  });

  it('a local color table applies only to its own frame', () => {
    const local: RGB[] = [GREEN, GREEN, GREEN, GREEN];
    const gif = buildGif(1, 1, [
      { width: 1, height: 1, pixels: [0] },
      { width: 1, height: 1, pixels: [0], localPalette: local },
      { width: 1, height: 1, pixels: [0] },
    ]);
    const c = new GifCompositor(new GifParser(gif).parse());
    c.step();
    expect(px(c, 0, 0)).toEqual(rgba(RED));
    c.step();
    expect(px(c, 0, 0)).toEqual(rgba(GREEN));
    c.step();
    expect(px(c, 0, 0)).toEqual(rgba(RED));
  });

  it('clips frame patches to the logical screen', () => {
    const gif = buildGif(2, 2, [{ left: 1, top: 1, width: 2, height: 2, pixels: [1, 2, 3, 0] }]);
    const c = compose(gif, 1);
    expect(px(c, 1, 1)).toEqual(rgba(GREEN));
    expect(px(c, 0, 0)).toEqual(CLEAR); // no wrap-around into the next row
    expect(px(c, 0, 1)).toEqual(CLEAR);
  });

  it('deinterlaces interlaced frames', () => {
    const rows = [0, 1, 2, 3, 0, 1, 2, 3, 0]; // 1x9: one color per row
    const gif = buildGif(1, 9, [{ width: 1, height: 9, pixels: rows, interlaced: true }]);
    const c = compose(gif, 1);
    rows.forEach((color, y) => expect(px(c, 0, y)).toEqual(rgba(PALETTE[color])));
  });

  it('restarts each cycle from a transparent screen', () => {
    const gif = buildGif(2, 1, [
      { width: 1, height: 1, pixels: [0] },
      { left: 1, top: 0, width: 1, height: 1, pixels: [1] },
    ]);
    const c = compose(gif, 2);
    expect(px(c, 1, 0)).toEqual(rgba(GREEN));
    expect(c.step()).toBe(0);
    expect(px(c, 0, 0)).toEqual(rgba(RED));
    expect(px(c, 1, 0)).toEqual(CLEAR);
  });

  it('keeps complete frames of a truncated file', () => {
    const gif = buildGif(1, 1, [{ width: 1, height: 1, pixels: [0] }, { width: 1, height: 1, pixels: [1] }]);
    const meta = new GifParser(gif.slice(0, gif.length - 6)).parse();
    expect(meta.frameCount).toBe(1);
  });

  const testFilesDir = join(__dirname, '../../testFiles');
  const sampleGifs = (() => {
    try {
      return readdirSync(testFilesDir).filter(f => f.endsWith('.gif'));
    } catch {
      return [];
    }
  })();
  it.runIf(sampleGifs.length > 0)('parses and composites every frame of the sample GIFs', () => {
    for (const name of sampleGifs) {
      const meta = new GifParser(new Uint8Array(readFileSync(join(testFilesDir, name)))).parse();
      expect(meta.frameCount, name).toBeGreaterThan(1);
      expect(meta.frameDelays.every(d => d > 10), name).toBe(true);
      const c = new GifCompositor(meta);
      for (let i = 0; i < meta.frameCount; i++) expect(c.step()).toBe(i);
      expect(c.pixels.some(v => v !== 0), name).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Presentation sizing
// ---------------------------------------------------------------------------

describe('computeBackingSize', () => {
  it('matches the contained CSS size times devicePixelRatio, keeping aspect ratio', () => {
    expect(computeBackingSize(100, 50, 800, 800, 2)).toEqual({ width: 1600, height: 800 });
    expect(computeBackingSize(640, 1138, 1920, 1080, 1)).toEqual({ width: 607, height: 1080 });
  });

  it('falls back to intrinsic size before layout and caps huge canvases', () => {
    expect(computeBackingSize(320, 240, 0, 0, 2)).toEqual({ width: 320, height: 240 });
    const big = computeBackingSize(100, 100, 10_000, 10_000, 3);
    expect(big.width * big.height).toBeLessThanOrEqual(16_000_000);
  });
});

// ---------------------------------------------------------------------------
// Player: scheduling, completion, lifecycle
// ---------------------------------------------------------------------------

function fakeMeta(delays: number[]): GifMetadata {
  return {
    width: 10,
    height: 10,
    globalPalette: null,
    frameCount: delays.length,
    isAnimated: delays.length > 1,
    totalDuration: delays.reduce((a, b) => a + b, 0),
    loopCount: 0,
    frameDelays: delays,
    frames: [],
  };
}

class FakeSource implements GifFrameSource {
  error: unknown = null;
  readonly images: CanvasImageSource[];
  readonly ready: Set<number>;
  closed = false;
  releasedUpTo = -1;
  constructor(count: number, readyAll = true) {
    this.images = Array.from({ length: count }, (_, i) => ({ id: i }) as unknown as CanvasImageSource);
    this.ready = new Set(readyAll ? this.images.map((_, i) => i) : []);
  }
  frame(i: number) {
    return this.ready.has(i) ? this.images[i] : null;
  }
  release(i: number) {
    this.releasedUpTo = i;
  }
  close() {
    this.closed = true;
  }
}

function fakeCanvas() {
  const ctx = {
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  };
  const canvas = { width: 0, height: 0, clientWidth: 100, clientHeight: 100, getContext: () => ctx };
  return { canvas: canvas as unknown as HTMLCanvasElement, ctx };
}

describe('GifPlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(delays: number[], source = new FakeSource(delays.length)) {
    const { canvas, ctx } = fakeCanvas();
    const frames: { index: number; at: number }[] = [];
    const onComplete = vi.fn();
    const onReady = vi.fn();
    const player = new GifPlayer({
      canvas,
      onFrame: (_img, index) => frames.push({ index, at: performance.now() }),
      onComplete,
      onReady,
    });
    player.start(fakeMeta(delays), source);
    return { player, canvas, ctx, frames, onComplete, onReady, source };
  }

  it('presents each frame when its cumulative delay has elapsed, without drift', () => {
    const delays = [100, 50, 200, 30];
    const { frames, onComplete } = setup(delays);
    vi.advanceTimersByTime(1000);
    expect(frames.map(f => f.index)).toEqual([0, 1, 2, 3]);
    const start = frames[0].at;
    const timeline = new GifTimeline(delays);
    frames.forEach((f, i) => {
      const offset = f.at - start - timeline.starts[i];
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(17); // within one rAF of the ideal time
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('fires completion once, only after the last frame has been shown for its delay', () => {
    const { frames, onComplete } = setup([100, 100, 100]);
    vi.advanceTimersByTime(250);
    expect(frames.at(-1)?.index).toBe(2);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onComplete).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(3); // one cycle, no looping
  });

  it('draws at the canvas backing size with high-quality smoothing', () => {
    const { canvas, ctx, player } = setup([100, 100]);
    vi.advanceTimersByTime(20);
    expect(canvas.width).toBe(100 * (window.devicePixelRatio || 1));
    expect(ctx.imageSmoothingQuality).toBe('high');
    expect(ctx.drawImage).toHaveBeenLastCalledWith(player.currentImage, 0, 0, canvas.width, canvas.height);
  });

  it('pause holds the current frame and resume continues from the same position', () => {
    const { player, frames, onComplete } = setup([100, 100]);
    vi.advanceTimersByTime(50);
    player.pause();
    vi.advanceTimersByTime(5000);
    expect(frames.map(f => f.index)).toEqual([0]);
    player.play();
    vi.advanceTimersByTime(40);
    expect(frames.map(f => f.index)).toEqual([0]);
    vi.advanceTimersByTime(40);
    expect(frames.map(f => f.index)).toEqual([0, 1]);
    vi.advanceTimersByTime(200);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('drops frames that are not decoded in time instead of slowing down', () => {
    const source = new FakeSource(4, false);
    source.ready.add(0);
    const { frames, onComplete } = setup([100, 100, 100, 100], source);
    vi.advanceTimersByTime(250); // frames 1 and 2 never became ready
    source.ready.add(3);
    vi.advanceTimersByTime(200);
    expect(frames.map(f => f.index)).toEqual([0, 3]);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('waits for the first frame before starting the clock', () => {
    const source = new FakeSource(2, false);
    const { frames, onReady } = setup([100, 100], source);
    vi.advanceTimersByTime(500);
    expect(frames).toHaveLength(0);
    expect(onReady).not.toHaveBeenCalled();
    source.ready.add(0).add(1);
    vi.advanceTimersByTime(20);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(frames.map(f => f.index)).toEqual([0]); // frame 1 still gets its full 100 ms
  });

  it('releases frames behind the playhead', () => {
    const { source } = setup([100, 100, 100]);
    vi.advanceTimersByTime(150);
    expect(source.releasedUpTo).toBe(1);
  });

  it('restart plays another full cycle and completes again', () => {
    const { player, frames, onComplete } = setup([100, 100]);
    vi.advanceTimersByTime(300);
    expect(player.isComplete).toBe(true);
    player.restart();
    vi.advanceTimersByTime(300);
    expect(frames.map(f => f.index)).toEqual([0, 1, 0, 1]);
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('a single-frame GIF shows its frame and never completes', () => {
    const { frames, onComplete } = setup([100]);
    vi.advanceTimersByTime(1000);
    expect(frames).toHaveLength(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('dispose stops drawing, cancels the loop and closes the source', () => {
    const { player, frames, source, onComplete } = setup([100, 100]);
    vi.advanceTimersByTime(20);
    player.dispose();
    vi.advanceTimersByTime(1000);
    expect(frames).toHaveLength(1);
    expect(onComplete).not.toHaveBeenCalled();
    expect(source.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports metadata before the backing store is first sized', () => {
    const { canvas } = fakeCanvas();
    const seen: { meta: GifMetadata; backingWidth: number }[] = [];
    const player = new GifPlayer({ canvas, onMetadata: meta => seen.push({ meta, backingWidth: canvas.width }) });
    const meta = fakeMeta([100, 100]);
    player.start(meta, new FakeSource(2));
    expect(seen).toHaveLength(1);
    expect(seen[0].meta).toBe(meta);
    expect(seen[0].backingWidth).toBe(0); // resize() hadn't run yet
    expect(canvas.width).toBeGreaterThan(0);
    player.dispose();
  });

  it('sizes from the intrinsic size when the CSS size is auto (no layout feedback)', () => {
    const { canvas } = fakeCanvas();
    Object.assign(canvas, { style: { width: 'auto', height: 'auto' }, clientWidth: 300, clientHeight: 150 });
    const player = new GifPlayer({ canvas });
    player.start(fakeMeta([100, 100]), new FakeSource(2));
    const dpr = window.devicePixelRatio || 1;
    expect(canvas.width).toBe(10 * dpr);
    // Layout following the backing store must not grow it further
    Object.assign(canvas, { clientWidth: canvas.width, clientHeight: canvas.height });
    player.resize();
    expect(canvas.width).toBe(10 * dpr);
    player.dispose();
  });

  it('drops the closed decoder frame when falling back to the JS decoder', () => {
    vi.stubGlobal('ImageData', class {
      constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
    });
    const images = [{ id: 0 }, { id: 1 }] as unknown as CanvasImageSource[];
    const decoderSource = Object.assign(Object.create(ImageDecoderSource.prototype) as GifFrameSource, {
      error: null as unknown,
      frame: (i: number) => images[i],
      release: () => {},
      close: vi.fn(),
    });
    const { canvas, ctx } = fakeCanvas();
    const player = new GifPlayer({ canvas });
    player.start(fakeMeta([100, 100]), decoderSource);
    vi.advanceTimersByTime(20);
    expect(player.currentImage).toBe(images[0]);

    decoderSource.error = new Error('decode failed');
    vi.advanceTimersByTime(16);
    expect(decoderSource.close).toHaveBeenCalled();
    expect(player.currentImage).toBeNull();

    // A resize after the fallback must not redraw the closed frame
    ctx.drawImage.mockClear();
    Object.assign(canvas, { clientWidth: 50, clientHeight: 50 });
    player.resize();
    expect(ctx.drawImage).not.toHaveBeenCalled();
    player.dispose();
    vi.unstubAllGlobals();
  });

  it('a player disposed during load never starts', async () => {
    vi.useRealTimers();
    const { canvas, ctx } = fakeCanvas();
    const player = new GifPlayer({ canvas, preferImageDecoder: false });
    const blob = { arrayBuffer: () => Promise.resolve(buildGif(1, 1, [{ width: 1, height: 1, pixels: [0] }]).buffer) };
    const loading = player.load(blob as unknown as Blob);
    player.dispose();
    await loading;
    await new Promise(r => setTimeout(r, 30));
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(player.width).toBe(0);
  });
});
