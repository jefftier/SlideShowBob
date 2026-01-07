import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MediaItem, MediaType } from '../types/media';
import './MediaDisplay.css';

interface MediaDisplayProps {
  currentMedia: MediaItem | null;
  zoomFactor: number;
  isFitToWindow: boolean;
  isMuted: boolean;
  onVideoEnded: () => void;
  onImageClick?: () => void;
  onEffectiveZoomChange?: (zoom: number) => void;
  onMediaError?: (error: string) => void;
  onMediaLoadSuccess?: () => void;
}

const MediaDisplay: React.FC<MediaDisplayProps> = ({
  currentMedia,
  zoomFactor,
  isFitToWindow,
  isMuted,
  onVideoEnded,
  onImageClick,
  onEffectiveZoomChange,
  onMediaError,
  onMediaLoadSuccess
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [, setEffectiveZoom] = useState(1.0); // Used via onEffectiveZoomChange callback
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNavigatingRef = useRef(false);
  const clickStartTimeRef = useRef(0);
  const clickStartPosRef = useRef({ x: 0, y: 0 });
  const loadSuccessNotifiedRef = useRef(false);

  useEffect(() => {
    if (!currentMedia) {
      setImageSrc(null);
      setVideoSrc(null);
      setIsLoading(false);
      loadSuccessNotifiedRef.current = false;
      return;
    }

    setIsLoading(true);
    loadSuccessNotifiedRef.current = false; // Reset success notification flag

    // Use object URL if available (from File System Access API), otherwise use filePath
    const mediaUrl = currentMedia.objectUrl || currentMedia.filePath;
    
    // Dev-only: Simulate failures based on URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const failRate = urlParams.get('failRate');
    const shouldSimulateFailure = failRate && !isNaN(parseFloat(failRate)) && Math.random() < parseFloat(failRate);
    
    if (shouldSimulateFailure) {
      // Simulate failure by using invalid URL
      const invalidUrl = 'data:image/png;base64,invalid';
      if (currentMedia.type === MediaType.Video) {
        setVideoSrc(invalidUrl);
        setImageSrc(null);
      } else {
        setImageSrc(invalidUrl);
        setVideoSrc(null);
      }
    } else {
      if (currentMedia.type === MediaType.Video) {
        setVideoSrc(mediaUrl);
        setImageSrc(null);
        // Don't set isLoading to false here - wait for video to load
      } else {
        setImageSrc(mediaUrl);
        setVideoSrc(null);
        // For images, isLoading will be set to false in onLoad handler
      }
    }
    
    // Note: Object URLs are now managed centrally via objectUrlRegistry
    // URLs are revoked when media items are removed from playlist, folders are removed,
    // or the app unmounts. We don't revoke here to allow URL reuse during playback.
    return () => {
      // Cleanup handled by objectUrlRegistry at the lifecycle level
    };
  }, [currentMedia]);

  // Handle video playback when video source changes
  useEffect(() => {
    if (videoRef.current && videoSrc) {
      // Reset video and play
      videoRef.current.load();
      const playPromise = videoRef.current.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsLoading(false);
            // Notify successful load (only once)
            if (onMediaLoadSuccess && !loadSuccessNotifiedRef.current) {
              loadSuccessNotifiedRef.current = true;
              onMediaLoadSuccess();
            }
          })
          .catch((error) => {
            console.error('Error playing video:', error);
            setIsLoading(false);
            // If autoplay fails (e.g., due to browser policy), try to play on user interaction
            // The video will be ready to play when user clicks
            // Still consider it a successful load if video element loaded
            if (videoRef.current && videoRef.current.readyState >= 2 && !loadSuccessNotifiedRef.current) {
              loadSuccessNotifiedRef.current = true;
              if (onMediaLoadSuccess) {
                onMediaLoadSuccess();
              }
            }
          });
      }
    }
  }, [videoSrc, onMediaLoadSuccess]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Calculate effective zoom when fit-to-window is enabled
  useEffect(() => {
    if (!isFitToWindow) {
      setEffectiveZoom(zoomFactor);
      if (onEffectiveZoomChange) {
        onEffectiveZoomChange(zoomFactor);
      }
      return;
    }

    const calculateEffectiveZoom = () => {
      const mediaElement = imageRef.current || videoRef.current;
      const container = containerRef.current;
      
      if (!mediaElement || !container) {
        setEffectiveZoom(zoomFactor);
        if (onEffectiveZoomChange) {
          onEffectiveZoomChange(zoomFactor);
        }
        return;
      }

      const naturalWidth = (mediaElement as HTMLImageElement).naturalWidth || 
                          (mediaElement as HTMLVideoElement).videoWidth || 0;
      const naturalHeight = (mediaElement as HTMLImageElement).naturalHeight || 
                           (mediaElement as HTMLVideoElement).videoHeight || 0;
      
      if (naturalWidth === 0 || naturalHeight === 0) {
        setEffectiveZoom(zoomFactor);
        if (onEffectiveZoomChange) {
          onEffectiveZoomChange(zoomFactor);
        }
        return;
      }

      const displayedWidth = mediaElement.clientWidth;
      const displayedHeight = mediaElement.clientHeight;
      
      if (displayedWidth === 0 || displayedHeight === 0) {
        setEffectiveZoom(zoomFactor);
        if (onEffectiveZoomChange) {
          onEffectiveZoomChange(zoomFactor);
        }
        return;
      }

      // Calculate the scale applied by fit-to-window (object-fit: contain)
      const scaleX = displayedWidth / naturalWidth;
      const scaleY = displayedHeight / naturalHeight;
      const fitScale = Math.min(scaleX, scaleY);
      
      // Effective zoom is fit scale multiplied by manual zoom factor
      const effective = fitScale * zoomFactor;
      setEffectiveZoom(effective);
      if (onEffectiveZoomChange) {
        onEffectiveZoomChange(effective);
      }
    };

    // Use a small delay to ensure layout is complete
    const timeoutId = setTimeout(calculateEffectiveZoom, 100);

    // Calculate after media loads
    const mediaElement = imageRef.current || videoRef.current;
    if (mediaElement) {
      const isComplete = (mediaElement as HTMLImageElement).complete || 
                         ((mediaElement as HTMLVideoElement).readyState >= 2);
      if (isComplete) {
        calculateEffectiveZoom();
      } else {
        const handleLoad = () => {
          setTimeout(calculateEffectiveZoom, 100);
        };
        mediaElement.addEventListener('load', handleLoad);
        mediaElement.addEventListener('loadeddata', handleLoad);
        return () => {
          clearTimeout(timeoutId);
          mediaElement.removeEventListener('load', handleLoad);
          mediaElement.removeEventListener('loadeddata', handleLoad);
        };
      }
    }

    // Also recalculate on window resize
    window.addEventListener('resize', calculateEffectiveZoom);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', calculateEffectiveZoom);
    };
  }, [isFitToWindow, zoomFactor, imageSrc, videoSrc, currentMedia, onEffectiveZoomChange]);

  const handleVideoEnded = () => {
    onVideoEnded();
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const errorMessage = `Failed to load image: ${currentMedia?.fileName || 'Unknown'}`;
    console.error('Image load error:', e);
    setIsLoading(false);
    if (onMediaError) {
      onMediaError(errorMessage);
    }
  };

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const errorMessage = `Failed to load video: ${currentMedia?.fileName || 'Unknown'}`;
    console.error('Video load error:', e);
    setIsLoading(false);
    if (onMediaError) {
      onMediaError(errorMessage);
    }
  };

  // Handle mouse down for drag/pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only enable drag when fit is off
    if (!isFitToWindow && currentMedia && !isLoading && containerRef.current) {
      const target = e.target as HTMLElement;
      if (target.closest('.loading-overlay')) {
        return;
      }
      
      const mediaElement = imageRef.current || videoRef.current;
      if (!mediaElement) return;
      
      // Always record click start for quick click detection (needed for both drag and click)
      clickStartTimeRef.current = Date.now();
      clickStartPosRef.current = { x: e.clientX, y: e.clientY };
      
      // Check if media is larger than viewport (only then allow panning)
      const containerRect = containerRef.current.getBoundingClientRect();
      const mediaRect = mediaElement.getBoundingClientRect();
      const scaledWidth = mediaRect.width * zoomFactor;
      const scaledHeight = mediaRect.height * zoomFactor;
      
      const isLargerThanViewport = scaledWidth > containerRect.width || scaledHeight > containerRect.height;
      
      if (isLargerThanViewport) {
        // Media is larger than viewport - enable dragging
        setIsDragging(true);
        setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
        e.preventDefault();
        e.stopPropagation();
      }
      // If media is smaller, we still record the click start but don't enable dragging
      // The click will be handled in handleMouseUp
    }
  }, [isFitToWindow, currentMedia, isLoading, panOffset, zoomFactor]);

  // Handle mouse move for dragging
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging && !isFitToWindow && containerRef.current) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      // Get container and media dimensions to constrain panning
      const container = containerRef.current;
      const mediaElement = imageRef.current || videoRef.current;
      
      if (mediaElement) {
        const containerRect = container.getBoundingClientRect();
        const naturalWidth = (mediaElement as HTMLImageElement).naturalWidth || 
                            (mediaElement as HTMLVideoElement).videoWidth || 0;
        const naturalHeight = (mediaElement as HTMLImageElement).naturalHeight || 
                             (mediaElement as HTMLVideoElement).videoHeight || 0;
        
        if (naturalWidth > 0 && naturalHeight > 0) {
          // Calculate scaled dimensions
          const scaledWidth = naturalWidth * zoomFactor;
          const scaledHeight = naturalHeight * zoomFactor;
          
          // Calculate max pan offset (half the difference between media and container)
          const maxX = Math.max(0, (scaledWidth - containerRect.width) / 2);
          const maxY = Math.max(0, (scaledHeight - containerRect.height) / 2);
          
          // Constrain panning to keep media within reasonable bounds
          const constrainedX = Math.max(-maxX, Math.min(maxX, newX));
          const constrainedY = Math.max(-maxY, Math.min(maxY, newY));
          
          setPanOffset({ x: constrainedX, y: constrainedY });
        } else {
          // Fallback if natural dimensions not available
          setPanOffset({ x: newX, y: newY });
        }
      }
    }
  }, [isDragging, isFitToWindow, dragStart, zoomFactor]);

  // Handle mouse up - end drag or trigger click
  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (isDragging) {
      setIsDragging(false);
    }
    
    // Check if this was a quick click (not a drag) - works for both dragging and non-dragging cases
    if (!isFitToWindow && currentMedia && !isLoading && clickStartTimeRef.current > 0) {
      const clickDuration = Date.now() - clickStartTimeRef.current;
      const clickDistance = Math.sqrt(
        Math.pow(e.clientX - clickStartPosRef.current.x, 2) +
        Math.pow(e.clientY - clickStartPosRef.current.y, 2)
      );
      
      // If it was a quick click (< 200ms) and didn't move much (< 5px), treat as click
      if (clickDuration < 200 && clickDistance < 5 && onImageClick) {
        // Prevent rapid clicks
        if (!isNavigatingRef.current) {
          isNavigatingRef.current = true;
          onImageClick();
          setTimeout(() => {
            isNavigatingRef.current = false;
          }, 200);
        }
      }
    }
    
    // Reset click tracking
    clickStartTimeRef.current = 0;
  }, [isDragging, isFitToWindow, currentMedia, isLoading, onImageClick]);

  // Reset pan when fit mode changes or media changes
  useEffect(() => {
    setPanOffset({ x: 0, y: 0 });
  }, [isFitToWindow, currentMedia]);

  // Touch event handlers (similar to mouse handlers)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return; // Only handle single touch
    
    // Only enable drag when fit is off
    if (!isFitToWindow && currentMedia && !isLoading && containerRef.current) {
      const target = e.target as HTMLElement;
      if (target.closest('.loading-overlay')) {
        return;
      }
      
      const mediaElement = imageRef.current || videoRef.current;
      if (!mediaElement) return;
      
      const touch = e.touches[0];
      clickStartTimeRef.current = Date.now();
      clickStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const mediaRect = mediaElement.getBoundingClientRect();
      const scaledWidth = mediaRect.width * zoomFactor;
      const scaledHeight = mediaRect.height * zoomFactor;
      
      const isLargerThanViewport = scaledWidth > containerRect.width || scaledHeight > containerRect.height;
      
      if (isLargerThanViewport) {
        setIsDragging(true);
        setDragStart({ x: touch.clientX - panOffset.x, y: touch.clientY - panOffset.y });
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, [isFitToWindow, currentMedia, isLoading, panOffset, zoomFactor]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    
    if (isDragging && !isFitToWindow && containerRef.current) {
      const touch = e.touches[0];
      const newX = touch.clientX - dragStart.x;
      const newY = touch.clientY - dragStart.y;
      
      const container = containerRef.current;
      const mediaElement = imageRef.current || videoRef.current;
      
      if (mediaElement) {
        const containerRect = container.getBoundingClientRect();
        const naturalWidth = (mediaElement as HTMLImageElement).naturalWidth || 
                            (mediaElement as HTMLVideoElement).videoWidth || 0;
        const naturalHeight = (mediaElement as HTMLImageElement).naturalHeight || 
                             (mediaElement as HTMLVideoElement).videoHeight || 0;
        
        if (naturalWidth > 0 && naturalHeight > 0) {
          const scaledWidth = naturalWidth * zoomFactor;
          const scaledHeight = naturalHeight * zoomFactor;
          
          const maxX = Math.max(0, (scaledWidth - containerRect.width) / 2);
          const maxY = Math.max(0, (scaledHeight - containerRect.height) / 2);
          
          const constrainedX = Math.max(-maxX, Math.min(maxX, newX));
          const constrainedY = Math.max(-maxY, Math.min(maxY, newY));
          
          setPanOffset({ x: constrainedX, y: constrainedY });
        } else {
          setPanOffset({ x: newX, y: newY });
        }
      }
      
      e.preventDefault();
    }
  }, [isDragging, isFitToWindow, dragStart, zoomFactor]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (isDragging) {
      setIsDragging(false);
    }
    
    if (!isFitToWindow && currentMedia && !isLoading && clickStartTimeRef.current > 0) {
      const touch = e.changedTouches[0];
      const clickDuration = Date.now() - clickStartTimeRef.current;
      const clickDistance = Math.sqrt(
        Math.pow(touch.clientX - clickStartPosRef.current.x, 2) +
        Math.pow(touch.clientY - clickStartPosRef.current.y, 2)
      );
      
      if (clickDuration < 300 && clickDistance < 10 && onImageClick) {
        if (!isNavigatingRef.current) {
          isNavigatingRef.current = true;
          onImageClick();
          setTimeout(() => {
            isNavigatingRef.current = false;
          }, 200);
        }
      }
    }
    
    clickStartTimeRef.current = 0;
  }, [isDragging, isFitToWindow, currentMedia, isLoading, onImageClick]);

  // Add/remove mouse move and up listeners
  useEffect(() => {
    if (!isFitToWindow && currentMedia && !isLoading) {
      // Always listen for mouseup when fit is off (needed for click detection on small images)
      document.addEventListener('mouseup', handleMouseUp);
      if (isDragging) {
        // Only listen for mousemove when actually dragging
        document.addEventListener('mousemove', handleMouseMove);
      }
      // Touch events
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
      return () => {
        document.removeEventListener('mouseup', handleMouseUp);
        if (isDragging) {
          document.removeEventListener('mousemove', handleMouseMove);
        }
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, isFitToWindow, currentMedia, isLoading, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  // Use useCallback to ensure stable reference and prevent issues with changing callbacks
  // MUST be defined before any conditional returns to follow Rules of Hooks
  const handleClick = useCallback((e: React.MouseEvent) => {
    // If fit is off, clicks are handled by mouse up (for drag/click distinction)
    if (!isFitToWindow) {
      return;
    }
    
    // Prevent rapid clicks
    if (isNavigatingRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    // Don't handle clicks if loading
    if (isLoading) {
      return;
    }
    
    // Don't handle clicks on the loading overlay
    const target = e.target as HTMLElement;
    if (target.closest('.loading-overlay')) {
      return;
    }
    
    // Handle clicks on any media (images or videos) to progress to next
    if (currentMedia && onImageClick) {
      e.preventDefault();
      e.stopPropagation();
      
      // Set flag to prevent rapid clicks
      isNavigatingRef.current = true;
      
      // Call the navigation handler to progress
      onImageClick();
      
      // Reset flag after navigation completes
      // Use requestAnimationFrame to ensure state updates have processed
      const timeoutId = requestAnimationFrame(() => {
        setTimeout(() => {
          isNavigatingRef.current = false;
        }, 100);
      });
      
      // Safety: Always reset after 1 second even if something goes wrong
      setTimeout(() => {
        isNavigatingRef.current = false;
        cancelAnimationFrame(timeoutId);
      }, 1000);
    }
  }, [currentMedia, isLoading, onImageClick, isFitToWindow]);

  const containerStyle: React.CSSProperties = {
    transform: `scale(${zoomFactor}) translate(${isFitToWindow ? 0 : panOffset.x}px, ${isFitToWindow ? 0 : panOffset.y}px)`,
    transformOrigin: 'center center',
    transition: (zoomFactor === 1.0 && isFitToWindow && !isDragging) ? 'transform 0.2s ease-out' : 'none' // Disable transition when zooming with keyboard or panning
  };

  const mediaStyle: React.CSSProperties = isFitToWindow
    ? {
        maxWidth: '100%',
        maxHeight: '100%',
        width: '100%',
        height: '100%',
        objectFit: 'contain'
      }
    : {
        width: 'auto',
        height: 'auto',
        maxWidth: 'none',
        maxHeight: 'none'
      };

  if (!currentMedia) {
    return null;
  }

  // Determine cursor style based on state
  const getCursorStyle = (): string => {
    if (isDragging) return 'grabbing';
    if (!isFitToWindow && currentMedia && !isLoading) {
      const mediaElement = imageRef.current || videoRef.current;
      if (mediaElement && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const mediaRect = mediaElement.getBoundingClientRect();
        const scaledWidth = mediaRect.width * zoomFactor;
        const scaledHeight = mediaRect.height * zoomFactor;
        const isLargerThanViewport = scaledWidth > containerRect.width || scaledHeight > containerRect.height;
        if (isLargerThanViewport) {
          return 'grab';
        }
      }
    }
    return 'pointer';
  };

  return (
    <div 
      className="media-display" 
      ref={containerRef} 
      onClick={handleClick}
      style={{ cursor: getCursorStyle() }}
    >
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      )}
      
      <div 
        className="media-container" 
        style={containerStyle}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {currentMedia.type === MediaType.Video && videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            style={mediaStyle}
            controls={false}
            autoPlay
            playsInline
            muted={isMuted}
            onEnded={handleVideoEnded}
            onLoadedData={() => {
              setIsLoading(false);
              // Notify successful load (only once, onLoadedData is more reliable than play promise)
              if (onMediaLoadSuccess && !loadSuccessNotifiedRef.current) {
                loadSuccessNotifiedRef.current = true;
                onMediaLoadSuccess();
              }
            }}
            onCanPlay={() => {
              // Ensure video plays when it can
              if (videoRef.current && videoRef.current.paused) {
                videoRef.current.play().catch(err => {
                  console.warn('Video autoplay prevented:', err);
                });
              }
            }}
            onError={handleVideoError}
          />
        ) : imageSrc ? (
          <img
            ref={imageRef}
            src={imageSrc}
            alt={currentMedia.fileName}
            style={mediaStyle}
            onLoad={() => {
              setIsLoading(false);
              // Notify successful load (only once)
              if (onMediaLoadSuccess && !loadSuccessNotifiedRef.current) {
                loadSuccessNotifiedRef.current = true;
                onMediaLoadSuccess();
              }
            }}
            onError={handleImageError}
          />
        ) : null}
      </div>
    </div>
  );
};

export default MediaDisplay;

