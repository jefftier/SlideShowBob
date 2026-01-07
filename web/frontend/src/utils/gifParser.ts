/**
 * GIF Parser Utility
 * 
 * Parses animated GIF files to extract frame information, duration, and loop count.
 * This enables accurate detection of when a GIF animation completes.
 */

// Import gifuct-js - it uses CommonJS exports, so we need to import the whole module
import * as gifuct from 'gifuct-js';

export interface GifMetadata {
  totalDuration: number; // Total duration in milliseconds
  frameCount: number;
  loopCount: number; // 0 = infinite, >0 = number of loops
  frameDelays: number[]; // Delay for each frame in milliseconds
}

/**
 * Parses a GIF file and extracts metadata including duration and frame information.
 * 
 * @param file - The GIF file to parse
 * @returns Promise resolving to GIF metadata
 */
export async function parseGifMetadata(file: File): Promise<GifMetadata> {
  const arrayBuffer = await file.arrayBuffer();
  const gif = gifuct.parseGIF(arrayBuffer);
  const frames = gifuct.decompressFrames(gif, true);
  
  // Calculate total duration by summing frame delays
  const frameDelays: number[] = [];
  let totalDuration = 0;
  
  frames.forEach((frame) => {
    // Frame delay is in hundredths of a second, convert to milliseconds
    // Default to 10 (100ms) if delay is 0 or undefined
    const delay = frame.delay || 10;
    const delayMs = delay * 10;
    frameDelays.push(delayMs);
    totalDuration += delayMs;
  });
  
  // Get loop count from application extension (Netscape extension)
  // 0 means infinite loop, >0 means number of loops
  let loopCount = 0;
  if (gif.application && gif.application.length > 0) {
    const netscapeExt = gif.application.find((app: any) => 
      app.application && app.application === 'NETSCAPE2.0'
    );
    if (netscapeExt && netscapeExt.data) {
      // Loop count is in the first two bytes of the data
      loopCount = netscapeExt.data[0] | (netscapeExt.data[1] << 8);
    }
  }
  
  return {
    totalDuration,
    frameCount: frames.length,
    loopCount,
    frameDelays
  };
}

/**
 * Parses a GIF from a URL (object URL or data URL).
 * 
 * @param url - URL to the GIF file
 * @returns Promise resolving to GIF metadata
 */
export async function parseGifMetadataFromUrl(url: string): Promise<GifMetadata> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const gif = gifuct.parseGIF(arrayBuffer);
  const frames = gifuct.decompressFrames(gif, true);
  
  const frameDelays: number[] = [];
  let totalDuration = 0;
  
  frames.forEach((frame) => {
    const delay = frame.delay || 10;
    const delayMs = delay * 10;
    frameDelays.push(delayMs);
    totalDuration += delayMs;
  });
  
  let loopCount = 0;
  if (gif.application && gif.application.length > 0) {
    const netscapeExt = gif.application.find((app: any) => 
      app.application && app.application === 'NETSCAPE2.0'
    );
    if (netscapeExt && netscapeExt.data) {
      loopCount = netscapeExt.data[0] | (netscapeExt.data[1] << 8);
    }
  }
  
  return {
    totalDuration,
    frameCount: frames.length,
    loopCount,
    frameDelays
  };
}

/**
 * Determines if a GIF should play once or loop.
 * 
 * @param metadata - GIF metadata
 * @returns True if GIF should play once (loopCount === 1 or totalDuration > 0 with no loops)
 */
export function shouldPlayOnce(metadata: GifMetadata): boolean {
  // If loopCount is 1, play once
  if (metadata.loopCount === 1) {
    return true;
  }
  
  // If loopCount is 0 (infinite), we'll play one cycle
  // If loopCount > 1, we could play that many times, but for slideshow, play once
  return true; // For slideshow purposes, always play one cycle
}

