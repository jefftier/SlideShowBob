import React, { useState, useEffect, useCallback } from 'react';
import { getEvents, clearEvents } from '../utils/eventLog';
import { LogEntry } from '../utils/logger';
import './DiagnosticsPanel.css';

interface DiagnosticsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({ isOpen, onClose }) => {
  const [events, setEvents] = useState<LogEntry[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refreshEvents = useCallback(() => {
    const allEvents = getEvents();
    // Show last 20 events
    setEvents(allEvents.slice(-20).reverse());
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshEvents();
      
      if (autoRefresh) {
        const interval = setInterval(refreshEvents, 1000);
        return () => clearInterval(interval);
      }
    }
  }, [isOpen, autoRefresh, refreshEvents]);

  const handleCopyToClipboard = useCallback(() => {
    const text = events
      .map(event => {
        const timestamp = new Date(event.timestamp).toISOString();
        const payload = event.payload ? ` ${JSON.stringify(event.payload)}` : '';
        return `[${timestamp}] [${event.level.toUpperCase()}] ${event.event}${payload}`;
      })
      .join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
      // Could show a toast here, but keeping it minimal
      console.log('Diagnostics copied to clipboard');
    }).catch(err => {
      console.error('Failed to copy to clipboard:', err);
    });
  }, [events]);

  const handleClear = useCallback(() => {
    if (window.confirm('Clear all diagnostic events? This cannot be undone.')) {
      clearEvents();
      refreshEvents();
    }
  }, [refreshEvents]);

  if (!isOpen) return null;

  return (
    <div className="diagnostics-overlay" onClick={onClose}>
      <div className="diagnostics-panel" onClick={(e) => e.stopPropagation()}>
        <div className="diagnostics-header">
          <h2>Diagnostics</h2>
          <div className="diagnostics-controls">
            <label className="diagnostics-auto-refresh">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
            <button className="diagnostics-btn-secondary" onClick={handleCopyToClipboard}>
              Copy to Clipboard
            </button>
            <button className="diagnostics-btn-secondary" onClick={handleClear}>
              Clear
            </button>
            <button className="diagnostics-btn-close" onClick={onClose} title="Close (Esc)" aria-label="Close diagnostics">
              ×
            </button>
          </div>
        </div>
        
        <div className="diagnostics-content">
          {events.length === 0 ? (
            <div className="diagnostics-empty">
              <p>No events logged yet</p>
              <p className="diagnostics-empty-hint">Events will appear here as the application runs</p>
            </div>
          ) : (
            <div className="diagnostics-events">
              {events.map((event, index) => {
                const timestamp = new Date(event.timestamp).toISOString();
                return (
                  <div key={`${event.timestamp}-${index}`} className={`diagnostics-event diagnostics-event-${event.level}`}>
                    <div className="diagnostics-event-header">
                      <span className="diagnostics-event-time">{timestamp}</span>
                      <span className={`diagnostics-event-level diagnostics-event-level-${event.level}`}>
                        {event.level.toUpperCase()}
                      </span>
                    </div>
                    <div className="diagnostics-event-name">{event.event}</div>
                    {event.payload && Object.keys(event.payload).length > 0 && (
                      <div className="diagnostics-event-payload">
                        <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiagnosticsPanel;

