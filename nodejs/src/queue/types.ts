import { SpanContext } from '@opentelemetry/api';

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  meta?: {
    host?: string;
    service?: string;
    [key: string]: unknown;
  };
  spanContext?: SpanContext;
}

export interface LogQueue {
  enqueue(entries: LogEntry[]): number;
  dequeue(): LogEntry | undefined;
  size(): number;
  remaining(): number;
  isEmpty(): boolean;
  isFull(): boolean;
}
