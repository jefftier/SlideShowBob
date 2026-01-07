import { useEffect, useRef, useCallback } from 'react';
import { MediaItem } from '../types/media';

interface UseSlideshowOptions {
  playlist: MediaItem[];
  currentIndex: number;
  slideDelayMs: number;
  isPlaying: boolean;
  onNavigate: (index: number) => void;
}

export function useSlideshow({
  playlist,
  currentIndex,
  slideDelayMs,
  isPlaying,
  onNavigate
}: UseSlideshowOptions) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const videoEndedRef = useRef(false);
  const currentMediaTypeRef = useRef<string | null>(null);

  const navigateNext = useCallback(() => {
    if (playlist.length === 0) return;
    const nextIndex = (currentIndex + 1) % playlist.length;
    onNavigate(nextIndex);
  }, [playlist, currentIndex, onNavigate]);

  const navigatePrevious = useCallback(() => {
    if (playlist.length === 0) return;
    const prevIndex = currentIndex <= 0 ? playlist.length - 1 : currentIndex - 1;
    onNavigate(prevIndex);
  }, [playlist, currentIndex, onNavigate]);

  const startSlideshow = useCallback(() => {
    if (playlist.length === 0 || slideDelayMs <= 0) return;
    
    const tick = () => {
      if (videoEndedRef.current || currentMediaTypeRef.current !== 'Video') {
        navigateNext();
      }
    };

    timerRef.current = setInterval(tick, slideDelayMs);
  }, [playlist, slideDelayMs, navigateNext]);

  const stopSlideshow = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isPlaying) {
      startSlideshow();
    } else {
      stopSlideshow();
    }
    return () => stopSlideshow();
  }, [isPlaying, startSlideshow, stopSlideshow, slideDelayMs]); // Include slideDelayMs to restart with new delay

  useEffect(() => {
    if (playlist && currentIndex >= 0 && currentIndex < playlist.length && playlist[currentIndex]) {
      currentMediaTypeRef.current = playlist[currentIndex].type;
      videoEndedRef.current = false;
    }
  }, [playlist, currentIndex]);

  const onVideoEnded = useCallback(() => {
    videoEndedRef.current = true;
  }, []);

  return {
    navigateNext,
    navigatePrevious,
    startSlideshow,
    stopSlideshow,
    onVideoEnded
  };
}

