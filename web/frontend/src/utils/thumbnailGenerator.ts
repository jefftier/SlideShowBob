// Thumbnail generation utility for images and videos
// Implements memory-efficient thumbnail creation with proper cleanup

import { MediaType } from '../types/media';

const THUMBNAIL_SIZE = 150; // Max dimension for thumbnails (reduced for faster processing)
const THUMBNAIL_CACHE_SIZE = 200; // Max cached thumbnails (LRU)
const JPEG_QUALITY = 0.75; // JPEG quality (reduced for faster encoding)

interface CachedThumbnail {
  thumbnailUrl: string;
  lastAccessed: number;
}

// LRU cache for thumbnails
const thumbnailCache = new Map<string, CachedThumbnail>();
const loadingPromises = new Map<string, Promise<string | null>>();

/**
 * Generates a thumbnail for an image file
 * Uses createImageBitmap for faster processing when available
 */
async function generateImageThumbnail(file: File): Promise<string | null> {
  return new Promise(async (resolve) => {
    const objectUrl = URL.createObjectURL(file);
    
    try {
      // Try using createImageBitmap for faster processing (modern browsers)
      let imageBitmap: ImageBitmap | HTMLImageElement;
      let needsCleanup = false;
      
      if ('createImageBitmap' in window) {
        try {
          imageBitmap = await createImageBitmap(file);
          needsCleanup = true;
        } catch {
          // Fallback to Image if createImageBitmap fails
          imageBitmap = await new Promise<HTMLImageElement>((imgResolve, imgReject) => {
            const img = new Image();
            img.onload = () => imgResolve(img);
            img.onerror = imgReject;
            img.src = objectUrl;
          });
        }
      } else {
        // Fallback for older browsers
        imageBitmap = await new Promise<HTMLImageElement>((imgResolve, imgReject) => {
          const img = new Image();
          img.onload = () => imgResolve(img);
          img.onerror = imgReject;
          img.src = objectUrl;
        });
      }
      
      // Calculate dimensions to maintain aspect ratio
      let width = imageBitmap.width;
      let height = imageBitmap.height;
      
      if (width > height) {
        if (width > THUMBNAIL_SIZE) {
          height = (height * THUMBNAIL_SIZE) / width;
          width = THUMBNAIL_SIZE;
        }
      } else {
        if (height > THUMBNAIL_SIZE) {
          width = (width * THUMBNAIL_SIZE) / height;
          height = THUMBNAIL_SIZE;
        }
      }
      
      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: false });
      
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        if (needsCleanup && 'close' in imageBitmap) {
          (imageBitmap as ImageBitmap).close();
        }
        resolve(null);
        return;
      }
      
      ctx.drawImage(imageBitmap, 0, 0, width, height);
      
      // Cleanup imageBitmap if needed
      if (needsCleanup && 'close' in imageBitmap) {
        (imageBitmap as ImageBitmap).close();
      }
      
      // Convert to blob URL
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (blob) {
          const thumbnailUrl = URL.createObjectURL(blob);
          resolve(thumbnailUrl);
        } else {
          resolve(null);
        }
      }, 'image/jpeg', JPEG_QUALITY);
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    }
  });
}

/**
 * Generates a thumbnail for a video file by capturing the first frame
 */
