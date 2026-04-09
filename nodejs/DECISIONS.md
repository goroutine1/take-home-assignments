# Log Ingestion Service — Design Decisions

## Overview

An HTTP log ingestion service that accepts batches of structured log entries, buffers them in a bounded internal queue, and processes them asynchronously via a background worker. Built with Express and TypeScript, instrumented with OpenTelemetry and exporting traces to Dash0. The core design separates the hot path (accept and enqueue) from the slow path (process and emit), keeping ingestion latency low regardless of downstream processing speed.

## Running the Service

### Prerequisites

- Node.js >= 18
- npm
- A [Dash0](https://dash0.com) account (free tier works) for viewing traces

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP listen port | `3003` |
| `API_KEYS` | Comma-separated list of valid API keys | `test-key-1,test-key-2` |
| `RATE_LIMIT_MAX` | Max requests per second per API key | `10` |
| `QUEUE_MAX_SIZE` | Max entries in the internal queue before rejecting with 503 | `10000` |
| `WORKER_CONCURRENCY` | Max log entries processed in parallel | `5` |
| `WORKER_POLL_MS` | Queue poll interval in milliseconds | `100` |
| `WORKER_MAX_RETRIES` | Retry attempts before dropping an entry | `3` |
| `WORKER_DELAY_MS` | Simulated processing delay (ms) | `100` |
| `WORKER_FAILURE_RATE` | Simulated failure probability (0.0–1.0) | `0.1` |
| `DASH0_AUTH_TOKEN` | Dash0 API auth token | (empty — traces won't export without this) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint URL | `https://api.europe-west4.gcp.dash0.com` |
| `OTEL_SERVICE_NAME` | Service name in traces | `log-ingestion-service` |

### Start

```bash
npm install
cp .env.example .env  # add your Dash0 auth token
npm start             # production
npm run dev           # watch mode with auto-reload
```

### Send a test request

```bash
curl -X POST http://localhost:3003/logs/json \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-key-1" \
  -d '[
    {
      "timestamp": "2024-11-01T12:00:00Z",
      "level": "error",
      "message": "Disk usage above 90%",
      "meta": { "host": "prod-server-1", "service": "disk-monitor" }
    }
  ]'
```

Expected response (HTTP 202):
```json
{ "accepted": 1, "queueDepth": 1 }
```

### Run tests

```bash
npm test              # 23 unit/integration tests
./test-manual.sh      # 13 E2E curl tests (requires running server)
```

### View traces in Dash0

Set `DASH0_AUTH_TOKEN` to your Dash0 auth token, start the service, send a few requests, then open your Dash0 dashboard. Filter by service name `log-ingestion-service`. You'll see spans for inbound HTTP requests (auto-instrumented) and `process-log-entry` spans from the worker — linked via traceparent propagation through the queue.

## Architecture

A request flows through five stages:

**HTTP request** — Express receives a JSON batch at `POST /logs/json`. The body parser enforces a 1 MB size limit. The body must be an array of log entries, each with `timestamp` (ISO 8601), `level` (trace/debug/info/warn/error/fatal), and `message`.

**Auth + rate limit** — The `authMiddleware` extracts the Bearer token and validates it against an `ApiKeyStore`. The `rateLimiterMiddleware` enforces a per-key sliding window rate limit (configurable, default 10 req/s). Both reject early with appropriate HTTP status codes (401, 429).

**Backpressure check** — Before enqueuing, the handler checks whether the queue has enough remaining capacity for the entire batch (`queue.remaining() < entries.length`). If not, the endpoint returns `503 Service Overloaded` with a `Retry-After: 5` header, signaling clients to back off and retry.

**Enqueue** — Validated entries are enriched with the current request's OTel span context (for traceparent propagation) and pushed onto the bounded in-memory queue. The endpoint returns `202 Accepted` with the count of accepted entries and current queue depth.

**Worker** — A background worker polls the queue on a configurable interval. On each tick, it drains entries up to the concurrency limit. Each entry is processed in its own OTel span (linked to the original HTTP request via stored span context), logged to STDOUT as structured JSON, and retried on failure with exponential backoff up to `maxRetries` times. Failed entries after exhausting retries are logged and dropped.

## Key Design Decisions

- **Interface-based auth store.** `ApiKeyStore` is an interface with a single `validate()` method. The in-memory implementation (`InMemoryApiKeyStore`) backs it with a `Set`. Swapping to Redis or a database means implementing one method — no changes to middleware or routing.

- **Rate limiter with swappable interface.** The `RateLimiter` interface defines an `isAllowed(key)` contract. The in-memory sliding window implementation is single-process only. For multi-process deployments, the interface can be backed by Redis + Lua scripting for atomic cross-process enforcement.

- **Circular buffer queue with backpressure.** The queue is implemented as a circular buffer with O(1) enqueue and dequeue (via head/tail pointers), avoiding the O(n) cost of `Array.shift()`. It has a configurable `maxSize` and checks remaining capacity against the full batch size before accepting — preventing partial enqueues or overflow. When full, the endpoint returns 503 with a `Retry-After` header.

- **Health endpoint.** `GET /health` exposes queue depth, remaining capacity, and worker concurrency. Useful for liveness/readiness probes and operational monitoring.

- **Concurrency control via semaphore pattern.** The worker tracks `activeCount` and only dequeues while `activeCount < concurrency`. This prevents unbounded parallelism without a heavyweight worker pool.

- **Exponential backoff on retry.** Failed entries are retried with increasing delays (100ms, 200ms, 400ms) to avoid hammering a failing downstream. After max retries, the entry is dropped and the failure is logged.

- **Traceparent propagation across the queue boundary.** The HTTP request's OTel span context is captured at ingestion time, stored alongside the log entry in the queue, and restored as the parent context when the worker creates its processing span. This links ingestion and processing in the same trace.

- **Coordinated graceful shutdown.** On SIGTERM/SIGINT: properly await `server.close()` to finish in-flight HTTP requests, wait for in-flight worker tasks to drain (up to 10s), flush OTel traces and metrics to Dash0, then exit.

- **Fail-fast configuration.** In production (`NODE_ENV=production`), the service throws on startup if `API_KEYS` is not set, preventing deployment with known default test keys.

## Design Tradeoffs

| Decision | This Implementation | Production Alternative |
|---|---|---|
| API key store | In-memory `Set` | Redis or PostgreSQL with key rotation and scoping |
| Rate limiting | In-memory sliding window, per-process | Redis + Lua script for atomic cross-process enforcement |
| Queue | Bounded circular buffer (O(1) ops, max 10K) | Kafka, SQS, or Redis Streams for durability across restarts |
| Retry strategy | Exponential backoff, drop after max retries | Add jitter to backoff, dead-letter queue for poison messages |
| Concurrency control | Counter-based semaphore (`activeCount`) | Worker pool with task scheduling and priority lanes |
| Observability | OTel traces + metrics to Dash0 | Add alerts on metric thresholds, SLO dashboards |

## What I'd Change for Production

The biggest gap is durability. The in-memory queue means a process restart loses all buffered entries. In production, I'd back the queue with Kafka or Redis Streams so entries survive restarts and can be consumed by multiple worker instances. Rate limiting would move to Redis with Lua scripts so it works across horizontally scaled processes. The retry strategy would add jitter to the exponential backoff to prevent thundering herd, and permanently-failed entries would route to a dead-letter queue for investigation rather than being dropped. Metrics are already in place (queue depth gauge, processing latency histogram, ingested/failed/rate-limited counters) — in production I'd add alerting thresholds on these and build SLO dashboards.

## OpenTelemetry Notes

**SDK initialization.** The OTel Node SDK is initialized in `src/tracing.ts`, which is imported before any other module in `src/index.ts`. This ordering is critical — the HTTP and Express auto-instrumentations work by monkey-patching `http.createServer` and Express routing at require time. If Express loads first, the instrumentation misses it entirely.

**Auto-instrumentation.** Every inbound HTTP request gets an automatic span from `HttpInstrumentation` and `ExpressInstrumentation`. No manual code in the route handlers.

**Manual worker spans.** Each log entry processed by the worker gets a dedicated span named `process-log-entry`, created via a manually acquired tracer (`log-ingestion-worker`). The span carries attributes: `log.level`, `log.service`, `queue.depth` at dequeue time, and `worker.retry_count`. On failure, the span is marked with `SpanStatusCode.ERROR` and the exception is recorded via `span.recordException()`. Spans are always closed in a `finally` block — not just on the happy path.

**Traceparent propagation.** The queue boundary normally breaks trace context (the worker runs in a detached `setInterval`, not in the HTTP request's async context). To solve this, the ingestion handler captures the active span's `SpanContext` and stores it on each log entry. When the worker picks up an entry, it reconstructs a remote parent context from the stored `traceId` and `spanId`, then creates the processing span as a child. This means the HTTP request span and all its worker processing spans appear in the same trace in Dash0.

**Trace export.** Traces are exported via OTLP/proto to the configured Dash0 endpoint, authenticated with a Bearer token. On shutdown, the SDK flushes pending spans before the process exits.

**Metrics.** In addition to traces, the service exports OTel metrics via a `PeriodicExportingMetricReader` (every 10s):
- `logs.ingested` — counter of entries accepted into the queue
- `logs.processed` — counter of entries successfully processed
- `logs.failed` — counter of entries that failed after max retries
- `logs.rate_limited` — counter of requests rejected by the rate limiter
- `queue.depth` — observable gauge of current queue size
- `logs.processing_latency_ms` — histogram of per-entry processing time

**What you'll see in Dash0.** Filter by `service.name = log-ingestion-service`. Each `POST /logs/json` request produces a parent span with child `process-log-entry` spans for each log in the batch. Failed entries show error spans with recorded exceptions and the retry count attribute, making it easy to spot flaky processing. The `queue.depth` attribute gives a rough signal of system load at each processing moment.
