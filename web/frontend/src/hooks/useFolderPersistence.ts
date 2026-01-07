import { useState, useCallback } from 'react';
import type React from 'react';
import { 
  loadDirectoryHandles, 
  saveDirectoryHandle, 
  removeDirectoryHandle, 
  clearAllDirectoryHandles, 
  isIndexedDBSupported 
} from '../utils/directoryStorage';
// hasReadPermission is used by App.tsx, not needed here
import { logger } from '../utils/logger';
import { addEvent } from '../utils/eventLog';
import { MediaItem } from '../types/media';

export interface UseFolderPersistenceCallbacks {
  showError: (message: string) => void;
  showWarning: (message: string) => void;
  revokeUrlsForMediaItems: (items: MediaItem[]) => void;
}

export interface UseFolderPersistenceResult {
  directoryHandles: Map<string, FileSystemDirectoryHandle>;
  folders: string[];
  setFolders: React.Dispatch<React.SetStateAction<string[]>>;
  loadFolders: (saveFoldersEnabled: boolean) => Promise<Map<string, FileSystemDirectoryHandle>>;
  persistFolder: (folderName: string, handle: FileSystemDirectoryHandle, saveFoldersEnabled: boolean) => Promise<void>;
  removeFolder: (folderName: string) => Promise<void>;
  handleRevokedFolder: (folderName: string, playlist: MediaItem[]) => Promise<MediaItem[]>;
  clearAllFolders: () => Promise<void>;
}

/**
 * Hook for managing folder persistence and revoked folder handling.
 * 
 * Responsibilities:
 * - Loading/saving directory handles (directoryStorage)
 * - Handling persistence errors (PR9b)
 * - Handling revoked permission folder removal (PR8a)
 */
