import { describe, it, expect } from 'vitest';
import { InMemoryQueue } from '../src/queue/memory-queue';

describe('InMemoryQueue', () => {
  it('enqueues and dequeues in FIFO order', () => {
    const queue = new InMemoryQueue();
    const entry1 = { timestamp: '2024-01-01T00:00:00Z', level: 'info', message: 'first' };
    const entry2 = { timestamp: '2024-01-01T00:00:01Z', level: 'error', message: 'second' };

    queue.enqueue([entry1, entry2]);

    expect(queue.size()).toBe(2);
    expect(queue.dequeue()).toEqual(entry1);
    expect(queue.dequeue()).toEqual(entry2);
    expect(queue.isEmpty()).toBe(true);
  });

  it('returns undefined when empty', () => {
    const queue = new InMemoryQueue();
    expect(queue.dequeue()).toBeUndefined();
  });

  it('tracks size correctly across operations', () => {
    const queue = new InMemoryQueue();
    expect(queue.size()).toBe(0);
    expect(queue.isEmpty()).toBe(true);

    queue.enqueue([{ timestamp: '2024-01-01T00:00:00Z', level: 'info', message: 'a' }]);
    expect(queue.size()).toBe(1);
    expect(queue.isEmpty()).toBe(false);

    queue.dequeue();
    expect(queue.size()).toBe(0);
    expect(queue.isEmpty()).toBe(true);
  });

  it('reports full when at max capacity', () => {
    const queue = new InMemoryQueue(2);
    expect(queue.isFull()).toBe(false);

    queue.enqueue([
      { timestamp: '2024-01-01T00:00:00Z', level: 'info', message: 'a' },
      { timestamp: '2024-01-01T00:00:01Z', level: 'info', message: 'b' },
    ]);
    expect(queue.isFull()).toBe(true);
  });
});
