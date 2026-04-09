import express, { Request, Response, NextFunction } from 'express';
import { trace, context } from '@opentelemetry/api';
import { config as defaultConfig, AppConfig } from './config';
import { InMemoryApiKeyStore } from './auth/memory-store';
import { InMemoryQueue } from './queue/memory-queue';
import { LogEntry } from './queue/types';
import { authMiddleware } from './middleware/auth';
import { rateLimiterMiddleware, InMemorySlidingWindowLimiter } from './middleware/rate-limiter';
import { validateLogsMiddleware } from './middleware/validate';
import { Worker } from './worker/worker';

export function createApp(overrides?: Partial<AppConfig>) {
  const cfg = { ...defaultConfig, ...overrides };
  const app = express();
  const apiKeyStore = new InMemoryApiKeyStore(cfg.apiKeys);
  const rateLimiter = new InMemorySlidingWindowLimiter(cfg.rateLimit.maxRequestsPerSecond);
  const queue = new InMemoryQueue(cfg.queue.maxSize);
  const worker = new Worker(queue, cfg.worker);

  app.use(express.json({ limit: '1mb' }));

  // Handle malformed JSON bodies gracefully instead of crashing
  app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
    if ((err as Error & { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Malformed JSON in request body' });
      return;
    }
    next(err);
  });

  app.get('/', (_req: Request, res: Response) => {
    res.json({ message: 'Log Ingestion Service', status: 'healthy' });
  });

  app.post(
    '/logs/json',
    authMiddleware(apiKeyStore),
    rateLimiterMiddleware(rateLimiter),
    validateLogsMiddleware,
    (req: Request, res: Response) => {
      const entries = (req as Request & { logEntries: LogEntry[] }).logEntries;

      if (queue.remaining() < entries.length) {
        res.status(503).json({ error: 'Service overloaded, try again later' });
        return;
      }

      // Capture the active span context from the HTTP request for traceparent propagation
      const activeSpan = trace.getSpan(context.active());
      const spanContext = activeSpan?.spanContext();
      if (spanContext) {
        for (const entry of entries) {
          entry.spanContext = spanContext;
        }
      }

      queue.enqueue(entries);

      res.status(202).json({
        accepted: entries.length,
        queueDepth: queue.size(),
      });
    },
  );

  // Start the background worker
  worker.start();

  const shutdown = async () => {
    await worker.stop();
  };

  return { app, shutdown, queue };
}
