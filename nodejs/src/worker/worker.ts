import { trace, SpanStatusCode, context, TraceFlags } from '@opentelemetry/api';
import { LogEntry, LogQueue } from '../queue/types';
import { logsProcessedCounter, logsFailedCounter, processingLatencyHistogram } from '../metrics';

export interface WorkerOptions {
  concurrency: number;
  pollIntervalMs: number;
  maxRetries: number;
  simulatedDelayMs: number;
  failureRate: number;
}

const tracer = trace.getTracer('log-ingestion-worker');

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processEntry(entry: LogEntry, queue: LogQueue, retryCount: number, simulatedDelayMs: number, failureRate: number): Promise<void> {
  // Restore the parent context from the HTTP request if available
  let parentContext = context.active();
  if (entry.spanContext) {
    parentContext = trace.setSpanContext(parentContext, {
      traceId: entry.spanContext.traceId,
      spanId: entry.spanContext.spanId,
      traceFlags: entry.spanContext.traceFlags ?? TraceFlags.SAMPLED,
      isRemote: true,
    });
  }

  const span = tracer.startSpan('process-log-entry', {
    attributes: {
      'log.level': entry.level,
      'log.service': entry.meta?.service ?? 'unknown',
      'queue.depth': queue.size(),
      'worker.retry_count': retryCount,
    },
  }, parentContext);

  return context.with(trace.setSpan(parentContext, span), async () => {
    const startTime = Date.now();
    try {
      // Simulate processing delay with some jitter
      const jitter = Math.random() * (simulatedDelayMs / 2);
      await delay(simulatedDelayMs + jitter);

      // Simulate configurable failure rate to demonstrate retry logic
      if (failureRate > 0 && Math.random() < failureRate) {
        throw new Error('Simulated processing failure');
      }

      // Log the entry to STDOUT as structured JSON
      console.log(JSON.stringify({
        level: 'info',
        message: 'Processed log entry',
        entry: {
          timestamp: entry.timestamp,
          level: entry.level,
          message: entry.message,
          service: entry.meta?.service,
          host: entry.meta?.host,
        },
        retryCount,
      }));

      span.setStatus({ code: SpanStatusCode.OK });
      logsProcessedCounter.add(1);
      processingLatencyHistogram.record(Date.now() - startTime);
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

export class Worker {
  private readonly queue: LogQueue;
  private readonly options: WorkerOptions;
  private activeCount = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(queue: LogQueue, options: WorkerOptions) {
    this.queue = queue;
    this.options = options;
  }

  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.drain();
    }, this.options.pollIntervalMs);

    console.log(JSON.stringify({
      level: 'info',
      message: 'Worker started',
      concurrency: this.options.concurrency,
      pollIntervalMs: this.options.pollIntervalMs,
    }));
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Wait for in-flight work to complete
    const drainIntervalMs = 50;
    const maxWaitMs = 10_000;
    let waited = 0;
    while (this.activeCount > 0 && waited < maxWaitMs) {
      await delay(drainIntervalMs);
      waited += drainIntervalMs;
    }

    if (this.activeCount > 0) {
      console.log(JSON.stringify({
        level: 'warn',
        message: 'Worker stopped with in-flight work remaining',
        activeCount: this.activeCount,
      }));
    }
  }

  private drain(): void {
    while (this.activeCount < this.options.concurrency && !this.queue.isEmpty()) {
      const entry = this.queue.dequeue();
      if (!entry) break;

      this.activeCount++;
      this.processWithRetry(entry, 0)
        .finally(() => {
          this.activeCount--;
        });
    }
  }

  private async processWithRetry(entry: LogEntry, attempt: number): Promise<void> {
    try {
      await processEntry(entry, this.queue, attempt, this.options.simulatedDelayMs, this.options.failureRate);
    } catch (err) {
      if (attempt < this.options.maxRetries) {
        const backoffMs = 100 * Math.pow(2, attempt);
        console.log(JSON.stringify({
          level: 'warn',
          message: 'Retrying failed log entry',
          attempt: attempt + 1,
          maxRetries: this.options.maxRetries,
          backoffMs,
          error: (err as Error).message,
        }));
        await delay(backoffMs);
        await this.processWithRetry(entry, attempt + 1);
      } else {
        logsFailedCounter.add(1);
        console.log(JSON.stringify({
          level: 'error',
          message: 'Failed to process log entry after max retries',
          entry: { timestamp: entry.timestamp, level: entry.level, message: entry.message },
          attempts: attempt + 1,
          error: (err as Error).message,
        }));
      }
    }
  }
}
