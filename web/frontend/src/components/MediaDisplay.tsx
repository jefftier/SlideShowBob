import React, { useState, useEffect, useRef } from 'react';
import { MediaItem, MediaType } from '../types/media';
import './MediaDisplay.css';

interface MediaDisplayProps {
  currentMedia: MediaItem | null;
  zoomFactor: number;
  isFitToWindow: boolean;
  isMuted: boolean;
  onVideoEnded: () => void;
}

const MediaDisplay: React.FC<MediaDisplayProps> = ({
  currentMedia,
  zoomFactor,
  isFitToWindow,
  isMuted,
  onVideoEnded
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentMedia) {
      setImageSrc(null);
      setVideoSrc(null);
      return;
    }

    setIsLoading(true);

    // Use object URL if available (from File System Access API), otherwise use filePath
    const mediaUrl = currentMedia.objectUrl || currentMedia.filePath;
    
    if (currentMedia.type === MediaType.Video) {
      setVideoSrc(mediaUrl);
      setImageSrc(null);
    } else {
      setImageSrc(mediaUrl);
      setVideoSrc(null);
    }

    setIsLoading(false);
    
    // Cleanup: revoke object URL when component unmounts or media changes
    return () => {
      // Note: We don't revoke here because we might want to reuse the URL
      // In production, implement proper cleanup when media is removed from playlist
    };
  }, [currentMedia]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const handleVideoEnded = () => {
    onVideoEnded();
  };

  const containerStyle: React.CSSProperties = {
    transform: `scale(${zoomFactor})`,
    transformOrigin: 'center center',
    transition: zoomFactor === 1.0 ? 'transform 0.2s ease-out' : 'none' // Disable transition when zooming with keyboard
  };

  const mediaStyle: React.CSSProperties = isFitToWindow
    ? {
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain'
      }
    : {
        width: 'auto',
        height: 'auto'
      };

  if (!currentMedia) {
    return null;
  }

  return (
    <div className="media-display" ref={containerRef}>
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      )}
      
      <div className="media-container" style={containerStyle}>
        {currentMedia.type === MediaType.Video && videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            style={mediaStyle}
            controls={false}
            autoPlay
            muted={isMuted}
            onEnded={handleVideoEnded}
            onLoadedData={() => setIsLoading(false)}
          />
        ) : imageSrc ? (
          <img
            src={imageSrc}
            alt={currentMedia.fileName}
            style={mediaStyle}
            onLoad={() => setIsLoading(false)}
            onError={() => setIsLoading(false)}
          />
        ) : null}
      </div>
    </div>
  );
};

export default MediaDisplay;

