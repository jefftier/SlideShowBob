import React, { useState, useEffect, useRef } from 'react';
import './SettingsWindow.css';
import { loadSettings, saveSettings, AppSettings, getDefaultSettings } from '../utils/settingsStorage';
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

          <div className="settings-toggle-row">
            <div className="settings-toggle-label">
              <span>Background Blur</span>
              <InfoIcon text="Show a blurred version of the media behind letterbox/pillarbox bars" />
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.backgroundBlur}
                onChange={(e) => {
                  setSettings(prev => ({ ...prev, backgroundBlur: e.target.checked }));
                  setHasChanges(true);
                }}
              />
              <span className="settings-toggle-slider"></span>
            </label>
          </div>
        </div>
        
        <div className="settings-footer">
          {onOpenDiagnostics && (
            <button
              className="settings-bug-btn"
              onClick={() => {
                onOpenDiagnostics();
                onClose();
              }}
              title="Diagnostics"
              aria-label="Diagnostics"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3.003 3.003 0 116 0v1"/>
                <path d="M12 20c-3.3 0-6-2.7-6-6v-3a6 6 0 0112 0v3c0 3.3-2.7 6-6 6z"/>
                <path d="M12 20v2M6 13H2M22 13h-4M6 17H3.5M20.5 17H18M6 9H4M20 9h-2"/>
              </svg>
            </button>
          )}
          <div className="settings-footer-actions">
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
