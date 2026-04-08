export const config = {
  port: parseInt(process.env.PORT ?? '3003', 10),
  apiKeys: (process.env.API_KEYS ?? 'test-key-1,test-key-2').split(','),
  rateLimit: {
    maxRequestsPerSecond: parseInt(process.env.RATE_LIMIT_MAX ?? '10', 10),
  },
  queue: {
    maxSize: parseInt(process.env.QUEUE_MAX_SIZE ?? '10000', 10),
  },
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? '5', 10),
    pollIntervalMs: parseInt(process.env.WORKER_POLL_MS ?? '100', 10),
    maxRetries: parseInt(process.env.WORKER_MAX_RETRIES ?? '3', 10),
    simulatedDelayMs: parseInt(process.env.WORKER_DELAY_MS ?? '100', 10),
  },
  otel: {
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'https://api.europe-west4.gcp.dash0.com',
    authToken: process.env.DASH0_AUTH_TOKEN ?? '',
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'log-ingestion-service',
  },
};
