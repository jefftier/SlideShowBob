/**
 * Object URL Registry
 * 
 * Central registry for tracking and revoking object URLs created via URL.createObjectURL().
 * Prevents memory leaks by ensuring all blob URLs are properly revoked when no longer needed.
 * 
 * This registry provides a simple API for tracking URLs at the lifecycle level:
 * - Register URLs when created
 * - Revoke URLs when media items are removed
 * - Revoke all on app unmount
 */

class ObjectUrlRegistry {
  private urls: Set<string> = new Set();

  /**
   * Register an object URL for tracking
   * @param url The object URL to register
   */
  register(url: string): void {
    if (this.urls.has(url)) {
      // Already registered - this is fine, just return
      return;
    }
    this.urls.add(url);
    
    // Dev-only: log registration in development mode
    if (import.meta.env.DEV) {
      console.debug(`[ObjectUrlRegistry] Registered URL (total: ${this.urls.size})`);
    }
  }

  /**
   * Revoke a specific object URL (idempotent)
   * @param url The object URL to revoke
   */
  revoke(url: string): void {
    if (!this.urls.has(url)) {
      // Not registered - safe to ignore (idempotent)
      return;
    }

    try {
      URL.revokeObjectURL(url);
      this.urls.delete(url);
      
      // Dev-only: log revocation in development mode
      if (import.meta.env.DEV) {
        console.debug(`[ObjectUrlRegistry] Revoked URL (remaining: ${this.urls.size})`);
      }
    } catch (error) {
      console.error(`[ObjectUrlRegistry] Error revoking URL:`, error);
      // Still remove from set even if revoke fails
      this.urls.delete(url);
    }
  }

  /**
   * Revoke multiple object URLs at once
   * @param urls Array of object URLs to revoke
   */
  revokeMany(urls: string[]): void {
    urls.forEach(url => this.revoke(url));
  }

  /**
   * Revoke all registered object URLs
   */
  revokeAll(): void {
    const count = this.urls.size;
    const urlsToRevoke = Array.from(this.urls);
    
    urlsToRevoke.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error(`[ObjectUrlRegistry] Error revoking URL during cleanup:`, error);
      }
    });
    
    this.urls.clear();
    
    // Dev-only: log cleanup in development mode
    if (import.meta.env.DEV) {
      console.debug(`[ObjectUrlRegistry] Revoked all ${count} URLs`);
    }
  }

  /**
   * Get the count of tracked URLs (for debugging/monitoring)
   * @returns Number of currently tracked URLs
   */
  getCount(): number {
    return this.urls.size;
  }

  /**
   * Check if a URL is registered
   * @param url The URL to check
   * @returns True if the URL is registered
   */
  has(url: string): boolean {
    return this.urls.has(url);
  }
}

// Singleton instance
export const objectUrlRegistry = new ObjectUrlRegistry();

// Dev-only: Expose registry to window for debugging
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as any).__objectUrlRegistry = {
    getCount: () => objectUrlRegistry.getCount(),
    revokeAll: () => objectUrlRegistry.revokeAll(),
    // Helper to log current state
    debug: () => {
      const count = objectUrlRegistry.getCount();
      console.log(`[ObjectUrlRegistry Debug] Currently tracking ${count} object URL(s)`);
      return count;
    }
  };
  console.log('[ObjectUrlRegistry] Debug helper available: window.__objectUrlRegistry.debug()');
}

// Export type for TypeScript
export type { ObjectUrlRegistry };

