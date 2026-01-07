import { useCallback } from 'react';
import { MediaItem, determineMediaType } from '../types/media';
import { objectUrlRegistry } from '../utils/objectUrlRegistry';

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
  rootFolderName: string,
  path: string = '',
  onProgress?: (current: number, total: number) => void
): Promise<MediaItem[]> {
  const mediaItems: MediaItem[] = [];
  let totalFiles = 0;
  let processedFiles = 0;

  // First pass: count total files (for progress tracking)
  try {
    for await (const [, handle] of dirHandle.entries()) {
      if (handle.kind === 'file') {
        totalFiles++;
      } else if (handle.kind === 'directory') {
        // Count files in subdirectories recursively
        const subDirHandle = handle as FileSystemDirectoryHandle;
        const subPath = path ? `${path}/${handle.name}` : handle.name;
        const subItems = await scanDirectory(subDirHandle, includeVideos, rootFolderName, subPath);
        totalFiles += subItems.length;
      }
    }
  } catch (error) {
    console.error(`Error counting files in directory ${path}:`, error);
  }

  // Second pass: process files with progress updates
  try {
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === 'file') {
        const fileHandle = handle as FileSystemFileHandle;
        const ext = '.' + name.split('.').pop()?.toLowerCase();
        
        // Separate GIF from other images - GIF should be controlled by includeVideos
        const isGif = ext === '.gif';
        const isImage = IMAGE_EXTENSIONS.includes(ext) && !isGif;
        const isVideo = includeVideos && VIDEO_EXTENSIONS.includes(ext);
        const isGifIncluded = includeVideos && isGif;
        
        if (isImage || isVideo || isGifIncluded) {
          try {
            const file = await fileHandle.getFile();
            const filePath = path ? `${path}/${name}` : name;
            const relativePath = path ? `${path}/${name}` : name;
            const objectUrl = URL.createObjectURL(file);
            
            // Register the object URL immediately to track it for lifecycle management
            objectUrlRegistry.register(objectUrl);
            
            mediaItems.push({
              filePath: filePath,
              fileName: name,
              type: determineMediaType(name),
              dateModified: file.lastModified,
              file: file,
              objectUrl: objectUrl,
              folderName: rootFolderName,
              relativePath: relativePath
            });
          } catch (error) {
            console.warn(`Error reading file ${name}:`, error);
          }
        }
        
        processedFiles++;
        // Update progress every 10 files or on last file
        if (onProgress && (processedFiles % 10 === 0 || processedFiles === totalFiles)) {
          onProgress(processedFiles, totalFiles);
        }
      } else if (handle.kind === 'directory') {
        // Recursively scan subdirectories
        const subDirHandle = handle as FileSystemDirectoryHandle;
        const subPath = path ? `${path}/${name}` : name;
        const subItems = await scanDirectory(subDirHandle, includeVideos, rootFolderName, subPath, onProgress);
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
    includeVideos: boolean,
    onProgress?: (current: number, total: number) => void
  ): Promise<MediaItem[]> => {
    const rootFolderName = dirHandle.name;
    return scanDirectory(dirHandle, includeVideos, rootFolderName, '', onProgress);
  }, []);

  return {
    loadMediaFromFolders,
    loadMediaFromDirectory
  };
}

