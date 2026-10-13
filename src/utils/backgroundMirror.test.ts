import { describe, it, expect, vi, afterEach } from 'vitest';
import { backgroundSize, drawBackgroundFrame, mirrorVideoToCanvas, BACKGROUND_MAX_EDGE } from './backgroundMirror';

function fakeCanvas() {
  const ctx = { drawImage: vi.fn(), clearRect: vi.fn() };
  const canvas = { width: 300, height: 150, getContext: () => ctx };
  return { canvas: canvas as unknown as HTMLCanvasElement, ctx };
}

class FakeVideo extends EventTarget {
  readyState = 4;
  videoWidth = 1920;
  videoHeight = 1080;
  currentTime = 0;
  paused = false;
  private callbacks = new Map<number, () => void>();
  private nextId = 1;
  requestVideoFrameCallback?: (cb: () => void) => number = (cb) => {
    const id = this.nextId++;
    this.callbacks.set(id, cb);
    return id;
  };
  cancelVideoFrameCallback = vi.fn((id: number) => this.callbacks.delete(id));
  /** Simulates the foreground presenting a new frame. */
  presentFrame(time: number) {
    this.currentTime = time;
    const cbs = [...this.callbacks.values()];
    this.callbacks.clear();
    cbs.forEach(cb => cb());
  }
  get pendingCallbacks() {
    return this.callbacks.size;
  }
}

describe('backgroundSize', () => {
  it('keeps the aspect ratio with the long edge capped', () => {
    expect(backgroundSize(1920, 1080)).toEqual({ width: BACKGROUND_MAX_EDGE, height: 144 });
    expect(backgroundSize(640, 1138)).toEqual({ width: 144, height: BACKGROUND_MAX_EDGE });
    expect(backgroundSize(100, 50)).toEqual({ width: 100, height: 50 }); // never upscales
    expect(backgroundSize(0, 50)).toEqual({ width: 0, height: 0 });
  });
});

describe('drawBackgroundFrame', () => {
  it('draws the source scaled into a low-res canvas', () => {
    const { canvas, ctx } = fakeCanvas();
    const image = {} as CanvasImageSource;
    drawBackgroundFrame(canvas, image, 1920, 1080);
    expect(canvas.width).toBe(256);
    expect(canvas.height).toBe(144);
    expect(ctx.drawImage).toHaveBeenCalledWith(image, 0, 0, 256, 144);
  });
});

describe('mirrorVideoToCanvas', () => {
  afterEach(() => vi.useRealTimers());

  it('draws once immediately and then on every presented foreground frame', () => {
    const video = new FakeVideo();
    const { canvas, ctx } = fakeCanvas();
    const stop = mirrorVideoToCanvas(video as unknown as HTMLVideoElement, canvas);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1); // late mount shows the current frame
    video.presentFrame(0.04);
    video.presentFrame(0.08);
    expect(ctx.drawImage).toHaveBeenCalledTimes(3);
    expect(ctx.drawImage).toHaveBeenLastCalledWith(video, 0, 0, 256, 144);
    stop();
  });

  it('redraws on seeked (paused seeks) and loadeddata', () => {
    const video = new FakeVideo();
    video.paused = true;
    const { canvas, ctx } = fakeCanvas();
    const stop = mirrorVideoToCanvas(video as unknown as HTMLVideoElement, canvas);
    video.currentTime = 12;
    video.dispatchEvent(new Event('seeked'));
    video.dispatchEvent(new Event('loadeddata'));
    expect(ctx.drawImage).toHaveBeenCalledTimes(3);
    stop();
  });

  it('does not draw before the video has a frame', () => {
    const video = new FakeVideo();
    video.readyState = 1;
    const { canvas, ctx } = fakeCanvas();
    const stop = mirrorVideoToCanvas(video as unknown as HTMLVideoElement, canvas);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    stop();
  });

  it('cleanup cancels the frame callback and removes listeners', () => {
    const video = new FakeVideo();
    const { canvas, ctx } = fakeCanvas();
    const stop = mirrorVideoToCanvas(video as unknown as HTMLVideoElement, canvas);
    stop();
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledTimes(1);
    expect(video.pendingCallbacks).toBe(0);
    video.dispatchEvent(new Event('seeked'));
    video.presentFrame(1);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });

  it('falls back to requestAnimationFrame, drawing only when the video time changes', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const video = new FakeVideo();
    video.requestVideoFrameCallback = undefined;
    const { canvas, ctx } = fakeCanvas();
    const stop = mirrorVideoToCanvas(video as unknown as HTMLVideoElement, canvas);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100); // time unchanged (paused/stalled): no redundant draws
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    video.currentTime = 0.5;
    vi.advanceTimersByTime(20);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
