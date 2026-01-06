import React from 'react';
import './SettingsWindow.css';

interface SettingsWindowProps {
  onClose: () => void;
  folders: string[];
  onRemoveFolder: (folder: string) => void;
}

const SettingsWindow: React.FC<SettingsWindowProps> = ({
  onClose,
  folders,
  onRemoveFolder
}) => {
  return (
    <div className="settings-window-overlay" onClick={onClose}>
      <div className="settings-window" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose} title="Close">×</button>
        </div>
        
        <div className="settings-content">
          <section className="settings-section">
            <h3>Folders</h3>
            {folders.length === 0 ? (
              <p className="settings-empty">No folders added</p>
            ) : (
              <ul className="settings-folder-list">
                {folders.map((folder, index) => (
                  <li key={index} className="settings-folder-item">
                    <span className="settings-folder-path">{folder}</span>
                    <button
                      className="settings-remove-btn"
                      onClick={() => onRemoveFolder(folder)}
                      title="Remove folder"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          
          <section className="settings-section">
            <h3>Preferences</h3>
            <div className="settings-preference">
              <label>
                <input type="checkbox" defaultChecked />
                Save slide delay
              </label>
            </div>
            <div className="settings-preference">
              <label>
                <input type="checkbox" defaultChecked />
                Save include videos setting
              </label>
            </div>
            <div className="settings-preference">
              <label>
                <input type="checkbox" defaultChecked />
                Save folder paths
              </label>
            </div>
            <div className="settings-preference">
              <label>
                <input type="checkbox" defaultChecked />
                Save sort mode
              </label>
            </div>
            <div className="settings-preference">
              <label>
                <input type="checkbox" defaultChecked />
                Save mute state
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SettingsWindow;