async function generateVideoThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    
    const objectUrl = URL.createObjectURL(file);
    
    video.onloadedmetadata = () => {
      // Seek to first frame (0.1 seconds to ensure frame is available)
      video.currentTime = 0.1;
    };
    
    video.onseeked = () => {
      // Calculate dimensions to maintain aspect ratio
      let width = video.videoWidth;
      let height = video.videoHeight;
      
      if (width === 0 || height === 0) {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
        return;
      }
      
      if (width > height) {
        if (width > THUMBNAIL_SIZE) {
          height = (height * THUMBNAIL_SIZE) / width;
          width = THUMBNAIL_SIZE;
        }
      } else {
        if (height > THUMBNAIL_SIZE) {
          width = (width * THUMBNAIL_SIZE) / height;
          height = THUMBNAIL_SIZE;
        }
      }
      
      // Create canvas and draw video frame
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
        return;
      }
      
      ctx.drawImage(video, 0, 0, width, height);
      
      // Convert to blob URL
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (blob) {
          const thumbnailUrl = URL.createObjectURL(blob);
          resolve(thumbnailUrl);
        } else {
          resolve(null);
        }
      }, 'image/jpeg', JPEG_QUALITY);
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    
    // Set a timeout in case video doesn't load
    setTimeout(() => {
      if (video.readyState < 2) {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      }
    }, 5000);
    
    video.src = objectUrl;
  });
}

/**
 * Enforces cache size limit using LRU eviction
 */
function enforceCacheSize() {
  if (thumbnailCache.size <= THUMBNAIL_CACHE_SIZE) {
    return;
  }
  
  // Sort by lastAccessed and remove oldest entries
  const entries = Array.from(thumbnailCache.entries())
    .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
  
  const toRemove = entries.slice(0, thumbnailCache.size - THUMBNAIL_CACHE_SIZE);
  toRemove.forEach(([key, value]) => {
    URL.revokeObjectURL(value.thumbnailUrl);
    thumbnailCache.delete(key);
  });
}

/**
 * Generates a thumbnail for a media file (image or video)
 * Uses caching to avoid regenerating thumbnails
 */
export async function generateThumbnail(
  file: File,
  filePath: string,
  mediaType: MediaType
): Promise<string | null> {
  // Create cache key from file path
  const cacheKey = filePath;
  
  // Check cache first
  const cached = thumbnailCache.get(cacheKey);
  if (cached) {
    cached.lastAccessed = Date.now();
    return cached.thumbnailUrl;
  }
  
  // Check if already loading
  const existingPromise = loadingPromises.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }
  
  // Create loading promise
  const promise = (async () => {
    try {
      let thumbnailUrl: string | null = null;
      
      if (mediaType === MediaType.Video) {
        thumbnailUrl = await generateVideoThumbnail(file);
      } else {
        // Image or GIF
        thumbnailUrl = await generateImageThumbnail(file);
      }
      
      if (thumbnailUrl) {
        // Cache the result
        thumbnailCache.set(cacheKey, {
          thumbnailUrl,
          lastAccessed: Date.now()
        });
        
        // Only enforce cache size if we're over the limit
        // This prevents unnecessary revocations
        if (thumbnailCache.size > THUMBNAIL_CACHE_SIZE) {
          enforceCacheSize();
        }
      }
      
      loadingPromises.delete(cacheKey);
      return thumbnailUrl;
    } catch (error) {
      console.error(`Error generating thumbnail for ${filePath}:`, error);
      loadingPromises.delete(cacheKey);
      return null;
    }
  })();
  
  loadingPromises.set(cacheKey, promise);
  return promise;
}

/**
 * Revokes a thumbnail URL to free memory
 * Should be called when thumbnail is no longer needed
 */
export function revokeThumbnail(thumbnailUrl: string) {
  try {
    URL.revokeObjectURL(thumbnailUrl);
  } catch (e) {
    // URL may have already been revoked, ignore
  }
  
  // Also remove from cache if it exists
  for (const [key, value] of thumbnailCache.entries()) {
    if (value.thumbnailUrl === thumbnailUrl) {
      thumbnailCache.delete(key);
      break;
    }
  }
}

/**
 * Clears all cached thumbnails and revokes their URLs
 */
export function clearThumbnailCache() {
  thumbnailCache.forEach((cached) => {
    URL.revokeObjectURL(cached.thumbnailUrl);
  });
  thumbnailCache.clear();
  loadingPromises.clear();
}

/**
 * Gets the current cache size
 */
export function getCacheSize(): number {
  return thumbnailCache.size;
}

