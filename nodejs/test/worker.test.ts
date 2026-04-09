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
  const noopCounter = { add: vi.fn() };
  const noopHistogram = { record: vi.fn() };
  const noopGauge = { addCallback: vi.fn() };
  const mockMeter = {
    createCounter: vi.fn(() => noopCounter),
    createHistogram: vi.fn(() => noopHistogram),
    createObservableGauge: vi.fn(() => noopGauge),
  };
  return {
    trace: {
      getTracer: vi.fn(() => mockTracer),
      setSpan: vi.fn((_ctx: unknown, _span: unknown) => ({})),
      setSpanContext: vi.fn((_ctx: unknown, _spanCtx: unknown) => ({})),
    },
    metrics: {
      getMeter: vi.fn(() => mockMeter),
    },
    SpanStatusCode: { OK: 1, ERROR: 2 },
    TraceFlags: { NONE: 0, SAMPLED: 1 },
    context: {
      active: vi.fn(() => ({})),
      with: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
    },
  };
});

const baseWorkerOptions = {
  concurrency: 5,
  pollIntervalMs: 50,
  maxRetries: 3,
  simulatedDelayMs: 10,
  failureRate: 0, // deterministic: no random failures
};

describe('Worker', () => {
  it('processes entries from the queue', async () => {
    const queue = new InMemoryQueue();
    queue.enqueue([
      { timestamp: '2024-01-01T00:00:00Z', level: 'info', message: 'test entry' },
    ]);

    const worker = new Worker(queue, baseWorkerOptions);

    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await worker.stop();

    expect(queue.isEmpty()).toBe(true);
  });

  it('processes multiple entries concurrently', async () => {
    const queue = new InMemoryQueue();
    const entries = Array.from({ length: 10 }, (_, i) => ({
      timestamp: '2024-01-01T00:00:00Z',
      level: 'info',
      message: `entry-${i}`,
    }));
    queue.enqueue(entries);

    const worker = new Worker(queue, baseWorkerOptions);

    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await worker.stop();

    expect(queue.isEmpty()).toBe(true);
  });

  it('starts and stops without errors', async () => {
    const queue = new InMemoryQueue();
    const worker = new Worker(queue, baseWorkerOptions);

    worker.start();
    await worker.stop();
  });

  it('retries failed entries up to maxRetries', async () => {
    const queue = new InMemoryQueue();
    queue.enqueue([
      { timestamp: '2024-01-01T00:00:00Z', level: 'error', message: 'will fail' },
    ]);

    // 100% failure rate to force retries
    const worker = new Worker(queue, {
      ...baseWorkerOptions,
      failureRate: 1.0,
      maxRetries: 2,
    });

    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await worker.stop();

    // Entry should be dequeued (even though it failed after max retries)
    expect(queue.isEmpty()).toBe(true);
  });
});
