import React, { useState, useMemo, useEffect } from 'react';
import { MediaItem } from '../types/media';
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
}

interface FolderNode {
  name: string;
  type: 'folder';
  children: Map<string, FolderNode | MediaItem>;
  path: string;
}

const PlaylistWindow: React.FC<PlaylistWindowProps> = ({
  playlist,
  currentIndex,
  folders,
  onClose,
  onNavigateToFile,
  onRemoveFile,
  onRemoveFolder,
  onAddFolder
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('tree');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  
  // Auto-expand root folders when they change
  React.useEffect(() => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      folders.forEach(folder => newSet.add(folder));
      return newSet;
    });
  }, [folders]);

  const filteredPlaylist = playlist.filter(item =>
    item.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.relativePath && item.relativePath.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Build tree structure from playlist
  const folderTree = useMemo(() => {
    const tree = new Map<string, FolderNode>();
    
    folders.forEach(folderName => {
      const rootNode: FolderNode = {
        name: folderName,
        type: 'folder',
        children: new Map(),
        path: folderName
      };
      tree.set(folderName, rootNode);
    });

    filteredPlaylist.forEach(item => {
      const folderName = item.folderName || 'Unknown';
      let currentNode = tree.get(folderName);
      
      if (!currentNode) {
        currentNode = {
          name: folderName,
          type: 'folder',
          children: new Map(),
          path: folderName
        };
        tree.set(folderName, currentNode);
      }

      if (item.relativePath) {
        const pathParts = item.relativePath.split('/');
        const fileName = pathParts[pathParts.length - 1];
        
        // Navigate/create folder structure
        for (let i = 0; i < pathParts.length - 1; i++) {
          const part = pathParts[i];
          if (!currentNode.children.has(part)) {
            const folderNode: FolderNode = {
              name: part,
              type: 'folder',
              children: new Map(),
              path: `${folderName}/${pathParts.slice(0, i + 1).join('/')}`
            };
            currentNode.children.set(part, folderNode);
          }
          currentNode = currentNode.children.get(part) as FolderNode;
        }
        
        // Add file to current node
        currentNode.children.set(fileName, item);
      } else {
        // File is in root folder
        currentNode.children.set(item.fileName, item);
      }
    });

    return tree;
  }, [filteredPlaylist, folders]);

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const renderTreeNode = (node: FolderNode | MediaItem, depth: number = 0): React.ReactNode => {
    if ('type' in node && node.type === 'folder') {
      const folderNode = node as FolderNode;
      const isExpanded = expandedFolders.has(folderNode.path);
      const hasChildren = folderNode.children.size > 0;
      
      return (
        <div key={folderNode.path} className="playlist-tree-folder">
          <div 
            className="playlist-tree-folder-header"
            style={{ paddingLeft: `${depth * 20 + 8}px` }}
            onClick={() => hasChildren && toggleFolder(folderNode.path)}
          >
            <span className="playlist-tree-icon">
              {hasChildren ? (isExpanded ? '📂' : '📁') : '📁'}
            </span>
            <span className="playlist-tree-name">{folderNode.name}</span>
            <span className="playlist-tree-count">({folderNode.children.size})</span>
          </div>
          {isExpanded && (
            <div className="playlist-tree-children">
              {Array.from(folderNode.children.values()).map(child => 
                renderTreeNode(child, depth + 1)
              )}
            </div>
          )}
        </div>
      );
    } else {
      const mediaItem = node as MediaItem;
      const isCurrent = playlist.findIndex(p => p.filePath === mediaItem.filePath) === currentIndex;
      
      return (
        <div
          key={mediaItem.filePath}
          className={`playlist-tree-item ${isCurrent ? 'current' : ''}`}
          style={{ paddingLeft: `${depth * 20 + 28}px` }}
          onClick={() => onNavigateToFile(mediaItem.filePath)}
        >
          <span className="playlist-tree-icon">
            {mediaItem.type === 'Video' ? '🎥' : mediaItem.type === 'Gif' ? '🎬' : '🖼️'}
          </span>
          <span className="playlist-tree-name">{mediaItem.fileName}</span>
          <button
            className="playlist-tree-remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFile(mediaItem.filePath);
            }}
            title="Remove from playlist"
          >
            ×
          </button>
        </div>
      );
    }
  };

  return (
    <div className="playlist-window-overlay" onClick={onClose}>
      <div className="playlist-window" onClick={(e) => e.stopPropagation()}>
        <div className="playlist-header">
          <h2>Playlist ({playlist.length} items)</h2>
          <div className="playlist-controls">
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="playlist-search"
            />
            <button
              className={`view-toggle ${viewMode === 'tree' ? 'active' : ''}`}
              onClick={() => setViewMode('tree')}
              title="Tree view"
            >
              🌳
            </button>
            <button
              className={`view-toggle ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              ☰
            </button>
            <button
              className="add-folder-btn"
              onClick={onAddFolder}
              title="Add folder"
            >
              +📁
            </button>
            <button className="close-btn" onClick={onClose} title="Close">×</button>
          </div>
        </div>
        
        <div className={`playlist-content ${viewMode}`}>
          {filteredPlaylist.length === 0 ? (
            <div className="playlist-empty">
              {searchQuery ? 'No items match your search' : 'Playlist is empty'}
            </div>
          ) : viewMode === 'tree' ? (
            <div className="playlist-tree">
              {Array.from(folderTree.values()).map(folder => (
                <div key={folder.path} className="playlist-tree-root">
                  <div 
                    className="playlist-tree-folder-header playlist-tree-root-header"
                    onClick={() => toggleFolder(folder.path)}
                  >
                    <span className="playlist-tree-icon">
                      {expandedFolders.has(folder.path) ? '📂' : '📁'}
                    </span>
                    <span className="playlist-tree-name">{folder.name}</span>
                    <span className="playlist-tree-count">({folder.children.size})</span>
                    <button
                      className="playlist-tree-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFolder(folder.name);
                      }}
                      title="Remove folder"
                    >
                      ×
                    </button>
                  </div>
                  {expandedFolders.has(folder.path) && (
                    <div className="playlist-tree-children">
                      {Array.from(folder.children.values()).map(child => 
                        renderTreeNode(child, 1)
                      )}
                    </div>
                  )}
                </div>
              ))}
              {folderTree.size === 0 && (
                <div className="playlist-empty">
                  No folders added. Click +📁 to add a folder.
                </div>
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
                    className={`playlist-item ${isCurrent ? 'current' : ''}`}
                    onClick={() => onNavigateToFile(item.filePath)}
                  >
                    <span className="playlist-item-index">{originalIndex + 1}</span>
                    <span className="playlist-item-name">{item.fileName}</span>
                    <span className="playlist-item-type">{item.type}</span>
                    <button
                      className="playlist-item-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFile(item.filePath);
                      }}
                      title="Remove from playlist"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="playlist-grid">
              {filteredPlaylist.map((item, index) => {
                const originalIndex = playlist.findIndex(p => p.filePath === item.filePath);
                const isCurrent = originalIndex === currentIndex;
                return (
                  <div
                    key={item.filePath}
                    className={`playlist-grid-item ${isCurrent ? 'current' : ''}`}
                    onClick={() => onNavigateToFile(item.filePath)}
                  >
                    <div className="playlist-grid-thumbnail">
                      {/* Thumbnail would go here */}
                      <span className="playlist-grid-type">{item.type}</span>
                    </div>
                    <div className="playlist-grid-name">{item.fileName}</div>
                    <button
                      className="playlist-grid-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFile(item.filePath);
                      }}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlaylistWindow;

