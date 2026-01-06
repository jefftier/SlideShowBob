import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import MediaDisplay from './components/MediaDisplay';
import Toolbar from './components/Toolbar';
import PlaylistWindow from './components/PlaylistWindow';
import SettingsWindow from './components/SettingsWindow';
import { useSlideshow } from './hooks/useSlideshow';
import { useMediaLoader } from './hooks/useMediaLoader';
import { MediaItem, MediaType } from './types/media';
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

  const { navigateNext, navigatePrevious, startSlideshow, stopSlideshow, onVideoEnded } = useSlideshow({
    playlist: filteredPlaylist,
    currentIndex: filteredCurrentIndex,
    slideDelayMs,
    isPlaying,
    onNavigate: handleNavigate
  });

  const { loadMediaFromFolders, loadMediaFromDirectory } = useMediaLoader();

  // Note: File System Access API requires user interaction to access directories
  // We can't automatically load folders on mount - user must select them
  // In production, you'd store directory handles in IndexedDB for persistence

  // Note: In production, directory handles should be stored in IndexedDB
  // For now, we just store folder names (which are not sufficient to re-access)

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
        
        // Store directory handle for later use
        const newHandles = new Map(directoryHandles);
        newHandles.set(folderName, dirHandle);
        setDirectoryHandles(newHandles);
        
        // Load media from the selected directory
        setStatusText('Loading...');
        try {
          const mediaItems = await loadMediaFromDirectory(dirHandle, includeVideos);
          let sortedItems = [...mediaItems];
          
          // Apply sorting
          sortedItems = sortMediaItems(sortedItems, sortMode);
          
          // Merge with existing playlist (avoid duplicates)
          const existingPaths = new Set(playlist.map(item => item.filePath));
          const newItems = sortedItems.filter(item => !existingPaths.has(item.filePath));
          
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
          
          setStatusText('');
        } catch (error) {
          setStatusText(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          console.error('Error loading directory:', error);
        }
      } else {
        // Fallback: use file input for folder selection (limited browser support)
        alert('File System Access API not supported. Please use Chrome, Edge, or another modern browser.');
      }
    } catch (error) {
      if ((error as any).name !== 'AbortError') {
        console.error('Error selecting folder:', error);
        setStatusText('Error selecting folder');
      }
    }
  };

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      stopSlideshow();
      setIsPlaying(false);
    } else {
      if (playlist.length > 0 && slideDelayMs > 0) {
        startSlideshow();
        setIsPlaying(true);
      }
    }
  }, [isPlaying, playlist.length, slideDelayMs, startSlideshow, stopSlideshow]);

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

  const handleZoomReset = useCallback(() => {
    setZoomFactor(1.0);
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
          setZoomFactor(prev => Math.min(prev + 0.1, 5));
          break;
        case '-':
        case '_':
          e.preventDefault();
          setZoomFactor(prev => Math.max(prev - 0.1, 0.1));
          break;
        case '0':
          if (!e.shiftKey) {
            e.preventDefault();
            handleZoomReset();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, showPlaylist, showSettings, handlePlayPause, handleNext, handlePrevious, handleToggleFullscreen, handleZoomReset]);

  return (
    <div className="app">
      <MediaDisplay
        currentMedia={currentMedia}
        zoomFactor={zoomFactor}
        isFitToWindow={isFitToWindow}
        isMuted={isMuted}
        onVideoEnded={onVideoEnded}
        onImageClick={handleNext}
        onEffectiveZoomChange={setEffectiveZoom}
      />
      
      {playlist.length === 0 && (
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
        onSlideDelayChange={setSlideDelayMs}
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
          onRemoveFolder={(folderName) => {
            // Remove folder from folders list
            const newFolders = folders.filter(f => f !== folderName);
            setFolders(newFolders);
            
            // Remove directory handle
            const newHandles = new Map(directoryHandles);
            newHandles.delete(folderName);
            setDirectoryHandles(newHandles);
            
            // Remove all files from that folder
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
          }}
          onAddFolder={handleAddFolder}
        />
      )}

      {showSettings && (
        <SettingsWindow
          onClose={() => setShowSettings(false)}
          folders={folders}
          onRemoveFolder={(folder) => {
            const newFolders = folders.filter(f => f !== folder);
            setFolders(newFolders);
            // Note: Removing a folder name doesn't remove files from playlist
            // In production, you'd track which files came from which directory handle
            // and remove only those files
          }}
        />
      )}
    </div>
  );
}

export default App;

