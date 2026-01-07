// Directory handle persistence using IndexedDB

import { isQuotaError } from './storageErrors';
import { logger } from './logger';
import { addEvent } from './eventLog';

// Optional callbacks for error reporting (to avoid tight coupling with React hooks)
export interface StorageErrorCallbacks {
  showError?: (message: string) => void;
  showWarning?: (message: string) => void;
}

const DB_NAME = 'slideshow-db';
const DB_VERSION = 1;
const STORE_NAME = 'directoryHandles';

// Note: FileSystemDirectoryHandle is structured-cloneable and can be stored in IndexedDB
// However, permissions may be revoked, so we verify on load

let dbInstance: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'folderName' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
};

// Track if we've shown errors to avoid spam
let hasShownReadError = false;
let hasShownSaveError = false;
let lastSaveErrorTime = 0;
const SAVE_ERROR_THROTTLE_MS = 5000; // Show save error at most once per 5 seconds

export const saveDirectoryHandle = async (
  folderName: string,
  handle: FileSystemDirectoryHandle,
  callbacks?: StorageErrorCallbacks
): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // FileSystemDirectoryHandle is structured-cloneable and can be stored directly
    const data = {
      folderName,
      handle,
      timestamp: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        const error = request.error || new Error('Failed to save directory handle');
        reject(error);
      };
    });
  } catch (error) {
    console.warn('Error saving directory handle:', error);
    
    // If structured clone fails, it means the browser doesn't support it
    // This is expected in some browsers - gracefully handle it
    if (error instanceof DOMException && error.name === 'DataCloneError') {
      console.warn('Directory handle cannot be cloned - browser limitation');
      // Don't show error for browser limitations
      return;
    }
    
    // Deduplicate save error warnings (at most once per 5 seconds)
    const now = Date.now();
    const shouldShowError = !hasShownSaveError || (now - lastSaveErrorTime) > SAVE_ERROR_THROTTLE_MS;
    
    // Log directoryStorage save failure
    const entry = logger.event('directory_storage_save_failed', {
      folderName,
      error: isQuotaError(error) ? 'quota_error' : 'unknown_error',
      errorMessage: error instanceof Error ? error.message : String(error),
    }, 'error');
    addEvent(entry);
    
    // Handle quota/storage errors
    if (isQuotaError(error)) {
      const message = 'Unable to save folders. Changes may not persist after reload.';
      if (shouldShowError) {
        hasShownSaveError = true;
        lastSaveErrorTime = now;
        // Call callback if provided (backward compatibility)
        if (callbacks?.showError) {
          callbacks.showError(message);
        }
      }
      // Throw friendly error for App.tsx to catch
      throw new Error(message);
    }
    
    // Other errors - show generic message
    const message = 'Unable to save folders. Changes may not persist after reload.';
    if (shouldShowError) {
      hasShownSaveError = true;
      lastSaveErrorTime = now;
      // Call callback if provided (backward compatibility)
      if (callbacks?.showError) {
        callbacks.showError(message);
      }
    }
    // Throw friendly error for App.tsx to catch
    throw new Error(message);
  }
};

export const loadDirectoryHandles = async (callbacks?: StorageErrorCallbacks): Promise<Map<string, FileSystemDirectoryHandle>> => {
  const handles = new Map<string, FileSystemDirectoryHandle>();

  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.getAll();

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = async () => {
        const results = request.result as Array<{ folderName: string; handle: FileSystemDirectoryHandle; timestamp: number }>;
        
        // Verify permissions for each handle
        const permissionChecks = results.map(async (item) => {
          try {
            // Use type assertion for queryPermission (available on FileSystemHandle)
            const handle = item.handle as any;
            if (handle.queryPermission && typeof handle.queryPermission === 'function') {
              const permission = await handle.queryPermission({ mode: 'read' });
              if (permission === 'granted') {
                handles.set(item.folderName, item.handle);
              } else {
                // Permission was revoked, remove from storage (silently - this is cleanup)
                try {
                  await removeDirectoryHandle(item.folderName);
                } catch {
                  // Ignore errors during cleanup of revoked permissions
                }
              }
            } else {
              // queryPermission not available - assume no permission (silently - this is cleanup)
              try {
                await removeDirectoryHandle(item.folderName);
              } catch {
                // Ignore errors during cleanup
              }
            }
          } catch (error) {
            console.warn(`Error checking permission for ${item.folderName}:`, error);
            // Remove invalid handles (silently - this is cleanup)
            try {
              await removeDirectoryHandle(item.folderName);
            } catch {
              // Ignore errors during cleanup
            }
          }
        });
        
        await Promise.all(permissionChecks);
        resolve();
      };
      
      request.onerror = () => {
        const error = request.error || new Error('Failed to load directory handles');
        reject(error);
      };
    });
  } catch (error) {
    console.warn('Error loading directory handles:', error);
    
    // Log directoryStorage load failure
    const entry = logger.event('directory_storage_load_failed', {
      error: 'read_error',
      errorMessage: error instanceof Error ? error.message : String(error),
    }, 'error');
    addEvent(entry);
    
    // Show warning once per session if read fails
    const message = 'Could not load saved folders. Please re-add them.';
    if (!hasShownReadError) {
      hasShownReadError = true;
      // Call callback if provided (backward compatibility)
      if (callbacks?.showWarning) {
        callbacks.showWarning(message);
      }
    }
    
    // Return empty Map (safe fallback) - App.tsx will catch the error we throw
    // Create a custom error that we'll throw, but first return empty handles
    // Actually, we can't return and throw. So we throw, and App.tsx catches and uses empty Map
    // But the requirement says to return empty on failure. Let's throw a special error that App.tsx can handle.
    throw new Error(message);
  }

  return handles;
};

export const removeDirectoryHandle = async (folderName: string, callbacks?: StorageErrorCallbacks): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(folderName);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        const error = request.error || new Error('Failed to remove directory handle');
        reject(error);
      };
    });
  } catch (error) {
    console.warn('Error removing directory handle:', error);
    
    // Throw friendly error for App.tsx to catch (but allow silent failure in cleanup scenarios)
    const message = 'Unable to remove folder from storage.';
    // Call callback if provided (backward compatibility)
    if (callbacks?.showError) {
      callbacks.showError(message);
    }
    // Throw friendly error for App.tsx to catch
    throw new Error(message);
  }
};

export const clearAllDirectoryHandles = async (callbacks?: StorageErrorCallbacks): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => {
        const error = request.error || new Error('Failed to clear directory handles');
        reject(error);
      };
    });
  } catch (error) {
    console.warn('Error clearing directory handles:', error);
    
    // Throw friendly error for App.tsx to catch
    const message = 'Unable to clear saved folders.';
    // Call callback if provided (backward compatibility)
    if (callbacks?.showError) {
      callbacks.showError(message);
    }
    // Throw friendly error for App.tsx to catch
    throw new Error(message);
  }
};

// Check if IndexedDB is supported
export const isIndexedDBSupported = (): boolean => {
  return 'indexedDB' in window;
};

