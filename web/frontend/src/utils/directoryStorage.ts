// Directory handle persistence using IndexedDB

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

export const saveDirectoryHandle = async (
  folderName: string,
  handle: FileSystemDirectoryHandle
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
      request.onerror = () => reject(new Error('Failed to save directory handle'));
    });
  } catch (error) {
    console.error('Error saving directory handle:', error);
    // If structured clone fails, it means the browser doesn't support it
    // This is expected in some browsers - gracefully handle it
    if (error instanceof DOMException && error.name === 'DataCloneError') {
      console.warn('Directory handle cannot be cloned - browser limitation');
    }
    throw error;
  }
};

export const loadDirectoryHandles = async (): Promise<Map<string, FileSystemDirectoryHandle>> => {
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
            const permission = await item.handle.queryPermission({ mode: 'read' });
            if (permission === 'granted') {
              handles.set(item.folderName, item.handle);
            } else {
              // Permission was revoked, remove from storage
              await removeDirectoryHandle(item.folderName);
            }
          } catch (error) {
            console.warn(`Error checking permission for ${item.folderName}:`, error);
            // Remove invalid handles
            await removeDirectoryHandle(item.folderName);
          }
        });
        
        await Promise.all(permissionChecks);
        resolve();
      };
      
      request.onerror = () => {
        reject(new Error('Failed to load directory handles'));
      };
    });
  } catch (error) {
    console.error('Error loading directory handles:', error);
  }

  return handles;
};

export const removeDirectoryHandle = async (folderName: string): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(folderName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to remove directory handle'));
    });
  } catch (error) {
    console.error('Error removing directory handle:', error);
    throw error;
  }
};

export const clearAllDirectoryHandles = async (): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Failed to clear directory handles'));
    });
  } catch (error) {
    console.error('Error clearing directory handles:', error);
    throw error;
  }
};

// Check if IndexedDB is supported
export const isIndexedDBSupported = (): boolean => {
  return 'indexedDB' in window;
};

