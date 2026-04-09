import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const testConfig = {
  apiKeys: ['valid-key'],
  rateLimit: { maxRequestsPerSecond: 10 },
  queue: { maxSize: 10_000 },
  worker: {
    concurrency: 5,
    pollIntervalMs: 60_000, // long interval so worker doesn't interfere with tests
    maxRetries: 3,
    simulatedDelayMs: 10,
    failureRate: 0,
  },
};

const validPayload = [
  {
    timestamp: '2024-11-01T12:00:00Z',
    level: 'error',
    message: 'Disk usage above 90%',
    meta: { host: 'prod-server-1', service: 'disk-monitor' },
  },
];

let shutdownFn: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (shutdownFn) {
    await shutdownFn();
    shutdownFn = null;
  }
});

function buildApp(overrides = {}) {
  const { app, shutdown, queue } = createApp({ ...testConfig, ...overrides });
  shutdownFn = shutdown;
  return { app, queue };
}

describe('POST /logs/json', () => {
  it('returns 401 without auth header', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/logs/json').send(validPayload);
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid key', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer invalid-key')
      .send(validPayload);
    expect(res.status).toBe(401);
  });

  it('returns 400 for non-array payload', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer valid-key')
      .send({ timestamp: '2024-01-01T00:00:00Z', level: 'info', message: 'test' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty array', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer valid-key')
      .send([]);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid timestamp format', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer valid-key')
      .send([{ timestamp: 'Tuesday', level: 'info', message: 'test' }]);
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing required fields', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer valid-key')
      .send([{ level: 'info' }]);
    expect(res.status).toBe(400);
    expect(res.body.details).toBeDefined();
  });

  it('accepts valid payload and enqueues', async () => {
    const { app, queue } = buildApp();
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
    const { app, queue } = buildApp();
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

  it('returns 503 when batch would exceed queue capacity', async () => {
    const { app } = buildApp({ queue: { maxSize: 1 } });

    // First request fills the queue
    await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer valid-key')
      .send(validPayload);

    // Second request should be rejected
    const res = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer valid-key')
      .send(validPayload);

    expect(res.status).toBe(503);
  });

  it('returns 503 when batch is larger than remaining capacity', async () => {
    const { app } = buildApp({ queue: { maxSize: 2 } });

    const batch = [
      { timestamp: '2024-11-01T12:00:00Z', level: 'info', message: 'msg1' },
      { timestamp: '2024-11-01T12:00:01Z', level: 'info', message: 'msg2' },
      { timestamp: '2024-11-01T12:00:02Z', level: 'info', message: 'msg3' },
    ];

    const res = await request(app)
      .post('/logs/json')
      .set('Authorization', 'Bearer valid-key')
      .send(batch);

    expect(res.status).toBe(503);
  });
});
