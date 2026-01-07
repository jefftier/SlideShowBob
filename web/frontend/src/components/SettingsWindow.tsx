import React, { useState, useEffect } from 'react';
import './SettingsWindow.css';
import { loadSettings, saveSettings, AppSettings, getDefaultSettings } from '../utils/settingsStorage';
import { createSampleManifest } from '../utils/manifestLoader';
import { useToast } from '../hooks/useToast';

interface SettingsWindowProps {
  onClose: () => void;
  onSave?: () => void; // Optional callback when settings are saved
  onOpenDiagnostics?: () => void; // Optional callback to open diagnostics panel
}

const SettingsWindow: React.FC<SettingsWindowProps> = ({
  onClose,
  onSave,
  onOpenDiagnostics
}) => {
  const [settings, setSettings] = useState<AppSettings>(getDefaultSettings());
  const [hasChanges, setHasChanges] = useState(false);
  const { showError, showWarning } = useToast();

  useEffect(() => {
    const loaded = loadSettings({ showError, showWarning });
    setSettings(loaded);
  }, [showError, showWarning]);

  const handleSaveFlagChange = (key: keyof AppSettings, value: boolean) => {
    setSettings(prev => {
      const updated = { ...prev, [key]: value };
      setHasChanges(true);
      return updated;
    });
  };

  const handleSave = () => {
    try {
      saveSettings(settings, { showError, showWarning });
      setHasChanges(false);
      if (onSave) {
        onSave();
      }
      onClose();
    } catch (error) {
      console.error('Error saving settings:', error);
      // Error is handled by saveSettings internally via callbacks
    }
  };

  const handleCancel = () => {
    // Reload original settings
    const loaded = loadSettings({ showError, showWarning });
    setSettings(loaded);
    setHasChanges(false);
    onClose();
  };

  return (
    <div className="settings-window-overlay" onClick={onClose}>
      <div className="settings-window" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={handleCancel} title="Close" aria-label="Close settings">×</button>
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
            <div className="settings-preference">
              <label>
                <input
                  type="checkbox"
                  checked={settings.saveFolders}
                  onChange={(e) => handleSaveFlagChange('saveFolders', e.target.checked)}
                />
                Save last loaded folders
              </label>
            </div>
          </section>

          <section className="settings-section">
            <h3>Diagnostics</h3>
            <p className="settings-description">
              View application event logs for troubleshooting. Use Ctrl+Alt+D to open diagnostics panel.
            </p>
            {onOpenDiagnostics && (
              <div className="settings-manifest-actions">
                <button
                  className="settings-btn-secondary"
                  onClick={() => {
                    onOpenDiagnostics();
                    onClose();
                  }}
                >
                  Open Diagnostics Panel
                </button>
              </div>
            )}
          </section>

          <section className="settings-section">
            <h3>Slideshow Playlist (Manifest)</h3>
            <p className="settings-description">
              A playlist manifest file allows you to create custom slideshows with specific files, 
              custom delays per file, and precise control over the playback order. Place a JSON file 
              in your folder root with the slideshow configuration.
            </p>
            <div className="settings-manifest-info">
              <h4>How to use:</h4>
              <ol>
                <li>Download the sample manifest file below</li>
                <li>Edit it with your file names and desired delays</li>
                <li>Save it as a .json file in your folder root (any name works)</li>
                <li>When loading the folder, you'll be asked if you want to use the manifest</li>
              </ol>
              <div className="settings-manifest-actions">
                <button
                  className="settings-btn-secondary"
                  onClick={() => {
                    const sample = createSampleManifest();
                    const blob = new Blob([sample], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'slideshow-playlist.json';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download Sample Manifest
                </button>
              </div>
              <div className="settings-manifest-format">
                <h4>Manifest Format:</h4>
                <ul>
                  <li><strong>file</strong>: Relative path to the file (e.g., "image.jpg" or "subfolder/video.mp4")</li>
                  <li><strong>delay</strong>: Optional delay in milliseconds (uses default if not specified)</li>
                  <li><strong>zoom</strong>: Optional zoom level (e.g., 1.5 for 150%)</li>
                  <li><strong>fit</strong>: Optional fit-to-window setting (true/false)</li>
                </ul>
              </div>
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

