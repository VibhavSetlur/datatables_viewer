/**
 * Structured Logger with History
 *
 * Production-grade logging utility with configurable log levels
 * and in-memory history for debugging.
 *
 * @module logger
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    data?: unknown;
}

const MAX_LOG_HISTORY = 500;
const logHistory: LogEntry[] = [];

/**
 * Get configured log level from environment or default to 'warn' for production.
 */
function getLogLevel(): LogLevel {
    const envLevel = (import.meta.env?.VITE_LOG_LEVEL as string)?.toLowerCase();
    if (envLevel && envLevel in LOG_LEVELS) {
        return envLevel as LogLevel;
    }
    return import.meta.env?.DEV ? 'debug' : 'warn';
}

const currentLevel = getLogLevel();

/**
 * Check if a log level should be output based on current configuration.
 */
function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

/**
 * Format log message with timestamp and prefix.
 */
function formatMessage(prefix: string, msg: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${prefix}] ${msg}`;
}

/**
 * Add entry to history (always, regardless of log level).
 */
function addToHistory(level: LogLevel, msg: string, data?: unknown): void {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message: msg,
        data: data !== undefined ? data : undefined
    };
    logHistory.push(entry);
    // Trim if over limit
    if (logHistory.length > MAX_LOG_HISTORY) {
        logHistory.shift();
    }
}

/**
 * Structured logger with configurable levels and history tracking.
 *
 * Log levels (from lowest to highest priority):
 * - debug: Development debugging information
 * - info: General operational information
 * - warn: Warning conditions that may require attention
 * - error: Error conditions that need immediate attention
 *
 * Set VITE_LOG_LEVEL environment variable to control output.
 */
export const logger = {
    /**
     * Debug-level logging for development.
     */
    debug(msg: string, data?: unknown): void {
        addToHistory('debug', msg, data);
        if (shouldLog('debug')) {
            if (data !== undefined) {
                console.info(formatMessage('DEBUG', msg), data);
            } else {
                console.info(formatMessage('DEBUG', msg));
            }
        }
    },

    /**
     * Info-level logging for operational messages.
     */
    info(msg: string, data?: unknown): void {
        addToHistory('info', msg, data);
        if (shouldLog('info')) {
            if (data !== undefined) {
                console.info(formatMessage('INFO', msg), data);
            } else {
                console.info(formatMessage('INFO', msg));
            }
        }
    },

    /**
     * Warn-level logging for potential issues.
     */
    warn(msg: string, data?: unknown): void {
        addToHistory('warn', msg, data);
        if (shouldLog('warn')) {
            if (data !== undefined) {
                console.warn(formatMessage('WARN', msg), data);
            } else {
                console.warn(formatMessage('WARN', msg));
            }
        }
    },

    /**
     * Error-level logging for failures.
     */
    error(msg: string, data?: unknown): void {
        addToHistory('error', msg, data);
        if (shouldLog('error')) {
            if (data !== undefined) {
                console.error(formatMessage('ERROR', msg), data);
            } else {
                console.error(formatMessage('ERROR', msg));
            }
        }
    },

    /**
     * Get the log history (all logs, regardless of current level).
     */
    getLogHistory(): LogEntry[] {
        return [...logHistory];
    },

    /**
     * Clear log history.
     */
    clearHistory(): void {
        logHistory.length = 0;
    }
};

export default logger;
