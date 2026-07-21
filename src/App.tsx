import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import MediaDisplay from './components/MediaDisplay';
import Toolbar from './components/Toolbar';
import PlaylistWindow from './components/PlaylistWindow';
import SettingsWindow from './components/SettingsWindow';
import KeyboardShortcutsHelp from './components/KeyboardShortcutsHelp';
import ProgressIndicator from './components/ProgressIndicator';
import FileNameOverlay from './components/FileNameOverlay';
import ManifestModeDialog from './components/ManifestModeDialog';
import ManifestSelectionDialog from './components/ManifestSelectionDialog';
import UpdatePrompt from './components/UpdatePrompt';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import { useSlideshow } from './hooks/useSlideshow';
import { useMediaLoader } from './hooks/useMediaLoader';
import { useToast } from './hooks/useToast';
import { usePlaybackErrorPolicy } from './hooks/usePlaybackErrorPolicy';
import { useFolderPersistence } from './hooks/useFolderPersistence';
import { useIdleTimer } from './hooks/useIdleTimer';
import { MediaItem, MediaType } from './types/media';
import { SlideshowManifest } from './types/manifest';
import { loadSettings, saveSettings, TransitionEffect } from './utils/settingsStorage';
// Directory storage functions are now handled by useFolderPersistence hook
import { findManifestFiles, loadManifestFile, matchManifestToMedia } from './utils/manifestLoader';
import { parseUrlParams } from './utils/urlParams';
import { resolveFolder } from './utils/folderResolver';
import { filterMediaByFileList } from './utils/fileFilter';
import { syncUrlToState } from './utils/urlSync';
import { objectUrlRegistry } from './utils/objectUrlRegistry';
import { hasReadPermission, assertReadPermission } from './utils/fsPermissions';
import { validateManifest as validateManifestStrict, validateMediaPath, MAX_MANIFEST_SIZE } from './utils/manifestValidation';
import { logger } from './utils/logger';
import { addEvent } from './utils/eventLog';
import './App.css';

