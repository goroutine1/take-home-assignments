import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rateLimiterMiddleware, InMemorySlidingWindowLimiter } from '../src/middleware/rate-limiter';

describe('rateLimiterMiddleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under the limit', async () => {
    vi.useRealTimers(); // supertest needs real timers
    const limiter = new InMemorySlidingWindowLimiter(3);
    const app = express();
    app.use((req, _res, next) => {
      (req as express.Request & { apiKey: string }).apiKey = 'test-key';
      next();
    });
    app.use(rateLimiterMiddleware(limiter));
    app.get('/', (_req, res) => res.json({ ok: true }));

    const res = await request(app).get('/');
    expect(res.status).toBe(200);
  });

  it('blocks requests over the limit', async () => {
    vi.useRealTimers();
    const limiter = new InMemorySlidingWindowLimiter(2);
    const app = express();
    app.use((req, _res, next) => {
      (req as express.Request & { apiKey: string }).apiKey = 'test-key';
      next();
    });
    app.use(rateLimiterMiddleware(limiter));
    app.get('/', (_req, res) => res.json({ ok: true }));

    await request(app).get('/');
    await request(app).get('/');
    const res = await request(app).get('/');
    expect(res.status).toBe(429);
  });
});
