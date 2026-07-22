import React, { useState, useEffect, useRef } from 'react';
import './SettingsWindow.css';
import { loadSettings, saveSettings, AppSettings, getDefaultSettings } from '../utils/settingsStorage';
import { useToast } from '../hooks/useToast';
import {
  KNOWN_METADATA_FIELDS,
  SMART_DEFAULT_FIELDS,
  MetadataOverlayMode,
  getFieldLabel,
  formatFieldValue,
} from '../types/metadata';

type SettingsSection = 'playback' | 'display' | 'persistence';

interface SettingsWindowProps {
  onClose: () => void;
  onSave?: () => void;
  onOpenDiagnostics?: () => void;
  // File keys detected across the currently loaded playlist's metadata.json entries,
  // used to populate the "Custom" field picker with real, observed keys.
  availableMetadataFields?: string[];
}

// Sample values used to preview the overlay in Settings before any real folder
// with metadata.json has been loaded, so the field picker isn't a "blind" checkbox list.
const SAMPLE_METADATA_VALUES: Record<string, string | number | boolean> = {
  title: 'A cool sunset',
  subreddit: 'pics',
  author: 'someuser',
  score: 42,
  nsfw: false,
  createdUtc: 1700000000,
  sourceName: 'pics',
  sourceType: 'subreddit',
  mediaType: 'image',
  postId: 'abc123',
  galleryIndex: 0,
  permalink: 'https://www.reddit.com/r/pics/comments/abc123/a_cool_sunset/',
  sourceUrl: 'https://i.redd.it/abc123.jpg',
};

const METADATA_MODE_OPTIONS: { value: MetadataOverlayMode; label: string; description: string }[] = [
  { value: 'off', label: 'Off', description: "Don't show any post details, just the file name" },
  { value: 'smart', label: 'Title + Subreddit', description: 'Show a short, curated summary (recommended)' },
  { value: 'custom', label: 'Custom', description: 'Choose exactly which fields to display' },
  { value: 'all', label: 'Show Everything Found', description: 'Display every field present in metadata.json' },
];

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'playback', label: 'Playback' },
  { id: 'display', label: 'Display' },
  { id: 'persistence', label: 'Persistence' },
];

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

