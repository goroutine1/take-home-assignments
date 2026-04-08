import { describe, it, expect, vi } from 'vitest';
import { InMemoryQueue } from '../src/queue/memory-queue';
import { Worker } from '../src/worker/worker';

// Mock OpenTelemetry to avoid needing a real exporter in tests
vi.mock('@opentelemetry/api', () => {
  const mockSpan = {
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
    setAttribute: vi.fn(),
  };
  const mockTracer = {
    startSpan: vi.fn(() => mockSpan),
  };
  return {
    trace: {
      getTracer: vi.fn(() => mockTracer),
      setSpan: vi.fn((_ctx: unknown, _span: unknown) => ({})),
      setSpanContext: vi.fn((_ctx: unknown, _spanCtx: unknown) => ({})),
    },
    SpanStatusCode: { OK: 1, ERROR: 2 },
    TraceFlags: { NONE: 0, SAMPLED: 1 },
    context: {
      active: vi.fn(() => ({})),
      with: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
    },
  };
});

describe('Worker', () => {
  it('processes entries from the queue', async () => {
    const queue = new InMemoryQueue();
    queue.enqueue([
      { timestamp: '2024-01-01T00:00:00Z', level: 'info', message: 'test entry' },
    ]);

    const worker = new Worker(queue, {
      concurrency: 5,
      pollIntervalMs: 50,
      maxRetries: 3,
      simulatedDelayMs: 10,
    });

    worker.start();

    // Wait for processing to complete (real timers)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await worker.stop();

    expect(queue.isEmpty()).toBe(true);
  });

  it('starts and stops without errors', async () => {
    const queue = new InMemoryQueue();
    const worker = new Worker(queue, {
      concurrency: 5,
      pollIntervalMs: 50,
      maxRetries: 3,
      simulatedDelayMs: 10,
    });

    worker.start();
    await worker.stop();
  });
});
