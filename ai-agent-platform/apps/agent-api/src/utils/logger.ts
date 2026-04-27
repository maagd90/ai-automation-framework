/**
 * Structured JSON logger for the Agent API.
 *
 * Emits newline-delimited JSON records to stdout (info/debug) or stderr (warn/error).
 * Each record always contains: level, message, timestamp.
 * Any additional key/value pairs passed in `context` are merged into the record.
 *
 * Usage:
 *   logger.info('Job created', { jobId: 'abc' });
 *   logger.warn('Limit exceeded', { received: 10, allowed: 5 });
 *   logger.error('Unexpected failure', { jobId: 'abc', error: err.message });
 *
 * NEVER pass API keys, passwords, or tokens as context fields.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogRecord {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const record: LogRecord = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };
  const line = JSON.stringify(record) + '\n';
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

export const logger = {
  info(message: string, context?: Record<string, unknown>): void {
    emit('info', message, context);
  },
  warn(message: string, context?: Record<string, unknown>): void {
    emit('warn', message, context);
  },
  error(message: string, context?: Record<string, unknown>): void {
    emit('error', message, context);
  },
  debug(message: string, context?: Record<string, unknown>): void {
    emit('debug', message, context);
  },
};
