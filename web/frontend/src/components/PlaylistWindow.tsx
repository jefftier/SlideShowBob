import React, { useState } from 'react';
import { MediaItem } from '../types/media';
import './PlaylistWindow.css';

interface PlaylistWindowProps {
  playlist: MediaItem[];
  currentIndex: number;
  onClose: () => void;
  onNavigateToFile: (filePath: string) => void;
  onRemoveFile: (filePath: string) => void;
}

const PlaylistWindow: React.FC<PlaylistWindowProps> = ({
  playlist,
  currentIndex,
  onClose,
  onNavigateToFile,
  onRemoveFile
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPlaylist = playlist.filter(item =>
    item.fileName.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
              className={`view-toggle ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              ☰
            </button>
            <button
              className={`view-toggle ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              ⊞
            </button>
            <button className="close-btn" onClick={onClose} title="Close">×</button>
          </div>
        </div>
        
        <div className={`playlist-content ${viewMode}`}>
          {filteredPlaylist.length === 0 ? (
            <div className="playlist-empty">
              {searchQuery ? 'No items match your search' : 'Playlist is empty'}
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

