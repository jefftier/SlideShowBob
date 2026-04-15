import { useState, useEffect, useCallback, useRef } from 'react';

interface UseKioskModeOptions {
  /**
   * Optional callback when kiosk mode is entered
   */
  onEnter?: () => void;
  /**
   * Optional callback when kiosk mode is exited
   */
  onExit?: () => void;
}

/**
 * Hook for managing kiosk mode state and fullscreen behavior.
 * 
 * Features:
 * - Enter/exit fullscreen automatically when kiosk mode changes
 * - Escape sequence: Shift + Escape (3 times within 2 seconds) OR Ctrl+Alt+K
 * - Automatically exits kiosk mode if user exits fullscreen via browser
 */
export function useKioskMode(options: UseKioskModeOptions = {}) {
  const { onEnter, onExit } = options;
  const [isKioskMode, setIsKioskMode] = useState(false);
  // Use refs to store callbacks to avoid stale closures
  const onEnterRef = useRef(onEnter);
  const onExitRef = useRef(onExit);
  
  // Update refs when callbacks change
  useEffect(() => {
    onEnterRef.current = onEnter;
    onExitRef.current = onExit;
  }, [onEnter, onExit]);
  
  // Escape sequence tracking
  const escapeSequenceRef = useRef<{
    shiftHeld: boolean;
    escapeCount: number;
    lastEscapeTime: number;
    resetTimer: number | null;
  }>({
    shiftHeld: false,
    escapeCount: 0,
    lastEscapeTime: 0,
    resetTimer: null,
  });

  /**
   * Enter kiosk mode: request fullscreen
   */
  const enterKiosk = useCallback(async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        // Safari support
        await (document.documentElement as any).webkitRequestFullscreen();
      } else if ((document.documentElement as any).mozRequestFullScreen) {
        // Firefox support
        await (document.documentElement as any).mozRequestFullScreen();
      } else if ((document.documentElement as any).msRequestFullscreen) {
        // IE/Edge support
        await (document.documentElement as any).msRequestFullscreen();
      }
      setIsKioskMode(true);
      if (onEnter) {
        onEnter();
      }
    } catch (error) {
      console.error('Failed to enter fullscreen:', error);
      // If fullscreen fails, don't set kiosk mode
    }
  }, [onEnter]);

  /**
   * Exit kiosk mode: exit fullscreen
   */
  const exitKiosk = useCallback(async () => {
    // Prevent double-exit
    if (!isKioskMode) {
      return;
    }
    
    try {
      // Set kiosk mode to false first and call onExit immediately
      // This ensures toolbar is restored before fullscreen exits
      setIsKioskMode(false);
      if (onExit) {
        onExit();
      }
      
      // Then exit fullscreen (this will trigger fullscreenchange event,
      // but isKioskMode is already false, so handleFullscreenChange won't do anything)
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        await (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }
    } catch (error) {
      console.error('Failed to exit fullscreen:', error);
      // Still set kiosk mode to false even if exit fails
      setIsKioskMode(false);
      if (onExit) {
        onExit();
      }
    }
  }, [onExit, isKioskMode]);

  /**
   * Toggle kiosk mode
   */
  const toggleKiosk = useCallback(() => {
    if (isKioskMode) {
      exitKiosk();
    } else {
      enterKiosk();
    }
  }, [isKioskMode, enterKiosk, exitKiosk]);

  /**
   * Check if document is in fullscreen (cross-browser)
   */
  const isFullscreenActive = useCallback(() => {
    return !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );
  }, []);

  /**
   * Handle fullscreen change events
   * If user exits fullscreen via browser, automatically exit kiosk mode
   */
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = isFullscreenActive();
      const currentKioskMode = isKioskMode; // Capture current state
      
      if (!isFullscreen && currentKioskMode) {
        // User exited fullscreen via browser (e.g., pressing Escape)
        // Exit kiosk mode and restore toolbar
        setIsKioskMode(false);
        // Use ref to get latest callback
        if (onExitRef.current) {
          onExitRef.current();
        }
      } else if (isFullscreen && !currentKioskMode) {
        // User entered fullscreen via browser - enter kiosk mode
        setIsKioskMode(true);
        if (onEnterRef.current) {
          onEnterRef.current();
        }
      }
    };
    
    // Listen to all fullscreen change events (cross-browser)
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    
    // Also listen on window for some browsers
    window.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      window.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [isKioskMode]);
  
  // Additional polling check as backup (in case events don't fire)
  useEffect(() => {
    if (!isKioskMode) return;
    
    const checkFullscreen = () => {
      const isFullscreen = isFullscreenActive();
      if (!isFullscreen && isKioskMode) {
        // Polling detected fullscreen exit - exit kiosk mode
        setIsKioskMode(false);
        if (onExitRef.current) {
          onExitRef.current();
        }
      }
    };
    
    // Poll every 100ms when in kiosk mode
    const interval = setInterval(checkFullscreen, 100);
    
    return () => clearInterval(interval);
  }, [isKioskMode]);

  /**
   * Handle escape sequence: Shift + Escape (3 times within 2 seconds) OR Ctrl+Alt+K
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Only process escape sequence when in kiosk mode
      if (!isKioskMode) {
        return;
      }

      const seq = escapeSequenceRef.current;

      // Option 1: Ctrl+Alt+K toggles kiosk mode
      if (e.key === 'k' || e.key === 'K') {
        if (e.ctrlKey && e.altKey && !e.shiftKey) {
          e.preventDefault();
          exitKiosk();
          return;
        }
      }

      // Option 2: Shift + Escape (3 times within 2 seconds)
      if (e.key === 'Escape') {
        const now = Date.now();
        
        // Check if Shift is held
        if (e.shiftKey) {
          e.preventDefault();
          
          // Reset sequence if too much time has passed
          if (now - seq.lastEscapeTime > 2000) {
            seq.escapeCount = 0;
          }
          
          seq.escapeCount++;
          seq.lastEscapeTime = now;
          
          // Clear any existing reset timer
          if (seq.resetTimer) {
            clearTimeout(seq.resetTimer);
          }
          
          // If we've pressed Shift+Escape 3 times, exit kiosk mode
          if (seq.escapeCount >= 3) {
            seq.escapeCount = 0;
            exitKiosk();
          } else {
            // Reset count after 2 seconds of inactivity
            seq.resetTimer = window.setTimeout(() => {
              seq.escapeCount = 0;
            }, 2000);
          }
        } else {
          // Regular Escape without Shift - prevent default to avoid exiting fullscreen
          e.preventDefault();
        }
      }

      // Track Shift key state
      if (e.key === 'Shift') {
        seq.shiftHeld = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        escapeSequenceRef.current.shiftHeld = false;
      }
    };

    if (isKioskMode) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        
        // Cleanup reset timer
        if (escapeSequenceRef.current.resetTimer) {
          clearTimeout(escapeSequenceRef.current.resetTimer);
        }
      };
    }
  }, [isKioskMode, exitKiosk]);

  return {
    isKioskMode,
    enterKiosk,
    exitKiosk,
    toggleKiosk,
  };
}

