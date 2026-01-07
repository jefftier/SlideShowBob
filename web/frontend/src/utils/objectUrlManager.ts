/**
 * Centralized Object URL Manager
 * 
 * Tracks and manages all object URLs created via URL.createObjectURL() to prevent memory leaks.
 * Every URL.createObjectURL() call should be registered here, and URLs should be revoked
 * when media items are removed from the playlist, folders are removed, or the app unmounts.
 */

interface ObjectUrlEntry {
  url: string;
  mediaItem: {
    filePath: string;
    fileName: string;
    folderName?: string;
  };
  createdAt: number;
}

class ObjectUrlManager {
  private urls: Map<string, ObjectUrlEntry> = new Map();
  private readonly MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Register an object URL for a media item
   * @param url The object URL created via URL.createObjectURL()
   * @param mediaItem The media item this URL belongs to
   * @returns The registered URL
   */
  register(url: string, mediaItem: { filePath: string; fileName: string; folderName?: string }): string {
    // If URL already exists, don't register again (shouldn't happen, but be safe)
    if (this.urls.has(url)) {
      console.warn(`Object URL already registered: ${url}`);
      return url;
    }

    this.urls.set(url, {
      url,
      mediaItem,
      createdAt: Date.now()
    });

    return url;
  }

  /**
   * Revoke a specific object URL
   * @param url The object URL to revoke
   */
  revoke(url: string): void {
    if (this.urls.has(url)) {
      try {
        URL.revokeObjectURL(url);
        this.urls.delete(url);
      } catch (error) {
        console.error(`Error revoking object URL ${url}:`, error);
        // Still remove from map even if revoke fails
        this.urls.delete(url);
      }
    }
  }

  /**
   * Revoke all object URLs for a specific media item (by file path)
   * @param filePath The file path of the media item
   */
  revokeForMediaItem(filePath: string): void {
    const entriesToRevoke: string[] = [];
    
    for (const [url, entry] of this.urls.entries()) {
      if (entry.mediaItem.filePath === filePath) {
        entriesToRevoke.push(url);
      }
    }

    entriesToRevoke.forEach(url => this.revoke(url));
  }

  /**
   * Revoke all object URLs for media items in a specific folder
   * @param folderName The folder name
   */
  revokeForFolder(folderName: string): void {
    const entriesToRevoke: string[] = [];
    
    for (const [url, entry] of this.urls.entries()) {
      if (entry.mediaItem.folderName === folderName) {
        entriesToRevoke.push(url);
      }
    }

    entriesToRevoke.forEach(url => this.revoke(url));
  }

  /**
   * Revoke all object URLs for a list of media items
   * @param mediaItems Array of media items to revoke URLs for
   */
  revokeForMediaItems(mediaItems: Array<{ filePath: string }>): void {
    const filePaths = new Set(mediaItems.map(item => item.filePath));
    const entriesToRevoke: string[] = [];
    
    for (const [url, entry] of this.urls.entries()) {
      if (filePaths.has(entry.mediaItem.filePath)) {
        entriesToRevoke.push(url);
      }
    }

    entriesToRevoke.forEach(url => this.revoke(url));
  }

  /**
   * Revoke all registered object URLs
   */
  revokeAll(): void {
    const urlsToRevoke = Array.from(this.urls.keys());
    urlsToRevoke.forEach(url => this.revoke(url));
  }

  /**
   * Get the number of registered URLs (for debugging/monitoring)
   */
  getCount(): number {
    return this.urls.size;
  }

  /**
   * Get all registered URLs (for debugging)
   */
  getAllUrls(): string[] {
    return Array.from(this.urls.keys());
  }

  /**
   * Clean up stale URLs (older than MAX_AGE_MS)
   * This is a safety mechanism in case URLs weren't properly revoked
   */
  cleanupStale(): void {
    const now = Date.now();
    const entriesToRevoke: string[] = [];
    
    for (const [url, entry] of this.urls.entries()) {
      if (now - entry.createdAt > this.MAX_AGE_MS) {
        entriesToRevoke.push(url);
      }
    }

    if (entriesToRevoke.length > 0) {
      console.warn(`Cleaning up ${entriesToRevoke.length} stale object URLs`);
      entriesToRevoke.forEach(url => this.revoke(url));
    }
  }

  /**
   * Check if a URL is registered
   */
  has(url: string): boolean {
    return this.urls.has(url);
  }
}

// Singleton instance
export const objectUrlManager = new ObjectUrlManager();

// Cleanup stale URLs periodically (every 5 minutes)
if (typeof window !== 'undefined') {
  setInterval(() => {
    objectUrlManager.cleanupStale();
  }, 5 * 60 * 1000);
}

// Cleanup all URLs on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    objectUrlManager.revokeAll();
  });
}

