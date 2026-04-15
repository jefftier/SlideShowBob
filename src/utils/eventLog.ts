/**
 * Bounded In-Memory Event Log
 * 
 * Stores the last N events (default: 200) in memory for troubleshooting.
 * In dev, exposes window.__eventLog helper for inspection.
 */

import { LogEntry } from './logger';

const MAX_EVENTS = 200;

const events: LogEntry[] = [];

/**
 * Add an event to the log (bounded to MAX_EVENTS)
 */
export const addEvent = (entry: LogEntry): void => {
  events.push(entry);
  
  // Keep only the last MAX_EVENTS
  if (events.length > MAX_EVENTS) {
    events.shift();
  }
};

/**
 * Get all events in the log
 */
export const getEvents = (): LogEntry[] => {
  return [...events]; // Return a copy
};

/**
 * Clear all events from the log
 */
export const clearEvents = (): void => {
  events.length = 0;
};

// Expose window helper in dev mode
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as any).__eventLog = {
    get: getEvents,
    clear: clearEvents,
  };
  
  console.log('Event log available: window.__eventLog.get() / clear()');
}

