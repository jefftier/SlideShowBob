import React, { useState, useEffect } from 'react';
import './SettingsWindow.css';
import { loadSettings, saveSettings, AppSettings, getDefaultSettings } from '../utils/settingsStorage';

interface SettingsWindowProps {
  onClose: () => void;
  onSave?: () => void; // Optional callback when settings are saved
}

const SettingsWindow: React.FC<SettingsWindowProps> = ({
  onClose,
  onSave
}) => {
  const [settings, setSettings] = useState<AppSettings>(getDefaultSettings());
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
  }, []);

  const handleSaveFlagChange = (key: keyof AppSettings, value: boolean) => {
    setSettings(prev => {
      const updated = { ...prev, [key]: value };
      setHasChanges(true);
      return updated;
    });
  };

  const handleSave = () => {
    try {
      saveSettings(settings);
      setHasChanges(false);
      if (onSave) {
        onSave();
      }
      onClose();
    } catch (error) {
      console.error('Error saving settings:', error);
      // Error is handled by saveSettings internally, but we could show a toast here if needed
    }
  };

  const handleCancel = () => {
    // Reload original settings
    const loaded = loadSettings();
    setSettings(loaded);
    setHasChanges(false);
    onClose();
  };

  return (
    <div className="settings-window-overlay" onClick={onClose}>
      <div className="settings-window" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={handleCancel} title="Close">×</button>
        </div>
        
        <div className="settings-content">
          <section className="settings-section">
            <h3>Preferences</h3>
            <p className="settings-description">
              Choose which settings should be saved and restored when you return.
            </p>
            <div className="settings-preference">
              <label>
                <input
                  type="checkbox"
                  checked={settings.saveSlideDelay}
                  onChange={(e) => handleSaveFlagChange('saveSlideDelay', e.target.checked)}
                />
                Save slide delay
              </label>
            </div>
            <div className="settings-preference">
              <label>
                <input
                  type="checkbox"
                  checked={settings.saveIncludeVideos}
                  onChange={(e) => handleSaveFlagChange('saveIncludeVideos', e.target.checked)}
                />
                Save include videos setting
              </label>
            </div>
            <div className="settings-preference">
              <label>
                <input
                  type="checkbox"
                  checked={settings.saveSortMode}
                  onChange={(e) => handleSaveFlagChange('saveSortMode', e.target.checked)}
                />
                Save sort mode
              </label>
            </div>
            <div className="settings-preference">
              <label>
                <input
                  type="checkbox"
                  checked={settings.saveIsMuted}
                  onChange={(e) => handleSaveFlagChange('saveIsMuted', e.target.checked)}
                />
                Save mute state
              </label>
            </div>
            <div className="settings-preference">
              <label>
                <input
                  type="checkbox"
                  checked={settings.saveIsFitToWindow}
                  onChange={(e) => handleSaveFlagChange('saveIsFitToWindow', e.target.checked)}
                />
                Save fit to window preference
              </label>
            </div>
            <div className="settings-preference">
              <label>
                <input
                  type="checkbox"
                  checked={settings.saveZoomFactor}
                  onChange={(e) => handleSaveFlagChange('saveZoomFactor', e.target.checked)}
                />
                Save zoom level
              </label>
            </div>
          </section>
        </div>
        
        <div className="settings-footer">
          <button className="settings-btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button 
            className="settings-btn-primary" 
            onClick={handleSave}
            disabled={!hasChanges}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsWindow;

