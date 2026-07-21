import React, { useMemo } from 'react';
import { MediaItem } from '../types/media';
import './FileNameOverlay.css';

interface FileNameOverlayProps {
  currentMedia: MediaItem | null;
  visible: boolean;
}

/**
 * Small, unobtrusive overlay showing the current media's file name and path.
 * Positioned top-left, semi-transparent, and non-interactive (pointer-events: none)
 * so it never interferes with slideshow interaction. Follows the same show/hide
 * behavior as the toolbar (hidden during idle/fullscreen playback).
 */
const FileNameOverlay: React.FC<FileNameOverlayProps> = ({ currentMedia, visible }) => {
  const displayPath = useMemo(() => {
    if (!currentMedia) return '';
    const relative = currentMedia.relativePath || currentMedia.fileName;
    if (currentMedia.folderName && !relative.startsWith(currentMedia.folderName)) {
      return `${currentMedia.folderName}/${relative}`;
    }
    return relative;
  }, [currentMedia]);

  if (!currentMedia) return null;

  return (
    <div
      className={`filename-overlay${visible ? '' : ' hidden'}`}
      aria-hidden="true"
      title={displayPath}
    >
      {displayPath}
    </div>
  );
};

export default FileNameOverlay;
