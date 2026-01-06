import React, { useState } from 'react';
import './Toolbar.css';

interface ToolbarProps {
  isPlaying: boolean;
  includeVideos: boolean;
  onIncludeVideosChange: (value: boolean) => void;
  slideDelayMs: number;
  onSlideDelayChange: (value: number) => void;
  zoomFactor: number;
  onZoomChange: (value: number) => void;
  onZoomReset: () => void;
  isFitToWindow: boolean;
  onFitToWindowChange: (value: boolean) => void;
  isMuted: boolean;
  onMuteToggle: () => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onAddFolder: () => void;
  onOpenPlaylist: () => void;
  onOpenSettings: () => void;
  onSort: (mode: 'NameAZ' | 'NameZA' | 'DateOldest' | 'DateNewest' | 'Random') => void;
  currentIndex: number;
  totalCount: number;
  statusText: string;
}

const Toolbar: React.FC<ToolbarProps> = ({
  isPlaying,
  includeVideos,
  onIncludeVideosChange,
  slideDelayMs,
  onSlideDelayChange,
  zoomFactor,
  onZoomChange,
  onZoomReset,
  isFitToWindow,
  onFitToWindowChange,
  isMuted,
  onMuteToggle,
  isFullscreen,
  onFullscreenToggle,
  onPlayPause,
  onNext,
  onPrevious,
  onAddFolder,
  onOpenPlaylist,
  onOpenSettings,
  onSort,
  currentIndex,
  totalCount,
  statusText
}) => {
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const displayIndex = currentIndex >= 0 ? currentIndex + 1 : 0;

  return (
    <>
      {!isMinimized ? (
        <div className="toolbar-expanded">
          <div className="toolbar-content">
            <button
              className="toolbar-btn"
              onClick={onPrevious}
              title="Previous"
              aria-label="Previous"
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
              aria-label="Next"
            >
              ⏭
            </button>
            
            <div className="toolbar-separator"></div>
            
            <button
              className="toolbar-btn"
              title="Replay video"
              aria-label="Replay video"
            >
              ↻
            </button>
            
            <div className="toolbar-separator"></div>
            
            <button
              className={`toolbar-btn-toggle ${isFitToWindow ? 'active' : ''}`}
              onClick={() => onFitToWindowChange(!isFitToWindow)}
              title="Fit to window"
            >
              Fit
            </button>
            
            <div className="toolbar-separator"></div>
            
            <span className="toolbar-label">Zoom</span>
            <span className="toolbar-value">{Math.round(zoomFactor * 100)}%</span>
            <button
              className="toolbar-btn-small"
              onClick={onZoomReset}
              title="Reset zoom to 100%"
            >
              100%
            </button>
            
            <div className="toolbar-separator"></div>
            
            <button
              className={`toolbar-btn-toggle ${includeVideos ? 'active' : ''}`}
              onClick={() => onIncludeVideosChange(!includeVideos)}
              title="Include videos and GIFs"
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
            
            <div className="toolbar-sort-container">
              <button
                className="toolbar-btn"
                onClick={() => setShowSortMenu(!showSortMenu)}
                title="Sort options"
                aria-label="Sort options"
              >
                ⇅
              </button>
              {showSortMenu && (
                <div className="sort-menu">
                  <button onClick={() => { onSort('NameAZ'); setShowSortMenu(false); }}>
                    Name (A-Z)
                  </button>
                  <button onClick={() => { onSort('NameZA'); setShowSortMenu(false); }}>
                    Name (Z-A)
                  </button>
                  <button onClick={() => { onSort('DateOldest'); setShowSortMenu(false); }}>
                    Date (Oldest First)
                  </button>
                  <button onClick={() => { onSort('DateNewest'); setShowSortMenu(false); }}>
                    Date (Newest First)
                  </button>
                  <button onClick={() => { onSort('Random'); setShowSortMenu(false); }}>
                    Random
                  </button>
                </div>
              )}
            </div>
            
            <div className="toolbar-separator"></div>
            
            <button
              className="toolbar-btn"
              onClick={onOpenSettings}
              title="App Settings"
              aria-label="App Settings"
            >
              ⚙
            </button>
            
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
        <div className="toolbar-minimized">
          <button className="toolbar-btn" onClick={onPrevious} title="Previous">⏮</button>
          <div className="toolbar-separator"></div>
          <button className="toolbar-btn" onClick={onPlayPause} title="Play/Pause">
            {isPlaying ? '⏸' : '▶'}
          </button>
          <div className="toolbar-separator"></div>
          <button className="toolbar-btn" onClick={onNext} title="Next">⏭</button>
          <div className="toolbar-separator"></div>
          <button className="toolbar-btn" onClick={onFullscreenToggle} title="Fullscreen">⛶</button>
          <div className="toolbar-separator"></div>
          <button className="toolbar-btn" onClick={onOpenPlaylist} title="Playlist">☰</button>
          <div className="toolbar-separator"></div>
          <button className="toolbar-btn" onClick={() => setIsMinimized(false)} title="Expand toolbar">▴</button>
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