function App() {
  const [currentMedia, setCurrentMedia] = useState<MediaItem | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [includeVideos, setIncludeVideos] = useState(true);
  const [dateFilterEnabled, setDateFilterEnabled] = useState(false);
  const [dateFilterDays, setDateFilterDays] = useState(30);
  const [slideDelayMs, setSlideDelayMs] = useState(2000);
  const [zoomFactor, setZoomFactor] = useState(1.0);
  const [effectiveZoom, setEffectiveZoom] = useState(1.0);
  const [isFitToWindow, setIsFitToWindow] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sortMode, setSortMode] = useState<'NameAZ' | 'NameZA' | 'DateOldest' | 'DateNewest' | 'Random'>('NameAZ');
  const [transitionEffect, setTransitionEffect] = useState<TransitionEffect>('Fade');
  const [playlist, setPlaylist] = useState<MediaItem[]>([]);
  const [statusText, setStatusText] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<{current: number, total: number} | null>(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
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
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const updateSWRef = useRef<(() => void) | null>(null);
  const cursorTimeoutRef = useRef<number | null>(null);
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false);
  const [backgroundBlur, setBackgroundBlur] = useState(true);
  const [showFileNameOverlay, setShowFileNameOverlay] = useState(false);
  // Pending URL folder path — set when URL resolution needs a user gesture (e.g., directory picker)
  const [pendingUrlPath, setPendingUrlPath] = useState<{
    path: string;
    files: string[];
    autoplay: boolean;
  } | null>(null);
  const { showSuccess, showError, showInfo, showWarning } = useToast();
  
  // Folder persistence hook
  const {
    directoryHandles,
    folders,
    setFolders,
    loadFolders,
    persistFolder,
    removeFolder,
    handleRevokedFolder: handleRevokedFolderHook,
    clearAllFolders,
  } = useFolderPersistence({
    showError,
    showWarning,
    revokeUrlsForMediaItems: (items) => {
      const urlsToRevoke = items
        .map(item => item.objectUrl)
        .filter((url): url is string => url !== undefined);
      objectUrlRegistry.revokeMany(urlsToRevoke);
    },
  });
  
  // Idle timer for auto-hiding toolbar during playback
  const anyDialogOpen = showPlaylist || showSettings || showShortcutsHelp || showDiagnostics || showManifestDialog || showManifestSelection || toolbarMenuOpen;

  const { pause: pauseIdleTimer, resume: resumeIdleTimer } = useIdleTimer({
    timeoutMs: 5000,
    enabled: isPlaying,
    onIdle: useCallback(() => {
      setToolbarVisible(false);
      setCursorHidden(true);
    }, []),
    onActive: useCallback(() => {
      setToolbarVisible(true);
      setCursorHidden(false);
    }, []),
  });

  // Pause/resume idle timer when dialogs or menus are open
  useEffect(() => {
    if (anyDialogOpen) {
      pauseIdleTimer();
    } else {
      resumeIdleTimer();
    }
  }, [anyDialogOpen, pauseIdleTimer, resumeIdleTimer]);

  // When isPlaying becomes false while toolbar is hidden, restore visibility
  useEffect(() => {
    if (!isPlaying && !toolbarVisible) {
      setToolbarVisible(true);
      setCursorHidden(false);
    }
  }, [isPlaying, toolbarVisible]);

  // Retry policy for media errors
  const errorPolicy = usePlaybackErrorPolicy({ maxAttempts: 3, baseDelayMs: 1000 });
  const [currentMediaReloadKey, setCurrentMediaReloadKey] = useState(0);
  const retryTimerRef = useRef<number | null>(null);
  // Track if retry is pending for current media (gates slideshow advancement)
  const isRetryingCurrentMediaRef = useRef(false);
  
  // Track media load state for playback timing (critical for minimum display time)
  const [mediaLoadState, setMediaLoadState] = useState<{
    isLoaded: boolean;
    loadTimestamp?: number;
  }>({ isLoaded: false });
  
  // Expose error log to console for debugging (dev-only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__getPlaybackErrors = () => {
        const errors = errorPolicy.getAllErrorRecords();
        console.table(errors);
        return errors;
      };
      (window as any).__clearPlaybackErrors = () => {
        errorPolicy.clearErrorRecords();
        console.log('Playback error log cleared');
      };
    }
  }, [errorPolicy]);

  // Get filtered playlist based on includeVideos (excludes both Video and Gif when false)
  // and dateFilter (excludes files whose dateModified is older than the configured window)
  const filteredPlaylist = useMemo(() => {
    let result = includeVideos
      ? playlist
      : playlist.filter(item => item.type !== MediaType.Video && item.type !== MediaType.Gif);

    if (dateFilterEnabled) {
      const cutoff = Date.now() - dateFilterDays * 24 * 60 * 60 * 1000;
      result = result.filter(item => item.dateModified === undefined || item.dateModified >= cutoff);
    }

    return result;
  }, [playlist, includeVideos, dateFilterEnabled, dateFilterDays]);

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

  // Gate slideshow advancement when retry is pending for current media
  const shouldGateAdvancement = useCallback(() => {
    return isRetryingCurrentMediaRef.current;
  }, []);

  const { navigateNext, navigatePrevious, startSlideshow, stopSlideshow, onVideoEnded, onGifCompleted } = useSlideshow({
    playlist: filteredPlaylist,
    currentIndex: filteredCurrentIndex,
    slideDelayMs: effectiveDelay,
    isPlaying,
    onNavigate: handleNavigate,
    shouldGateAdvancement,
    mediaLoadState
  });

  const { loadMediaFromDirectory } = useMediaLoader();

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      // Revoke all object URLs when component unmounts
      objectUrlRegistry.revokeAll();
      // Clear any pending retry timers
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  // Reset reload key and clear retry timer when media changes
  useEffect(() => {
    // Clear any pending retry timer when media changes
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    
    // Reset retry gating flag when media changes
    isRetryingCurrentMediaRef.current = false;
    
    // Reset reload key when media changes (new item loaded)
    setCurrentMediaReloadKey(0);
    
    // Reset media load state when media changes
    setMediaLoadState({ isLoaded: false });
    
    // Reset error policy for the new media item on successful change
    if (currentMedia) {
      const mediaId = currentMedia.filePath;
      errorPolicy.resetOnSuccess(mediaId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMedia?.filePath]); // Only depend on filePath, not the whole object

  // Service Worker update handling
  useEffect(() => {
    const handleUpdateAvailable = (event: Event) => {
      const customEvent = event as CustomEvent<{ updateSW: () => void }>;
      if (customEvent.detail?.updateSW) {
        updateSWRef.current = customEvent.detail.updateSW;
        setUpdateAvailable(true);
      }
    };

    window.addEventListener('sw-update-available', handleUpdateAvailable);
    return () => {
      window.removeEventListener('sw-update-available', handleUpdateAvailable);
    };
  }, []);

  // Apply service worker update
  const handleApplyUpdate = useCallback(() => {
    if (updateSWRef.current) {
      updateSWRef.current();
      setUpdateAvailable(false);
      // The service worker will reload the page after update
      window.location.reload();
    }
  }, []);

  // Load settings and directory handles on mount
  useEffect(() => {
    const initializeApp = async () => {
      setIsLoading(true);
      
      try {
        // Load settings from localStorage
        const savedSettings = loadSettings({ showError, showWarning });
        if (savedSettings.saveSlideDelay) {
          setSlideDelayMs(savedSettings.slideDelayMs);
        }
        if (savedSettings.saveIncludeVideos) {
          setIncludeVideos(savedSettings.includeVideos);
        }
        if (savedSettings.saveDateFilter) {
          setDateFilterEnabled(savedSettings.dateFilterEnabled);
          setDateFilterDays(savedSettings.dateFilterDays);
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
        if (savedSettings.saveTransitionEffect) {
          setTransitionEffect(savedSettings.transitionEffect);
        }
        setBackgroundBlur(savedSettings.backgroundBlur);
        setShowFileNameOverlay(savedSettings.showFileNameOverlay);

        // --- URL Parameter Processing ---
        // Parse URL params early, before loading persisted folders.
        // If URL specifies a path, we skip the normal "load persisted folders" flow
        // to avoid double-loading.
        let urlResolved = false;
        try {
          const urlParams = parseUrlParams(window.location.search);

          // Display error toast if parsing produced an error (e.g., path traversal)
          if (urlParams.error) {
            showError(urlParams.error);
            // Fall through to default behavior (urlResolved stays false)
          }

          // Display warning toasts for any validation warnings
          for (const warning of urlParams.warnings) {
            showWarning(warning);
          }

          // If path is present and no error, attempt folder resolution
          if (urlParams.path && !urlParams.error) {
            try {
              setStatusText('Resolving folder from URL…');
              const resolution = await resolveFolder({
                path: urlParams.path,
                onStatusChange: (msg) => setStatusText(msg),
                onPromptUser: (msg) => showInfo(msg),
              });

              // Persist the resolved handle with its full path
              await persistFolder(
                resolution.folderName,
                resolution.handle,
                savedSettings.saveFolders,
                resolution.fullPath
              );

              // Load media from the resolved directory
              const mediaItems = await loadMediaFromDirectory(
                resolution.handle,
                savedSettings.includeVideos
              );

              let finalPlaylist: MediaItem[];

              // Apply file filter if file params are present
              if (urlParams.files.length > 0) {
                const filterResult = filterMediaByFileList(mediaItems, urlParams.files);
                finalPlaylist = filterResult.matched;

                // Show warnings for missing files
                if (filterResult.missing.length > 0) {
                  if (filterResult.matched.length === 0) {
                    showWarning(
                      `None of the specified files were found: ${filterResult.missing.join(', ')}`
                    );
                  } else {
                    showWarning(
                      `Some files not found: ${filterResult.missing.join(', ')}`
                    );
                  }
                }

                // Sync URL with the current file filter state
                syncUrlToState({ path: resolution.fullPath, files: urlParams.files });
              } else {
                // No file filter — use all media, sorted
                finalPlaylist = sortMediaItems(mediaItems, savedSettings.sortMode);
                // Sync URL with path only (no files)
                syncUrlToState({ path: resolution.fullPath, files: [] });
              }

              if (finalPlaylist.length > 0) {
                setPlaylist(finalPlaylist);
                setCurrentIndex(0);
                setCurrentMedia(finalPlaylist[0]);

                // Autoplay: start playback if requested and playlist is non-empty
                if (urlParams.autoplay) {
                  setIsMuted(true); // Mute for video autoplay policy (Req 5.5)
                  setIsPlaying(true);
                }
              } else if (urlParams.autoplay) {
                // Autoplay requested but playlist is empty after filtering
                showWarning('Autoplay requested but no media files are available to play');
              }

              urlResolved = true;
              setStatusText('');
            } catch (resolveError) {
              // Folder resolution failed (permission denied, picker cancelled, etc.)
              // If it failed because a user gesture is required (SecurityError or AbortError
              // from showDirectoryPicker during init), store the pending URL so the user
              // can click a button to trigger the picker.
              const isGestureError =
                resolveError instanceof DOMException &&
                (resolveError.name === 'SecurityError' || resolveError.name === 'AbortError');
              
              if (isGestureError) {
                // Store pending URL params so the empty state UI can offer a button
                setPendingUrlPath({
                  path: urlParams.path!,
                  files: urlParams.files,
                  autoplay: urlParams.autoplay,
                });
                showInfo(`Click "Open Folder" to grant access to the requested path`);
                // Mark as resolved so we don't fall through to loading cached folders
                urlResolved = true;
              } else {
                const errorMessage = resolveError instanceof Error
                  ? resolveError.message
                  : 'Could not open the folder specified in the URL';
                showError(errorMessage);
              }
              setStatusText('');
              // Fall through to default behavior
            }
          }
        } catch (urlError) {
          // Unexpected error during URL parameter processing (Req 6.4)
          console.error('Error processing URL parameters:', urlError);
          showError('Could not process URL parameters');
          // Fall through to default behavior
        }

        // --- Default Folder Loading ---
        // Only load persisted folders if URL resolution did not succeed
        if (!urlResolved) {
          // Load directory handles from IndexedDB (only if saveFolders is enabled)
          const handles = await loadFolders(savedSettings.saveFolders);
          
          // Reload media from persisted folders
          if (handles.size > 0) {
            setStatusText('Loading folders...');
            const allMediaItems: MediaItem[] = [];
            
            for (const [folderName, handle] of handles.entries()) {
              try {
                // Check permission before using handle
                if (!(await hasReadPermission(handle))) {
                  console.warn(`Permission revoked for folder "${folderName}"`);
                  const removedItems = await handleRevokedFolder(folderName);
                  // Remove items from playlist
                  setPlaylist(prev => prev.filter(item => !removedItems.some(removed => removed.filePath === item.filePath)));
                  continue;
                }
                
                const mediaItems = await loadMediaFromDirectory(handle, savedSettings.includeVideos);
                allMediaItems.push(...mediaItems);
              } catch (error) {
                console.error(`Error loading folder ${folderName}:`, error);
                // Check if it's a permission error
                if (error instanceof Error && error.message.includes('Permission denied')) {
                  const removedItems = await handleRevokedFolder(folderName);
                  // Remove items from playlist
                  setPlaylist(prev => prev.filter(item => !removedItems.some(removed => removed.filePath === item.filePath)));
                } else {
                  // Other error - remove invalid handle
                  try {
                    await removeFolder(folderName);
                  } catch (removeError) {
                    // Error already shown by removeFolder via toast
                    console.warn('Error removing invalid handle:', removeError);
                  }
                }
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
        }
      } catch (error) {
        console.error('Error initializing app:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []); // Only run on mount

  // Dev-only: Expose manifest validation functions to window for manual testing
  useEffect(() => {
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      (window as any).__validateManifestSample = (sample: unknown) => {
        try {
          const manifest = validateManifestStrict(sample);
          return { ok: true, manifest };
        } catch (error) {
          return { 
            ok: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          };
        }
      };
      
      (window as any).__validateMediaPath = (path: string) => {
        try {
          const validated = validateMediaPath(path);
          return { ok: true, validated };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      };
      
      (window as any).__MAX_MANIFEST_SIZE = MAX_MANIFEST_SIZE;
      
      console.log('Dev validation harness available:');
      console.log('  window.__validateManifestSample(sample) - Validate manifest object');
      console.log('  window.__validateMediaPath(path, index?) - Validate media path');
      console.log('  window.__MAX_MANIFEST_SIZE - Max manifest size in bytes');
    }
  }, []);

  // Removed handleLoadFolders - now handled directly in handleAddFolder
  // In production, you'd implement a system to store and restore directory handles

  /**
   * Helper function to remove a folder and all its media items when permission is revoked
   * This handles cleanup: removes from state, removes playlist items, revokes URLs, and shows toast
   * @returns Array of media items that were removed (for caller to handle playlist updates if needed)
   */
  const handleRevokedFolder = useCallback(async (folderName: string): Promise<MediaItem[]> => {
    // Use the hook to handle folder removal and URL revocation
    const removedItems = await handleRevokedFolderHook(folderName, playlist);
    
    // Remove files from playlist and update current media/index
    setPlaylist(prevPlaylist => {
      const newPlaylist = prevPlaylist.filter(item => item.folderName !== folderName);
      
      // Update current media and index if current media belongs to revoked folder
      // Use setTimeout to avoid nested state updates (React batches these)
      setTimeout(() => {
        setCurrentMedia(prevMedia => {
          if (prevMedia && prevMedia.folderName === folderName) {
            // Current media belongs to revoked folder - find next valid item
            if (newPlaylist.length > 0) {
              // Find the index of the current item in the new playlist, or go to first
              const currentIndexInNew = newPlaylist.findIndex(
                item => item.filePath === prevMedia.filePath
              );
              if (currentIndexInNew >= 0) {
                setCurrentIndex(currentIndexInNew);
                return newPlaylist[currentIndexInNew];
              } else {
                // Current item was removed, go to first item
                setCurrentIndex(0);
                return newPlaylist[0];
              }
            } else {
              // Playlist is now empty
              setCurrentIndex(-1);
              return null;
            }
          }
          return prevMedia;
        });
      }, 0);
      
      return newPlaylist;
    });
    
    return removedItems;
  }, [handleRevokedFolderHook, playlist]);

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

  /**
   * Handle the user clicking "Open Folder" when a URL path is pending.
   * This runs in response to a user gesture, so showDirectoryPicker will work.
   */
  const handleOpenPendingUrlFolder = useCallback(async () => {
    if (!pendingUrlPath) return;

    const { path, files, autoplay } = pendingUrlPath;
    const savedSettings = loadSettings({ showError, showWarning });

    try {
      setStatusText('Resolving folder from URL…');
      const resolution = await resolveFolder({
        path,
        onStatusChange: (msg) => setStatusText(msg),
        onPromptUser: (msg) => showInfo(msg),
      });

      // Persist the resolved handle with its full path
      await persistFolder(
        resolution.folderName,
        resolution.handle,
        savedSettings.saveFolders,
        resolution.fullPath
      );

      // Load media from the resolved directory
      const mediaItems = await loadMediaFromDirectory(
        resolution.handle,
        savedSettings.includeVideos
      );

      let finalPlaylist: MediaItem[];

      if (files.length > 0) {
        const filterResult = filterMediaByFileList(mediaItems, files);
        finalPlaylist = filterResult.matched;

        if (filterResult.missing.length > 0) {
          if (filterResult.matched.length === 0) {
            showWarning(`None of the specified files were found: ${filterResult.missing.join(', ')}`);
          } else {
            showWarning(`Some files not found: ${filterResult.missing.join(', ')}`);
          }
        }

        syncUrlToState({ path: resolution.fullPath, files });
      } else {
        finalPlaylist = sortMediaItems(mediaItems, savedSettings.sortMode);
        syncUrlToState({ path: resolution.fullPath, files: [] });
      }

      if (finalPlaylist.length > 0) {
        setPlaylist(finalPlaylist);
        setCurrentIndex(0);
        setCurrentMedia(finalPlaylist[0]);

        if (autoplay) {
          setIsMuted(true);
          setIsPlaying(true);
        }
      } else {
        showWarning('No media files found in the selected folder');
      }

      setPendingUrlPath(null);
      setStatusText('');
    } catch (resolveError) {
      const errorMessage = resolveError instanceof Error
        ? resolveError.message
        : 'Could not open the folder specified in the URL';
      showError(errorMessage);
      setStatusText('');
    }
  }, [pendingUrlPath, showError, showWarning, showInfo, persistFolder, loadMediaFromDirectory]);

  const handleAddFolder = async () => {
    try {
      // Use File System Access API
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
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
          // Check permission before using handle
          await assertReadPermission(dirHandle, `folder "${folderName}"`);
          
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
                mediaItems
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
                  const { matched } = matchManifestToMedia(result.manifest!, mediaItems);
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
          
          // Persist directory handle (hook handles state and IndexedDB)
          const currentSettings = loadSettings({ showError, showWarning });
          await persistFolder(folderName, dirHandle, currentSettings.saveFolders);
          
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
          
          // Folder name is already added by persistFolder hook
          
          showSuccess(`Added ${newItems.length} item${newItems.length !== 1 ? 's' : ''} from "${folderName}"`);
          
          // Sync URL to reflect the newly added folder
          syncUrlToState({ path: folderName, files: [] });
          
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

  /**
   * "Change folder" — replaces the current playlist with a newly selected folder.
   * Clears existing playlist/state, revokes URLs, then picks and loads a new folder.
   */
  const handleChangeFolder = async () => {
    // Revoke all existing object URLs
    const urlsToRevoke = playlist
      .map(item => item.objectUrl)
      .filter((url): url is string => url !== undefined);
    objectUrlRegistry.revokeMany(urlsToRevoke);

    // Clear current playlist state
    setPlaylist([]);
    setCurrentIndex(-1);
    setCurrentMedia(null);
    setIsManifestMode(false);
    setManifestData(null);

    // Remove folders from active session (handles stay in IndexedDB)
    setFolders([]);

    // Now delegate to the add folder flow (which will set up the new folder)
    await handleAddFolder();
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
      mediaItems
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
    
    // Store directory handle (hook handles state and IndexedDB)
    const currentSettings = loadSettings({ showError, showWarning });
    await persistFolder(folderName, dirHandle, currentSettings.saveFolders);
    
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
  }, [pendingManifestFiles, pendingManifestContext, persistFolder, setFolders, showSuccess, showWarning]);
  
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
      // Check if the file should be shown based on includeVideos and dateFilter
      const item = playlist[index];
      if (!includeVideos && (item.type === MediaType.Video || item.type === MediaType.Gif)) {
        // Skip videos and GIFs when includeVideos is false
        return;
      }
      if (dateFilterEnabled && item.dateModified !== undefined) {
        const cutoff = Date.now() - dateFilterDays * 24 * 60 * 60 * 1000;
        if (item.dateModified < cutoff) return;
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
      if (dateFilterEnabled && item.dateModified !== undefined) {
        const cutoff = Date.now() - dateFilterDays * 24 * 60 * 60 * 1000;
        if (item.dateModified < cutoff) return;
      }
      setCurrentIndex(index);
      setCurrentMedia(item);
      // Start slideshow if not already playing
      if (!isPlaying) {
        setIsPlaying(true);
      }
    }
  }, [playlist, includeVideos, dateFilterEnabled, dateFilterDays, isPlaying]);

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
    saveSettings({ zoomFactor: 1.0, isFitToWindow: true }, { showError, showWarning });
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
            saveSettings({ zoomFactor: newValue }, { showError, showWarning });
            return newValue;
          });
          break;
        case '-':
        case '_':
          e.preventDefault();
          setZoomFactor(prev => {
            const newValue = Math.max(prev - 0.1, 0.1);
            saveSettings({ zoomFactor: newValue }, { showError, showWarning });
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
        case 'd':
        case 'D':
          if (e.ctrlKey && e.altKey) {
            e.preventDefault();
            setShowDiagnostics(prev => !prev);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, showPlaylist, showSettings, handlePlayPause, handleNext, handlePrevious, handleToggleFullscreen, handleZoomReset, showDiagnostics]);

  // Manifest mode: Cursor hiding in fullscreen (only when idle timer is not active)
  useEffect(() => {
    // When idle timer is active (isPlaying), it handles cursor hiding
    if (isPlaying) return;

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
      cursorTimeoutRef.current = window.setTimeout(() => {
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
  }, [isManifestMode, isFullscreen, isPlaying]);

  // Manifest mode: Toolbar visibility (show on mouse move to bottom)
  // Only active when not playing (idle timer handles visibility during playback)
  useEffect(() => {
    // When playing, the idle timer handles toolbar visibility
    if (isPlaying) {
      return;
    }
    
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
  }, [isManifestMode, isFullscreen, isPlaying]);

  // In manifest mode, restart slideshow when current item changes (for per-item delays)
  // NOTE: effectiveDelay change is handled by useSlideshow's delay effect, so we only
  // need to handle currentMedia changes here. The delay effect will automatically restart
  // the timer with the new delay, so we don't need a separate setTimeout here.
  // This prevents timer stacking that could occur with the previous setTimeout approach.

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
        key={currentMedia ? `${currentMedia.filePath}-${currentMediaReloadKey}` : 'no-media'}
        currentMedia={currentMedia}
        zoomFactor={zoomFactor}
        isFitToWindow={isFitToWindow}
        isMuted={isMuted}
        transitionEffect={transitionEffect}
        onVideoEnded={onVideoEnded}
        onImageClick={handleNext}
        onEffectiveZoomChange={setEffectiveZoom}
        isPlaying={isPlaying}
        backgroundBlur={backgroundBlur}
        onMediaError={(error) => {
          if (!currentMedia) return;
          
          const mediaId = currentMedia.filePath;
          const fileName = currentMedia.fileName;
          
          // Determine error type (simplified - could be enhanced with more context)
          const errorType: 'network' | 'decode' | 'unknown' = 
            error.toLowerCase().includes('network') || error.toLowerCase().includes('fetch') 
              ? 'network' 
              : error.toLowerCase().includes('decode') || error.toLowerCase().includes('format')
              ? 'decode'
              : 'unknown';
          
          // Record failure and get retry info
          const { shouldRetry, nextDelayMs, attempt } = errorPolicy.recordFailure(
            mediaId,
            fileName,
            errorType
          );
          
          // Clear any existing retry timer
          if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
          }
          
          if (shouldRetry) {
            // Set retry gating flag to prevent slideshow advancement during retry
            isRetryingCurrentMediaRef.current = true;
            
            // Log retry scheduled
            const retryEntry = logger.event('retry_scheduled', {
              mediaId,
              fileName,
              attempt,
              maxAttempts: errorPolicy.config.maxAttempts,
              delayMs: nextDelayMs,
            });
            addEvent(retryEntry);
            
            // Show retry message
            const delaySeconds = Math.ceil(nextDelayMs / 1000);
            showWarning(
              `Failed to load media. Retrying in ${delaySeconds}s (attempt ${attempt}/${errorPolicy.config.maxAttempts})...`,
              nextDelayMs + 500 // Show toast slightly longer than delay
            );
            
            // Schedule retry
            retryTimerRef.current = window.setTimeout(() => {
              retryTimerRef.current = null;
              // Clear retry gating flag before retry
              isRetryingCurrentMediaRef.current = false;
              // Force remount by incrementing reload key
              setCurrentMediaReloadKey(prev => prev + 1);
            }, nextDelayMs);
          } else {
            // Max retries reached - clear retry gating flag
            isRetryingCurrentMediaRef.current = false;
            
            // Max retries reached - skip to next
            const errorRecord = errorPolicy.getErrorRecord(mediaId);
            showError(
              `Failed to load after ${errorPolicy.config.maxAttempts} attempts. Skipping.`,
              5000
            );
            
            // Log final skip after max retries
            const skipEntry = logger.event('final_skip_after_max_retries', {
              mediaId,
              fileName,
              attempts: errorRecord?.attempts || attempt,
              maxAttempts: errorPolicy.config.maxAttempts,
              errorType,
            }, 'error');
            addEvent(skipEntry);
            
            // Log error for debugging
            console.error('Media load failed after max retries:', {
              mediaId,
              fileName,
              attempts: errorRecord?.attempts || attempt,
              errorType,
              timestamp: new Date().toISOString(),
            });
            
            // Advance to next item using the deterministic navigateNext function
            // Use a small delay to ensure error state is displayed, but use the
            // slideshow's navigateNext which properly clears timers
            setTimeout(() => {
              navigateNext();
            }, 1000);
          }
        }}
        onMediaLoadSuccess={() => {
          // Clear retry gating flag on successful load
          isRetryingCurrentMediaRef.current = false;
          
          // Record load timestamp for minimum display time enforcement
          setMediaLoadState({
            isLoaded: true,
            loadTimestamp: Date.now()
          });
          
          // Reset error policy on successful load
          if (currentMedia) {
            errorPolicy.resetOnSuccess(currentMedia.filePath);
          }
        }}
        onGifCompleted={onGifCompleted}
      />
      
      {showFileNameOverlay && (
        <FileNameOverlay currentMedia={currentMedia} visible={toolbarVisible} />
      )}

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
          {pendingUrlPath ? (
            <>
              <p>Folder access required</p>
              <p className="empty-state-hint">
                This URL wants to open: <strong>{pendingUrlPath.path}</strong>
              </p>
              <p className="empty-state-hint">Please select the folder to grant access</p>
              <button onClick={handleOpenPendingUrlFolder} className="btn-primary">
                Open Folder
              </button>
            </>
          ) : (
            <>
              <p>No media loaded</p>
              <p className="empty-state-hint">Add a folder to begin your slideshow</p>
              <button onClick={handleAddFolder} className="btn-primary">
                Add Folder
              </button>
            </>
          )}
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
                try {
                  // Check permission before using handle
                  if (!(await hasReadPermission(dirHandle))) {
                    console.warn(`Permission revoked for folder "${folderName}"`);
                    const removedItems = await handleRevokedFolder(folderName);
                    // Remove items from playlist (will be rebuilt anyway, but clean up now)
                    setPlaylist(prev => prev.filter(item => !removedItems.some(removed => removed.filePath === item.filePath)));
                    continue;
                  }
                  
                  const mediaItems = await loadMediaFromDirectory(dirHandle, value);
                  allMediaItems.push(...mediaItems);
                } catch (error) {
                  console.error(`Error reloading folder ${folderName}:`, error);
                  // Check if it's a permission error
                  if (error instanceof Error && error.message.includes('Permission denied')) {
                    const removedItems = await handleRevokedFolder(folderName);
                    // Remove items from playlist (will be rebuilt anyway, but clean up now)
                    setPlaylist(prev => prev.filter(item => !removedItems.some(removed => removed.filePath === item.filePath)));
                  } else {
                    // Other error - skip this folder
                    showWarning(`Failed to reload folder "${folderName}": ${error instanceof Error ? error.message : 'Unknown error'}`);
                  }
                }
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
        dateFilterEnabled={dateFilterEnabled}
        onDateFilterEnabledChange={(value) => {
          setDateFilterEnabled(value);
          saveSettings({ dateFilterEnabled: value }, { showError, showWarning });
        }}
        dateFilterDays={dateFilterDays}
        onDateFilterDaysChange={(value) => {
          setDateFilterDays(value);
          saveSettings({ dateFilterDays: value }, { showError, showWarning });
        }}
        slideDelayMs={slideDelayMs}
        onSlideDelayChange={(value) => {
          setSlideDelayMs(value);
          saveSettings({ slideDelayMs: value }, { showError, showWarning });
        }}
        zoomFactor={zoomFactor}
        effectiveZoom={effectiveZoom}
        onZoomChange={setZoomFactor}
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
        onChangeFolder={handleChangeFolder}
        onOpenPlaylist={() => setShowPlaylist(true)}
        onOpenSettings={() => setShowSettings(true)}
        onSort={handleSort}
        currentSortMode={sortMode}
        currentIndex={currentIndex}
        totalCount={playlist.length}
        isManifestMode={isManifestMode}
        onExitManifestMode={handleExitManifestMode}
        toolbarVisible={toolbarVisible}
        onMenuOpenChange={setToolbarMenuOpen}
      />

      {showPlaylist && (
        <PlaylistWindow
          playlist={playlist}
          currentIndex={currentIndex}
          onClose={() => setShowPlaylist(false)}
          onNavigateToFile={handleNavigateToFile}
          onRemoveFile={handleRemoveFile}
          onPlayFromFile={handlePlayFromFile}
          onRemoveFolder={async (folderName) => {
            // Remove folder (hook handles state and IndexedDB)
            await removeFolder(folderName);
            
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
            
            // Clear URL params when folder is removed
            syncUrlToState({ path: null, files: [] });
          }}
          onAddFolder={handleAddFolder}
        />
      )}

      {showSettings && (
        <SettingsWindow
          onClose={() => setShowSettings(false)}
          onOpenDiagnostics={() => setShowDiagnostics(true)}
          onSave={async () => {
            showSuccess('Settings saved successfully');
            // Reload settings to apply changes immediately
            const currentSettings = loadSettings({ showError, showWarning });
            if (currentSettings.saveTransitionEffect) {
              setTransitionEffect(currentSettings.transitionEffect);
            }
            setBackgroundBlur(currentSettings.backgroundBlur);
            setShowFileNameOverlay(currentSettings.showFileNameOverlay);
            if (currentSettings.saveDateFilter) {
              setDateFilterEnabled(currentSettings.dateFilterEnabled);
              setDateFilterDays(currentSettings.dateFilterDays);
            }
            // Check if saveFolders was disabled and clear saved folders from IndexedDB if so
            if (!currentSettings.saveFolders) {
              try {
                await clearAllFolders();
                // Note: Current folders in state remain active, but won't be saved on next load
              } catch (error) {
                // Error already shown by clearAllFolders via toast
                console.warn('Error clearing directory handles:', error);
              }
            }
          }}
        />
      )}

      <KeyboardShortcutsHelp 
          isOpen={showShortcutsHelp} 
          onClose={() => setShowShortcutsHelp(false)} 
        />

      <DiagnosticsPanel
          isOpen={showDiagnostics}
          onClose={() => setShowDiagnostics(false)}
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

      {updateAvailable && (
        <UpdatePrompt 
          onReload={handleApplyUpdate}
          onDismiss={() => setUpdateAvailable(false)}
        />
      )}
      
    </div>
  );
}

export default App;

