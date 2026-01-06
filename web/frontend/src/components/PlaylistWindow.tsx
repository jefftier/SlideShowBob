import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { MediaItem } from '../types/media';
import { buildFolderTree, toggleFolder, setFolderExpanded, FolderNode } from '../utils/folderTree';
import FolderTree from './FolderTree';
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
  const contentRef = React.useRef<HTMLDivElement>(null);
  const currentItemRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const sidebarRef = React.useRef<HTMLDivElement>(null);
  
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

  // Filter playlist based on search and selected folder
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
                  >
                    ×
                  </button>
                )}
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
              <button className="close-btn" onClick={onClose} title="Close (Esc)">×</button>
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

            {/* Right Panel - File List */}
            <div ref={contentRef} className="playlist-content">
              {filteredPlaylist.length === 0 ? (
                <div className="playlist-empty">
                  {searchQuery 
                    ? 'No items match your search' 
                    : selectedRootFolder 
                      ? 'No files in this folder' 
                      : 'Select a folder to view files'}
                </div>
              ) : (
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
                          >
                            ×
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
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

