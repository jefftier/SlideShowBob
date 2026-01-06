import { useCallback } from 'react';
import { MediaItem, determineMediaType } from '../types/media';

// Supported image extensions
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.tif', '.tiff', '.webp', '.gif'];
// Supported video extensions
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.wmv'];

interface FileSystemDirectoryHandle {
  name: string;
  kind: 'directory';
  getFileHandle(name: string): Promise<FileSystemFileHandle>;
  keys(): AsyncIterableIterator<string>;
  values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
  entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
}

interface FileSystemFileHandle {
  name: string;
  kind: 'file';
  getFile(): Promise<File>;
}

async function scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
  includeVideos: boolean,
  path: string = ''
): Promise<MediaItem[]> {
  const mediaItems: MediaItem[] = [];

  try {
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === 'file') {
        const fileHandle = handle as FileSystemFileHandle;
        const ext = '.' + name.split('.').pop()?.toLowerCase();
        
        const isImage = IMAGE_EXTENSIONS.includes(ext);
        const isVideo = includeVideos && VIDEO_EXTENSIONS.includes(ext);
        
        if (isImage || isVideo) {
          try {
            const file = await fileHandle.getFile();
            const filePath = path ? `${path}/${name}` : name;
            const objectUrl = URL.createObjectURL(file);
            
            mediaItems.push({
              filePath: filePath,
              fileName: name,
              type: determineMediaType(name),
              dateModified: file.lastModified,
              file: file,
              objectUrl: objectUrl
            });
          } catch (error) {
            console.warn(`Error reading file ${name}:`, error);
          }
        }
      } else if (handle.kind === 'directory') {
        // Recursively scan subdirectories
        const subDirHandle = handle as FileSystemDirectoryHandle;
        const subPath = path ? `${path}/${name}` : name;
        const subItems = await scanDirectory(subDirHandle, includeVideos, subPath);
        mediaItems.push(...subItems);
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${path}:`, error);
  }

  return mediaItems;
}

export function useMediaLoader() {
  const loadMediaFromFolders = useCallback(async (
    folderPaths: string[],
    includeVideos: boolean
  ): Promise<MediaItem[]> => {
    const mediaItems: MediaItem[] = [];

    // For web, we need to use File System Access API
    // Since folderPaths are just names, we'll need to prompt for directory access
    // In a production app, you'd store directory handles in IndexedDB for persistence
    
    if (!('showDirectoryPicker' in window)) {
      throw new Error('File System Access API is not supported in this browser. Please use Chrome, Edge, or another modern browser.');
    }

    try {
      // For now, we'll prompt for a directory if folders are provided
      // In a real implementation, you'd store and reuse directory handles
      if (folderPaths.length > 0) {
        // Note: This is a simplified implementation
        // In production, you'd want to:
        // 1. Store directory handles in IndexedDB
        // 2. Request permission to access previously selected directories
        // 3. Use the stored handles to scan files
        
        // For now, we'll need to prompt for directory access each time
        // This is a limitation of the File System Access API
        console.log('Note: File System Access API requires user interaction to access directories');
        console.log('In production, directory handles should be stored and reused');
      }
    } catch (error) {
      console.error('Error loading media:', error);
      throw error;
    }

    return mediaItems;
  }, []);

  const loadMediaFromDirectory = useCallback(async (
    dirHandle: FileSystemDirectoryHandle,
    includeVideos: boolean
  ): Promise<MediaItem[]> => {
    return scanDirectory(dirHandle, includeVideos);
  }, []);

  return {
    loadMediaFromFolders,
    loadMediaFromDirectory
  };
}

