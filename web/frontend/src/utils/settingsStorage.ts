// Settings persistence using localStorage

import { logger } from './logger';
import { addEvent } from './eventLog';

// Optional callbacks for error reporting (to avoid tight coupling with React hooks)
export interface StorageErrorCallbacks {
  showError?: (message: string) => void;
  showWarning?: (message: string) => void;
}

export interface AppSettings {
  slideDelayMs: number;
  includeVideos: boolean;
  sortMode: 'NameAZ' | 'NameZA' | 'DateOldest' | 'DateNewest' | 'Random';
  isMuted: boolean;
  isFitToWindow: boolean;
  zoomFactor: number;
  // Save flags
  saveSlideDelay: boolean;
  saveIncludeVideos: boolean;
  saveSortMode: boolean;
  saveIsMuted: boolean;
  saveIsFitToWindow: boolean;
  saveZoomFactor: boolean;
  saveFolders: boolean;
}

const SETTINGS_KEY = 'slideshow-settings';

const defaultSettings: AppSettings = {
  slideDelayMs: 2000,
  includeVideos: true,
  sortMode: 'NameAZ',
  isMuted: true,
  isFitToWindow: true,
  zoomFactor: 1.0,
  saveSlideDelay: true,
  saveIncludeVideos: true,
  saveSortMode: true,
  saveIsMuted: true,
  saveIsFitToWindow: true,
  saveZoomFactor: true,
  saveFolders: true,
};

// Track if we've already shown a warning to avoid spam
let hasShownLoadWarning = false;

export const loadSettings = (callbacks?: StorageErrorCallbacks): AppSettings => {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle missing properties
        return { ...defaultSettings, ...parsed };
      } catch (parseError) {
        // Corrupt JSON - show warning once and fall back to defaults
        console.warn('Error parsing settings JSON:', parseError);
        
        // Log settings load failure
        const entry = logger.event('settings_load_failed', {
          error: 'parse_error',
          errorMessage: parseError instanceof Error ? parseError.message : String(parseError),
        }, 'error');
        addEvent(entry);
        
        if (!hasShownLoadWarning && callbacks?.showWarning) {
          hasShownLoadWarning = true;
          callbacks.showWarning('Saved settings could not be loaded. Defaults were restored.');
        }
        // Clear the corrupted data
        try {
          localStorage.removeItem(SETTINGS_KEY);
        } catch {
          // Ignore errors when removing corrupted data
        }
        return { ...defaultSettings };
      }
    }
  } catch (error) {
    // Catch any localStorage.getItem errors (e.g., storage disabled, quota exceeded)
    console.warn('Error loading settings:', error);
    
    // Log settings load failure
    const entry = logger.event('settings_load_failed', {
      error: 'storage_error',
      errorMessage: error instanceof Error ? error.message : String(error),
    }, 'error');
    addEvent(entry);
    
    if (!hasShownLoadWarning && callbacks?.showWarning) {
      hasShownLoadWarning = true;
      callbacks.showWarning('Saved settings could not be loaded. Defaults were restored.');
    }
  }
  return { ...defaultSettings };
};

export const saveSettings = (settings: Partial<AppSettings>, callbacks?: StorageErrorCallbacks): void => {
  try {
    // Load existing settings first (without callbacks to avoid duplicate warnings)
    const existing = loadSettings();
    
    // Merge with new settings, respecting save flags
    const merged: AppSettings = { ...existing };
    
    if (settings.saveSlideDelay !== false && settings.slideDelayMs !== undefined) {
      merged.slideDelayMs = settings.slideDelayMs;
    }
    if (settings.saveIncludeVideos !== false && settings.includeVideos !== undefined) {
      merged.includeVideos = settings.includeVideos;
    }
    if (settings.saveSortMode !== false && settings.sortMode !== undefined) {
      merged.sortMode = settings.sortMode;
    }
    if (settings.saveIsMuted !== false && settings.isMuted !== undefined) {
      merged.isMuted = settings.isMuted;
    }
    if (settings.saveIsFitToWindow !== false && settings.isFitToWindow !== undefined) {
      merged.isFitToWindow = settings.isFitToWindow;
    }
    if (settings.saveZoomFactor !== false && settings.zoomFactor !== undefined) {
      merged.zoomFactor = settings.zoomFactor;
    }
    
    // Update save flags if provided
    if (settings.saveSlideDelay !== undefined) merged.saveSlideDelay = settings.saveSlideDelay;
    if (settings.saveIncludeVideos !== undefined) merged.saveIncludeVideos = settings.saveIncludeVideos;
    if (settings.saveSortMode !== undefined) merged.saveSortMode = settings.saveSortMode;
    if (settings.saveIsMuted !== undefined) merged.saveIsMuted = settings.saveIsMuted;
    if (settings.saveIsFitToWindow !== undefined) merged.saveIsFitToWindow = settings.saveIsFitToWindow;
    if (settings.saveZoomFactor !== undefined) merged.saveZoomFactor = settings.saveZoomFactor;
    if (settings.saveFolders !== undefined) merged.saveFolders = settings.saveFolders;
    
    // Wrap localStorage.setItem in try/catch to catch all write failures
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    } catch (writeError) {
      // Catch localStorage.setItem errors (quota, storage disabled, etc.)
      console.warn('Error saving settings to localStorage:', writeError);
      
      // Log settings save failure
      const entry = logger.event('settings_save_failed', {
        error: 'write_error',
        errorMessage: writeError instanceof Error ? writeError.message : String(writeError),
      }, 'error');
      addEvent(entry);
      
      if (callbacks?.showError) {
        callbacks.showError('Unable to save settings. Changes may not persist.');
      }
      // Continue running with in-memory state (do NOT crash)
      return;
    }
  } catch (error) {
    // Catch any other errors (e.g., from loadSettings or JSON.stringify)
    console.warn('Error saving settings:', error);
    
    // Log settings save failure
    const entry = logger.event('settings_save_failed', {
      error: 'unknown_error',
      errorMessage: error instanceof Error ? error.message : String(error),
    }, 'error');
    addEvent(entry);
    
    if (callbacks?.showError) {
      callbacks.showError('Unable to save settings. Changes may not persist.');
    }
    // Continue running with in-memory state (do NOT crash)
    // The settings are already applied to the in-memory state, they just won't persist
  }
};

export const getDefaultSettings = (): AppSettings => {
  return { ...defaultSettings };
};

