import { LogEntry, LogQueue } from './types';

const DEFAULT_MAX_SIZE = 10_000;

/**
 * Circular buffer queue for O(1) enqueue and dequeue.
 * Grows up to maxSize, then rejects new entries.
 */
export class InMemoryQueue implements LogQueue {
  private buffer: (LogEntry | undefined)[];
  private head = 0;
  private tail = 0;
  private count = 0;
  private readonly maxSize: number;

  constructor(maxSize: number = DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize;
    this.buffer = new Array(maxSize);
  }

  enqueue(entries: LogEntry[]): number {
    const available = this.maxSize - this.count;
    const toInsert = Math.min(entries.length, available);

    for (let i = 0; i < toInsert; i++) {
      this.buffer[this.tail] = entries[i];
      this.tail = (this.tail + 1) % this.maxSize;
    }

    this.count += toInsert;
    return toInsert;
  }

  dequeue(): LogEntry | undefined {
    if (this.count === 0) return undefined;

    const entry = this.buffer[this.head];
    this.buffer[this.head] = undefined;
    this.head = (this.head + 1) % this.maxSize;
    this.count--;
    return entry;
  }

  size(): number {
    return this.count;
  }

  remaining(): number {
    return this.maxSize - this.count;
  }

  isEmpty(): boolean {
    return this.count === 0;
  }

  isFull(): boolean {
    return this.count >= this.maxSize;
  }
}
