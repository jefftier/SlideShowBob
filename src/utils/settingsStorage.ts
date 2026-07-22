// Settings persistence using localStorage

import { logger } from './logger';
import { addEvent } from './eventLog';
import { MetadataOverlayMode, SMART_DEFAULT_FIELDS } from '../types/metadata';

// Optional callbacks for error reporting (to avoid tight coupling with React hooks)
export interface StorageErrorCallbacks {
  showError?: (message: string) => void;
  showWarning?: (message: string) => void;
}

export type TransitionEffect = 'None' | 'Fade' | 'Push' | 'Wipe' | 'Morph' | 'Zoom';

export interface AppSettings {
  slideDelayMs: number;
  includeVideos: boolean;
  sortMode: 'NameAZ' | 'NameZA' | 'DateOldest' | 'DateNewest' | 'Random';
  isMuted: boolean;
  isFitToWindow: boolean;
  zoomFactor: number;
  transitionEffect: TransitionEffect;
  backgroundBlur: boolean;
  // Show the current file's name/path as a small overlay in the corner
  showFileNameOverlay: boolean;
  // Which post-metadata fields (from a folder's metadata.json, if present) to show
  // in the overlay alongside the file name.
  // 'off' - never show metadata; 'smart' - curated default fields (title, subreddit);
  // 'custom' - user-selected fields (see metadataOverlayFields); 'all' - show every
  // field found in the entry.
  metadataOverlayMode: MetadataOverlayMode;
  metadataOverlayFields: string[];
  // Date range filter (filters playlist to files modified within the past N days)
  dateFilterEnabled: boolean;
  dateFilterDays: number;
  // Persistence
  masterPersistenceEnabled: boolean;
  // Save flags
  saveSlideDelay: boolean;
  saveIncludeVideos: boolean;
  saveSortMode: boolean;
  saveIsMuted: boolean;
  saveIsFitToWindow: boolean;
  saveZoomFactor: boolean;
  saveTransitionEffect: boolean;
  saveFolders: boolean;
  saveDateFilter: boolean;
}

const SETTINGS_KEY = 'slideshow-settings';

const defaultSettings: AppSettings = {
  slideDelayMs: 2000,
  includeVideos: true,
  sortMode: 'NameAZ',
  isMuted: true,
  isFitToWindow: true,
  zoomFactor: 1.0,
  transitionEffect: 'Fade',
  backgroundBlur: true,
  showFileNameOverlay: false,
  metadataOverlayMode: 'off',
  metadataOverlayFields: [...SMART_DEFAULT_FIELDS],
  dateFilterEnabled: false,
  dateFilterDays: 30,
  masterPersistenceEnabled: true,
  saveSlideDelay: true,
  saveIncludeVideos: true,
  saveSortMode: true,
  saveIsMuted: true,
  saveIsFitToWindow: true,
  saveZoomFactor: true,
  saveTransitionEffect: true,
  saveFolders: true,
  saveDateFilter: true,
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
    
    // Always update the master toggle state if provided
    if (settings.masterPersistenceEnabled !== undefined) {
      merged.masterPersistenceEnabled = settings.masterPersistenceEnabled;
    }
    
    // Always update individual save flags if provided
    if (settings.saveSlideDelay !== undefined) merged.saveSlideDelay = settings.saveSlideDelay;
    if (settings.saveIncludeVideos !== undefined) merged.saveIncludeVideos = settings.saveIncludeVideos;
    if (settings.saveSortMode !== undefined) merged.saveSortMode = settings.saveSortMode;
    if (settings.saveIsMuted !== undefined) merged.saveIsMuted = settings.saveIsMuted;
    if (settings.saveIsFitToWindow !== undefined) merged.saveIsFitToWindow = settings.saveIsFitToWindow;
    if (settings.saveZoomFactor !== undefined) merged.saveZoomFactor = settings.saveZoomFactor;
    if (settings.saveTransitionEffect !== undefined) merged.saveTransitionEffect = settings.saveTransitionEffect;
    if (settings.saveFolders !== undefined) merged.saveFolders = settings.saveFolders;
    if (settings.saveDateFilter !== undefined) merged.saveDateFilter = settings.saveDateFilter;
    
    // When master persistence is disabled, skip writing preference values
    // (only the master toggle state and individual flags are persisted above)
    if (merged.masterPersistenceEnabled) {
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
      if (settings.saveTransitionEffect !== false && settings.transitionEffect !== undefined) {
        merged.transitionEffect = settings.transitionEffect;
      }
      if (settings.backgroundBlur !== undefined) {
        merged.backgroundBlur = settings.backgroundBlur;
      }
      if (settings.showFileNameOverlay !== undefined) {
        merged.showFileNameOverlay = settings.showFileNameOverlay;
      }
      if (settings.metadataOverlayMode !== undefined) {
        merged.metadataOverlayMode = settings.metadataOverlayMode;
      }
      if (settings.metadataOverlayFields !== undefined) {
        merged.metadataOverlayFields = settings.metadataOverlayFields;
      }
      if (settings.saveDateFilter !== false && settings.dateFilterEnabled !== undefined) {
        merged.dateFilterEnabled = settings.dateFilterEnabled;
      }
      if (settings.saveDateFilter !== false && settings.dateFilterDays !== undefined) {
        merged.dateFilterDays = settings.dateFilterDays;
      }
    }
    
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

