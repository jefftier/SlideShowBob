/**
 * Blurred background fill that mirrors the foreground media.
 *
 * Instead of decoding the media a second time (a second <video>/<img> that has to be kept in
 * sync), the background is a small canvas that only ever draws frames the foreground has already
 * presented. Play, pause, seek, playback rate, looping and late mounting therefore stay in sync
 * by construction. The CSS blur hides the low resolution.
 */

/** Longest edge of the background canvas, in pixels. */
export const BACKGROUND_MAX_EDGE = 256;

/** Background canvas size for a `srcW`x`srcH` source: same aspect ratio, long edge <= maxEdge. */
export function backgroundSize(
  srcW: number,
  srcH: number,
  maxEdge: number = BACKGROUND_MAX_EDGE
): { width: number; height: number } {
  if (srcW <= 0 || srcH <= 0) return { width: 0, height: 0 };
  const s = Math.min(1, maxEdge / Math.max(srcW, srcH));
  return { width: Math.max(1, Math.round(srcW * s)), height: Math.max(1, Math.round(srcH * s)) };
}

/** Draws one frame of `image` (intrinsic size `srcW`x`srcH`) into the background canvas. */
export function drawBackgroundFrame(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  srcW: number,
  srcH: number
): void {
  const { width, height } = backgroundSize(srcW, srcH);
  if (width === 0) return;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
}

const HAVE_CURRENT_DATA = 2;

/**
 * Mirrors every presented frame of `video` into `canvas`, using requestVideoFrameCallback where
 * available and a requestAnimationFrame loop otherwise. Also draws immediately and on
 * loadeddata/seeked so a late-mounted background or a paused seek shows the right frame.
 * Returns a cleanup function.
 */
export function mirrorVideoToCanvas(video: HTMLVideoElement, canvas: HTMLCanvasElement): () => void {
  let stopped = false;
  let vfcId = 0;
  let rafId = 0;
  let lastTime = -1;

  const draw = () => {
    if (stopped || video.readyState < HAVE_CURRENT_DATA || !video.videoWidth) return;
    lastTime = video.currentTime;
    try {
      drawBackgroundFrame(canvas, video, video.videoWidth, video.videoHeight);
    } catch {
      // Decorative: never let the background break playback.
    }
  };

  const useVfc = typeof video.requestVideoFrameCallback === 'function';
  const onVideoFrame = () => {
    if (stopped) return;
    draw();
    vfcId = video.requestVideoFrameCallback(onVideoFrame);
  };
  const onAnimationFrame = () => {
    if (stopped) return;
    if (video.currentTime !== lastTime) draw();
    rafId = requestAnimationFrame(onAnimationFrame);
  };

  if (useVfc) vfcId = video.requestVideoFrameCallback(onVideoFrame);
  else rafId = requestAnimationFrame(onAnimationFrame);

  video.addEventListener('loadeddata', draw);
  video.addEventListener('seeked', draw);
  draw();

  return () => {
    stopped = true;
    if (vfcId && typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(vfcId);
    if (rafId) cancelAnimationFrame(rafId);
    video.removeEventListener('loadeddata', draw);
    video.removeEventListener('seeked', draw);
  };
}
