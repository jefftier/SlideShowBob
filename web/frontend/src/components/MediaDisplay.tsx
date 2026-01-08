import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MediaItem, MediaType } from '../types/media';
import { logger } from '../utils/logger';
import { addEvent } from '../utils/eventLog';
import { TransitionEffect } from '../utils/settingsStorage';
import { parseGifMetadata, parseGifMetadataFromUrl } from '../utils/gifParser';
import { createGifPlayerOnce, GifPlayer } from '../utils/gifPlayer';
import './MediaDisplay.css';

interface MediaDisplayProps {
  currentMedia: MediaItem | null;
  zoomFactor: number;
  isFitToWindow: boolean;
  isMuted: boolean;
  transitionEffect: TransitionEffect;
  onVideoEnded: () => void;
  onImageClick?: () => void;
  onEffectiveZoomChange?: (zoom: number) => void;
  onMediaError?: (error: string) => void;
  onMediaLoadSuccess?: () => void;
  onGifCompleted?: () => void;
  isPlaying?: boolean; // Whether slideshow is currently playing
}

const MediaDisplay: React.FC<MediaDisplayProps> = ({
  currentMedia,
  zoomFactor,
  isFitToWindow,
  isMuted,
  transitionEffect,
  onVideoEnded,
  onImageClick,
  onEffectiveZoomChange,
  onMediaError,
  onMediaLoadSuccess,
  onGifCompleted,
  isPlaying = false
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [, setEffectiveZoom] = useState(1.0); // Used via onEffectiveZoomChange callback
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [transitionKey, setTransitionKey] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNavigatingRef = useRef(false);
  const clickStartTimeRef = useRef(0);
  const clickStartPosRef = useRef({ x: 0, y: 0 });
  const loadSuccessNotifiedRef = useRef(false);
  const activeTimeoutsRef = useRef<Set<number>>(new Set());
  const activeAnimationFramesRef = useRef<Set<number>>(new Set());
  const gifCompletionTimeoutRef = useRef<number | null>(null);
  const gifParsingInProgressRef = useRef(false);
  const currentGifMediaRef = useRef<string | null>(null);
  const gifLoadHandledRef = useRef<Set<string>>(new Set()); // Track which GIFs have already had onLoad handled
  const gifPlayerRef = useRef<GifPlayer | null>(null);
  const gifCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!currentMedia) {
      setImageSrc(null);
      setVideoSrc(null);
      setIsLoading(false);
      loadSuccessNotifiedRef.current = false;
      return;
    }

    // Trigger transition by updating key
    setTransitionKey(prev => prev + 1);
    setIsLoading(true);
    loadSuccessNotifiedRef.current = false; // Reset success notification flag

    // Use object URL if available (from File System Access API), otherwise use filePath
    const mediaUrl = currentMedia.objectUrl || currentMedia.filePath;
    
    // Dev-only: Simulate failures based on URL parameter
    const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
    const shouldSimulateFailure = isDev && (() => {
      const urlParams = new URLSearchParams(window.location.search);
      const failRate = urlParams.get('failRate');
      return failRate && !isNaN(parseFloat(failRate)) && Math.random() < parseFloat(failRate);
    })();
    
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
    // Cleanup GIF completion timeout and player when media changes
    // Only clear if media actually changed (check by filePath)
    const previousMediaId = currentGifMediaRef.current;
    const newMediaId = currentMedia.filePath;
    if (previousMediaId !== newMediaId) {
      if (gifCompletionTimeoutRef.current) {
        const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
        if (isDev) {
          console.log('[MediaDisplay] Clearing GIF timeout - media changed', {
            previous: previousMediaId,
            new: newMediaId
          });
        }
        clearTimeout(gifCompletionTimeoutRef.current);
        gifCompletionTimeoutRef.current = null;
      }
      // Cleanup GIF player
      if (gifPlayerRef.current) {
        gifPlayerRef.current.stop();
        gifPlayerRef.current = null;
      }
      gifParsingInProgressRef.current = false;
      currentGifMediaRef.current = null;
      // Clear the load handled set when media changes
      gifLoadHandledRef.current.clear();
    }
    
    return () => {
      // Cleanup handled by objectUrlRegistry at the lifecycle level
      if (gifCompletionTimeoutRef.current) {
        clearTimeout(gifCompletionTimeoutRef.current);
        gifCompletionTimeoutRef.current = null;
      }
      // Cleanup GIF player
      if (gifPlayerRef.current) {
        gifPlayerRef.current.stop();
        gifPlayerRef.current = null;
      }
      gifParsingInProgressRef.current = false;
      currentGifMediaRef.current = null;
    };
  }, [currentMedia]);

  // Handle GIF playback using gifPlayer module
  useEffect(() => {
    if (!currentMedia || currentMedia.type !== MediaType.Gif || !imageSrc) {
      // Cleanup if not a GIF
      if (gifPlayerRef.current) {
        gifPlayerRef.current.stop();
        gifPlayerRef.current = null;
      }
      return;
    }

    if (!gifCanvasRef.current) {
      return;
    }

    const mediaId = currentMedia.filePath;
    
    // Don't reinitialize if already playing the same media
    if (gifPlayerRef.current && currentGifMediaRef.current === mediaId) {
      return;
    }

    // Cleanup previous player
    if (gifPlayerRef.current) {
      gifPlayerRef.current.stop();
      gifPlayerRef.current = null;
    }

    const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
    
    // Create GIF player configured to play once (no looping)
    // This ensures GIFs play once whether in slideshow mode or not
    const player = createGifPlayerOnce(gifCanvasRef.current, {
      autoPlay: true,
      onComplete: () => {
        const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
        if (isDev) {
          console.log('[MediaDisplay] GIF player completed', {
            mediaId: currentGifMediaRef.current,
            isPlaying
          });
        }
        // Notify completion (for slideshow advancement if playing)
        if (onGifCompleted && currentGifMediaRef.current === mediaId) {
          onGifCompleted();
        }
      },
      onError: (error) => {
        console.error('[MediaDisplay] GIF player error:', error);
        if (onMediaError) {
          onMediaError(`Failed to play GIF: ${currentMedia.fileName}`);
        }
      }
    });

    gifPlayerRef.current = player;
    currentGifMediaRef.current = mediaId;

    // Load and play the GIF
    const loadGif = async () => {
      try {
        setIsLoading(true);
        
        // Prefer File object, fallback to URL
        if (currentMedia.file) {
          await player.loadFromFile(currentMedia.file);
        } else if (imageSrc) {
          await player.loadFromUrl(imageSrc);
        } else {
          throw new Error('No file or URL available');
        }

        setIsLoading(false);
        
        // Notify successful load
        if (onMediaLoadSuccess && !loadSuccessNotifiedRef.current) {
          loadSuccessNotifiedRef.current = true;
          onMediaLoadSuccess();
          
          const entry = logger.event('media_load_success', {
            mediaType: 'gif',
            fileName: currentMedia.fileName,
            filePath: currentMedia.filePath,
          });
          addEvent(entry);
        }

        // Start playing
        player.play();
      } catch (error) {
        console.error('[MediaDisplay] Failed to load GIF:', error);
        setIsLoading(false);
        
        if (onMediaError) {
          onMediaError(`Failed to load GIF: ${currentMedia.fileName}`);
        }
      }
    };

    loadGif();

    // Cleanup on unmount or media change
    return () => {
      if (gifPlayerRef.current) {
        gifPlayerRef.current.stop();
        gifPlayerRef.current = null;
      }
    };
  }, [currentMedia, imageSrc, onGifCompleted, onMediaError, onMediaLoadSuccess, isPlaying]);

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
              
              // Log media load success (video play promise)
              if (currentMedia) {
                const entry = logger.event('media_load_success', {
                  mediaType: 'video',
                  fileName: currentMedia.fileName,
                  filePath: currentMedia.filePath,
                });
                addEvent(entry);
              }
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

    // Capture current element at effect start to ensure cleanup targets the same instance
    const mediaElement = imageRef.current || videoRef.current || gifCanvasRef.current;
    
    // Define stable handler that uses captured refs
    const calculateEffectiveZoom = () => {
      const currentMediaElement = imageRef.current || videoRef.current || gifCanvasRef.current;
      const currentContainer = containerRef.current;
      
      if (!currentMediaElement || !currentContainer) {
        setEffectiveZoom(zoomFactor);
        if (onEffectiveZoomChange) {
          onEffectiveZoomChange(zoomFactor);
        }
        return;
      }

      const naturalWidth = (currentMediaElement as HTMLImageElement).naturalWidth || 
                          (currentMediaElement as HTMLVideoElement).videoWidth ||
                          (currentMediaElement as HTMLCanvasElement).width || 0;
      const naturalHeight = (currentMediaElement as HTMLImageElement).naturalHeight || 
                           (currentMediaElement as HTMLVideoElement).videoHeight ||
                           (currentMediaElement as HTMLCanvasElement).height || 0;
      
      if (naturalWidth === 0 || naturalHeight === 0) {
        setEffectiveZoom(zoomFactor);
        if (onEffectiveZoomChange) {
          onEffectiveZoomChange(zoomFactor);
        }
        return;
      }

      const displayedWidth = currentMediaElement.clientWidth;
      const displayedHeight = currentMediaElement.clientHeight;
      
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

    // Track all timeouts for cleanup
    const timeoutIds: number[] = [];

    // Use a small delay to ensure layout is complete
    const initialTimeoutId = window.setTimeout(calculateEffectiveZoom, 100);
    timeoutIds.push(initialTimeoutId);

    // Define stable load handler that tracks its own timeout
    const handleLoad = () => {
      const loadTimeoutId = window.setTimeout(calculateEffectiveZoom, 100);
      timeoutIds.push(loadTimeoutId);
    };

    // Set up media element listeners if element exists and isn't already loaded
    if (mediaElement) {
      const isComplete = (mediaElement as HTMLImageElement).complete || 
                         ((mediaElement as HTMLVideoElement).readyState >= 2);
      if (!isComplete) {
        mediaElement.addEventListener('load', handleLoad);
        mediaElement.addEventListener('loadeddata', handleLoad);
      } else {
        calculateEffectiveZoom();
      }
    }

    // Also recalculate on window resize
    window.addEventListener('resize', calculateEffectiveZoom);

    // Cleanup: remove listeners from the captured element and clear all timeouts
    return () => {
      // Clear all tracked timeouts
      timeoutIds.forEach(id => window.clearTimeout(id));
      
      // Remove listeners from the captured element instance
      if (mediaElement) {
        mediaElement.removeEventListener('load', handleLoad);
        mediaElement.removeEventListener('loadeddata', handleLoad);
      }
      
      // Remove window resize listener
      window.removeEventListener('resize', calculateEffectiveZoom);
    };
  }, [isFitToWindow, zoomFactor, imageSrc, videoSrc, currentMedia, onEffectiveZoomChange]);

  const handleVideoEnded = useCallback(() => {
    onVideoEnded();
  }, [onVideoEnded]);

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const errorMessage = `Failed to load image: ${currentMedia?.fileName || 'Unknown'}`;
    console.error('Image load error:', e);
    setIsLoading(false);
    
    // Log media load error
    if (currentMedia) {
      const entry = logger.event('media_load_error', {
        mediaType: 'image',
        fileName: currentMedia.fileName,
        filePath: currentMedia.filePath,
        error: errorMessage,
      }, 'error');
      addEvent(entry);
    }
    
    if (onMediaError) {
      onMediaError(errorMessage);
    }
  };

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const errorMessage = `Failed to load video: ${currentMedia?.fileName || 'Unknown'}`;
    console.error('Video load error:', e);
    setIsLoading(false);
    
    // Log media load error
    if (currentMedia) {
      const entry = logger.event('media_load_error', {
        mediaType: 'video',
        fileName: currentMedia.fileName,
        filePath: currentMedia.filePath,
        error: errorMessage,
      }, 'error');
      addEvent(entry);
    }
    
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
          const timeoutId = window.setTimeout(() => {
            isNavigatingRef.current = false;
            activeTimeoutsRef.current.delete(timeoutId);
          }, 200);
          activeTimeoutsRef.current.add(timeoutId);
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

  // Cleanup all timeouts and animation frames when media changes or component unmounts
  useEffect(() => {
    return () => {
      // Clear all active timeouts
      activeTimeoutsRef.current.forEach(timeoutId => window.clearTimeout(timeoutId));
      activeTimeoutsRef.current.clear();
      
      // Cancel all active animation frames
      activeAnimationFramesRef.current.forEach(rafId => cancelAnimationFrame(rafId));
      activeAnimationFramesRef.current.clear();
      
      // Reset navigation flag
      isNavigatingRef.current = false;
    };
  }, [currentMedia]);

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
          const timeoutId = window.setTimeout(() => {
            isNavigatingRef.current = false;
            activeTimeoutsRef.current.delete(timeoutId);
          }, 200);
          activeTimeoutsRef.current.add(timeoutId);
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
      const rafId = requestAnimationFrame(() => {
        activeAnimationFramesRef.current.delete(rafId);
        const timeoutId = window.setTimeout(() => {
          isNavigatingRef.current = false;
          activeTimeoutsRef.current.delete(timeoutId);
        }, 100);
        activeTimeoutsRef.current.add(timeoutId);
      });
      activeAnimationFramesRef.current.add(rafId);
      
      // Safety: Always reset after 1 second even if something goes wrong
      const safetyTimeoutId = window.setTimeout(() => {
        isNavigatingRef.current = false;
        if (activeAnimationFramesRef.current.has(rafId)) {
          cancelAnimationFrame(rafId);
          activeAnimationFramesRef.current.delete(rafId);
        }
        activeTimeoutsRef.current.delete(safetyTimeoutId);
      }, 1000);
      activeTimeoutsRef.current.add(safetyTimeoutId);
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
      const mediaElement = imageRef.current || videoRef.current || gifCanvasRef.current;
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
            key={`${transitionKey}-video`}
            ref={videoRef}
            src={videoSrc}
            className={`transition-${transitionEffect.toLowerCase()}`}
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
                
                // Log media load success
                if (currentMedia) {
                  const entry = logger.event('media_load_success', {
                    mediaType: 'video',
                    fileName: currentMedia.fileName,
                    filePath: currentMedia.filePath,
                  });
                  addEvent(entry);
                }
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
        ) : currentMedia.type === MediaType.Gif && imageSrc ? (
          // Render GIFs using gifPlayer module with canvas for loop control
          <canvas
            key={`${transitionKey}-gif-canvas`}
            ref={gifCanvasRef}
            className={`transition-${transitionEffect.toLowerCase()}`}
            style={mediaStyle}
          />
        ) : imageSrc ? (
          <img
            key={`${transitionKey}-image`}
            ref={imageRef}
            src={imageSrc}
            alt={currentMedia.fileName}
            className={`transition-${transitionEffect.toLowerCase()}`}
            style={mediaStyle}
            onLoad={() => {
              setIsLoading(false);
              // Notify successful load (only once)
              if (onMediaLoadSuccess && !loadSuccessNotifiedRef.current) {
                loadSuccessNotifiedRef.current = true;
                onMediaLoadSuccess();
                
                // Log media load success
                if (currentMedia) {
                  const entry = logger.event('media_load_success', {
                    mediaType: 'image',
                    fileName: currentMedia.fileName,
                    filePath: currentMedia.filePath,
                  });
                  addEvent(entry);
                }
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

