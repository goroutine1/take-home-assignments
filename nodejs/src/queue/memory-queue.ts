import { LogEntry, LogQueue } from './types';

const DEFAULT_MAX_SIZE = 10_000;

export class InMemoryQueue implements LogQueue {
  private readonly buffer: LogEntry[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize;
  }

  enqueue(entries: LogEntry[]): void {
    this.buffer.push(...entries);
  }

  dequeue(): LogEntry | undefined {
    return this.buffer.shift();
  }

  size(): number {
    return this.buffer.length;
  }

  isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  isFull(): boolean {
    return this.buffer.length >= this.maxSize;
  }
}
