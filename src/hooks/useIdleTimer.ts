import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseIdleTimerOptions {
  /** Timeout in milliseconds before idle state triggers */
  timeoutMs: number;
  /** Whether the timer is enabled */
  enabled: boolean;
  /** Callback when idle state is entered */
  onIdle: () => void;
  /** Callback when activity resumes */
  onActive: () => void;
}

export interface UseIdleTimerReturn {
  /** Whether the user is currently idle */
  isIdle: boolean;
  /** Manually reset the timer */
  reset: () => void;
  /** Pause the timer (e.g., when a menu is open) */
  pause: () => void;
  /** Resume the timer after pausing */
  resume: () => void;
}

export function useIdleTimer(options: UseIdleTimerOptions): UseIdleTimerReturn {
  const { timeoutMs, enabled, onIdle, onActive } = options;

  const [isIdle, setIsIdle] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Refs for stable callback access
  const onIdleRef = useRef(onIdle);
  const onActiveRef = useRef(onActive);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(timeoutMs);
  const lastStartRef = useRef<number | null>(null);
  const isIdleRef = useRef(false);
  const isPausedRef = useRef(false);

  // Keep callback refs up to date
  useEffect(() => {
    onIdleRef.current = onIdle;
    onActiveRef.current = onActive;
  }, [onIdle, onActive]);

  // Keep isPausedRef in sync
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Keep isIdleRef in sync
  useEffect(() => {
    isIdleRef.current = isIdle;
  }, [isIdle]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback((duration: number) => {
    clearTimer();
    lastStartRef.current = Date.now();
    remainingRef.current = duration;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      lastStartRef.current = null;
      if (!isPausedRef.current) {
        setIsIdle(true);
        isIdleRef.current = true;
        onIdleRef.current();
      }
    }, duration);
  }, [clearTimer]);

  const handleActivity = useCallback(() => {
    if (isPausedRef.current) return;

    if (isIdleRef.current) {
      setIsIdle(false);
      isIdleRef.current = false;
      onActiveRef.current();
    }
    // Reset timer on any activity
    startTimer(timeoutMs);
  }, [timeoutMs, startTimer]);

  const reset = useCallback(() => {
    setIsIdle(false);
    isIdleRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    remainingRef.current = timeoutMs;
    if (enabled) {
      startTimer(timeoutMs);
    }
  }, [enabled, timeoutMs, startTimer]);

  const pause = useCallback(() => {
    if (isPausedRef.current) return;
    setIsPaused(true);
    isPausedRef.current = true;

    // Calculate remaining time and clear the timer
    if (timerRef.current !== null && lastStartRef.current !== null) {
      const elapsed = Date.now() - lastStartRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    }
    clearTimer();
    lastStartRef.current = null;
  }, [clearTimer]);

  const resume = useCallback(() => {
    if (!isPausedRef.current) return;
    setIsPaused(false);
    isPausedRef.current = false;

    if (!isIdleRef.current && enabled) {
      startTimer(remainingRef.current);
    }
  }, [enabled, startTimer]);

  // Main effect: set up event listeners and timer when enabled
  useEffect(() => {
    if (!enabled) {
      clearTimer();
      setIsIdle(false);
      isIdleRef.current = false;
      setIsPaused(false);
      isPausedRef.current = false;
      remainingRef.current = timeoutMs;
      lastStartRef.current = null;
      return;
    }

    // Start the initial timer
    remainingRef.current = timeoutMs;
    startTimer(timeoutMs);

    const onActivity = () => handleActivity();

    document.addEventListener('mousemove', onActivity);
    document.addEventListener('keydown', onActivity);

    return () => {
      document.removeEventListener('mousemove', onActivity);
      document.removeEventListener('keydown', onActivity);
      clearTimer();
      lastStartRef.current = null;
    };
  }, [enabled, timeoutMs, clearTimer, startTimer, handleActivity]);

  return { isIdle, reset, pause, resume };
}
