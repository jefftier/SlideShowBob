/**
 * GIF Utilities — basic metadata via the built-in GIF parser.
 */

import { getGifMetadata } from './gifPlayer';

export interface GifInfo {
  isAnimated: boolean;
  frameCount: number;
  duration: number; // Total duration in milliseconds
  width: number;
  height: number;
}

/**
 * Get basic GIF information (dimensions, frame count, duration).
 */
export async function getGifInfo(file: File | string): Promise<GifInfo> {
  const meta = await getGifMetadata(file);
  return {
    isAnimated: meta.isAnimated,
    frameCount: meta.frameCount,
    duration: meta.totalDuration,
    width: meta.width,
    height: meta.height,
  };
}
