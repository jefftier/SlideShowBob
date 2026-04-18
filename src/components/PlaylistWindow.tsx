import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { MediaItem, MediaType } from '../types/media';
import { buildFolderTree, toggleFolder, setFolderExpanded, FolderNode } from '../utils/folderTree';
import FolderTree from './FolderTree';
import { generateThumbnail, revokeThumbnail } from '../utils/thumbnailGenerator';
import SkeletonLoader from './SkeletonLoader';
import { useToast } from '../hooks/useToast';
import ToastContainer from './ToastContainer';
import './PlaylistWindow.css';

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

interface PendingUndo {
  type: 'file';
  item: MediaItem;
  originalIndex: number;
  toastId: string;
}

interface PlaylistWindowProps {
  playlist: MediaItem[];
  currentIndex: number;
  onClose: () => void;
  onNavigateToFile: (filePath: string) => void;
  onRemoveFile: (filePath: string) => void;
  onRemoveFolder: (folderName: string) => void;
  onAddFolder: () => void;
  onPlayFromFile?: (filePath: string) => void;
}


const PlaylistWindow: React.FC<PlaylistWindowProps> = ({
  playlist,
  currentIndex,
  onClose,
  onNavigateToFile,
  onRemoveFile,
  onRemoveFolder,
  onAddFolder,
  onPlayFromFile
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRootFolder, setSelectedRootFolder] = useState<string | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string>(''); // Path within the root folder
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [isResizing, setIsResizing] = useState(false);
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const pendingUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toasts, showToast, removeToast } = useToast();
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'thumbnail'>('list');
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [loadingThumbnails, setLoadingThumbnails] = useState<Set<string>>(new Set());
  const contentRef = React.useRef<HTMLDivElement>(null);
  const currentItemRef = React.useRef<HTMLLIElement | HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const sidebarRef = React.useRef<HTMLDivElement>(null);
  const modalRef = React.useRef<HTMLDivElement>(null);
  const fileListRef = React.useRef<HTMLUListElement>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const thumbnailObserverRef = useRef<IntersectionObserver | null>(null);
  const thumbnailItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // Build folder tree from playlist
  useEffect(() => {
    const tree = buildFolderTree(playlist);
    
    // Preserve expansion state when rebuilding
    setFolderTree(prev => {
      if (prev.length === 0) {
        // First time - expand first folder
        if (tree.length > 0) {
          return setFolderExpanded(tree, tree[0].name, '', true);
        }
        return tree;
      }
      
      // Merge expansion states from previous tree
      const preserveExpansion = (oldNode: FolderNode, newNode: FolderNode): FolderNode => {
        const preserved: FolderNode = {
          ...newNode,
          isExpanded: oldNode.isExpanded ?? false,
          children: newNode.children.map(child => {
            const oldChild = oldNode.children.find(c => c.fullPath === child.fullPath);
            return oldChild ? preserveExpansion(oldChild, child) : child;
          })
        };
        return preserved;
      };
      
      return tree.map(newRoot => {
        const oldRoot = prev.find(r => r.name === newRoot.name);
        return oldRoot ? preserveExpansion(oldRoot, newRoot) : newRoot;
      });
    });
    
    // Auto-select first folder if none selected
    if (!selectedRootFolder && tree.length > 0) {
      setSelectedRootFolder(tree[0].name);
      setSelectedFolderPath('');
    }
  }, [playlist]);
  
  // Auto-expand path to selected folder when it changes (only expand, never collapse)
  useEffect(() => {
    if (selectedRootFolder && selectedFolderPath) {
      const pathParts = selectedFolderPath.split('/').filter(p => p);
      if (pathParts.length > 0) {
        let currentPath = '';
        
        // Expand all parent folders in a single update
        setFolderTree(prev => {
          let updated = prev;
          pathParts.forEach(part => {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            updated = setFolderExpanded(updated, selectedRootFolder, currentPath, true);
          });
          return updated;
        });
      }
      
      // Reset scroll position to top when folder changes
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }
    }
  }, [selectedRootFolder, selectedFolderPath]);

  // Handle sidebar resizing
  React.useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (sidebarRef.current) {
        const newWidth = e.clientX - sidebarRef.current.getBoundingClientRect().left;
        setSidebarWidth(Math.max(200, Math.min(400, newWidth)));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Filter playlist based on search and selected folder
  // Must be defined before useEffects that use it
  const filteredPlaylist = useMemo(() => {
    let filtered = playlist;

    // Filter out the item pending undo (visually removed but not yet finalized)
    if (pendingUndo) {
      filtered = filtered.filter(item => item.filePath !== pendingUndo.item.filePath);
    }
    
    // Filter by selected root folder and folder path
    if (selectedRootFolder) {
      filtered = filtered.filter(item => {
        // Must match root folder
        if (item.folderName !== selectedRootFolder) return false;
        
        // If no relativePath, it's a root file
        if (!item.relativePath) {
          return selectedFolderPath === '';
        }
        
        // Parse the relative path - split by '/' and remove empty parts
        const pathParts = item.relativePath.split('/').filter(p => p && p.trim() !== '');
        
        // If only one part, it's just the filename (file in root of the selected folder)
        if (pathParts.length === 1) {
          return selectedFolderPath === '';
        }
        
        // Get the folder path (all parts except the last which is the filename)
        const fileFolderPath = pathParts.slice(0, -1).join('/');
        
        // Match exact folder path
        return fileFolderPath === selectedFolderPath;
      });
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.fileName.toLowerCase().includes(query) ||
        (item.relativePath && item.relativePath.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  }, [playlist, pendingUndo, selectedRootFolder, selectedFolderPath, searchQuery]);

  // Auto-scroll to current item when playlist opens (only once on mount)
  React.useEffect(() => {
    if (currentItemRef.current && contentRef.current) {
      // Use a small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        if (currentItemRef.current) {
          currentItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []); // Only run once when component mounts

  // Load thumbnail for an item
  // Must be defined before useEffects that use it
  const loadThumbnail = useCallback(async (item: MediaItem) => {
    if (!item.file || thumbnails.has(item.filePath) || loadingThumbnails.has(item.filePath)) {
      return;
    }

    setLoadingThumbnails(prev => new Set(prev).add(item.filePath));

    try {
      const thumbnailUrl = await generateThumbnail(item.file, item.filePath, item.type);
      if (thumbnailUrl) {
        setThumbnails(prev => new Map(prev).set(item.filePath, thumbnailUrl));
      }
    } catch (error) {
      console.error(`Error loading thumbnail for ${item.filePath}:`, error);
    } finally {
      setLoadingThumbnails(prev => {
        const next = new Set(prev);
        next.delete(item.filePath);
        return next;
      });
    }
  }, [thumbnails, loadingThumbnails]);

  // Setup intersection observer for virtual scrolling in thumbnail view
  useEffect(() => {
    if (viewMode !== 'thumbnail') {
      if (thumbnailObserverRef.current) {
        thumbnailObserverRef.current.disconnect();
        thumbnailObserverRef.current = null;
      }
      return;
    }

    if (!contentRef.current) return;

    // Create intersection observer with root margin for preloading
    // Load 3 viewport heights ahead and behind for smoother scrolling
    const observer = new IntersectionObserver(
      (entries) => {
        // Batch load requests to avoid overwhelming the system
        const itemsToLoad: MediaItem[] = [];
        
        entries.forEach((entry) => {
          const filePath = entry.target.getAttribute('data-file-path');
          if (!filePath) return;

          if (entry.isIntersecting) {
            // Item is visible or near visible - queue for loading
            const item = filteredPlaylist.find(i => i.filePath === filePath);
            if (item && item.file && !thumbnails.has(filePath) && !loadingThumbnails.has(filePath)) {
              itemsToLoad.push(item);
            }
          }
        });
        
        // Load thumbnails in batches, prioritizing images over videos
        if (itemsToLoad.length > 0) {
          // Separate images and videos - images load much faster
          const images = itemsToLoad.filter(item => item.type !== MediaType.Video);
          const videos = itemsToLoad.filter(item => item.type === MediaType.Video);
          
          // Load images first (faster)
          const imageBatch = images.slice(0, 8); // Load more images in parallel
          imageBatch.forEach(item => loadThumbnail(item));
          
          // Load remaining images in smaller batches
          if (images.length > 8) {
            let imageIndex = 8;
            const loadImageBatch = () => {
              const batch = images.slice(imageIndex, imageIndex + 5);
              batch.forEach(item => loadThumbnail(item));
              imageIndex += 5;
              if (imageIndex < images.length) {
                setTimeout(loadImageBatch, 30);
              }
            };
            setTimeout(loadImageBatch, 50);
          }
          
          // Load videos after images (slower, so fewer at a time)
          if (videos.length > 0) {
            const videoBatch = videos.slice(0, 2); // Only 2 videos at a time
            videoBatch.forEach(item => loadThumbnail(item));
            
            // Load remaining videos one at a time
            if (videos.length > 2) {
              let videoIndex = 2;
              const loadVideoBatch = () => {
                const batch = videos.slice(videoIndex, videoIndex + 1);
                batch.forEach(item => loadThumbnail(item));
                videoIndex += 1;
                if (videoIndex < videos.length) {
                  setTimeout(loadVideoBatch, 100);
                }
              };
              setTimeout(loadVideoBatch, 200);
            }
          }
        }
      },
      {
        root: contentRef.current,
        rootMargin: '300% 0px 300% 0px', // Load 3 viewport heights ahead/behind
        threshold: 0
      }
    );

    thumbnailObserverRef.current = observer;

    // Use a small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      // Observe all thumbnail items
      thumbnailItemRefs.current.forEach((element) => {
        if (element && thumbnailObserverRef.current) {
          thumbnailObserverRef.current.observe(element);
        }
      });
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (thumbnailObserverRef.current) {
        thumbnailObserverRef.current.disconnect();
        thumbnailObserverRef.current = null;
      }
    };
  }, [viewMode, filteredPlaylist, thumbnails, loadingThumbnails, loadThumbnail]);

  // Note: We don't revoke thumbnails during scrolling anymore
  // The browser handles blob URL memory management automatically
  // We only revoke when switching views or unmounting

  // Cleanup thumbnails on unmount
  useEffect(() => {
    return () => {
      // Cleanup all thumbnails when component unmounts
      // Use a small delay to ensure images are no longer being rendered
      setThumbnails(prev => {
        setTimeout(() => {
          prev.forEach((url) => {
            try {
              revokeThumbnail(url);
            } catch (e) {
              // Ignore errors if URL was already revoked
            }
          });
        }, 100);
        return new Map(); // Clear immediately
      });
    };
  }, []);

  // Cleanup thumbnails when switching away from thumbnail view
  useEffect(() => {
    if (viewMode !== 'thumbnail') {
      // Release all thumbnails when switching to list view
      // Use a small delay to ensure images are no longer being rendered
      setTimeout(() => {
        thumbnails.forEach((url) => {
          try {
            revokeThumbnail(url);
          } catch (e) {
            // Ignore errors if URL was already revoked
          }
        });
        setThumbnails(new Map());
        setLoadingThumbnails(new Set());
      }, 100);
    }
  }, [viewMode, thumbnails]);

  // Finalize a pending undo — actually remove the file from the parent playlist
  const finalizePendingUndo = useCallback((pending: PendingUndo) => {
    onRemoveFile(pending.item.filePath);
    removeToast(pending.toastId);
  }, [onRemoveFile, removeToast]);

  // Cleanup pending undo timer on unmount
  useEffect(() => {
    return () => {
      if (pendingUndoTimerRef.current) {
        clearTimeout(pendingUndoTimerRef.current);
      }
    };
  }, []);

  // Focus search input on mount (Requirement 15.5)
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Focus trapping and Escape key handler (Requirements 15.1, 15.2)
  const handleModalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'Tab' && modalRef.current) {
      const focusableElements = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter(el => el.offsetParent !== null); // filter out hidden elements

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: wrap from first to last
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: wrap from last to first
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  };

  // Arrow key navigation for file list (Requirement 15.4)
  const handleFileListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();

    const list = fileListRef.current;
    if (!list) return;

    const items = Array.from(list.querySelectorAll<HTMLElement>('.playlist-item'));
    if (items.length === 0) return;

    const currentFocused = document.activeElement as HTMLElement;
    const currentIdx = items.indexOf(currentFocused);

    let nextIdx: number;
    if (e.key === 'ArrowDown') {
      nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
    } else {
      nextIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
    }

    items[nextIdx]?.focus();
  };

  // Arrow key navigation for thumbnail grid (Requirement 15.4)
  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();

    const grid = gridRef.current;
    if (!grid) return;

    const items = Array.from(grid.querySelectorAll<HTMLElement>('.playlist-grid-item'));
    if (items.length === 0) return;

    const currentFocused = document.activeElement as HTMLElement;
    const currentIdx = items.indexOf(currentFocused);

    let nextIdx: number;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
    } else {
      nextIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
    }

    items[nextIdx]?.focus();
  };

  // Keyboard shortcut: Ctrl+F to focus search
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleRemoveFile = useCallback((filePath: string, fileName: string) => {
    // If there's an existing pending undo, finalize it first (only one at a time)
    if (pendingUndo) {
      if (pendingUndoTimerRef.current) {
        clearTimeout(pendingUndoTimerRef.current);
        pendingUndoTimerRef.current = null;
      }
      finalizePendingUndo(pendingUndo);
    }

    // Find the item and its original index before filtering
    const originalIndex = playlist.findIndex(item => item.filePath === filePath);
    const item = playlist[originalIndex];
    if (!item) return;

    // Show toast with undo action (5s duration)
    const toastId = showToast(
      `Removed "${fileName}"`,
      'info',
      5000,
      {
        label: 'Undo',
        onClick: () => {
          // On undo: clear pending state, item reappears since it's still in playlist prop
          if (pendingUndoTimerRef.current) {
            clearTimeout(pendingUndoTimerRef.current);
            pendingUndoTimerRef.current = null;
          }
          setPendingUndo(null);
        }
      }
    );

    const newPending: PendingUndo = {
      type: 'file',
      item,
      originalIndex,
      toastId,
    };

    setPendingUndo(newPending);

    // Auto-finalize after 5 seconds
    pendingUndoTimerRef.current = setTimeout(() => {
      setPendingUndo(prev => {
        if (prev && prev.toastId === toastId) {
          onRemoveFile(prev.item.filePath);
          return null;
        }
        return prev;
      });
      pendingUndoTimerRef.current = null;
    }, 5000);
  }, [pendingUndo, playlist, showToast, finalizePendingUndo, onRemoveFile]);



  // Helper to get media-type icon based on MediaType
  const getMediaTypeIcon = (type: MediaType): string => {
    switch (type) {
      case MediaType.Image: return '🖼️';
      case MediaType.Video: return '🎬';
      case MediaType.Gif: return '🎞️';
      default: return '🖼️';
    }
  };

  // Compute subfolder-grouped items for list view when no folder filter is active
  const groupedListItems = useMemo(() => {
    if (selectedRootFolder || viewMode !== 'list') return null;

    const groups: { folder: string; items: MediaItem[] }[] = [];
    let currentFolder = '';

    for (const item of filteredPlaylist) {
      const folderKey = item.folderName || 'Unknown';
      if (folderKey !== currentFolder) {
        currentFolder = folderKey;
        groups.push({ folder: folderKey, items: [] });
      }
      groups[groups.length - 1].items.push(item);
    }

    return groups;
  }, [filteredPlaylist, selectedRootFolder, viewMode]);

  const highlightSearchMatch = (text: string, query: string): React.ReactNode => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="search-highlight">{part}</mark>
      ) : part
    );
  };

  return (
    <>
      <div className="playlist-window-overlay" onClick={onClose}>
        <div
          className="playlist-window"
          ref={modalRef}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleModalKeyDown}
          role="dialog"
          aria-label="Playlist"
          aria-modal="true"
        >
          <div className="playlist-header">
            <h2>Playlist ({playlist.length} items)</h2>
            <div className="playlist-controls">
              <div className="playlist-search-container">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search... (Ctrl+F)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="playlist-search"
                  aria-label="Search playlist"
                />
                {searchQuery && (
                  <button
                    className="playlist-search-clear"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="playlist-view-toggle" role="group" aria-label="View mode">
                <button
                  className={`playlist-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                  title="List view"
                  aria-label="List view"
                  aria-pressed={viewMode === 'list'}
                >
                  ☰
                </button>
                <button
                  className={`playlist-view-btn ${viewMode === 'thumbnail' ? 'active' : ''}`}
                  onClick={() => setViewMode('thumbnail')}
                  title="Thumbnail view"
                  aria-label="Thumbnail view"
                  aria-pressed={viewMode === 'thumbnail'}
                >
                  ⊞
                </button>
              </div>
              <button className="close-btn" onClick={onClose} title="Close (Esc)" aria-label="Close playlist">×</button>
            </div>
          </div>
          <div className="playlist-toolbar" role="toolbar" aria-label="Playlist actions">
            {selectedRootFolder && (
              <button
                className="playlist-btn-secondary"
                onClick={() => {
                  setSelectedRootFolder(null);
                  setSelectedFolderPath('');
                }}
                title="Show all files"
                aria-label="Show all files"
              >
                Show All
              </button>
            )}
            <button
              className="add-folder-btn"
              onClick={onAddFolder}
              title="Add folder"
              aria-label="Add folder"
            >
              <span className="add-folder-icon">+</span>
              <span className="add-folder-label">Add Folder</span>
            </button>
          </div>
          
          <div className="playlist-body">
            {/* Left Sidebar - Folder Tree */}
            <div 
              ref={sidebarRef}
              className="playlist-sidebar"
              style={{ width: `${sidebarWidth}px` }}
            >
              <div className="playlist-sidebar-header">
                <h3>Folders</h3>
              </div>
              <div className="playlist-sidebar-content" role="tree" aria-label="Folder tree">
                <FolderTree
                  tree={folderTree}
                  selectedRootFolder={selectedRootFolder}
                  selectedFolderPath={selectedFolderPath}
                  onSelectFolder={(rootName, folderPath) => {
                    setSelectedRootFolder(rootName);
                    setSelectedFolderPath(folderPath);
                  }}
                  onToggleExpand={(rootName, folderPath) => {
                    setFolderTree(prev => toggleFolder(prev, rootName, folderPath));
                  }}
                  onRemoveFolder={onRemoveFolder}
                />
              </div>
            </div>

            {/* Resize Handle */}
            <div
              className="playlist-resize-handle"
              onMouseDown={() => setIsResizing(true)}
            />

            {/* Right Panel - File List or Thumbnail Grid */}
            <div ref={contentRef} className="playlist-content">
              {filteredPlaylist.length === 0 ? (
                <div className="playlist-empty">
                  {searchQuery 
                    ? (
                      <>
                        <p>No items match your search</p>
                        <p className="playlist-empty-hint">Try a different search term or clear the search</p>
                      </>
                    )
                    : selectedRootFolder 
                      ? (
                        <>
                          <p>No files in this folder</p>
                          <p className="playlist-empty-hint">This folder is empty or contains no media files</p>
                        </>
                      )
                      : (
                        <>
                          <p>No folders added</p>
                          <p className="playlist-empty-hint">Select a folder from the sidebar or add a new folder to view files</p>
                        </>
                      )}
                </div>
              ) : viewMode === 'list' ? (
                <ul className="playlist-list" role="listbox" aria-label="File list" ref={fileListRef} onKeyDown={handleFileListKeyDown}>
                  {groupedListItems && !selectedRootFolder ? (
                    groupedListItems.map((group) => (
                      <React.Fragment key={group.folder}>
                        <li className="playlist-subfolder-header">{group.folder}</li>
                        {group.items.map((item) => {
                          const originalIndex = playlist.findIndex(p => p.filePath === item.filePath);
                          const isCurrent = originalIndex === currentIndex;
                          return (
                            <li
                              key={item.filePath}
                              ref={isCurrent ? (currentItemRef as React.RefObject<HTMLLIElement>) : null}
                              className={`playlist-item ${isCurrent ? 'current' : ''}`}
                              onClick={() => onNavigateToFile(item.filePath)}
                              title="Click to jump to this file"
                              tabIndex={0}
                              role="option"
                              aria-selected={isCurrent}
                            >
                              <span className="playlist-item-icon">{getMediaTypeIcon(item.type)}</span>
                              <span className="playlist-item-name">
                                {highlightSearchMatch(item.fileName, searchQuery)}
                              </span>
                              <span className="playlist-item-type">{item.type}</span>
                              <div className="playlist-item-actions">
                                {onPlayFromFile && (
                                  <button
                                    className="playlist-item-play"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onPlayFromFile(item.filePath);
                                      onClose();
                                    }}
                                    title="Play slideshow from here"
                                    aria-label={`Play slideshow from ${item.fileName}`}
                                  >
                                    ▶
                                  </button>
                                )}
                                <button
                                  className="playlist-item-remove"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveFile(item.filePath, item.fileName);
                                  }}
                                  title="Remove from playlist"
                                  aria-label={`Remove ${item.fileName} from playlist`}
                                >
                                  ×
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </React.Fragment>
                    ))
                  ) : (
                    filteredPlaylist.map((item) => {
                      const originalIndex = playlist.findIndex(p => p.filePath === item.filePath);
                      const isCurrent = originalIndex === currentIndex;
                      return (
                        <li
                          key={item.filePath}
                          ref={isCurrent ? (currentItemRef as React.RefObject<HTMLLIElement>) : null}
                          className={`playlist-item ${isCurrent ? 'current' : ''}`}
                          onClick={() => onNavigateToFile(item.filePath)}
                          title="Click to jump to this file"
                          tabIndex={0}
                          role="option"
                          aria-selected={isCurrent}
                        >
                          <span className="playlist-item-icon">{getMediaTypeIcon(item.type)}</span>
                          <span className="playlist-item-name">
                            {highlightSearchMatch(item.fileName, searchQuery)}
                          </span>
                          <span className="playlist-item-type">{item.type}</span>
                          <div className="playlist-item-actions">
                            {onPlayFromFile && (
                              <button
                                className="playlist-item-play"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPlayFromFile(item.filePath);
                                  onClose();
                                }}
                                title="Play slideshow from here"
                                aria-label={`Play slideshow from ${item.fileName}`}
                              >
                                ▶
                              </button>
                            )}
                            <button
                              className="playlist-item-remove"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFile(item.filePath, item.fileName);
                              }}
                              title="Remove from playlist"
                              aria-label={`Remove ${item.fileName} from playlist`}
                            >
                              ×
                            </button>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : (
                <div className="playlist-grid" role="grid" aria-label="Thumbnail grid" ref={gridRef} onKeyDown={handleGridKeyDown}>
                  {filteredPlaylist.length === 0 && thumbnails.size === 0 && loadingThumbnails.size === 0 ? (
                    <SkeletonLoader count={12} />
                  ) : (
                    filteredPlaylist.map((item) => {
                    const originalIndex = playlist.findIndex(p => p.filePath === item.filePath);
                    const isCurrent = originalIndex === currentIndex;
                    const thumbnailUrl = thumbnails.get(item.filePath);
                    const isLoading = loadingThumbnails.has(item.filePath);
                    
                    return (
                      <div
                        key={item.filePath}
                        ref={(el) => {
                          if (el) {
                            thumbnailItemRefs.current.set(item.filePath, el);
                            if (isCurrent) {
                              currentItemRef.current = el;
                            }
                          } else {
                            thumbnailItemRefs.current.delete(item.filePath);
                          }
                        }}
                        data-file-path={item.filePath}
                        className={`playlist-grid-item ${isCurrent ? 'current' : ''}`}
                        onClick={() => onNavigateToFile(item.filePath)}
                        title={`${item.fileName} - Click to jump to this file`}
                        tabIndex={0}
                        role="gridcell"
                      >
                        <div className="playlist-grid-thumbnail">
                          {thumbnailUrl ? (
                            <img
                              src={thumbnailUrl}
                              alt={item.fileName}
                              loading="lazy"
                              onError={(e) => {
                                // Fallback if thumbnail fails to load (blob URL was revoked)
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                // Remove from thumbnails map if it fails
                                setThumbnails(prev => {
                                  const next = new Map(prev);
                                  next.delete(item.filePath);
                                  return next;
                                });
                              }}
                            />
                          ) : isLoading ? (
                            <div className="playlist-thumbnail-loading">Loading...</div>
                          ) : (
                            <div className="playlist-thumbnail-placeholder">
                              {item.type === MediaType.Video ? '🎬' : '🖼️'}
                            </div>
                          )}
                          <span className="playlist-grid-type">{item.type}</span>
                        </div>
                        <div className="playlist-grid-name" title={item.fileName}>
                          {highlightSearchMatch(item.fileName, searchQuery)}
                        </div>
                        <div className="playlist-grid-index">#{originalIndex + 1}</div>
                        <div className="playlist-grid-actions">
                          {onPlayFromFile && (
                            <button
                              className="playlist-grid-play"
                              onClick={(e) => {
                                e.stopPropagation();
                                onPlayFromFile(item.filePath);
                                onClose();
                              }}
                              title="Play slideshow from here"
                              aria-label={`Play slideshow from ${item.fileName}`}
                            >
                              ▶
                            </button>
                          )}
                          <button
                            className="playlist-grid-remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFile(item.filePath, item.fileName);
                            }}
                            title="Remove from playlist"
                            aria-label={`Remove ${item.fileName} from playlist`}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Toast notifications for file removal undo */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </>
  );
};

export default PlaylistWindow;

