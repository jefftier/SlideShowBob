import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Toolbar.css';

interface ToolbarProps {
  isPlaying: boolean;
  includeVideos: boolean;
  onIncludeVideosChange: (value: boolean) => void;
  slideDelayMs: number;
  onSlideDelayChange: (value: number) => void;
  zoomFactor: number;
  effectiveZoom?: number;
  onZoomChange: (value: number) => void;
  isFitToWindow: boolean;
  onFitToWindowChange: (value: boolean) => void;
  isMuted: boolean;
  onMuteToggle: () => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRestart: () => void;
  onAddFolder: () => void;
  onOpenPlaylist: () => void;
  onOpenSettings: () => void;
  onOpenShortcutsHelp?: () => void;
  onSort: (mode: 'NameAZ' | 'NameZA' | 'DateOldest' | 'DateNewest' | 'Random') => void;
  currentSortMode?: 'NameAZ' | 'NameZA' | 'DateOldest' | 'DateNewest' | 'Random';
  currentIndex: number;
  totalCount: number;
  statusText: string;
  isManifestMode?: boolean;
  onExitManifestMode?: () => void;
  toolbarVisible?: boolean;
  isKioskMode?: boolean;
  onEnterKiosk?: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  isPlaying,
  includeVideos,
  onIncludeVideosChange,
  slideDelayMs,
  onSlideDelayChange,
  zoomFactor,
  effectiveZoom,
  onZoomChange,
  isFitToWindow,
  onFitToWindowChange,
  isMuted,
  onMuteToggle,
  isFullscreen,
  onFullscreenToggle,
  onPlayPause,
  onNext,
  onPrevious,
  onRestart,
  onAddFolder,
  onOpenPlaylist,
  onOpenSettings,
  onOpenShortcutsHelp,
  onSort,
  currentSortMode,
  currentIndex,
  totalCount,
  statusText,
  isManifestMode,
  onExitManifestMode,
  toolbarVisible = true,
  isKioskMode = false,
  onEnterKiosk
}) => {
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  // Calculate menu position when it opens
  useEffect(() => {
    if (showSortMenu && sortButtonRef.current) {
      const rect = sortButtonRef.current.getBoundingClientRect();
      // Position menu above the button
      const menuHeight = 200; // Approximate menu height
      setMenuPosition({
        top: rect.top - menuHeight - 8, // Position above button with 8px gap
        left: rect.left
      });
    }
  }, [showSortMenu]);

  // Close sort menu when clicking outside
  useEffect(() => {
    if (!showSortMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if click is on the menu or button
      const menuElement = document.querySelector('.sort-menu');
      if (menuElement && (menuElement.contains(target) || sortButtonRef.current?.contains(target))) {
        return; // Don't close if clicking on menu or button
      }
      // Close menu if clicking outside
      setShowSortMenu(false);
    };

    // Use click instead of mousedown to allow onClick handlers to fire first
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true); // Use capture phase
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [showSortMenu]);

  const displayIndex = currentIndex >= 0 ? currentIndex + 1 : 0;

  // Don't render toolbar at all in kiosk mode
  if (isKioskMode) {
    return null;
  }

  return (
    <>
      {!isMinimized ? (
        <div className={`toolbar-expanded ${(isManifestMode && !toolbarVisible) ? 'hidden' : ''}`}>
          <div className="toolbar-content">
            <button
              className="toolbar-btn"
              onClick={onPrevious}
              title="Previous"
              aria-label="Previous slide"
            >
              ⏮
            </button>
            <div className="toolbar-separator"></div>
            
            {!isPlaying ? (
              <button
                className="toolbar-btn"
                onClick={onPlayPause}
                title="Start slideshow"
                aria-label="Start slideshow"
              >
                ▶
              </button>
            ) : (
              <button
                className="toolbar-btn"
                onClick={onPlayPause}
                title="Pause slideshow"
                aria-label="Pause slideshow"
              >
                ⏸
              </button>
            )}
            
            <div className="toolbar-separator"></div>
            
            <button
              className="toolbar-btn"
              onClick={onNext}
              title="Next"
              aria-label="Next slide"
            >
              ⏭
            </button>
            
            <div className="toolbar-separator"></div>
            
            <button
              className="toolbar-btn"
              onClick={onRestart}
              title="Restart slideshow from beginning"
              aria-label="Restart slideshow from beginning"
            >
              ↺
            </button>
            
            <div className="toolbar-separator"></div>
            
            <button
              className={`toolbar-btn-toggle ${isFitToWindow ? 'active' : ''}`}
              onClick={() => onFitToWindowChange(!isFitToWindow)}
              title="Fit to window"
              aria-label="Fit to window"
            >
              Fit
            </button>
            
            <div className="toolbar-separator"></div>
            
            <span className="toolbar-label">Zoom</span>
            <button
              className="toolbar-btn-small"
              onClick={() => onZoomChange(Math.max(zoomFactor - 0.1, 0.1))}
              title="Zoom out"
              aria-label="Zoom out"
            >
              −
            </button>
            <span className="toolbar-value">{Math.round((effectiveZoom !== undefined ? effectiveZoom : zoomFactor) * 100)}%</span>
            <button
              className="toolbar-btn-small"
              onClick={() => onZoomChange(Math.min(zoomFactor + 0.1, 5))}
              title="Zoom in"
              aria-label="Zoom in"
            >
              +
            </button>
            
            <div className="toolbar-separator"></div>
            
            <button
              className={`toolbar-btn-toggle ${includeVideos ? 'active' : ''}`}
              onClick={() => onIncludeVideosChange(!includeVideos)}
              title="Include videos and GIFs"
              aria-label="Include videos and GIFs"
            >
              GIF / MP4
            </button>
            
            <div className="toolbar-separator"></div>
            
            <button
              className="toolbar-btn"
              onClick={onMuteToggle}
              title={isMuted ? 'Unmute' : 'Mute'}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇' : '🔊'}
            </button>
            
            <div className="toolbar-separator"></div>
            
            {!isFullscreen ? (
              <button
                className="toolbar-btn"
                onClick={onFullscreenToggle}
                title="Toggle fullscreen"
                aria-label="Toggle fullscreen"
              >
                ⛶
              </button>
            ) : (
              <button
                className="toolbar-btn"
                onClick={onFullscreenToggle}
                title="Exit fullscreen"
                aria-label="Exit fullscreen"
              >
                ⛶
              </button>
            )}
            
            <div className="toolbar-separator"></div>
            
            <button
              className="toolbar-btn"
              onClick={onAddFolder}
              title="Change folder"
              aria-label="Change folder"
            >
              📁
            </button>
            
            <div className="toolbar-separator"></div>
            
            <button
              className="toolbar-btn"
              onClick={onOpenPlaylist}
              title="Playlist editor"
              aria-label="Playlist editor"
            >
              ☰
            </button>
            
            <div className="toolbar-separator"></div>
            
            <div className="toolbar-sort-container" ref={sortMenuRef}>
              <button
                ref={sortButtonRef}
                className="toolbar-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('Sort button clicked, current state:', showSortMenu);
                  setShowSortMenu(!showSortMenu);
                }}
                title="Sort options"
                aria-label="Sort options"
              >
                ⇅
              </button>
              {showSortMenu && createPortal(
                <div 
                  className="sort-menu" 
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'fixed',
                    top: `${menuPosition.top}px`,
                    left: `${menuPosition.left}px`
                  }}
                >
                  <button 
                    className={currentSortMode === 'NameAZ' ? 'sort-menu-item-active' : ''}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => { 
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Sort button clicked: NameAZ, onSort type:', typeof onSort);
                      if (onSort) {
                        onSort('NameAZ');
                      }
                      setShowSortMenu(false); 
                    }}
                  >
                    Name (A-Z) {currentSortMode === 'NameAZ' && '✓'}
                  </button>
                  <button 
                    className={currentSortMode === 'NameZA' ? 'sort-menu-item-active' : ''}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => { 
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Sort button clicked: NameZA');
                      if (onSort) {
                        onSort('NameZA');
                      }
                      setShowSortMenu(false); 
                    }}
                  >
                    Name (Z-A) {currentSortMode === 'NameZA' && '✓'}
                  </button>
                  <button 
                    className={currentSortMode === 'DateOldest' ? 'sort-menu-item-active' : ''}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => { 
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Sort button clicked: DateOldest');
                      if (onSort) {
                        onSort('DateOldest');
                      }
                      setShowSortMenu(false); 
                    }}
                  >
                    Date (Oldest First) {currentSortMode === 'DateOldest' && '✓'}
                  </button>
                  <button 
                    className={currentSortMode === 'DateNewest' ? 'sort-menu-item-active' : ''}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => { 
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Sort button clicked: DateNewest');
                      if (onSort) {
                        onSort('DateNewest');
                      }
                      setShowSortMenu(false); 
                    }}
                  >
                    Date (Newest First) {currentSortMode === 'DateNewest' && '✓'}
                  </button>
                  <button 
                    className={currentSortMode === 'Random' ? 'sort-menu-item-active' : ''}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => { 
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Sort button clicked: Random');
                      if (onSort) {
                        onSort('Random');
                      }
                      setShowSortMenu(false); 
                    }}
                  >
                    Random {currentSortMode === 'Random' && '✓'}
                  </button>
                </div>,
                document.body
              )}
            </div>
            
            <div className="toolbar-separator"></div>
            
            {!isKioskMode && onEnterKiosk && (
              <>
                <button
                  className="toolbar-btn"
                  onClick={onEnterKiosk}
                  title="Enter Kiosk Mode (fullscreen + hide UI)"
                  aria-label="Enter kiosk mode"
                >
                  🖥
                </button>
                <div className="toolbar-separator"></div>
              </>
            )}
            
            <button
              className="toolbar-btn"
              onClick={onOpenSettings}
              title="App Settings"
              aria-label="App settings"
            >
              ⚙
            </button>
            
            {onOpenShortcutsHelp && (
              <>
                <div className="toolbar-separator"></div>
                <button
                  className="toolbar-btn"
                  onClick={onOpenShortcutsHelp}
                  title="Keyboard Shortcuts (?)"
                  aria-label="Keyboard shortcuts"
                >
                  ?
                </button>
              </>
            )}
            
            {isManifestMode && onExitManifestMode && (
              <>
                <div className="toolbar-separator"></div>
                <button
                  className="toolbar-btn"
                  onClick={onExitManifestMode}
                  title="Exit Manifest Mode"
                  aria-label="Exit manifest mode"
                >
                  ⛶
                </button>
              </>
            )}
            
            <div className="toolbar-separator"></div>
            
            <span className="toolbar-label">Delay</span>
            <input
              type="number"
              className="toolbar-input"
              value={slideDelayMs}
              onChange={(e) => onSlideDelayChange(parseInt(e.target.value) || 0)}
              min="0"
              step="100"
            />
            
            <div className="toolbar-separator"></div>
            
            <button
              className="toolbar-btn"
              onClick={() => setIsMinimized(true)}
              title="Minimize toolbar"
              aria-label="Minimize toolbar"
            >
              ▾
            </button>
          </div>
        </div>
      ) : (
        <div className={`toolbar-minimized ${(isManifestMode && !toolbarVisible) ? 'hidden' : ''}`}>
          <button className="toolbar-btn" onClick={onPrevious} title="Previous" aria-label="Previous slide">⏮</button>
          <div className="toolbar-separator"></div>
          <button 
            className="toolbar-btn" 
            onClick={onPlayPause} 
            title={isPlaying ? "Pause slideshow" : "Play slideshow"}
            aria-label={isPlaying ? "Pause slideshow" : "Play slideshow"}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <div className="toolbar-separator"></div>
          <button className="toolbar-btn" onClick={onNext} title="Next" aria-label="Next slide">⏭</button>
          <div className="toolbar-separator"></div>
          <button 
            className="toolbar-btn" 
            onClick={onFullscreenToggle} 
            title={isFullscreen ? "Exit fullscreen" : "Toggle fullscreen"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Toggle fullscreen"}
          >
            ⛶
          </button>
          <div className="toolbar-separator"></div>
          <button className="toolbar-btn" onClick={onOpenPlaylist} title="Playlist editor" aria-label="Playlist editor">☰</button>
          <div className="toolbar-separator"></div>
          <button className="toolbar-btn" onClick={() => setIsMinimized(false)} title="Expand toolbar" aria-label="Expand toolbar">▴</button>
        </div>
      )}
      
      <div className="status-bar">
        <span>{statusText}</span>
      </div>
      
      <div className="title-count">
        {displayIndex} / {totalCount}
      </div>
    </>
  );
};

export default Toolbar;

