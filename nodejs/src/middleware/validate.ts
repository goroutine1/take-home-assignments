import { Request, Response, NextFunction } from 'express';
import { LogEntry } from '../queue/types';

const VALID_LEVELS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);

function isValidISOTimestamp(value: string): boolean {
  const date = new Date(value);
  return !isNaN(date.getTime());
}

function validateLogEntry(entry: unknown, index: number): string | null {
  if (typeof entry !== 'object' || entry === null) {
    return `Entry ${index}: must be an object`;
  }

  const record = entry as Record<string, unknown>;

  if (typeof record.timestamp !== 'string' || !isValidISOTimestamp(record.timestamp)) {
    return `Entry ${index}: 'timestamp' must be a valid ISO 8601 string`;
  }

  if (typeof record.level !== 'string' || !VALID_LEVELS.has(record.level)) {
    return `Entry ${index}: 'level' must be one of: ${[...VALID_LEVELS].join(', ')}`;
  }

  if (typeof record.message !== 'string' || record.message.length === 0) {
    return `Entry ${index}: 'message' must be a non-empty string`;
  }

  if (record.meta !== undefined) {
    if (typeof record.meta !== 'object' || record.meta === null) {
      return `Entry ${index}: 'meta' must be an object if provided`;
    }
  }

  return null;
}

export function validateLogsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as unknown;

  if (!Array.isArray(body)) {
    res.status(400).json({ error: 'Payload must be a JSON array of log entries' });
    return;
  }

  if (body.length === 0) {
    res.status(400).json({ error: 'Payload must contain at least one log entry' });
    return;
  }

  const errors: string[] = [];
  for (let i = 0; i < body.length; i++) {
    const error = validateLogEntry(body[i], i);
    if (error) errors.push(error);
  }

  if (errors.length > 0) {
    res.status(400).json({ error: 'Validation failed', details: errors });
    return;
  }

  // Attach validated entries to request
  (req as Request & { logEntries: LogEntry[] }).logEntries = body as LogEntry[];
  next();
}
