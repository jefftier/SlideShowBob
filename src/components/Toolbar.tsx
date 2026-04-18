import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  IconPrevious,
  IconNext,
  IconPlay,
  IconPause,
  IconRestart,
  IconFullscreen,
  IconFullscreenExit,
  IconMore,
  IconChevronDown,
  IconChevronUp,
  IconFolder,
  IconList,
  IconSort,
  IconDisplay,
  IconSettings,
  IconHelp,
  IconSpeakerOn,
  IconSpeakerOff,
  IconZoomIn,
  IconZoomOut,
  IconFit,
  IconVideo,
  IconGrip,
} from './ToolbarIcons';
import './Toolbar.css';

const TOOLBAR_POSITION_KEY = 'slideshow-toolbar-position';

function loadToolbarPosition(): { left: number; top: number } {
  try {
    const s = localStorage.getItem(TOOLBAR_POSITION_KEY);
    if (s) {
      const { left, top } = JSON.parse(s);
      if (typeof left === 'number' && typeof top === 'number') return { left, top };
    }
  } catch (_) {}
  return { left: -1, top: -1 }; // use CSS default (bottom center)
}

function saveToolbarPosition(left: number, top: number) {
  try {
    localStorage.setItem(TOOLBAR_POSITION_KEY, JSON.stringify({ left, top }));
  } catch (_) {}
}

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
  onMenuOpenChange?: (isOpen: boolean) => void;
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
  onEnterKiosk,
  onMenuOpenChange,
}) => {
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  // Draggable toolbar position (pixels; -1 means use CSS default)
  const [position, setPosition] = useState(loadToolbarPosition);
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  const shellRef = useRef<HTMLDivElement>(null);

  // Notify parent when menu open state changes (for idle timer pausing)
  useEffect(() => {
    onMenuOpenChange?.(showSortMenu || showMoreMenu);
  }, [showSortMenu, showMoreMenu, onMenuOpenChange]);

  // Close menus when clicking outside
  useEffect(() => {
    if (!showSortMenu && !showMoreMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inSort = document.querySelector('.sort-menu')?.contains(target);
      const inMore = moreMenuRef.current?.contains(target) || moreButtonRef.current?.contains(target);
      if (!inSort) setShowSortMenu(false);
      if (!inMore) setShowMoreMenu(false);
    };
    const t = setTimeout(() => document.addEventListener('click', handleClickOutside, true), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [showSortMenu, showMoreMenu]);

  // Position More menu above the button
  useEffect(() => {
    if (showMoreMenu && moreButtonRef.current) {
      const rect = moreButtonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.top - 8,
        left: rect.left,
      });
    }
  }, [showMoreMenu]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t.closest('button') || t.closest('.sort-menu') || t.closest('.more-menu')) return;
      dragRef.current = {
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: position.left,
        startTop: position.top,
      };
    },
    [position]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.isDragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      let left = dragRef.current.startLeft + dx;
      let top = dragRef.current.startTop + dy;
      if (dragRef.current.startLeft < 0) {
        const shell = shellRef.current;
        if (shell) {
          const r = shell.getBoundingClientRect();
          left = r.left + dx;
          top = r.top + dy;
        }
      }
      const padding = 8;
      left = Math.max(padding, Math.min(window.innerWidth - (shellRef.current?.offsetWidth ?? 400) - padding, left));
      top = Math.max(padding, Math.min(window.innerHeight - (shellRef.current?.offsetHeight ?? 80) - padding, top));
      setPosition({ left, top });
    };
    const onUp = () => {
      if (dragRef.current.isDragging) {
        const { startLeft, startTop } = dragRef.current;
        if (startLeft >= 0 && startTop >= 0) {
          saveToolbarPosition(position.left, position.top);
        } else if (shellRef.current) {
          const r = shellRef.current.getBoundingClientRect();
          saveToolbarPosition(r.left, r.top);
          setPosition({ left: r.left, top: r.top });
        }
        dragRef.current.isDragging = false;
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [position]);

  const displayIndex = currentIndex >= 0 ? currentIndex + 1 : 0;

  if (isKioskMode) return null;

  const hidden = !toolbarVisible;
  const shellStyle =
    position.left >= 0 && position.top >= 0
      ? { left: position.left, top: position.top, bottom: 'auto', transform: 'translateX(0)' }
      : undefined;

  const sortMenuPortal = showSortMenu &&
    createPortal(
      <div
        className="sort-menu glass-menu"
        role="menu"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: `${menuPosition.top}px`,
          left: `${menuPosition.left}px`,
          transform: 'translateY(-100%)',
        }}
      >
        {[
          { mode: 'NameAZ' as const, label: 'Name (A–Z)' },
          { mode: 'NameZA' as const, label: 'Name (Z–A)' },
          { mode: 'DateOldest' as const, label: 'Date (Oldest First)' },
          { mode: 'DateNewest' as const, label: 'Date (Newest First)' },
          { mode: 'Random' as const, label: 'Random' },
        ].map(({ mode, label }) => (
          <button
            key={mode}
            role="menuitem"
            className={currentSortMode === mode ? 'glass-menu-item-active' : ''}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onSort(mode);
              setShowSortMenu(false);
            }}
          >
            {label} {currentSortMode === mode && '✓'}
          </button>
        ))}
      </div>,
      document.body
    );

  const moreMenuPortal = showMoreMenu &&
    createPortal(
      <div
        ref={moreMenuRef}
        className="more-menu glass-menu"
        role="menu"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: `${menuPosition.top}px`,
          left: `${menuPosition.left}px`,
          transform: 'translateY(-100%)',
          minWidth: '220px',
        }}
      >
        <button role="menuitem" className="glass-menu-item" onClick={() => { onRestart(); setShowMoreMenu(false); }}>
          <IconRestart /> Restart from beginning
        </button>
        <button
          role="menuitem"
          className={`glass-menu-item ${isFitToWindow ? 'glass-menu-item-active' : ''}`}
          onClick={() => { onFitToWindowChange(!isFitToWindow); setShowMoreMenu(false); }}
        >
          <IconFit /> Fit to window
        </button>
        <div className="glass-menu-row">
          <span className="glass-menu-label">Zoom</span>
          <span className="glass-menu-actions">
            <button type="button" className="glass-menu-icon-btn" onClick={() => onZoomChange(Math.max(zoomFactor - 0.1, 0.1))} aria-label="Zoom out"><IconZoomOut /></button>
            <span className="glass-menu-value">{Math.round((effectiveZoom !== undefined ? effectiveZoom : zoomFactor) * 100)}%</span>
            <button type="button" className="glass-menu-icon-btn" onClick={() => onZoomChange(Math.min(zoomFactor + 0.1, 5))} aria-label="Zoom in"><IconZoomIn /></button>
          </span>
        </div>
        <button
          role="menuitem"
          className={`glass-menu-item ${includeVideos ? 'glass-menu-item-active' : ''}`}
          onClick={() => { onIncludeVideosChange(!includeVideos); setShowMoreMenu(false); }}
        >
          <IconVideo /> Include GIF / MP4
        </button>
        <button role="menuitem" className="glass-menu-item" onClick={() => { onMuteToggle(); setShowMoreMenu(false); }}>
          {isMuted ? <IconSpeakerOff /> : <IconSpeakerOn />} {isMuted ? 'Unmute' : 'Mute'}
        </button>
        <div className="glass-menu-divider" />
        <button role="menuitem" className="glass-menu-item" onClick={() => { onAddFolder(); setShowMoreMenu(false); }}>
          <IconFolder /> Change folder
        </button>
        <button role="menuitem" className="glass-menu-item" onClick={() => { onOpenPlaylist(); setShowMoreMenu(false); }}>
          <IconList /> Playlist editor
        </button>
        <button
          role="menuitem"
          className="glass-menu-item"
          onClick={(e) => {
            e.stopPropagation();
            if (moreButtonRef.current) {
              const r = moreButtonRef.current.getBoundingClientRect();
              setMenuPosition({ top: r.top, left: r.left });
            }
            setShowMoreMenu(false);
            setShowSortMenu(true);
          }}
        >
          <IconSort /> Sort
        </button>
        {!isKioskMode && onEnterKiosk && (
          <button role="menuitem" className="glass-menu-item" onClick={() => { onEnterKiosk(); setShowMoreMenu(false); }}>
            <IconDisplay /> Kiosk mode
          </button>
        )}
        <button role="menuitem" className="glass-menu-item" onClick={() => { onOpenSettings(); setShowMoreMenu(false); }}>
          <IconSettings /> Settings
        </button>
        {onOpenShortcutsHelp && (
          <button role="menuitem" className="glass-menu-item" onClick={() => { onOpenShortcutsHelp(); setShowMoreMenu(false); }}>
            <IconHelp /> Keyboard shortcuts
          </button>
        )}
        <div className="glass-menu-row">
          <span className="glass-menu-label">Slide delay (ms)</span>
          <input
            type="number"
            className="glass-menu-input"
            value={slideDelayMs}
            onChange={(e) => onSlideDelayChange(parseInt(e.target.value) || 0)}
            min={0}
            step={100}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        {isManifestMode && onExitManifestMode && (
          <>
            <div className="glass-menu-divider" />
            <button role="menuitem" className="glass-menu-item" onClick={() => { onExitManifestMode(); setShowMoreMenu(false); }}>
              <IconFullscreenExit /> Exit manifest mode
            </button>
          </>
        )}
      </div>,
      document.body
    );

  return (
    <>
      <div
        ref={shellRef}
        className={`toolbar-shell ${hidden ? 'hidden' : ''}`}
        style={shellStyle}
        onMouseDown={handleMouseDown}
      >
        <div className="toolbar-grip" aria-hidden><IconGrip /></div>
        {!isMinimized ? (
          <div className="toolbar-expanded glass-bar">
            <div className="toolbar-content">
              <button type="button" className="toolbar-btn glass-btn" onClick={onPrevious} title="Previous" aria-label="Previous slide">
                <IconPrevious />
              </button>
              <div className="toolbar-separator" />
              {!isPlaying ? (
                <button type="button" className="toolbar-btn glass-btn" onClick={onPlayPause} title="Start slideshow" aria-label="Start slideshow">
                  <IconPlay />
                </button>
              ) : (
                <button type="button" className="toolbar-btn glass-btn" onClick={onPlayPause} title="Pause" aria-label="Pause slideshow">
                  <IconPause />
                </button>
              )}
              <div className="toolbar-separator" />
              <button type="button" className="toolbar-btn glass-btn" onClick={onNext} title="Next" aria-label="Next slide">
                <IconNext />
              </button>
              <div className="toolbar-separator" />
              <button type="button" className="toolbar-btn glass-btn" onClick={onFullscreenToggle} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                {isFullscreen ? <IconFullscreenExit /> : <IconFullscreen />}
              </button>
              <div className="toolbar-separator" />
              <button
                ref={moreButtonRef}
                type="button"
                className="toolbar-btn glass-btn"
                onClick={(e) => { e.stopPropagation(); setShowMoreMenu(!showMoreMenu); setShowSortMenu(false); }}
                title="More options"
                aria-label="More options"
                aria-expanded={showMoreMenu}
              >
                <IconMore />
              </button>
              <div className="toolbar-separator" />
              <button
                type="button"
                className="toolbar-btn glass-btn"
                onClick={() => setIsMinimized(true)}
                title="Minimize toolbar"
                aria-label="Minimize toolbar"
              >
                <IconChevronDown />
              </button>
            </div>
          </div>
        ) : (
          <div className="toolbar-minimized glass-bar">
            <button type="button" className="toolbar-btn glass-btn" onClick={onPrevious} title="Previous" aria-label="Previous slide"><IconPrevious /></button>
            <div className="toolbar-separator" />
            <button type="button" className="toolbar-btn glass-btn" onClick={onPlayPause} title={isPlaying ? 'Pause' : 'Play'} aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <IconPause /> : <IconPlay />}
            </button>
            <div className="toolbar-separator" />
            <button type="button" className="toolbar-btn glass-btn" onClick={onNext} title="Next" aria-label="Next slide"><IconNext /></button>
            <div className="toolbar-separator" />
            <button type="button" className="toolbar-btn glass-btn" onClick={onFullscreenToggle} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullscreen ? <IconFullscreenExit /> : <IconFullscreen />}
            </button>
            <div className="toolbar-separator" />
            <button
              ref={moreButtonRef}
              type="button"
              className="toolbar-btn glass-btn"
              onClick={(e) => { e.stopPropagation(); setShowMoreMenu(!showMoreMenu); }}
              title="More options"
              aria-label="More options"
              aria-expanded={showMoreMenu}
            >
              <IconMore />
            </button>
            <div className="toolbar-separator" />
            <button type="button" className="toolbar-btn glass-btn" onClick={() => setIsMinimized(false)} title="Expand toolbar" aria-label="Expand toolbar">
              <IconChevronUp />
            </button>
          </div>
        )}
        <div className="toolbar-footer">
          <span className="toolbar-status">{statusText}</span>
        </div>
        <span className="toolbar-count">{displayIndex} / {totalCount}</span>
      </div>
      {showMoreMenu && moreMenuPortal}
      {showSortMenu && !showMoreMenu && sortMenuPortal}
    </>
  );
};

export default Toolbar;
