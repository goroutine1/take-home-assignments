import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { InMemoryApiKeyStore } from '../src/auth/memory-store';
import { InMemoryQueue } from '../src/queue/memory-queue';
import { LogEntry } from '../src/queue/types';
import { authMiddleware } from '../src/middleware/auth';
import { rateLimiterMiddleware, InMemorySlidingWindowLimiter } from '../src/middleware/rate-limiter';
import { validateLogsMiddleware } from '../src/middleware/validate';

function buildTestApp() {
  const app = express();
  const queue = new InMemoryQueue();
  const store = new InMemoryApiKeyStore(['valid-key']);

  app.use(express.json({ limit: '1mb' }));
  app.post(
    '/logs/json',
    authMiddleware(store),
    rateLimiterMiddleware(new InMemorySlidingWindowLimiter(10)),
    validateLogsMiddleware,
    (req, res) => {
      if (queue.isFull()) {
        res.status(503).json({ error: 'Service overloaded, try again later' });
        return;
      }
      const entries = (req as express.Request & { logEntries: LogEntry[] }).logEntries;
      queue.enqueue(entries);
      res.status(202).json({ accepted: entries.length, queueDepth: queue.size() });
    },
  );

  return { app, queue };
}

const validPayload = [
  {
    timestamp: '2024-11-01T12:00:00Z',
    level: 'error',
    message: 'Disk usage above 90%',
    meta: { host: 'prod-server-1', service: 'disk-monitor' },
  },
];

describe('POST /logs/json', () => {
  it('returns 401 without auth header', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post('/logs/json').send(validPayload);
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid key', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer invalid-key')
      .send(validPayload);
    expect(res.status).toBe(401);
  });

  it('returns 400 for non-array payload', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer valid-key')
      .send({ timestamp: '2024-01-01T00:00:00Z', level: 'info', message: 'test' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty array', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer valid-key')
      .send([]);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid log entries', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer valid-key')
      .send([{ timestamp: 'not-a-date', level: 'info', message: 'test' }]);
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing required fields', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer valid-key')
      .send([{ level: 'info' }]);
    expect(res.status).toBe(400);
    expect(res.body.details).toBeDefined();
  });

  it('accepts valid payload and enqueues', async () => {
    const { app, queue } = buildTestApp();
    const res = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer valid-key')
      .send(validPayload);

    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(1);
    expect(res.body.queueDepth).toBe(1);
    expect(queue.size()).toBe(1);
  });

  it('accepts batch of multiple entries', async () => {
    const { app, queue } = buildTestApp();
    const batch = [
      { timestamp: '2024-11-01T12:00:00Z', level: 'info', message: 'msg1' },
      { timestamp: '2024-11-01T12:00:01Z', level: 'warn', message: 'msg2' },
      { timestamp: '2024-11-01T12:00:02Z', level: 'error', message: 'msg3', meta: { service: 'api' } },
    ];

    const res = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer valid-key')
      .send(batch);

    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(3);
    expect(queue.size()).toBe(3);
  });

  it('returns 503 when queue is full', async () => {
    const app = express();
    const queue = new InMemoryQueue(1);
    const store = new InMemoryApiKeyStore(['valid-key']);

    app.use(express.json({ limit: '1mb' }));
    app.post(
      '/logs/json',
      authMiddleware(store),
      rateLimiterMiddleware(new InMemorySlidingWindowLimiter(10)),
      validateLogsMiddleware,
      (req, res) => {
        if (queue.isFull()) {
          res.status(503).json({ error: 'Service overloaded, try again later' });
          return;
        }
        const entries = (req as express.Request & { logEntries: LogEntry[] }).logEntries;
        queue.enqueue(entries);
        res.status(202).json({ accepted: entries.length, queueDepth: queue.size() });
      },
    );

    // Fill the queue
    queue.enqueue([{ timestamp: '2024-01-01T00:00:00Z', level: 'info', message: 'fill' }]);

    const res = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer valid-key')
      .send(validPayload);

    expect(res.status).toBe(503);
  });
});
