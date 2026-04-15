/**
 * Structured Logger Utility
 * 
 * Provides structured logging with levels (debug/info/warn/error) and event-based logging.
 * In dev: logs to console.
 * In prod: defaults to info+ (debug disabled unless enabled via env flag).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  event: string;
  payload?: Record<string, unknown>;
}

const isDev = import.meta.env.DEV;
const enableDebugInProd = import.meta.env.VITE_ENABLE_DEBUG_LOGS === 'true';

const shouldLog = (level: LogLevel): boolean => {
  if (isDev) {
    return true; // Log everything in dev
  }
  
  // In prod: only log info+ unless debug is explicitly enabled
  if (level === 'debug') {
    return enableDebugInProd;
  }
  
  return true; // info, warn, error always logged in prod
};

const logToConsole = (entry: LogEntry): void => {
  if (!shouldLog(entry.level)) {
    return;
  }
  
  const timestamp = new Date(entry.timestamp).toISOString();
  const message = `[${timestamp}] [${entry.level.toUpperCase()}] ${entry.event}`;
  
  switch (entry.level) {
    case 'debug':
      console.debug(message, entry.payload || '');
      break;
    case 'info':
      console.info(message, entry.payload || '');
      break;
    case 'warn':
      console.warn(message, entry.payload || '');
      break;
    case 'error':
      console.error(message, entry.payload || '');
      break;
  }
};

/**
 * Log an event with structured data
 * @param event Event name (e.g., "media_load_failed")
 * @param payload Optional payload object (keep small, no secrets)
 * @param level Log level (default: "info")
 */
export const logEvent = (
  event: string,
  payload?: Record<string, unknown>,
  level: LogLevel = 'info'
): LogEntry => {
  const entry: LogEntry = {
    timestamp: Date.now(),
    level,
    event,
    payload,
  };
  
  logToConsole(entry);
  
  return entry;
};

/**
 * Logger object with convenience methods
 */
export const logger = {
  debug: (event: string, payload?: Record<string, unknown>) => 
    logEvent(event, payload, 'debug'),
  info: (event: string, payload?: Record<string, unknown>) => 
    logEvent(event, payload, 'info'),
  warn: (event: string, payload?: Record<string, unknown>) => 
    logEvent(event, payload, 'warn'),
  error: (event: string, payload?: Record<string, unknown>) => 
    logEvent(event, payload, 'error'),
  event: logEvent,
};

