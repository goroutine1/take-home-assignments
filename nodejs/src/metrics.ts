import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('log-ingestion-service');

export const logsIngestedCounter = meter.createCounter('logs.ingested', {
  description: 'Total number of log entries accepted into the queue',
});

export const logsFailedCounter = meter.createCounter('logs.failed', {
  description: 'Total number of log entries that failed after max retries',
});

export const logsProcessedCounter = meter.createCounter('logs.processed', {
  description: 'Total number of log entries successfully processed',
});

export const rateLimitedCounter = meter.createCounter('logs.rate_limited', {
  description: 'Total number of requests rejected by rate limiter',
});

export const queueDepthGauge = meter.createObservableGauge('queue.depth', {
  description: 'Current number of entries in the queue',
});

export const processingLatencyHistogram = meter.createHistogram('logs.processing_latency_ms', {
  description: 'Time taken to process a single log entry in milliseconds',
  unit: 'ms',
});

export function registerQueueDepthCallback(getDepth: () => number): void {
  queueDepthGauge.addCallback((result) => {
    result.observe(getDepth());
  });
}
