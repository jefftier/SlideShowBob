import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const [includeVideos, setIncludeVideos] = useState(false);
  const [slideDelayMs, setSlideDelayMs] = useState(2000);
  const [zoomFactor, setZoomFactor] = useState(1.0);
  const [isFitToWindow, setIsFitToWindow] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sortMode, setSortMode] = useState<'NameAZ' | 'NameZA' | 'DateOldest' | 'DateNewest' | 'Random'>('NameAZ');
  const [playlist, setPlaylist] = useState<MediaItem[]>([]);
  const [statusText, setStatusText] = useState<string>('');

  const { navigateNext, navigatePrevious, startSlideshow, stopSlideshow } = useSlideshow({
    playlist,
    currentIndex,
    slideDelayMs,
    isPlaying,
    onNavigate: (index) => {
      setCurrentIndex(index);
      setCurrentMedia(playlist[index] || null);
    }
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
    const sorted = [...items];
    switch (mode) {
      case 'NameAZ':
        return sorted.sort((a, b) => a.fileName.localeCompare(b.fileName));
      case 'NameZA':
        return sorted.sort((a, b) => b.fileName.localeCompare(a.fileName));
      case 'DateOldest':
        return sorted.sort((a, b) => (a.dateModified || 0) - (b.dateModified || 0));
      case 'DateNewest':
        return sorted.sort((a, b) => (b.dateModified || 0) - (a.dateModified || 0));
      case 'Random':
        return sorted.sort(() => Math.random() - 0.5);
      default:
        return sorted;
    }
  };

  const handleAddFolder = async () => {
    try {
      // Use File System Access API
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker();
        const folderName = dirHandle.name;
        
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

  const handleSort = (mode: 'NameAZ' | 'NameZA' | 'DateOldest' | 'DateNewest' | 'Random') => {
    setSortMode(mode);
    const sorted = sortMediaItems(playlist, mode);
    setPlaylist(sorted);
    // Update current index if needed
    if (currentMedia) {
      const newIndex = sorted.findIndex(item => item.filePath === currentMedia.filePath);
      if (newIndex >= 0) {
        setCurrentIndex(newIndex);
      }
    }
  };

  const handleNavigateToFile = (filePath: string) => {
    const index = playlist.findIndex(item => item.filePath === filePath);
    if (index >= 0) {
      setCurrentIndex(index);
      setCurrentMedia(playlist[index]);
    }
  };

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
        onVideoEnded={() => {
          if (isPlaying) {
            setTimeout(() => navigateNext(), 100);
          }
        }}
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
        onIncludeVideosChange={setIncludeVideos}
        slideDelayMs={slideDelayMs}
        onSlideDelayChange={setSlideDelayMs}
        zoomFactor={zoomFactor}
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
        onAddFolder={handleAddFolder}
        onOpenPlaylist={() => setShowPlaylist(true)}
        onOpenSettings={() => setShowSettings(true)}
        onSort={handleSort}
        currentIndex={currentIndex}
        totalCount={playlist.length}
        statusText={statusText}
      />

      {showPlaylist && (
        <PlaylistWindow
          playlist={playlist}
          currentIndex={currentIndex}
          onClose={() => setShowPlaylist(false)}
          onNavigateToFile={handleNavigateToFile}
          onRemoveFile={handleRemoveFile}
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

