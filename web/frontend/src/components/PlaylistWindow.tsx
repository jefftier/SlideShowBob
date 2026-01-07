import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { MediaItem, MediaType } from '../types/media';
import { buildFolderTree, toggleFolder, setFolderExpanded, FolderNode } from '../utils/folderTree';
import FolderTree from './FolderTree';
import { generateThumbnail, revokeThumbnail } from '../utils/thumbnailGenerator';
import SkeletonLoader from './SkeletonLoader';
import './PlaylistWindow.css';

interface PlaylistWindowProps {
  playlist: MediaItem[];
  currentIndex: number;
  folders: string[];
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
  folders,
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
  const [pendingRemove, setPendingRemove] = useState<{type: 'file' | 'folder', path: string, name: string} | null>(null);
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'thumbnail'>('list');
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [loadingThumbnails, setLoadingThumbnails] = useState<Set<string>>(new Set());
  const contentRef = React.useRef<HTMLDivElement>(null);
  const currentItemRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const sidebarRef = React.useRef<HTMLDivElement>(null);
  const thumbnailObserverRef = useRef<IntersectionObserver | null>(null);
  const thumbnailItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
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
  }, [playlist, selectedRootFolder, selectedFolderPath, searchQuery]);

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

  const handleConfirmRemove = useCallback(() => {
    if (!pendingRemove) return;
    
    if (pendingRemove.type === 'file') {
      onRemoveFile(pendingRemove.path);
    } else {
      onRemoveFolder(pendingRemove.name);
    }
    setPendingRemove(null);
  }, [pendingRemove, onRemoveFile, onRemoveFolder]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingRemove) {
          setPendingRemove(null);
        } else {
          onClose();
        }
      } else if (e.key === 'Enter' && pendingRemove) {
        handleConfirmRemove();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingRemove, onClose, handleConfirmRemove]);

  const handleRemoveFile = (filePath: string, fileName: string) => {
    setPendingRemove({ type: 'file', path: filePath, name: fileName });
  };

  const handleRemoveFolder = (folderName: string) => {
    setPendingRemove({ type: 'folder', path: folderName, name: folderName });
  };


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
        <div className="playlist-window" onClick={(e) => e.stopPropagation()}>
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
              <div className="playlist-view-toggle">
                <button
                  className={`playlist-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                  title="List view"
                >
                  ☰
                </button>
                <button
                  className={`playlist-view-btn ${viewMode === 'thumbnail' ? 'active' : ''}`}
                  onClick={() => setViewMode('thumbnail')}
                  title="Thumbnail view"
                >
                  ⊞
                </button>
              </div>
              {selectedRootFolder && (
                <button
                  className="playlist-btn-secondary"
                  onClick={() => {
                    setSelectedRootFolder(null);
                    setSelectedFolderPath('');
                  }}
                  title="Show all files"
                >
                  Show All
                </button>
              )}
              <button
                className="add-folder-btn"
                onClick={onAddFolder}
                title="Add folder"
              >
                <span className="add-folder-icon">+</span>
                <span className="add-folder-label">Add Folder</span>
              </button>
              <button className="close-btn" onClick={onClose} title="Close (Esc)" aria-label="Close playlist">×</button>
            </div>
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
                <button
                  className="playlist-btn-icon"
                  onClick={onAddFolder}
                  title="Add folder"
                  aria-label="Add folder"
                >
                  +
                </button>
              </div>
              <div className="playlist-sidebar-content">
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
                  onRemoveFolder={handleRemoveFolder}
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
                <ul className="playlist-list">
                  {filteredPlaylist.map((item, index) => {
                    const originalIndex = playlist.findIndex(p => p.filePath === item.filePath);
                    const isCurrent = originalIndex === currentIndex;
                    return (
                      <li
                        key={item.filePath}
                        ref={isCurrent ? currentItemRef : null}
                        className={`playlist-item ${isCurrent ? 'current' : ''}`}
                        onClick={() => onNavigateToFile(item.filePath)}
                        title="Click to jump to this file"
                      >
                        <span className="playlist-item-index">{originalIndex + 1}</span>
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
                </ul>
              ) : (
                <div className="playlist-grid">
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

      {/* Confirmation Dialog */}
      {pendingRemove && (
        <div className="playlist-confirm-overlay" onClick={() => setPendingRemove(null)}>
          <div className="playlist-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Removal</h3>
            <p>
              Are you sure you want to remove <strong>{pendingRemove.name}</strong>?
              {pendingRemove.type === 'folder' && ' This will remove all files in this folder from the playlist.'}
            </p>
            <div className="playlist-confirm-buttons">
              <button className="playlist-btn-danger" onClick={handleConfirmRemove}>
                Remove
              </button>
              <button className="playlist-btn-secondary" onClick={() => setPendingRemove(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PlaylistWindow;