const SettingsWindow: React.FC<SettingsWindowProps> = ({
  onClose,
  onSave,
  onOpenDiagnostics,
  availableMetadataFields = []
}) => {
  const [settings, setSettings] = useState<AppSettings>(getDefaultSettings());
  const [hasChanges, setHasChanges] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>('playback');
  const { showError, showWarning } = useToast();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loaded = loadSettings({ showError, showWarning });
    setSettings(loaded);
  }, [showError, showWarning]);

  // Focus first interactive element on mount (Requirement 7.5)
  useEffect(() => {
    if (modalRef.current) {
      const firstFocusable = modalRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }
  }, []);

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

  // Focus trapping and Escape key handler (Requirements 7.2, 7.4)
  const handleModalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
      return;
    }

    if (e.key === 'Tab' && modalRef.current) {
      const focusableElements = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter(el => el.offsetParent !== null); // filter out hidden elements

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: wrap from first to last
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: wrap from last to first
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  };

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex: number | null = null;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (index + 1) % SECTIONS.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (index - 1 + SECTIONS.length) % SECTIONS.length;
    }
    if (nextIndex !== null) {
      const nextTab = tabRefs.current[nextIndex];
      if (nextTab) {
        nextTab.focus();
        setActiveSection(SECTIONS[nextIndex].id);
      }
    }
  };

  const renderPlaybackSection = () => (
    <div
      role="tabpanel"
      id="settings-tabpanel-playback"
      aria-labelledby="settings-tab-playback"
      hidden={activeSection !== 'playback'}
    >
      <div className="settings-section-content">
        <div className="settings-row">
          <div className="settings-label-group">
            <label className="settings-label">Transition Style</label>
            <span className="settings-description">Choose the animation used between slides</span>
          </div>
          <select
            value={settings.transitionEffect}
            onChange={(e) => {
              setSettings(prev => ({
                ...prev,
                transitionEffect: e.target.value as 'None' | 'Fade' | 'Push' | 'Wipe' | 'Morph' | 'Zoom'
              }));
              setHasChanges(true);
            }}
            className="settings-select"
          >
            <option value="None">None</option>
            <option value="Fade">Fade</option>
            <option value="Push">Push</option>
            <option value="Wipe">Wipe</option>
            <option value="Morph">Morph</option>
            <option value="Zoom">Zoom</option>
          </select>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <label className="settings-label" htmlFor="settings-slide-timing">Slide Timing</label>
            <span className="settings-description">How long each slide is displayed (in milliseconds)</span>
          </div>
          <input
            id="settings-slide-timing"
            type="number"
            min={500}
            max={30000}
            step={100}
            value={settings.slideDelayMs}
            onChange={(e) => {
              const val = Math.max(500, Math.min(30000, Number(e.target.value)));
              setSettings(prev => ({ ...prev, slideDelayMs: val }));
              setHasChanges(true);
            }}
            className="settings-number-input"
          />
        </div>

        <div className="settings-toggle-row">
          <div className="settings-toggle-label">
            <div className="settings-label-group">
              <span>Include Videos</span>
              <span className="settings-description">Show video files alongside images in the slideshow</span>
            </div>
          </div>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.includeVideos}
              onChange={(e) => {
                setSettings(prev => ({ ...prev, includeVideos: e.target.checked }));
                setHasChanges(true);
              }}
            />
            <span className="settings-toggle-slider"></span>
          </label>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <label className="settings-label">Sort Order</label>
            <span className="settings-description">Set the order in which slides are presented</span>
          </div>
          <select
            value={settings.sortMode}
            onChange={(e) => {
              setSettings(prev => ({
                ...prev,
                sortMode: e.target.value as AppSettings['sortMode']
              }));
              setHasChanges(true);
            }}
            className="settings-select"
          >
            <option value="NameAZ">Name (A–Z)</option>
            <option value="NameZA">Name (Z–A)</option>
            <option value="DateOldest">Date (Oldest first)</option>
            <option value="DateNewest">Date (Newest first)</option>
            <option value="Random">Random</option>
          </select>
        </div>

        <div className="settings-toggle-row">
          <div className="settings-toggle-label">
            <div className="settings-label-group">
              <span>Mute Audio</span>
              <span className="settings-description">Silence audio playback for videos</span>
            </div>
          </div>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.isMuted}
              onChange={(e) => {
                setSettings(prev => ({ ...prev, isMuted: e.target.checked }));
                setHasChanges(true);
              }}
            />
            <span className="settings-toggle-slider"></span>
          </label>
        </div>

        <div className="settings-toggle-row">
          <div className="settings-toggle-label">
            <div className="settings-label-group">
              <span>Filter by Date Modified</span>
              <span className="settings-description">Only show files modified within the past number of days</span>
            </div>
          </div>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.dateFilterEnabled}
              onChange={(e) => {
                setSettings(prev => ({ ...prev, dateFilterEnabled: e.target.checked }));
                setHasChanges(true);
              }}
            />
            <span className="settings-toggle-slider"></span>
          </label>
        </div>

        {settings.dateFilterEnabled && (
          <div className="settings-row">
            <div className="settings-label-group">
              <label className="settings-label" htmlFor="settings-date-filter-days">Days to Include</label>
              <span className="settings-description">Show only files modified in the last N days</span>
            </div>
            <input
              id="settings-date-filter-days"
              type="number"
              min={1}
              max={36500}
              step={1}
              value={settings.dateFilterDays}
              onChange={(e) => {
                const val = Math.max(1, Math.min(36500, Number(e.target.value) || 1));
                setSettings(prev => ({ ...prev, dateFilterDays: val }));
                setHasChanges(true);
              }}
              className="settings-number-input"
            />
          </div>
        )}
      </div>
    </div>
  );

  const renderDisplaySection = () => (
    <div
      role="tabpanel"
      id="settings-tabpanel-display"
      aria-labelledby="settings-tab-display"
      hidden={activeSection !== 'display'}
    >
      <div className="settings-section-content">
        <div className="settings-toggle-row">
          <div className="settings-toggle-label">
            <div className="settings-label-group">
              <span>Background Blur</span>
              <span className="settings-description">Apply a soft blur effect behind the current slide</span>
            </div>
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

        <div className="settings-toggle-row">
          <div className="settings-toggle-label">
            <div className="settings-label-group">
              <span>Show File Name</span>
              <span className="settings-description">Display the current file's name and path in the corner of the screen</span>
            </div>
          </div>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.showFileNameOverlay}
              onChange={(e) => {
                setSettings(prev => ({ ...prev, showFileNameOverlay: e.target.checked }));
                setHasChanges(true);
              }}
            />
            <span className="settings-toggle-slider"></span>
          </label>
        </div>

        {settings.showFileNameOverlay && (
          <div className="settings-group settings-metadata-group">
            <div className="settings-group-title">Post Details in Overlay</div>
            <div className="settings-group-content">
              <div className="settings-row settings-row-wrap">
                <div className="settings-label-group">
                  <label className="settings-label">Show</label>
                  <span className="settings-description">
                    Include details from a folder's metadata.json (if present) alongside the file name
                  </span>
                </div>
                <select
                  value={settings.metadataOverlayMode}
                  onChange={(e) => {
                    setSettings(prev => ({
                      ...prev,
                      metadataOverlayMode: e.target.value as MetadataOverlayMode
                    }));
                    setHasChanges(true);
                  }}
                  className="settings-select"
                >
                  {METADATA_MODE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <span className="settings-description settings-mode-description">
                {METADATA_MODE_OPTIONS.find(o => o.value === settings.metadataOverlayMode)?.description}
              </span>

              {settings.metadataOverlayMode === 'custom' && (
                <div className="settings-metadata-fields">
                  {(availableMetadataFields.length > 0
                    ? [...KNOWN_METADATA_FIELDS.map(f => f.key).filter(k => availableMetadataFields.includes(k)),
                       ...availableMetadataFields.filter(k => !KNOWN_METADATA_FIELDS.some(f => f.key === k))]
                    : KNOWN_METADATA_FIELDS.map(f => f.key)
                  ).map((key) => (
                    <label className="settings-metadata-field-checkbox" key={key}>
                      <input
                        type="checkbox"
                        checked={settings.metadataOverlayFields.includes(key)}
                        onChange={(e) => {
                          setSettings(prev => ({
                            ...prev,
                            metadataOverlayFields: e.target.checked
                              ? [...prev.metadataOverlayFields, key]
                              : prev.metadataOverlayFields.filter(f => f !== key)
                          }));
                          setHasChanges(true);
                        }}
                      />
                      <span>{getFieldLabel(key)}</span>
                    </label>
                  ))}
                  {availableMetadataFields.length === 0 && (
                    <span className="settings-description">
                      No metadata.json detected in your loaded folders yet - showing all known fields. Load a folder with saved metadata to see fields specific to it.
                    </span>
                  )}
                </div>
              )}

              <div className="settings-metadata-preview">
                <div className="settings-metadata-preview-label">Preview</div>
                <div className="filename-overlay-preview">
                  <div className="filename-overlay-preview-path">example_photo.jpg</div>
                  {(() => {
                    const mode = settings.metadataOverlayMode;
                    if (mode === 'off') return null;
                    const keys = mode === 'smart'
                      ? SMART_DEFAULT_FIELDS
                      : mode === 'custom'
                      ? settings.metadataOverlayFields
                      : Object.keys(SAMPLE_METADATA_VALUES);
                    const lines = keys
                      .map(key => {
                        const value = SAMPLE_METADATA_VALUES[key];
                        if (value === undefined) return null;
                        const formatted = formatFieldValue(key, value);
                        if (!formatted) return null;
                        const needsLabel = !['title', 'subreddit', 'author', 'score', 'nsfw'].includes(key);
                        return needsLabel ? `${getFieldLabel(key)}: ${formatted}` : formatted;
                      })
                      .filter((l): l is string => !!l);
                    if (lines.length === 0) return null;
                    return (
                      <div className="filename-overlay-preview-metadata">
                        {lines.map((line, i) => (
                          <div key={i} className="filename-overlay-preview-metadata-line">{line}</div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="settings-toggle-row">
          <div className="settings-toggle-label">
            <div className="settings-label-group">
              <span>Scale to Fit</span>
              <span className="settings-description">Resize media to fill the window without cropping</span>
            </div>
          </div>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.isFitToWindow}
              onChange={(e) => {
                setSettings(prev => ({ ...prev, isFitToWindow: e.target.checked }));
                setHasChanges(true);
              }}
            />
            <span className="settings-toggle-slider"></span>
          </label>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <label className="settings-label" htmlFor="settings-zoom-level">Zoom Level</label>
            <span className="settings-description">Adjust the magnification of the displayed media</span>
          </div>
          <div className="settings-range-group">
            <input
              id="settings-zoom-level"
              type="range"
              min={0.5}
              max={3.0}
              step={0.1}
              value={settings.zoomFactor}
              onChange={(e) => {
                const val = Number(e.target.value);
                setSettings(prev => ({ ...prev, zoomFactor: val }));
                setHasChanges(true);
              }}
              className="settings-range-input"
            />
            <span className="settings-range-value">{settings.zoomFactor.toFixed(1)}×</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPersistenceSection = () => (
    <div
      role="tabpanel"
      id="settings-tabpanel-persistence"
      aria-labelledby="settings-tab-persistence"
      hidden={activeSection !== 'persistence'}
    >
      <div className="settings-section-content">
        <div className="settings-toggle-row">
          <div className="settings-toggle-label">
            <div className="settings-label-group">
              <span>Remember My Settings</span>
              <span className="settings-description">Save your preferences so they're restored next time you open the app</span>
            </div>
          </div>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.masterPersistenceEnabled}
              onChange={(e) => {
                setSettings(prev => ({ ...prev, masterPersistenceEnabled: e.target.checked }));
                setHasChanges(true);
              }}
            />
            <span className="settings-toggle-slider"></span>
          </label>
        </div>

        {settings.masterPersistenceEnabled && (
          <div className="settings-group">
            <div className="settings-group-title">Individual Preferences</div>
            <div className="settings-group-content">
              {[
                { key: 'saveSlideDelay' as const, label: 'Slide Delay', description: 'Remember how long each slide is displayed' },
                { key: 'saveIncludeVideos' as const, label: 'Include Videos', description: 'Remember whether videos are shown in the slideshow' },
                { key: 'saveSortMode' as const, label: 'Sort Order', description: 'Remember the order slides are presented' },
                { key: 'saveIsMuted' as const, label: 'Mute Audio', description: 'Remember your audio mute preference' },
                { key: 'saveIsFitToWindow' as const, label: 'Scale to Fit', description: 'Remember your scaling preference' },
                { key: 'saveZoomFactor' as const, label: 'Zoom Level', description: 'Remember your zoom magnification' },
                { key: 'saveTransitionEffect' as const, label: 'Transition Style', description: 'Remember which transition animation is used' },
                { key: 'saveFolders' as const, label: 'Loaded Folders', description: 'Remember which folders were loaded into the playlist' },
                { key: 'saveDateFilter' as const, label: 'Date Filter', description: 'Remember your date range filter preference' },
              ].map(({ key, label, description }) => (
                <div className="settings-toggle-row" key={key}>
                  <div className="settings-toggle-label">
                    <div className="settings-label-group">
                      <span>{label}</span>
                      <span className="settings-description">{description}</span>
                    </div>
                  </div>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={settings[key]}
                      onChange={(e) => {
                        setSettings(prev => ({ ...prev, [key]: e.target.checked }));
                        setHasChanges(true);
                      }}
                    />
                    <span className="settings-toggle-slider"></span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="settings-window-overlay" onClick={onClose}>
      <div
        className="settings-window"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleModalKeyDown}
      >
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={handleCancel} aria-label="Close">×</button>
        </div>

        <div className="settings-body">
          <div className="settings-nav-column">
            <nav role="tablist" aria-orientation="vertical" aria-label="Settings sections">
              {SECTIONS.map((section, index) => (
                <button
                  key={section.id}
                  ref={(el) => { tabRefs.current[index] = el; }}
                  role="tab"
                  id={`settings-tab-${section.id}`}
                  aria-selected={activeSection === section.id}
                  aria-controls={`settings-tabpanel-${section.id}`}
                  tabIndex={activeSection === section.id ? 0 : -1}
                  className={`settings-tab${activeSection === section.id ? ' settings-tab-active' : ''}`}
                  onClick={() => setActiveSection(section.id)}
                  onKeyDown={(e) => handleTabKeyDown(e, index)}
                >
                  {section.label}
                </button>
              ))}
            </nav>

            {onOpenDiagnostics && (
              <button
                className="settings-diagnostics-btn"
                onClick={() => {
                  onOpenDiagnostics();
                  onClose();
                }}
                aria-label="Open diagnostics"
                title="Diagnostics"
              >
                🐛
              </button>
            )}
          </div>

          <div className="settings-content">
            {renderPlaybackSection()}
            {renderDisplaySection()}
            {renderPersistenceSection()}
          </div>
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
