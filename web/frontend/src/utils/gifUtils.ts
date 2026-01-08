/**
 * GIF Utilities - Minimal, Working Implementation
 * 
 * Only gets basic info - no frame decoding
 * We'll use img tag and timer approach
 */

import * as gifuct from 'gifuct-js';

export interface GifInfo {
  isAnimated: boolean;
  frameCount: number;
  duration: number; // Total duration in milliseconds
  width: number;
  height: number;
}

/**
 * Get basic GIF information - minimal parsing, just what we need
 */
export async function getGifInfo(file: File | string): Promise<GifInfo> {
  const arrayBuffer = file instanceof File 
    ? await file.arrayBuffer()
    : await (await fetch(file)).arrayBuffer();
  
  const gif = gifuct.parseGIF(arrayBuffer);
  const frames = gifuct.decompressFrames(gif, true);
  
  const width = (gif as any).lsd?.width || (gif as any).width || 0;
  const height = (gif as any).lsd?.height || (gif as any).height || 0;
  
  const isAnimated = frames.length > 1;
  
  // Calculate duration - delays are in centiseconds (hundredths of a second)
  let duration = 0;
  frames.forEach((frame) => {
    const delay = frame.delay || 0;
    // Convert centiseconds to milliseconds
    // If delay is 0, use minimum 10ms (1 centisecond)
    duration += delay > 0 ? delay * 10 : 10;
  });
  
  return {
    isAnimated,
    frameCount: frames.length,
    duration,
    width,
    height
  };
}
