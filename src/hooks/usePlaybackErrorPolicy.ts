/**
 * Playback Error Policy Hook
 * 
 * Provides centralized retry/backoff logic for media playback errors.
 * Implements exponential backoff with configurable max attempts.
 */

export type ErrorType = 'network' | 'decode' | 'unknown';

export interface MediaErrorRecord {
  mediaId: string;
  fileName: string;
  attempts: number;
  maxAttempts: number;
  lastErrorType: ErrorType;
  timestamp: number;
  finalStatus: 'retrying' | 'failed' | 'succeeded';
}

interface RetryPolicyConfig {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

const DEFAULT_CONFIG: Required<RetryPolicyConfig> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

export function usePlaybackErrorPolicy(config: RetryPolicyConfig = {}) {
  const policy = { ...DEFAULT_CONFIG, ...config };
  
  // In-memory error log
  const errorLog = new Map<string, MediaErrorRecord>();
  
  // Track retry attempts per media item
  const retryAttempts = new Map<string, number>();

  /**
   * Compute exponential backoff delay for a given attempt number
   * Formula: min(baseDelay * (multiplier ^ (attempt - 1)), maxDelay)
   */
  const computeNextRetryDelay = (attempt: number): number => {
    if (attempt <= 0) return policy.baseDelayMs;
    
    const delay = policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt - 1);
    return Math.min(delay, policy.maxDelayMs);
  };

  /**
   * Determine if a retry should be attempted
   */
  const shouldRetry = (mediaId: string, _errorType?: ErrorType): boolean => {
    const attempts = retryAttempts.get(mediaId) || 0;
    return attempts < policy.maxAttempts;
  };

  /**
   * Record a failure and increment attempt counter
   */
  const recordFailure = (
    mediaId: string,
    fileName: string,
    errorType: ErrorType = 'unknown'
  ): { shouldRetry: boolean; nextDelayMs: number; attempt: number } => {
    const currentAttempt = (retryAttempts.get(mediaId) || 0) + 1;
    retryAttempts.set(mediaId, currentAttempt);

    const shouldRetryNow = currentAttempt < policy.maxAttempts;
    const nextDelayMs = computeNextRetryDelay(currentAttempt);

    // Update or create error record
    const existing = errorLog.get(mediaId);
    const errorRecord: MediaErrorRecord = {
      mediaId,
      fileName,
      attempts: currentAttempt,
      maxAttempts: policy.maxAttempts,
      lastErrorType: errorType,
      timestamp: Date.now(),
      finalStatus: shouldRetryNow ? 'retrying' : 'failed',
    };

    if (existing) {
      // Update existing record
      errorLog.set(mediaId, {
        ...existing,
        ...errorRecord,
      });
    } else {
      errorLog.set(mediaId, errorRecord);
    }

    return {
      shouldRetry: shouldRetryNow,
      nextDelayMs,
      attempt: currentAttempt,
    };
  };

  /**
   * Reset retry state on successful load
   */
  const resetOnSuccess = (mediaId: string): void => {
    const attempts = retryAttempts.get(mediaId);
    if (attempts && attempts > 0) {
      // Update error record to succeeded if it exists
      const existing = errorLog.get(mediaId);
      if (existing) {
        errorLog.set(mediaId, {
          ...existing,
          finalStatus: 'succeeded',
          timestamp: Date.now(),
        });
      }
    }
    
    // Clear retry attempts (successful load)
    retryAttempts.delete(mediaId);
  };

  /**
   * Get current attempt count for a media item
   */
  const getAttemptCount = (mediaId: string): number => {
    return retryAttempts.get(mediaId) || 0;
  };

  /**
   * Get error record for a media item
   */
  const getErrorRecord = (mediaId: string): MediaErrorRecord | undefined => {
    return errorLog.get(mediaId);
  };

  /**
   * Get all error records (for debugging/logging)
   */
  const getAllErrorRecords = (): MediaErrorRecord[] => {
    return Array.from(errorLog.values());
  };

  /**
   * Clear error records (useful for cleanup)
   */
  const clearErrorRecords = (): void => {
    errorLog.clear();
    retryAttempts.clear();
  };

  /**
   * Clear error record for a specific media item
   */
  const clearErrorRecord = (mediaId: string): void => {
    errorLog.delete(mediaId);
    retryAttempts.delete(mediaId);
  };

  return {
    recordFailure,
    computeNextRetryDelay,
    shouldRetry,
    resetOnSuccess,
    getAttemptCount,
    getErrorRecord,
    getAllErrorRecords,
    clearErrorRecords,
    clearErrorRecord,
    config: policy,
  };
}

