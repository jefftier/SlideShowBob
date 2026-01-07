// Storage error classification and formatting utilities

/**
 * Detects if an error is a quota/storage limit error.
 * Handles DOMException with name "QuotaExceededError" and common browser variants.
 */
export function isQuotaError(err: unknown): boolean {
  if (err instanceof DOMException) {
    const name = err.name;
    return (
      name === 'QuotaExceededError' ||
      name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      name === 'NS_ERROR_FILE_NO_DEVICE_SPACE' ||
      // Some browsers use these variants
      name.includes('Quota') ||
      name.includes('QUOTA')
    );
  }
  
  // Check error message as fallback
  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    return (
      message.includes('quota') ||
      message.includes('storage') ||
      message.includes('space') ||
      message.includes('full')
    );
  }
  
  return false;
}

/**
 * Formats a storage error into a user-safe message (no stack traces).
 */
export function formatStorageError(err: unknown): string {
  if (err instanceof DOMException) {
    if (isQuotaError(err)) {
      return 'Storage quota exceeded';
    }
    return err.message || 'Storage operation failed';
  }
  
  if (err instanceof Error) {
    // Return a safe message without exposing internal details
    if (isQuotaError(err)) {
      return 'Storage quota exceeded';
    }
    // For other errors, return a generic message
    return 'Storage operation failed';
  }
  
  return 'An unknown storage error occurred';
}

