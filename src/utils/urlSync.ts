/**
 * URL Sync module.
 *
 * Updates the browser URL to reflect the current slideshow state
 * using history.replaceState (no new history entries, no page reload).
 */

export interface UrlSyncState {
  /** Full filesystem path, or null if no folder is loaded */
  path: string | null;
  /** Ordered list of filtered file names */
  files: string[];
}

/**
 * Synchronizes the browser URL to match the current slideshow state.
 *
 * - Percent-encodes path and file values for URL safety.
 * - Removes all slideshow params (`path`, `file`, `autoplay`) when state is empty
 *   (path is null and files is empty).
 * - Uses `history.replaceState` so URL changes don't add browser history entries.
 *
 * @param state - The current slideshow state to reflect in the URL
 */
export function syncUrlToState(state: UrlSyncState): void {
  const url = new URL(window.location.href);

  // Remove all slideshow-related params first
  url.searchParams.delete('path');
  url.searchParams.delete('file');
  url.searchParams.delete('autoplay');

  // If state is empty (no path and no files), just clear the params
  if (state.path !== null) {
    url.searchParams.set('path', state.path);
  }

  // Add file params (each as a separate `file` entry)
  for (const file of state.files) {
    url.searchParams.append('file', file);
  }

  // Update the URL without navigation or new history entry
  history.replaceState(history.state, '', url.toString());
}
