import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import MediaDisplay from './components/MediaDisplay';
import Toolbar from './components/Toolbar';
import PlaylistWindow from './components/PlaylistWindow';
import SettingsWindow from './components/SettingsWindow';
import ToastContainer from './components/ToastContainer';
import KeyboardShortcutsHelp from './components/KeyboardShortcutsHelp';
import ProgressIndicator from './components/ProgressIndicator';
import ManifestModeDialog from './components/ManifestModeDialog';
import ManifestSelectionDialog from './components/ManifestSelectionDialog';
import { useSlideshow } from './hooks/useSlideshow';
import { useMediaLoader } from './hooks/useMediaLoader';
import { useToast } from './hooks/useToast';
import { MediaItem, MediaType } from './types/media';
import { SlideshowManifest } from './types/manifest';
import { loadSettings, saveSettings, AppSettings } from './utils/settingsStorage';
import { loadDirectoryHandles, saveDirectoryHandle, removeDirectoryHandle, clearAllDirectoryHandles, isIndexedDBSupported } from './utils/directoryStorage';
import { findManifestFiles, loadManifestFile, matchManifestToMedia } from './utils/manifestLoader';
import { objectUrlRegistry } from './utils/objectUrlRegistry';
import './App.css';

function App() {
  const [folders, setFolders] = useState<string[]>([]);
  const [currentMedia, setCurrentMedia] = useState<MediaItem | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [includeVideos, setIncludeVideos] = useState(true);
  const [directoryHandles, setDirectoryHandles] = useState<Map<string, any>>(new Map());
  const [slideDelayMs, setSlideDelayMs] = useState(2000);
  const [zoomFactor, setZoomFactor] = useState(1.0);
  const [effectiveZoom, setEffectiveZoom] = useState(1.0);
  const [isFitToWindow, setIsFitToWindow] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sortMode, setSortMode] = useState<'NameAZ' | 'NameZA' | 'DateOldest' | 'DateNewest' | 'Random'>('NameAZ');
  const [playlist, setPlaylist] = useState<MediaItem[]>([]);
  const [statusText, setStatusText] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<{current: number, total: number} | null>(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [isManifestMode, setIsManifestMode] = useState(false);
  const [manifestData, setManifestData] = useState<SlideshowManifest | null>(null);
  const [showManifestDialog, setShowManifestDialog] = useState(false);
  const [showManifestSelection, setShowManifestSelection] = useState(false);
  const [pendingManifestData, setPendingManifestData] = useState<{
    manifest: SlideshowManifest;
    fileName: string;
    mediaItems: MediaItem[];
    missingFiles: string[];
  } | null>(null);
  const [pendingManifestFiles, setPendingManifestFiles] = useState<Array<{
    name: string;
    itemCount: number;
    manifest: SlideshowManifest;
    fileName: string;
  }>>([]);
  const [pendingManifestContext, setPendingManifestContext] = useState<{
    dirHandle: FileSystemDirectoryHandle;
    folderName: string;
    mediaItems: MediaItem[];
  } | null>(null);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const cursorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toasts, showSuccess, showError, showInfo, showWarning, removeToast } = useToast();

  // Get filtered playlist based on includeVideos (excludes both Video and Gif when false)
  const filteredPlaylist = useMemo(() => {
    return includeVideos 
      ? playlist 
      : playlist.filter(item => item.type !== MediaType.Video && item.type !== MediaType.Gif);
  }, [playlist, includeVideos]);

  // Find the current index in the filtered playlist
  const filteredCurrentIndex = useMemo(() => {
    if (currentIndex < 0 || !currentMedia) return -1;
    return filteredPlaylist.findIndex(item => item.filePath === currentMedia.filePath);
  }, [currentIndex, currentMedia, filteredPlaylist]);

  // Stable navigate callback to prevent unnecessary re-renders
  const handleNavigate = useCallback((index: number) => {
    if (index >= 0 && index < filteredPlaylist.length) {
      const item = filteredPlaylist[index];
      // Find the actual index in the full playlist
      const actualIndex = playlist.findIndex(p => p.filePath === item.filePath);
      setCurrentIndex(actualIndex);
      setCurrentMedia(item);
    }
  }, [filteredPlaylist, playlist]);

  // Calculate effective delay for current item (uses manifest delay if available)
  const effectiveDelay = useMemo(() => {
    if (isManifestMode && currentMedia && (currentMedia as any).manifestDelay !== undefined) {
      return (currentMedia as any).manifestDelay;
    }
    if (isManifestMode && manifestData?.defaultDelay !== undefined) {
      return manifestData.defaultDelay;
    }
    return slideDelayMs;
  }, [isManifestMode, currentMedia, manifestData, slideDelayMs]);

  const { navigateNext, navigatePrevious, startSlideshow, stopSlideshow, onVideoEnded } = useSlideshow({
    playlist: filteredPlaylist,
    currentIndex: filteredCurrentIndex,
    slideDelayMs: effectiveDelay,
    isPlaying,
    onNavigate: handleNavigate
  });

  const { loadMediaFromFolders, loadMediaFromDirectory } = useMediaLoader();

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      // Revoke all object URLs when component unmounts
      objectUrlRegistry.revokeAll();
    };
  }, []);

  // Load settings and directory handles on mount
  useEffect(() => {
    const initializeApp = async () => {
      setIsLoading(true);
      
      try {
        // Load settings from localStorage
        const savedSettings = loadSettings();
        if (savedSettings.saveSlideDelay) {
          setSlideDelayMs(savedSettings.slideDelayMs);
        }
        if (savedSettings.saveIncludeVideos) {
          setIncludeVideos(savedSettings.includeVideos);
        }
        if (savedSettings.saveSortMode) {
          setSortMode(savedSettings.sortMode);
        }
        if (savedSettings.saveIsMuted) {
          setIsMuted(savedSettings.isMuted);
        }
        if (savedSettings.saveIsFitToWindow) {
          setIsFitToWindow(savedSettings.isFitToWindow);
        }
        if (savedSettings.saveZoomFactor) {
          setZoomFactor(savedSettings.zoomFactor);
        }

        // Load directory handles from IndexedDB (only if saveFolders is enabled)
        if (savedSettings.saveFolders && isIndexedDBSupported()) {
          try {
            const handles = await loadDirectoryHandles();
            setDirectoryHandles(handles);
            
            // Extract folder names
            const folderNames = Array.from(handles.keys());
            setFolders(folderNames);
            
            // Reload media from persisted folders
            if (handles.size > 0) {
              setStatusText('Loading folders...');
              const allMediaItems: MediaItem[] = [];
              
              for (const [folderName, handle] of handles.entries()) {
                try {
                  const mediaItems = await loadMediaFromDirectory(handle, savedSettings.includeVideos);
                  allMediaItems.push(...mediaItems);
                } catch (error) {
                  console.error(`Error loading folder ${folderName}:`, error);
                  // Remove invalid handle
                  await removeDirectoryHandle(folderName);
                }
              }
              
              if (allMediaItems.length > 0) {
                const sortedItems = sortMediaItems(allMediaItems, savedSettings.sortMode);
                setPlaylist(sortedItems);
                setCurrentIndex(0);
                setCurrentMedia(sortedItems[0]);
              }
              
              setStatusText('');
            }
          } catch (error) {
            console.error('Error loading directory handles:', error);
          }
        } else if (!savedSettings.saveFolders && isIndexedDBSupported()) {
          // If saveFolders is disabled, clear any existing saved folders
          try {
            await clearAllDirectoryHandles();
          } catch (error) {
            console.error('Error clearing directory handles:', error);
          }
        }
      } catch (error) {
        console.error('Error initializing app:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []); // Only run on mount

  // Removed handleLoadFolders - now handled directly in handleAddFolder
  // In production, you'd implement a system to store and restore directory handles

  const sortMediaItems = (items: MediaItem[], mode: string): MediaItem[] => {
    // Create a deep copy to ensure React detects the change
    const sorted = [...items];
    switch (mode) {
      case 'NameAZ':
        sorted.sort((a, b) => a.fileName.localeCompare(b.fileName));
        break;
      case 'NameZA':
        sorted.sort((a, b) => b.fileName.localeCompare(a.fileName));
        break;
      case 'DateOldest':
        sorted.sort((a, b) => (a.dateModified || 0) - (b.dateModified || 0));
        break;
      case 'DateNewest':
        sorted.sort((a, b) => (b.dateModified || 0) - (a.dateModified || 0));
        break;
      case 'Random':
        // For random, use a better shuffle algorithm
        for (let i = sorted.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
        }
        break;
      default:
        break;
    }
    return sorted;
  };

  const handleAddFolder = async () => {
    try {
      // Use File System Access API
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker();
        const folderName = dirHandle.name;
        
        // Check if folder already exists
        if (folders.includes(folderName)) {
          showWarning(`Folder "${folderName}" is already in your playlist`);
          return;
        }
        
        setIsLoadingFolders(true);
        setStatusText(`Loading "${folderName}"...`);
        setLoadingProgress({ current: 0, total: 0 });
        showInfo(`Scanning folder "${folderName}"...`);
        
        try {
          // Check for manifest files first
          const manifestFiles = await findManifestFiles(dirHandle);
          console.log('Found manifest files:', manifestFiles.map(f => f.name));
          
          if (manifestFiles.length > 0) {
            // Load and validate all manifest files
            const manifestResults = await Promise.all(
              manifestFiles.map(async (file) => {
                const result = await loadManifestFile(file.handle);
                console.log(`Manifest ${file.name} validation:`, result.valid ? 'valid' : result.error);
                return { ...result, fileName: file.name };
              })
            );
            
            const validManifests = manifestResults.filter(r => r.valid && r.manifest);
            console.log('Valid manifests:', validManifests.length);
            console.log('All manifest results:', manifestResults);
            
            if (validManifests.length === 0) {
              // No valid manifests, continue with normal loading
              const errors = manifestResults.map(r => `${r.fileName || 'unknown'}: ${r.error || 'Unknown error'}`).filter(Boolean);
              console.error('Manifest validation failed:', errors);
              if (errors.length > 0) {
                showError(`Manifest file(s) found but invalid: ${errors.join('; ')}. Loading folder normally.`);
              }
            } else if (validManifests.length === 1) {
              // Single manifest - load media and show dialog
              const manifestResult = validManifests[0];
              const mediaItems = await loadMediaFromDirectory(dirHandle, includeVideos, (current, total) => {
                setLoadingProgress({ current, total });
                setStatusText(`Loading "${folderName}"... (${current.toLocaleString()} / ${total.toLocaleString()} files)`);
              });
              
              if (mediaItems.length === 0) {
                showWarning(`No media files found in "${folderName}"`);
                setIsLoadingFolders(false);
                setStatusText('');
                return;
              }
              
              // Match manifest to media
              const { matched, missing } = matchManifestToMedia(
                manifestResult.manifest!,
                mediaItems,
                folderName
              );
              
              if (matched.length === 0) {
                showWarning('Manifest found but no files matched. Loading folder normally.');
                // Continue with normal loading below
              } else {
                // Store pending manifest data and show dialog
                setPendingManifestData({
                  manifest: manifestResult.manifest!,
                  fileName: manifestResult.fileName || 'manifest.json',
                  mediaItems: matched,
                  missingFiles: missing
                });
                setIsLoadingFolders(false);
                setStatusText('');
                setLoadingProgress(null);
                setShowManifestDialog(true);
                return; // Exit early, will continue in dialog handler
              }
            } else {
              // Multiple manifests - show selection dialog
              const mediaItems = await loadMediaFromDirectory(dirHandle, includeVideos);
              const manifestOptions = await Promise.all(
                validManifests.map(async (result) => {
                  const { matched } = matchManifestToMedia(result.manifest!, mediaItems, folderName);
                  return {
                    name: result.fileName || 'manifest.json',
                    itemCount: matched.length,
                    manifest: result.manifest!,
                    fileName: result.fileName || 'manifest.json'
                  };
                })
              );
              
              // Store context for when user selects a manifest
              setPendingManifestContext({
                dirHandle,
                folderName,
                mediaItems
              });
              
              setPendingManifestFiles(manifestOptions);
              setIsLoadingFolders(false);
              setStatusText('');
              setLoadingProgress(null);
              setShowManifestSelection(true);
              return; // Exit early, will continue in selection handler
            }
          }
          
          // Normal folder loading (no manifest or manifest ignored)
          const mediaItems = await loadMediaFromDirectory(dirHandle, includeVideos, (current, total) => {
            setLoadingProgress({ current, total });
            setStatusText(`Loading "${folderName}"... (${current.toLocaleString()} / ${total.toLocaleString()} files)`);
          });
          
          if (mediaItems.length === 0) {
            showWarning(`No media files found in "${folderName}"`);
            setIsLoadingFolders(false);
            setStatusText('');
            return;
          }
          
          // Store directory handle in state
          const newHandles = new Map(directoryHandles);
          newHandles.set(folderName, dirHandle);
          setDirectoryHandles(newHandles);
          
          // Persist directory handle to IndexedDB (only if saveFolders is enabled)
          const currentSettings = loadSettings();
          if (currentSettings.saveFolders && isIndexedDBSupported()) {
            try {
              await saveDirectoryHandle(folderName, dirHandle);
            } catch (error) {
              console.error('Error saving directory handle:', error);
              showError('Failed to save folder. It may not persist after refresh.');
            }
          }
          
          let sortedItems = [...mediaItems];
          
          // Apply sorting
          sortedItems = sortMediaItems(sortedItems, sortMode);
          
          // Merge with existing playlist (avoid duplicates)
          const existingPaths = new Set(playlist.map(item => item.filePath));
          const newItems = sortedItems.filter(item => !existingPaths.has(item.filePath));
          
          if (newItems.length === 0) {
            showWarning(`All files from "${folderName}" are already in your playlist`);
            setIsLoadingFolders(false);
            setStatusText('');
            return;
          }
          
          const mergedPlaylist = [...playlist, ...newItems];
          setPlaylist(mergedPlaylist);
          
          if (mergedPlaylist.length > 0 && currentIndex < 0) {
            setCurrentIndex(0);
            setCurrentMedia(mergedPlaylist[0]);
          }
          
          // Add folder name to folders list
          if (!folders.includes(folderName)) {
            setFolders([...folders, folderName]);
          }
          
          showSuccess(`Added ${newItems.length} item${newItems.length !== 1 ? 's' : ''} from "${folderName}"`);
          setStatusText('');
          setLoadingProgress(null);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showError(`Failed to load folder "${folderName}": ${errorMessage}`);
          setStatusText(`Error: ${errorMessage}`);
          setLoadingProgress(null);
          console.error('Error loading directory:', error);
        } finally {
          setIsLoadingFolders(false);
        }
      } else {
        // Fallback: use file input for folder selection (limited browser support)
        showError('File System Access API not supported. Please use Chrome, Edge, or another modern browser.');
      }
    } catch (error) {
      if ((error as any).name !== 'AbortError') {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showError(`Failed to select folder: ${errorMessage}`);
        console.error('Error selecting folder:', error);
        setStatusText('Error selecting folder');
      }
      setIsLoadingFolders(false);
    }
  };

  // Manifest mode handlers
  const handleLoadManifest = useCallback(() => {
    if (!pendingManifestData) return;
    
    const { manifest, fileName, mediaItems, missingFiles } = pendingManifestData;
    
    // Set manifest mode
    setIsManifestMode(true);
    setManifestData(manifest);
    
    // Revoke object URLs for items no longer in playlist before replacing
    const itemsToKeep = new Set(mediaItems.map(item => item.filePath));
    const itemsToRemove = playlist.filter(item => !itemsToKeep.has(item.filePath));
    if (itemsToRemove.length > 0) {
      const urlsToRevoke = itemsToRemove
        .map(item => item.objectUrl)
        .filter((url): url is string => url !== undefined);
      objectUrlRegistry.revokeMany(urlsToRevoke);
    }
    
    // Set playlist to manifest items only
    setPlaylist(mediaItems);
    setCurrentIndex(0);
    setCurrentMedia(mediaItems[0]);
    
    // Clear other folders (manifest mode uses only manifest items)
    setFolders([fileName]);
    
    // Close dialog
    setShowManifestDialog(false);
    setPendingManifestData(null);
    
    if (missingFiles.length > 0) {
      showWarning(`${missingFiles.length} file${missingFiles.length !== 1 ? 's' : ''} from manifest could not be found`);
    }
    
    showSuccess(`Loaded playlist: ${fileName} (${mediaItems.length} items)`);
  }, [pendingManifestData, showSuccess, showWarning]);
  
  const handleIgnoreManifest = useCallback(() => {
    setShowManifestDialog(false);
    setPendingManifestData(null);
    // Continue with normal folder loading
    // The folder loading will continue from where it left off
  }, []);
  
  const handleSelectManifest = useCallback(async (index: number) => {
    const selected = pendingManifestFiles[index];
    if (!selected || !pendingManifestContext) return;
    
    const { dirHandle, folderName, mediaItems } = pendingManifestContext;
    
    // Match manifest to media
    const { matched, missing } = matchManifestToMedia(
      selected.manifest,
      mediaItems,
      folderName
    );
    
    if (matched.length === 0) {
      showWarning('No files from the selected manifest could be found.');
      setShowManifestSelection(false);
      setPendingManifestFiles([]);
      setPendingManifestContext(null);
      return;
    }
    
    // Set manifest mode
    setIsManifestMode(true);
    setManifestData(selected.manifest);
    
    // Revoke object URLs for items no longer in playlist before replacing
    const itemsToKeep = new Set(matched.map(item => item.filePath));
    const itemsToRemove = playlist.filter(item => !itemsToKeep.has(item.filePath));
    if (itemsToRemove.length > 0) {
      const urlsToRevoke = itemsToRemove
        .map(item => item.objectUrl)
        .filter((url): url is string => url !== undefined);
      objectUrlRegistry.revokeMany(urlsToRevoke);
    }
    
    // Set playlist to manifest items only
    setPlaylist(matched);
    setCurrentIndex(0);
    setCurrentMedia(matched[0]);
    
    // Store directory handle
    const newHandles = new Map(directoryHandles);
    newHandles.set(folderName, dirHandle);
    setDirectoryHandles(newHandles);
    
    // Clear other folders (manifest mode uses only manifest items)
    setFolders([selected.fileName]);
    
    // Close dialog
    setShowManifestSelection(false);
    setPendingManifestFiles([]);
    setPendingManifestContext(null);
    
    if (missing.length > 0) {
      showWarning(`${missing.length} file${missing.length !== 1 ? 's' : ''} from manifest could not be found`);
    }
    
    showSuccess(`Loaded playlist: ${selected.fileName} (${matched.length} items)`);
  }, [pendingManifestFiles, pendingManifestContext, directoryHandles, showSuccess, showWarning]);
  
  const handleIgnoreAllManifests = useCallback(() => {
    setShowManifestSelection(false);
    setPendingManifestFiles([]);
    setPendingManifestContext(null);
    // Continue with normal loading - the folder loading will continue from where it left off
  }, []);
  
  const handleExitManifestMode = useCallback(() => {
    // Revoke all object URLs before clearing playlist
    objectUrlRegistry.revokeAll();
    
    setIsManifestMode(false);
    setManifestData(null);
    setPlaylist([]);
    setCurrentIndex(-1);
    setCurrentMedia(null);
    setFolders([]);
    setToolbarVisible(true);
    setCursorHidden(false);
    if (cursorTimeoutRef.current) {
      clearTimeout(cursorTimeoutRef.current);
      cursorTimeoutRef.current = null;
    }
    showInfo('Exited manifest mode');
  }, [showInfo]);

  const handleToggleFullscreen = useCallback(() => {
    if (!isFullscreen) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, [isFullscreen]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      stopSlideshow();
      setIsPlaying(false);
    } else {
      if (playlist.length > 0 && slideDelayMs > 0) {
        startSlideshow();
        setIsPlaying(true);
        
        // In manifest mode, auto-enter fullscreen when slideshow starts
        if (isManifestMode && !isFullscreen) {
          setTimeout(() => {
            handleToggleFullscreen();
          }, 100);
        }
      }
    }
  }, [isPlaying, playlist.length, slideDelayMs, startSlideshow, stopSlideshow, isManifestMode, isFullscreen, handleToggleFullscreen]);

  const handleNext = useCallback(() => {
    navigateNext();
  }, [navigateNext]);

  const handlePrevious = useCallback(() => {
    navigatePrevious();
  }, [navigatePrevious]);

  const handleRestart = useCallback(() => {
    // Navigate to first item in the filtered playlist
    if (filteredPlaylist.length > 0) {
      const firstItem = filteredPlaylist[0];
      const actualIndex = playlist.findIndex(p => p.filePath === firstItem.filePath);
      if (actualIndex >= 0) {
        setCurrentIndex(actualIndex);
        setCurrentMedia(firstItem);
        // If playing, restart from beginning
        if (isPlaying) {
          stopSlideshow();
          setIsPlaying(false);
          // Optionally auto-start again, but for now just pause
        }
      }
    }
  }, [filteredPlaylist, playlist, isPlaying, stopSlideshow]);

  const handleSort = useCallback((mode: 'NameAZ' | 'NameZA' | 'DateOldest' | 'DateNewest' | 'Random') => {
    // Use functional update to ensure we have the latest playlist state
    setPlaylist(prevPlaylist => {
      const sorted = sortMediaItems([...prevPlaylist], mode);
      
      // Update current index and media - maintain position if possible
      setCurrentMedia(prevMedia => {
        if (prevMedia) {
          const newIndex = sorted.findIndex(item => item.filePath === prevMedia.filePath);
          
          if (newIndex >= 0) {
            // Current item found in sorted list - maintain position
            setCurrentIndex(newIndex);
            // Show brief feedback that sorting occurred
            setStatusText(`Sorted: ${getSortModeLabel(mode)}`);
            setTimeout(() => setStatusText(''), 2000);
            return sorted[newIndex];
          } else if (sorted.length > 0) {
            // Current item not found - go to first item
            setCurrentIndex(0);
            setStatusText(`Sorted: ${getSortModeLabel(mode)}`);
            setTimeout(() => setStatusText(''), 2000);
            return sorted[0];
          }
          return prevMedia;
        } else if (sorted.length > 0) {
          // No current media - start from first
          setCurrentIndex(0);
          setStatusText(`Sorted: ${getSortModeLabel(mode)}`);
          setTimeout(() => setStatusText(''), 2000);
          return sorted[0];
        }
        return null;
      });
      
      return sorted;
    });
    
    setSortMode(mode);
  }, []);

  const getSortModeLabel = (mode: 'NameAZ' | 'NameZA' | 'DateOldest' | 'DateNewest' | 'Random'): string => {
    switch (mode) {
      case 'NameAZ': return 'Name (A-Z)';
      case 'NameZA': return 'Name (Z-A)';
      case 'DateOldest': return 'Date (Oldest First)';
      case 'DateNewest': return 'Date (Newest First)';
      case 'Random': return 'Random';
      default: return 'Sorted';
    }
  };

  const handleNavigateToFile = (filePath: string) => {
    const index = playlist.findIndex(item => item.filePath === filePath);
    if (index >= 0) {
      // Check if the file should be shown based on includeVideos
      const item = playlist[index];
      if (!includeVideos && (item.type === MediaType.Video || item.type === MediaType.Gif)) {
        // Skip videos and GIFs when includeVideos is false
        return;
      }
      setCurrentIndex(index);
      setCurrentMedia(item);
    }
  };

  const handlePlayFromFile = useCallback((filePath: string) => {
    const index = playlist.findIndex(item => item.filePath === filePath);
    if (index >= 0) {
      const item = playlist[index];
      if (!includeVideos && (item.type === MediaType.Video || item.type === MediaType.Gif)) {
        return;
      }
      setCurrentIndex(index);
      setCurrentMedia(item);
      // Start slideshow if not already playing
      if (!isPlaying) {
        setIsPlaying(true);
      }
    }
  }, [playlist, includeVideos, isPlaying]);

  const handleRemoveFile = (filePath: string) => {
    // Find the item being removed to revoke its object URL
    const itemToRemove = playlist.find(item => item.filePath === filePath);
    if (itemToRemove?.objectUrl) {
      objectUrlRegistry.revoke(itemToRemove.objectUrl);
    }
    
    const newPlaylist = playlist.filter(item => item.filePath !== filePath);
    setPlaylist(newPlaylist);
    
    if (newPlaylist.length === 0) {
      setCurrentIndex(-1);
      setCurrentMedia(null);
    } else if (currentIndex >= newPlaylist.length) {
      setCurrentIndex(newPlaylist.length - 1);
      setCurrentMedia(newPlaylist[newPlaylist.length - 1]);
    } else {
      setCurrentMedia(newPlaylist[currentIndex]);
    }
  };

  const handleZoomReset = useCallback(() => {
    setZoomFactor(1.0);
    setIsFitToWindow(true);
    saveSettings({ zoomFactor: 1.0, isFitToWindow: true });
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          handlePrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNext();
          break;
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'f':
        case 'F':
          if (e.key === 'F' || (e.key === 'f' && !e.shiftKey && !e.ctrlKey && !e.altKey)) {
            e.preventDefault();
            handleToggleFullscreen();
          }
          break;
        case 'Escape':
          if (isFullscreen) {
            e.preventDefault();
            handleToggleFullscreen();
          }
          if (showPlaylist) {
            setShowPlaylist(false);
          }
          if (showSettings) {
            setShowSettings(false);
          }
          break;
        case '+':
        case '=':
          e.preventDefault();
          setZoomFactor(prev => {
            const newValue = Math.min(prev + 0.1, 5);
            saveSettings({ zoomFactor: newValue });
            return newValue;
          });
          break;
        case '-':
        case '_':
          e.preventDefault();
          setZoomFactor(prev => {
            const newValue = Math.max(prev - 0.1, 0.1);
            saveSettings({ zoomFactor: newValue });
            return newValue;
          });
          break;
        case '0':
          if (!e.shiftKey) {
            e.preventDefault();
            handleZoomReset();
          }
          break;
        case '?':
          // ? key requires Shift on most keyboards, so allow Shift
          if (!e.ctrlKey && !e.altKey) {
            e.preventDefault();
            setShowShortcutsHelp(true);
          }
          break;
        case '/':
          // Some keyboards use / for ?, handle both
          if (e.shiftKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            setShowShortcutsHelp(true);
          }
          break;
        case 'p':
        case 'P':
          if (!e.shiftKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            setShowPlaylist(true);
          }
          break;
        case ',':
          if (!e.shiftKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            setShowSettings(true);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, showPlaylist, showSettings, handlePlayPause, handleNext, handlePrevious, handleToggleFullscreen, handleZoomReset]);

  // Manifest mode: Cursor hiding in fullscreen
  useEffect(() => {
    if (!isManifestMode || !isFullscreen) {
      setCursorHidden(false);
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
        cursorTimeoutRef.current = null;
      }
      return;
    }

    const handleMouseMove = () => {
      setCursorHidden(false);
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
      }
      cursorTimeoutRef.current = setTimeout(() => {
        setCursorHidden(true);
      }, 2000);
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
      }
    };
  }, [isManifestMode, isFullscreen]);

  // Manifest mode: Toolbar visibility (show on mouse move to bottom)
  useEffect(() => {
    if (!isManifestMode || !isFullscreen) {
      setToolbarVisible(true);
      return;
    }

    // Start with toolbar hidden in manifest mode + fullscreen
    setToolbarVisible(false);

    const handleMouseMove = (e: MouseEvent) => {
      const windowHeight = window.innerHeight;
      const mouseY = e.clientY;
      const distanceFromBottom = windowHeight - mouseY;
      
      // Show toolbar when mouse is within 100px of bottom
      if (distanceFromBottom < 100) {
        setToolbarVisible(true);
      } else {
        setToolbarVisible(false);
      }
    };

    // Also hide toolbar when mouse leaves the window
    const handleMouseLeave = () => {
      setToolbarVisible(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isManifestMode, isFullscreen]);

  // In manifest mode, restart slideshow when current item changes (for per-item delays)
  useEffect(() => {
    if (isManifestMode && isPlaying && currentMedia) {
      // Restart slideshow to use the new delay for the current item
      stopSlideshow();
      setTimeout(() => {
        if (isPlaying) {
          startSlideshow();
        }
      }, 50);
    }
  }, [isManifestMode, isPlaying, currentMedia, effectiveDelay, startSlideshow, stopSlideshow]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`app ${isManifestMode ? 'manifest-mode' : ''} ${cursorHidden ? 'cursor-hidden' : ''}`}
      style={cursorHidden ? { cursor: 'none' } : {}}
    >
      <MediaDisplay
        currentMedia={currentMedia}
        zoomFactor={zoomFactor}
        isFitToWindow={isFitToWindow}
        isMuted={isMuted}
        onVideoEnded={onVideoEnded}
        onImageClick={handleNext}
        onEffectiveZoomChange={setEffectiveZoom}
        onMediaError={(error) => {
          showError(`Failed to load media: ${error}`);
          // Auto-advance to next item on error
          setTimeout(() => handleNext(), 1000);
        }}
      />
      
      {isLoadingFolders && (
        <div className="loading-overlay-global">
          <ProgressIndicator
            message={statusText || 'Loading folders...'}
            current={loadingProgress?.current}
            total={loadingProgress?.total}
          />
        </div>
      )}

      {playlist.length === 0 && !isLoadingFolders && (
        <div className="empty-state">
          <p>No media loaded</p>
          <button onClick={handleAddFolder} className="btn-primary">
            Add Folder
          </button>
        </div>
      )}

      <Toolbar
        isPlaying={isPlaying}
        includeVideos={includeVideos}
        onIncludeVideosChange={async (value) => {
          const wasIncludingVideos = includeVideos;
          setIncludeVideos(value);
          
          // If toggle state changed and we have folders loaded, reload them
          if (value !== wasIncludingVideos && directoryHandles.size > 0) {
            setStatusText(value ? 'Reloading folders to include GIF/MP4...' : 'Reloading folders to exclude GIF/MP4...');
            try {
              const allMediaItems: MediaItem[] = [];
              
              // Reload all folders with the new includeVideos setting
              for (const [folderName, dirHandle] of directoryHandles.entries()) {
                const mediaItems = await loadMediaFromDirectory(dirHandle, value);
                allMediaItems.push(...mediaItems);
              }
              
              // Apply sorting
              let sortedItems = sortMediaItems(allMediaItems, sortMode);
              
              // Remove duplicates
              const uniqueItems = Array.from(
                new Map(sortedItems.map(item => [item.filePath, item])).values()
              );
              
              // Revoke object URLs for items no longer in the new playlist
              const newFilePaths = new Set(uniqueItems.map(item => item.filePath));
              const itemsToRemove = playlist.filter(item => !newFilePaths.has(item.filePath));
              if (itemsToRemove.length > 0) {
                const urlsToRevoke = itemsToRemove
                  .map(item => item.objectUrl)
                  .filter((url): url is string => url !== undefined);
                objectUrlRegistry.revokeMany(urlsToRevoke);
              }
              
              setPlaylist(uniqueItems);
              
              // Update current index if needed
              if (uniqueItems.length > 0) {
                if (currentMedia) {
                  const newIndex = uniqueItems.findIndex(item => item.filePath === currentMedia.filePath);
                  if (newIndex >= 0) {
                    setCurrentIndex(newIndex);
                    setCurrentMedia(uniqueItems[newIndex]);
                  } else {
                    // Current item was filtered out, find next valid item
                    const filtered = value 
                      ? uniqueItems 
                      : uniqueItems.filter(item => item.type !== MediaType.Video && item.type !== MediaType.Gif);
                    if (filtered.length > 0) {
                      const targetIndex = uniqueItems.findIndex(item => item.filePath === filtered[0].filePath);
                      setCurrentIndex(targetIndex >= 0 ? targetIndex : 0);
                      setCurrentMedia(uniqueItems[targetIndex >= 0 ? targetIndex : 0]);
                    } else {
                      setCurrentIndex(0);
                      setCurrentMedia(uniqueItems[0]);
                    }
                  }
                } else {
                  setCurrentIndex(0);
                  setCurrentMedia(uniqueItems[0]);
                }
              } else {
                setCurrentIndex(-1);
                setCurrentMedia(null);
              }
              
              setStatusText('');
            } catch (error) {
              setStatusText(`Error reloading folders: ${error instanceof Error ? error.message : 'Unknown error'}`);
              console.error('Error reloading folders:', error);
            }
          } else if (!value && currentMedia && (currentMedia.type === MediaType.Video || currentMedia.type === MediaType.Gif)) {
            // If disabling and current item is a video or gif, navigate to next valid item
            const filtered = playlist.filter(item => item.type !== MediaType.Video && item.type !== MediaType.Gif);
            if (filtered.length > 0) {
              const currentIndexInFiltered = filtered.findIndex(item => 
                playlist.indexOf(item) >= currentIndex
              );
              const targetIndex = currentIndexInFiltered >= 0 
                ? playlist.indexOf(filtered[currentIndexInFiltered])
                : playlist.indexOf(filtered[0]);
              setCurrentIndex(targetIndex);
              setCurrentMedia(playlist[targetIndex]);
            } else {
              setCurrentIndex(-1);
              setCurrentMedia(null);
            }
          }
        }}
        slideDelayMs={slideDelayMs}
        onSlideDelayChange={(value) => {
          setSlideDelayMs(value);
          saveSettings({ slideDelayMs: value });
        }}
        zoomFactor={zoomFactor}
        effectiveZoom={effectiveZoom}
        onZoomChange={setZoomFactor}
        onZoomReset={handleZoomReset}
        isFitToWindow={isFitToWindow}
        onFitToWindowChange={setIsFitToWindow}
        isMuted={isMuted}
        onMuteToggle={() => setIsMuted(!isMuted)}
        isFullscreen={isFullscreen}
        onFullscreenToggle={handleToggleFullscreen}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onRestart={handleRestart}
        onAddFolder={handleAddFolder}
        onOpenPlaylist={() => setShowPlaylist(true)}
        onOpenSettings={() => setShowSettings(true)}
        onSort={handleSort}
        currentSortMode={sortMode}
        currentIndex={currentIndex}
        totalCount={playlist.length}
        statusText={statusText}
        isManifestMode={isManifestMode}
        onExitManifestMode={handleExitManifestMode}
        toolbarVisible={toolbarVisible}
      />

      {showPlaylist && (
        <PlaylistWindow
          playlist={playlist}
          currentIndex={currentIndex}
          folders={folders}
          onClose={() => setShowPlaylist(false)}
          onNavigateToFile={handleNavigateToFile}
          onRemoveFile={handleRemoveFile}
          onPlayFromFile={handlePlayFromFile}
          onRemoveFolder={async (folderName) => {
            // Remove folder from folders list
            const newFolders = folders.filter(f => f !== folderName);
            setFolders(newFolders);
            
            // Remove directory handle from state
            const newHandles = new Map(directoryHandles);
            newHandles.delete(folderName);
            setDirectoryHandles(newHandles);
            
            // Remove directory handle from IndexedDB (if saveFolders is enabled, or just to clean up)
            if (isIndexedDBSupported()) {
              try {
                await removeDirectoryHandle(folderName);
              } catch (error) {
                console.error('Error removing directory handle:', error);
                // Don't show error - folder is removed from UI anyway
              }
            }
            
            // Remove all files from that folder
            const filesInFolder = playlist.filter(item => item.folderName === folderName);
            
            // Revoke object URLs for all files in the folder before removing
            const urlsToRevoke = filesInFolder
              .map(item => item.objectUrl)
              .filter((url): url is string => url !== undefined);
            objectUrlRegistry.revokeMany(urlsToRevoke);
            
            const newPlaylist = playlist.filter(item => item.folderName !== folderName);
            setPlaylist(newPlaylist);
            
            // Update current index if needed
            if (newPlaylist.length === 0) {
              setCurrentIndex(-1);
              setCurrentMedia(null);
            } else if (currentIndex >= newPlaylist.length) {
              const newIndex = newPlaylist.length - 1;
              setCurrentIndex(newIndex >= 0 ? newIndex : -1);
              setCurrentMedia(newIndex >= 0 ? newPlaylist[newIndex] : null);
            } else {
              setCurrentMedia(newPlaylist[currentIndex]);
            }
            
            showSuccess(`Removed folder "${folderName}" (${filesInFolder.length} items)`);
          }}
          onAddFolder={handleAddFolder}
        />
      )}

      {showSettings && (
        <SettingsWindow
          onClose={() => setShowSettings(false)}
          onSave={async () => {
            showSuccess('Settings saved successfully');
            // Check if saveFolders was disabled and clear saved folders from IndexedDB if so
            const currentSettings = loadSettings();
            if (!currentSettings.saveFolders && isIndexedDBSupported()) {
              try {
                await clearAllDirectoryHandles();
                // Note: Current folders in state remain active, but won't be saved on next load
              } catch (error) {
                console.error('Error clearing directory handles:', error);
              }
            }
          }}
        />
      )}

      <KeyboardShortcutsHelp 
        isOpen={showShortcutsHelp} 
        onClose={() => setShowShortcutsHelp(false)} 
      />

      {showManifestDialog && pendingManifestData && (
        <ManifestModeDialog
          manifestName={pendingManifestData.fileName}
          itemCount={pendingManifestData.mediaItems.length}
          missingFiles={pendingManifestData.missingFiles}
          onLoadManifest={handleLoadManifest}
          onIgnore={handleIgnoreManifest}
        />
      )}

      {showManifestSelection && pendingManifestFiles.length > 0 && (
        <ManifestSelectionDialog
          manifests={pendingManifestFiles.map(f => ({ name: f.name, itemCount: f.itemCount }))}
          onSelect={handleSelectManifest}
          onIgnore={handleIgnoreAllManifests}
        />
      )}
    </div>
  );
}

export default App;

