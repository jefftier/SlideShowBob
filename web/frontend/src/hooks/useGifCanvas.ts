/**
 * Simple GIF Canvas Hook
 * Renders frames sequentially, plays once
 */

import { useEffect, useRef, useState } from 'react';
import { decodeGifFrames, type GifFrame } from '../utils/gifPlayer';

interface UseGifCanvasOptions {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  gifFile?: File;
  gifUrl?: string;
  onLoad?: () => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
  mediaId: string;
}

export function useGifCanvas({
  canvasRef,
  gifFile,
  gifUrl,
  onLoad,
  onError,
  onComplete,
  mediaId
}: UseGifCanvasOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const framesRef = useRef<GifFrame[]>([]);
  const timeoutsRef = useRef<number[]>([]);
  const currentMediaIdRef = useRef(mediaId);
  const isCompletedRef = useRef(false);
  
  useEffect(() => {
    currentMediaIdRef.current = mediaId;
    isCompletedRef.current = false;
  }, [mediaId]);
  
  const cleanup = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    framesRef.current = [];
    isCompletedRef.current = false;
  };
  
  useEffect(() => {
    if (!gifFile && !gifUrl) {
      return;
    }
    
    if (currentMediaIdRef.current !== mediaId) {
      return;
    }
    
    setIsLoading(true);
    cleanup();
    
    const decodePromise = gifFile 
      ? decodeGifFrames(gifFile)
      : decodeGifFrames(gifUrl!);
    
    decodePromise
      .then((frames) => {
        if (currentMediaIdRef.current !== mediaId) {
          return;
        }
        
        if (frames.length === 0) {
          throw new Error('No frames decoded');
        }
        
        framesRef.current = frames;
        setIsLoading(false);
        
        const canvas = canvasRef.current;
        if (!canvas) {
          return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }
        
        // Set dimensions
        const firstFrame = frames[0];
        canvas.width = firstFrame.imageData.width;
        canvas.height = firstFrame.imageData.height;
        
        // Render first frame
        ctx.putImageData(firstFrame.imageData, 0, 0);
        
        if (onLoad) {
          onLoad();
        }
        
        // Single frame - complete after delay
        if (frames.length === 1) {
          if (onComplete) {
            setTimeout(() => {
              if (currentMediaIdRef.current === mediaId && !isCompletedRef.current) {
                isCompletedRef.current = true;
                onComplete();
              }
            }, Math.max(frames[0].delay, 100));
          }
          return;
        }
        
        // Schedule frames
        let cumulativeDelay = 0;
        for (let i = 1; i < frames.length; i++) {
          cumulativeDelay += frames[i - 1].delay;
          
          const timeoutId = window.setTimeout(() => {
            if (currentMediaIdRef.current !== mediaId || isCompletedRef.current) {
              return;
            }
            
            const currentCanvas = canvasRef.current;
            if (!currentCanvas) {
              return;
            }
            
            const currentCtx = currentCanvas.getContext('2d');
            if (!currentCtx) {
              return;
            }
            
            // Render frame
            currentCtx.putImageData(frames[i].imageData, 0, 0);
            
            // Last frame - complete
            if (i === frames.length - 1) {
              isCompletedRef.current = true;
              if (onComplete) {
                setTimeout(() => {
                  if (currentMediaIdRef.current === mediaId) {
                    onComplete();
                  }
                }, frames[i].delay);
              }
            }
          }, cumulativeDelay);
          
          timeoutsRef.current.push(timeoutId);
        }
      })
      .catch((error) => {
        if (currentMediaIdRef.current !== mediaId) {
          return;
        }
        
        setIsLoading(false);
        if (onError) {
          onError(error.message);
        }
      });
    
    return cleanup;
  }, [gifFile, gifUrl, mediaId, canvasRef, onLoad, onError, onComplete]);
  
  return { isLoading };
}

