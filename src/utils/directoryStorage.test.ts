// Unit tests for IndexedDB schema migration and directory storage functions
// Task 1.3: Tests for schema v2 migration, fullPath index, and backward compatibility
// Requirements: 8.3, 8.4

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

const DB_NAME = 'slideshow-db';
const STORE_NAME = 'directoryHandles';

// Mock the logger and eventLog to prevent import.meta.env issues
vi.mock('./logger', () => ({
  logger: {
    debug: vi.fn(() => ({ timestamp: Date.now(), level: 'debug', event: '' })),
    info: vi.fn(() => ({ timestamp: Date.now(), level: 'info', event: '' })),
    warn: vi.fn(() => ({ timestamp: Date.now(), level: 'warn', event: '' })),
    error: vi.fn(() => ({ timestamp: Date.now(), level: 'error', event: '' })),
    event: vi.fn(() => ({ timestamp: Date.now(), level: 'info', event: '' })),
  },
}));

vi.mock('./eventLog', () => ({
  addEvent: vi.fn(),
}));

/**
 * Create a plain-object mock that is structured-cloneable (fake-indexeddb requirement).
 * We can't use vi.fn() methods because structuredClone fails on functions.
 */
function createCloneableHandle(name: string): FileSystemDirectoryHandle {
  return { kind: 'directory', name } as unknown as FileSystemDirectoryHandle;
}

/** Helper: get a fresh module import (resets cached dbInstance) */
async function freshImport() {
  vi.resetModules();
  // Re-apply mocks after reset
  vi.doMock('./logger', () => ({
    logger: {
      debug: vi.fn(() => ({ timestamp: Date.now(), level: 'debug', event: '' })),
      info: vi.fn(() => ({ timestamp: Date.now(), level: 'info', event: '' })),
      warn: vi.fn(() => ({ timestamp: Date.now(), level: 'warn', event: '' })),
      error: vi.fn(() => ({ timestamp: Date.now(), level: 'error', event: '' })),
      event: vi.fn(() => ({ timestamp: Date.now(), level: 'info', event: '' })),
    },
  }));
  vi.doMock('./eventLog', () => ({
    addEvent: vi.fn(),
  }));

  const mod = await import('./directoryStorage');
  return mod;
}

describe('IndexedDB schema migration (v2)', () => {
  beforeEach(() => {
    // Replace the global indexedDB with a fresh factory for complete isolation
    globalThis.indexedDB = new IDBFactory();
  });

  it('opening DB at version 2 creates the fullPath index', async () => {
    const { saveDirectoryHandle } = await freshImport();

    // Trigger DB open by saving a record
    const handle = createCloneableHandle('TestFolder');
    await saveDirectoryHandle('TestFolder', handle, undefined, '/Users/jeff/TestFolder');

    // Directly open the DB to inspect the schema
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
    expect(store.indexNames.contains('fullPath')).toBe(true);
    expect(store.indexNames.contains('timestamp')).toBe(true);
    db.close();
  });

  it('records saved at version 1 (no fullPath) still load correctly after migration', async () => {
    // Step 1: Create a version 1 database with a record (no fullPath)
    const dbV1 = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'folderName' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // Save a legacy record without fullPath
    const handle = createCloneableHandle('LegacyFolder');
    await new Promise<void>((resolve, reject) => {
      const tx = dbV1.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ folderName: 'LegacyFolder', handle, timestamp: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    dbV1.close();

    // Step 2: Open via the module (which upgrades to v2) and verify the record loads
    const { loadDirectoryHandleByFolderName } = await freshImport();
    const record = await loadDirectoryHandleByFolderName('LegacyFolder');

    expect(record).not.toBeNull();
    expect(record!.folderName).toBe('LegacyFolder');
    expect(record!.handle).toBeDefined();
    expect(record!.fullPath).toBeUndefined();
  });

  it('loadDirectoryHandleByFullPath returns the correct record', async () => {
    const { saveDirectoryHandle, loadDirectoryHandleByFullPath } = await freshImport();

    const handle = createCloneableHandle('Photos');
    const fullPath = '/Users/jeff/Pictures/Photos';
    await saveDirectoryHandle('Photos', handle, undefined, fullPath);

    const record = await loadDirectoryHandleByFullPath(fullPath);

    expect(record).not.toBeNull();
    expect(record!.folderName).toBe('Photos');
    expect(record!.fullPath).toBe(fullPath);
    expect(record!.handle.name).toBe('Photos');
  });

  it('loadDirectoryHandleByFullPath returns null when no match', async () => {
    const { saveDirectoryHandle, loadDirectoryHandleByFullPath } = await freshImport();

    const handle = createCloneableHandle('Photos');
    await saveDirectoryHandle('Photos', handle, undefined, '/Users/jeff/Pictures/Photos');

    const record = await loadDirectoryHandleByFullPath('/nonexistent/path');
    expect(record).toBeNull();
  });

  it('loadDirectoryHandleByFolderName still works for legacy records (no fullPath)', async () => {
    const { saveDirectoryHandle, loadDirectoryHandleByFolderName } = await freshImport();

    // Save a record without fullPath (simulates legacy behavior)
    const handle = createCloneableHandle('OldFolder');
    await saveDirectoryHandle('OldFolder', handle);

    const record = await loadDirectoryHandleByFolderName('OldFolder');

    expect(record).not.toBeNull();
    expect(record!.folderName).toBe('OldFolder');
    expect(record!.handle.name).toBe('OldFolder');
    // fullPath is undefined for legacy records
    expect(record!.fullPath).toBeUndefined();
  });

  it('loadDirectoryHandleByFolderName returns null for non-existent folder', async () => {
    const { loadDirectoryHandleByFolderName } = await freshImport();

    const record = await loadDirectoryHandleByFolderName('NonExistent');
    expect(record).toBeNull();
  });

  it('saveDirectoryHandle stores fullPath when provided', async () => {
    const { saveDirectoryHandle, loadDirectoryHandleByFullPath, loadDirectoryHandleByFolderName } =
      await freshImport();

    const handle = createCloneableHandle('Vacation');
    const fullPath = '/Users/jeff/Pictures/Vacation';
    await saveDirectoryHandle('Vacation', handle, undefined, fullPath);

    // Verify via fullPath index
    const byPath = await loadDirectoryHandleByFullPath(fullPath);
    expect(byPath).not.toBeNull();
    expect(byPath!.fullPath).toBe(fullPath);

    // Also accessible by folderName
    const byName = await loadDirectoryHandleByFolderName('Vacation');
    expect(byName).not.toBeNull();
    expect(byName!.fullPath).toBe(fullPath);
  });

  it('saveDirectoryHandle omits fullPath when not provided', async () => {
    const { saveDirectoryHandle, loadDirectoryHandleByFolderName } = await freshImport();

    const handle = createCloneableHandle('SimpleFolder');
    await saveDirectoryHandle('SimpleFolder', handle);

    const record = await loadDirectoryHandleByFolderName('SimpleFolder');
    expect(record).not.toBeNull();
    expect(record!.folderName).toBe('SimpleFolder');
    expect(record!.fullPath).toBeUndefined();
  });
});
