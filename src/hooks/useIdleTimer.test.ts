import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { useIdleTimer } from './useIdleTimer';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useIdleTimer property-based tests', () => {
  // Feature: toolbar-ui-improvements, Property 2: Idle timer triggers after timeout with no activity
  // Validates: Requirements 4.1
  it('Property 2: idle timer triggers after timeout with no activity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 30000 }),
        (timeoutMs) => {
          const onIdle = vi.fn();
          const onActive = vi.fn();

          const { result, unmount } = renderHook(() =>
            useIdleTimer({ timeoutMs, enabled: true, onIdle, onActive })
          );

          // Initially not idle
          expect(result.current.isIdle).toBe(false);

          // Advance time just before timeout — should still not be idle
          act(() => {
            vi.advanceTimersByTime(timeoutMs - 1);
          });
          expect(result.current.isIdle).toBe(false);

          // Advance past the timeout
          act(() => {
            vi.advanceTimersByTime(2);
          });
          expect(result.current.isIdle).toBe(true);
          expect(onIdle).toHaveBeenCalled();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: toolbar-ui-improvements, Property 3: Any user input resets idle state
  // Validates: Requirements 4.2, 4.3, 4.4
  it('Property 3: any user input resets idle state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('mousemove', 'keydown'),
        fc.integer({ min: 100, max: 10000 }),
        (eventType, timeoutMs) => {
          const onIdle = vi.fn();
          const onActive = vi.fn();

          const { result, unmount } = renderHook(() =>
            useIdleTimer({ timeoutMs, enabled: true, onIdle, onActive })
          );

          // Let the timer expire so we become idle
          act(() => {
            vi.advanceTimersByTime(timeoutMs + 1);
          });
          expect(result.current.isIdle).toBe(true);

          // Dispatch user activity event to reset idle state
          act(() => {
            document.dispatchEvent(new Event(eventType));
          });

          expect(result.current.isIdle).toBe(false);
          expect(onActive).toHaveBeenCalled();

          // Timer should have restarted — not idle before new timeout
          act(() => {
            vi.advanceTimersByTime(timeoutMs - 1);
          });
          expect(result.current.isIdle).toBe(false);

          // Goes idle again after the full new timeout
          act(() => {
            vi.advanceTimersByTime(2);
          });
          expect(result.current.isIdle).toBe(true);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: toolbar-ui-improvements, Property 4: Disabled timer never reports idle
  // Validates: Requirements 4.5, 4.8
  it('Property 4: disabled timer never reports idle', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 30000 }),
        fc.integer({ min: 1, max: 5 }),
        (timeoutMs, multiplier) => {
          const onIdle = vi.fn();
          const onActive = vi.fn();

          const { result, unmount } = renderHook(() =>
            useIdleTimer({ timeoutMs, enabled: false, onIdle, onActive })
          );

          // Advance well past the timeout
          act(() => {
            vi.advanceTimersByTime(timeoutMs * multiplier);
          });

          expect(result.current.isIdle).toBe(false);
          expect(onIdle).not.toHaveBeenCalled();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: toolbar-ui-improvements, Property 5: Paused timer does not trigger idle
  // Validates: Requirements 4.6
  it('Property 5: paused timer does not trigger idle', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 10000 }),
        fc.integer({ min: 1, max: 5 }),
        (timeoutMs, pauseCount) => {
          const onIdle = vi.fn();
          const onActive = vi.fn();

          const { result, unmount } = renderHook(() =>
            useIdleTimer({ timeoutMs, enabled: true, onIdle, onActive })
          );

          // Let some time pass (half the timeout)
          const halfTimeout = Math.floor(timeoutMs / 2);
          act(() => {
            vi.advanceTimersByTime(halfTimeout);
          });
          expect(result.current.isIdle).toBe(false);

          // Pause the timer
          act(() => {
            result.current.pause();
          });

          // Advance well past the timeout while paused — should never go idle
          act(() => {
            vi.advanceTimersByTime(timeoutMs * (pauseCount + 1));
          });
          expect(result.current.isIdle).toBe(false);
          expect(onIdle).not.toHaveBeenCalled();

          // Resume the timer — should not immediately be idle
          act(() => {
            result.current.resume();
          });
          expect(result.current.isIdle).toBe(false);

          // The remaining time should still need to elapse before going idle
          // After resume, the remaining time is approximately halfTimeout
          // Advance just short of remaining — still not idle
          const remaining = timeoutMs - halfTimeout;
          act(() => {
            vi.advanceTimersByTime(remaining - 1);
          });
          expect(result.current.isIdle).toBe(false);

          // Now advance past remaining
          act(() => {
            vi.advanceTimersByTime(2);
          });
          expect(result.current.isIdle).toBe(true);
          expect(onIdle).toHaveBeenCalled();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
