import React, { useState, useEffect, useRef } from 'react';
import './SettingsWindow.css';
import { loadSettings, saveSettings, AppSettings, getDefaultSettings } from '../utils/settingsStorage';
import { createSampleManifest } from '../utils/manifestLoader';
import { useToast } from '../hooks/useToast';

interface SettingsWindowProps {
  onClose: () => void;
  onSave?: () => void;
  onOpenDiagnostics?: () => void;
}

const SettingsWindow: React.FC<SettingsWindowProps> = ({
  onClose,
  onSave,
  onOpenDiagnostics
}) => {
  const [settings, setSettings] = useState<AppSettings>(getDefaultSettings());
  const [hasChanges, setHasChanges] = useState(false);
  const [tooltip, setTooltip] = useState<{ content: React.ReactNode; x: number; y: number } | null>(null);
  const { showError, showWarning } = useToast();
  const tooltipTimeoutRef = useRef<number | null>(null);

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
    }
  };

  const handleCancel = () => {
    const loaded = loadSettings({ showError, showWarning });
    setSettings(loaded);
    setHasChanges(false);
    onClose();
  };

  const showTooltip = (content: string | React.ReactNode, event: React.MouseEvent) => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    setTooltip({ content, x: event.clientX, y: event.clientY });
  };

  const hideTooltip = () => {
    tooltipTimeoutRef.current = window.setTimeout(() => {
      setTooltip(null);
    }, 100);
  };

  const InfoIcon: React.FC<{ text: string | React.ReactNode }> = ({ text }) => {
    return (
      <span
        className="info-icon"
        onMouseEnter={(e) => showTooltip(text, e)}
        onMouseLeave={hideTooltip}
        onMouseMove={(e) => setTooltip(prev => prev ? { content: text, x: e.clientX, y: e.clientY } : null)}
      >
        ⓘ
      </span>
    );
  };

  return (
    <div className="settings-window-overlay" onClick={onClose}>
      <div className="settings-window" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={handleCancel} aria-label="Close">×</button>
        </div>
        
        <div className="settings-content">
          <div className="settings-row">
            <label className="settings-label">
              Transition Effect
              <InfoIcon text="Animation style when slides change" />
            </label>
            <select
              value={settings.transitionEffect}
              onChange={(e) => {
                setSettings(prev => ({
                  ...prev,
                  transitionEffect: e.target.value as 'Fade' | 'Push' | 'Wipe' | 'Morph' | 'Zoom'
                }));
                setHasChanges(true);
              }}
              className="settings-select"
            >
              <option value="Fade">Fade</option>
              <option value="Push">Push</option>
              <option value="Wipe">Wipe</option>
              <option value="Morph">Morph</option>
              <option value="Zoom">Zoom</option>
            </select>
          </div>

          <div className="settings-divider"></div>

          <div className="settings-group">
            <div className="settings-group-title">Save Preferences</div>
            <div className="settings-group-content">
              <div className="settings-toggle-row">
                <div className="settings-toggle-label">
                  <span>Slide Delay</span>
                  <InfoIcon text="Remember the time between slides" />
                </div>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.saveSlideDelay}
                    onChange={(e) => handleSaveFlagChange('saveSlideDelay', e.target.checked)}
                  />
                  <span className="settings-toggle-slider"></span>
                </label>
              </div>
              <div className="settings-toggle-row">
                <div className="settings-toggle-label">
                  <span>Include Videos</span>
                  <InfoIcon text="Remember video inclusion setting" />
                </div>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.saveIncludeVideos}
                    onChange={(e) => handleSaveFlagChange('saveIncludeVideos', e.target.checked)}
                  />
                  <span className="settings-toggle-slider"></span>
                </label>
              </div>
              <div className="settings-toggle-row">
                <div className="settings-toggle-label">
                  <span>Sort Mode</span>
                  <InfoIcon text="Remember how files are sorted" />
                </div>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.saveSortMode}
                    onChange={(e) => handleSaveFlagChange('saveSortMode', e.target.checked)}
                  />
                  <span className="settings-toggle-slider"></span>
                </label>
              </div>
              <div className="settings-toggle-row">
                <div className="settings-toggle-label">
                  <span>Mute State</span>
                  <InfoIcon text="Remember audio mute preference" />
                </div>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.saveIsMuted}
                    onChange={(e) => handleSaveFlagChange('saveIsMuted', e.target.checked)}
                  />
                  <span className="settings-toggle-slider"></span>
                </label>
              </div>
              <div className="settings-toggle-row">
                <div className="settings-toggle-label">
                  <span>Fit to Window</span>
                  <InfoIcon text="Remember fit-to-window preference" />
                </div>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.saveIsFitToWindow}
                    onChange={(e) => handleSaveFlagChange('saveIsFitToWindow', e.target.checked)}
                  />
                  <span className="settings-toggle-slider"></span>
                </label>
              </div>
              <div className="settings-toggle-row">
                <div className="settings-toggle-label">
                  <span>Zoom Level</span>
                  <InfoIcon text="Remember zoom level" />
                </div>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.saveZoomFactor}
                    onChange={(e) => handleSaveFlagChange('saveZoomFactor', e.target.checked)}
                  />
                  <span className="settings-toggle-slider"></span>
                </label>
              </div>
              <div className="settings-toggle-row">
                <div className="settings-toggle-label">
                  <span>Transition Effect</span>
                  <InfoIcon text="Remember selected transition style" />
                </div>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.saveTransitionEffect}
                    onChange={(e) => handleSaveFlagChange('saveTransitionEffect', e.target.checked)}
                  />
                  <span className="settings-toggle-slider"></span>
                </label>
              </div>
              <div className="settings-toggle-row">
                <div className="settings-toggle-label">
                  <span>Loaded Folders</span>
                  <InfoIcon text="Remember which folders were loaded" />
                </div>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={settings.saveFolders}
                    onChange={(e) => handleSaveFlagChange('saveFolders', e.target.checked)}
                  />
                  <span className="settings-toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>

          <div className="settings-divider"></div>

          <div className="settings-actions">
            <div className="settings-action-item">
              <div className="settings-action-header">
                <button
                  className="settings-btn-link"
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
                  Download Manifest Template
                </button>
                <InfoIcon text={
                  <div className="tooltip-content">
                    <div className="tooltip-section">
                      <strong>How to use:</strong>
                      <ol>
                        <li>Download the template</li>
                        <li>Edit it with your file names and desired delays</li>
                        <li>Save as a .json file in your folder root</li>
                        <li>When loading the folder, you'll be asked if you want to use the manifest</li>
                      </ol>
                    </div>
                    <div className="tooltip-section">
                      <strong>Features:</strong>
                      <ul>
                        <li>Custom playlists with specific files</li>
                        <li>Delays per file</li>
                        <li>Zoom levels</li>
                        <li>Precise playback order</li>
                      </ul>
                    </div>
                  </div>
                } />
              </div>
              <p className="settings-action-desc">JSON file for custom playlists with specific files, delays, and order</p>
            </div>
          </div>
        </div>
        
        {onOpenDiagnostics && (
          <div className="settings-diagnostics">
            <button
              className="settings-btn-link"
              onClick={() => {
                onOpenDiagnostics();
                onClose();
              }}
            >
              Diagnostics
            </button>
          </div>
        )}
        
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

      {tooltip && (
        <div
          className="settings-tooltip"
          style={{ left: tooltip.x + 10, top: tooltip.y + 10 }}
        >
          {typeof tooltip.content === 'string' ? tooltip.content : tooltip.content}
        </div>
      )}
    </div>
  );
};

export default SettingsWindow;
