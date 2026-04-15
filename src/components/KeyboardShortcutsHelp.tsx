import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './KeyboardShortcutsHelp.css';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Shortcut {
  category: string;
  shortcuts: {
    keys: string[];
    description: string;
  }[];
}

const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('shortcuts-help-overlay')) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    window.addEventListener('click', handleClickOutside);

    return () => {
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcuts: Shortcut[] = [
    {
      category: 'Navigation',
      shortcuts: [
        { keys: ['→', 'ArrowRight'], description: 'Next media' },
        { keys: ['←', 'ArrowLeft'], description: 'Previous media' },
        { keys: ['Space'], description: 'Play/Pause slideshow' },
        { keys: ['R'], description: 'Restart slideshow from beginning' },
      ]
    },
    {
      category: 'Zoom & Fit',
      shortcuts: [
        { keys: ['+', '='], description: 'Zoom in' },
        { keys: ['-', '_'], description: 'Zoom out' },
        { keys: ['0'], description: 'Reset zoom to fit window' },
        { keys: ['F'], description: 'Toggle fit to window' },
      ]
    },
    {
      category: 'Fullscreen',
      shortcuts: [
        { keys: ['F'], description: 'Toggle fullscreen mode' },
        { keys: ['F11'], description: 'Toggle fullscreen (browser)' },
        { keys: ['Esc'], description: 'Exit fullscreen' },
      ]
    },
    {
      category: 'Video Controls',
      shortcuts: [
        { keys: ['M'], description: 'Toggle mute' },
        { keys: ['R'], description: 'Replay current video' },
      ]
    },
    {
      category: 'Windows & Dialogs',
      shortcuts: [
        { keys: ['P'], description: 'Open playlist window' },
        { keys: [','], description: 'Open settings window' },
        { keys: ['?'], description: 'Show keyboard shortcuts (this help)' },
        { keys: ['Esc'], description: 'Close open windows/dialogs' },
      ]
    },
    {
      category: 'Playlist Window',
      shortcuts: [
        { keys: ['Ctrl', 'F'], description: 'Focus search box' },
        { keys: ['Enter'], description: 'Confirm action in dialogs' },
        { keys: ['Esc'], description: 'Close playlist window' },
      ]
    },
    {
      category: 'Mouse & Touch',
      shortcuts: [
        { keys: ['Left Click'], description: 'Next media' },
        { keys: ['Right Click'], description: 'Previous media' },
        { keys: ['Click & Drag'], description: 'Pan image when zoomed' },
        { keys: ['Mouse Wheel'], description: 'Zoom in/out or scroll' },
      ]
    }
  ];

  const formatKeys = (keys: string[]): React.ReactNode => {
    return keys.map((key, index) => (
      <React.Fragment key={index}>
        {index > 0 && <span className="key-separator">+</span>}
        <kbd className="key">{key}</kbd>
      </React.Fragment>
    ));
  };

  return createPortal(
    <div className="shortcuts-help-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="shortcuts-help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-help-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="shortcuts-help-close" onClick={onClose} title="Close (Esc)" aria-label="Close keyboard shortcuts help">
            ×
          </button>
        </div>
        <div className="shortcuts-help-content">
          {shortcuts.map((section, sectionIndex) => (
            <div key={sectionIndex} className="shortcuts-section">
              <h3 className="shortcuts-category">{section.category}</h3>
              <div className="shortcuts-list">
                {section.shortcuts.map((shortcut, index) => (
                  <div key={index} className="shortcut-item">
                    <div className="shortcut-keys">
                      {formatKeys(shortcut.keys)}
                    </div>
                    <div className="shortcut-description">{shortcut.description}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="shortcuts-help-footer">
          <p>Press <kbd className="key">Esc</kbd> or click outside to close</p>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default KeyboardShortcutsHelp;

