// Settings persistence using localStorage

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
};

export const loadSettings = (): AppSettings => {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle missing properties
      return { ...defaultSettings, ...parsed };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return { ...defaultSettings };
};

export const saveSettings = (settings: Partial<AppSettings>): void => {
  try {
    // Load existing settings first
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
    
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  } catch (error) {
    console.error('Error saving settings:', error);
  }
};

export const getDefaultSettings = (): AppSettings => {
  return { ...defaultSettings };
};

