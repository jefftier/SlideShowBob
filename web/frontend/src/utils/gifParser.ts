/**
 * GIF Parser Utility
 * 
 * Parses animated GIF files to extract frame information, duration, and loop count.
 * This enables accurate detection of when a GIF animation completes.
 * 
 * Now uses the built-from-scratch GIF player module instead of external dependencies.
 */

import { GifParser, GifMetadata as FullGifMetadata } from './gifPlayer';

/**
 * Backward-compatible metadata interface matching the old API
 */
export interface GifMetadata {
  totalDuration: number; // Total duration in milliseconds
  frameCount: number;
  loopCount: number; // 0 = infinite, >0 = number of loops
  frameDelays: number[]; // Delay for each frame in milliseconds
}

/**
 * Converts full metadata from gifPlayer to backward-compatible format
 */
function convertMetadata(fullMetadata: FullGifMetadata): GifMetadata {
  return {
    totalDuration: fullMetadata.totalDuration,
    frameCount: fullMetadata.frameCount,
    loopCount: fullMetadata.loopCount,
    frameDelays: fullMetadata.frameDelays
  };
}

/**
 * Parses a GIF file and extracts metadata including duration and frame information.
 * Uses the built-from-scratch GIF parser module.
 * 
 * @param file - The GIF file to parse
 * @returns Promise resolving to GIF metadata
 */
export async function parseGifMetadata(file: File): Promise<GifMetadata> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const parser = new GifParser(new Uint8Array(arrayBuffer));
    const fullMetadata = parser.parse();
    return convertMetadata(fullMetadata);
  } catch (error) {
    console.error('Error parsing GIF metadata:', error);
    throw error;
  }
}

/**
 * Parses a GIF from a URL (object URL or data URL).
 * Uses the built-from-scratch GIF parser module.
 * 
 * @param url - URL to the GIF file
 * @returns Promise resolving to GIF metadata
 */
export async function parseGifMetadataFromUrl(url: string): Promise<GifMetadata> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch GIF: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const parser = new GifParser(new Uint8Array(arrayBuffer));
    const fullMetadata = parser.parse();
    return convertMetadata(fullMetadata);
  } catch (error) {
    console.error('Error parsing GIF metadata from URL:', error);
    throw error;
  }
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

