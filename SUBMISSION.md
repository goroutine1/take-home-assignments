# Dash0 Take-Home Assignment Submission

**Candidate:** Bhuvana Chinnadurai  
**Assignment:** Node.js Log Ingestion Service  
**Repository:** https://github.com/bhuvana-chinnadurai/take-home-assignments  
**Branch:** `nodejs-submission`

## 🎯 Assignment Completion Status

✅ **FULLY COMPLETE** - All requirements implemented and tested

## 📁 Implementation Location

The complete Node.js log ingestion service is located in the `/nodejs/` directory.

## 🚀 Quick Start

```bash
cd nodejs
npm install
cp .env.example .env
# Add your DASH0_AUTH_TOKEN to .env
npm start
```

## ✅ Requirements Fulfilled

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| **Authentication** | ✅ Complete | Bearer token with swappable `ApiKeyStore` interface |
| **Rate Limiting** | ✅ Complete | Per-API-key sliding window (10 req/s default) |
| **Log Ingestion** | ✅ Complete | `POST /logs/json` with JSON validation |
| **Async Processing** | ✅ Complete | Background worker with configurable concurrency |
| **Retry Logic** | ✅ Complete | Exponential backoff, max 3 retries |
| **OpenTelemetry** | ✅ Complete | Full instrumentation with Dash0 export |
| **Observability** | ✅ Complete | Spans with attributes, error recording |

## 🧪 Testing

- **Unit Tests:** 20 tests covering all components
- **Integration Tests:** End-to-end API testing
- **Manual Tests:** 13 E2E scenarios via `test-manual.sh`

```bash
npm test              # Run all automated tests
./test-manual.sh      # Run E2E tests (requires running server)
```

## 🏗️ Architecture Highlights

- **Production-Ready:** Graceful shutdown, backpressure control, comprehensive error handling
- **Scalable Design:** Interface-based architecture ready for Redis/database backends
- **Observability:** Full OpenTelemetry instrumentation with trace propagation
- **Reliability:** Bounded queues, retry logic, rate limiting

## 📊 Key Features Beyond Requirements

- **Backpressure Control:** Returns 503 when queue is full
- **Graceful Shutdown:** Proper cleanup on SIGTERM/SIGINT  
- **Comprehensive Testing:** 100% requirement coverage
- **Production Configuration:** 12-factor app compliant
- **Detailed Documentation:** Architecture decisions in `DECISIONS.md`

## 🔧 Configuration

All configuration via environment variables (see `.env.example`):
- Authentication, rate limiting, queue size, worker concurrency
- OpenTelemetry and Dash0 integration
- Processing delays and retry settings

## 📈 What You'll See in Dash0

- HTTP request spans (auto-instrumented)
- Linked processing spans for each log entry  
- Error spans with exception details
- Queue depth and retry count attributes
- End-to-end trace correlation

---

**Implementation Time:** ~4 hours  
**Ready for Production:** ✅ Yes