export const useFolderPersistence = (
  callbacks: UseFolderPersistenceCallbacks
): UseFolderPersistenceResult => {
  const { showError, showWarning, revokeUrlsForMediaItems } = callbacks;
  
  const [directoryHandles, setDirectoryHandles] = useState<Map<string, FileSystemDirectoryHandle>>(new Map());
  const [folders, setFolders] = useState<string[]>([]);

  /**
   * Load saved folders from IndexedDB
   * @param saveFoldersEnabled Whether folder saving is enabled in settings
   * @returns Map of folder names to directory handles
   */
  const loadFolders = useCallback(async (saveFoldersEnabled: boolean): Promise<Map<string, FileSystemDirectoryHandle>> => {
    if (!saveFoldersEnabled || !isIndexedDBSupported()) {
      // If saveFolders is disabled, clear any existing saved folders
      if (!saveFoldersEnabled && isIndexedDBSupported()) {
        try {
          await clearAllDirectoryHandles({ showError, showWarning });
        } catch (error) {
          // Error already shown by clearAllDirectoryHandles via toast
          const errorMessage = error instanceof Error ? error.message : 'Unable to clear saved folders.';
          showError(errorMessage);
        }
      }
      setDirectoryHandles(new Map());
      setFolders([]);
      return new Map();
    }

    try {
      const handles = await loadDirectoryHandles({ showError, showWarning });
      setDirectoryHandles(handles);
      
      // Extract folder names
      const folderNames = Array.from(handles.keys());
      setFolders(folderNames);
      
      return handles;
    } catch (error) {
      // Error loading directory handles - show toast and use empty state
      const errorMessage = error instanceof Error ? error.message : 'Could not load saved folders. Please re-add them.';
      showWarning(errorMessage);
      // Use empty state (safe fallback)
      setDirectoryHandles(new Map());
      setFolders([]);
      return new Map();
    }
  }, [showError, showWarning]);

  /**
   * Persist a folder handle to IndexedDB
   * @param folderName Name of the folder
   * @param handle Directory handle to save
   * @param saveFoldersEnabled Whether folder saving is enabled in settings
   */
  const persistFolder = useCallback(async (
    folderName: string,
    handle: FileSystemDirectoryHandle,
    saveFoldersEnabled: boolean
  ): Promise<void> => {
    // Store directory handle in state
    setDirectoryHandles(prev => {
      const newHandles = new Map(prev);
      newHandles.set(folderName, handle);
      return newHandles;
    });

    // Add folder name to folders list if not already present
    setFolders(prev => {
      if (!prev.includes(folderName)) {
        return [...prev, folderName];
      }
      return prev;
    });

    // Persist directory handle to IndexedDB (only if saveFolders is enabled)
    if (saveFoldersEnabled && isIndexedDBSupported()) {
      try {
        await saveDirectoryHandle(folderName, handle, { showError, showWarning });
      } catch (error) {
        // Error already shown by saveDirectoryHandle via toast
        // Continue with in-memory state even if IDB save failed
        console.warn('Error saving directory handle:', error);
      }
    }
  }, [showError, showWarning]);

  /**
   * Remove a folder handle from state and IndexedDB
   * @param folderName Name of the folder to remove
   */
  const removeFolder = useCallback(async (folderName: string): Promise<void> => {
    // Remove folder from folders list
    setFolders(prev => prev.filter(f => f !== folderName));
    
    // Remove directory handle from state
    setDirectoryHandles(prev => {
      const newHandles = new Map(prev);
      newHandles.delete(folderName);
      return newHandles;
    });
    
    // Remove directory handle from IndexedDB (if saveFolders is enabled, or just to clean up)
    if (isIndexedDBSupported()) {
      try {
        await removeDirectoryHandle(folderName, { showError, showWarning });
      } catch (error) {
        // Error already shown by removeDirectoryHandle via toast
        // Continue with removal from UI state even if IDB removal failed
        console.warn('Error removing directory handle from storage:', error);
      }
    }
  }, [showError, showWarning]);

  /**
   * Handle a folder with revoked permissions.
   * Removes the folder from state and storage, revokes URLs for media items,
   * and returns the media items that were in that folder.
   * 
   * @param folderName Name of the folder with revoked permissions
   * @param playlist Current playlist to find media items in the revoked folder
   * @returns Array of media items that were in the revoked folder (for playlist cleanup)
   */
  const handleRevokedFolder = useCallback(async (folderName: string, playlist: MediaItem[]): Promise<MediaItem[]> => {
    // Log folder permission revoked removal
    const entry = logger.event('folder_permission_revoked_removal', {
      folderName,
    }, 'warn');
    addEvent(entry);
    
    // Remove folder from folders list
    setFolders(prev => prev.filter(f => f !== folderName));
    
    // Remove directory handle from state
    setDirectoryHandles(prev => {
      const newHandles = new Map(prev);
      newHandles.delete(folderName);
      return newHandles;
    });
    
    // Remove directory handle from IndexedDB
    if (isIndexedDBSupported()) {
      try {
        await removeDirectoryHandle(folderName, { showError, showWarning });
      } catch (error) {
        // Error already shown by removeDirectoryHandle via toast
        // Continue with removal from UI state even if IDB removal failed
        console.warn('Error removing directory handle from storage:', error);
      }
    }
    
    // Find all files from that folder and revoke their URLs
    const filesInFolder = playlist.filter(item => item.folderName === folderName);
    
    // Revoke object URLs for all files in the folder
    if (filesInFolder.length > 0) {
      revokeUrlsForMediaItems(filesInFolder);
    }
    
    // Show toast notification
    showError(`Folder access revoked. Removed "${folderName}". Please re-add.`);
    
    // Return the media items that were in the revoked folder (for playlist cleanup in App.tsx)
    return filesInFolder;
  }, [showError, showWarning, revokeUrlsForMediaItems]);

  /**
   * Clear all folder handles from state and IndexedDB
   */
  const clearAllFolders = useCallback(async (): Promise<void> => {
    setDirectoryHandles(new Map());
    setFolders([]);
    
    if (isIndexedDBSupported()) {
      try {
        await clearAllDirectoryHandles({ showError, showWarning });
      } catch (error) {
        // Error already shown by clearAllDirectoryHandles via toast
        console.warn('Error clearing directory handles:', error);
      }
    }
  }, [showError, showWarning]);

  return {
    directoryHandles,
    folders,
    setFolders,
    loadFolders,
    persistFolder,
    removeFolder,
    handleRevokedFolder,
    clearAllFolders,
  };
};

