#!/bin/bash
# Manual end-to-end test script for the Log Ingestion Service
# Usage: ./test-manual.sh
# Requires: server running on localhost:3003

BASE_URL="http://localhost:3003"
API_KEY="test-key-1"
PASS=0
FAIL=0

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"

  if [ "$actual" = "$expected" ]; then
    echo "  PASS  $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "========================================="
echo " Log Ingestion Service — Manual Tests"
echo "========================================="
echo ""

# 1. Root endpoint
echo "[1] Root Endpoint"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
check "GET / returns 200" "200" "$STATUS"
echo ""

# 1b. Health endpoint
echo "[1b] Health Endpoint"
HEALTH=$(curl -s "$BASE_URL/health")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
check "GET /health returns 200" "200" "$STATUS"
echo "  Health response: $HEALTH"
echo ""

# 2. Auth — no header
echo "[2] Auth — Missing Authorization header"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/logs/json" -H "Content-Type: application/json" -d '[{"timestamp":"2024-01-01T00:00:00Z","level":"info","message":"test"}]')
check "POST without auth returns 401" "401" "$STATUS"
echo ""

# 3. Auth — invalid key
echo "[3] Auth — Invalid API key"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/logs/json" -H "Content-Type: application/json" -H "Authorization: Bearer invalid-key" -d '[{"timestamp":"2024-01-01T00:00:00Z","level":"info","message":"test"}]')
check "POST with bad key returns 401" "401" "$STATUS"
echo ""

# 4. Validation — non-array body
echo "[4] Validation — Non-array body"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/logs/json" -H "Content-Type: application/json" -H "Authorization: Bearer $API_KEY" -d '{"timestamp":"2024-01-01T00:00:00Z","level":"info","message":"test"}')
check "POST with object (not array) returns 400" "400" "$STATUS"
echo ""

# 5. Validation — empty array
echo "[5] Validation — Empty array"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/logs/json" -H "Content-Type: application/json" -H "Authorization: Bearer $API_KEY" -d '[]')
check "POST with empty array returns 400" "400" "$STATUS"
echo ""

# 6. Validation — invalid level
echo "[6] Validation — Invalid log level"
BODY=$(curl -s -X POST "$BASE_URL/logs/json" -H "Content-Type: application/json" -H "Authorization: Bearer $API_KEY" -d '[{"timestamp":"2024-01-01T00:00:00Z","level":"bad","message":"test"}]')
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/logs/json" -H "Content-Type: application/json" -H "Authorization: Bearer $API_KEY" -d '[{"timestamp":"2024-01-01T00:00:00Z","level":"bad","message":"test"}]')
check "POST with invalid level returns 400" "400" "$STATUS"
echo ""

# 7. Validation — missing fields
echo "[7] Validation — Missing required fields"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/logs/json" -H "Content-Type: application/json" -H "Authorization: Bearer $API_KEY" -d '[{"level":"info"}]')
check "POST with missing timestamp/message returns 400" "400" "$STATUS"
echo ""

# 8. Validation — bad timestamp
echo "[8] Validation — Invalid timestamp"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/logs/json" -H "Content-Type: application/json" -H "Authorization: Bearer $API_KEY" -d '[{"timestamp":"not-a-date","level":"info","message":"test"}]')
check "POST with bad timestamp returns 400" "400" "$STATUS"
echo ""

# 9. Validation — malformed JSON
echo "[9] Validation — Malformed JSON body"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/logs/json" -H "Content-Type: application/json" -H "Authorization: Bearer $API_KEY" -d '{bad json}')
check "POST with malformed JSON returns 400" "400" "$STATUS"
echo ""

# 10. Valid single entry
echo "[10] Ingestion — Single valid entry"
BODY=$(curl -s -X POST "$BASE_URL/logs/json" -H "Content-Type: application/json" -H "Authorization: Bearer $API_KEY" -d '[{"timestamp":"2024-11-01T12:00:00Z","level":"error","message":"Disk usage above 90%","meta":{"host":"prod-server-1","service":"disk-monitor"}}]')
STATUS=$(echo "$BODY" | grep -o '"accepted":1' | head -1)
if [ "$STATUS" = '"accepted":1' ]; then
  echo "  PASS  Single entry accepted (response: $BODY)"
  PASS=$((PASS + 1))
else
  echo "  FAIL  Single entry not accepted (response: $BODY)"
  FAIL=$((FAIL + 1))
fi
echo ""

# 11. Valid batch of 5
echo "[11] Ingestion — Batch of 5 entries"
BODY=$(curl -s -X POST "$BASE_URL/logs/json" -H "Content-Type: application/json" -H "Authorization: Bearer $API_KEY" -d '[{"timestamp":"2024-01-01T00:00:00Z","level":"info","message":"log 1","meta":{"service":"api"}},{"timestamp":"2024-01-01T00:00:01Z","level":"warn","message":"log 2","meta":{"service":"db"}},{"timestamp":"2024-01-01T00:00:02Z","level":"error","message":"log 3","meta":{"service":"cache"}},{"timestamp":"2024-01-01T00:00:03Z","level":"debug","message":"log 4","meta":{"service":"api"}},{"timestamp":"2024-01-01T00:00:04Z","level":"info","message":"log 5","meta":{"service":"db"}}]')
STATUS=$(echo "$BODY" | grep -o '"accepted":5' | head -1)
if [ "$STATUS" = '"accepted":5' ]; then
  echo "  PASS  Batch of 5 accepted (response: $BODY)"
  PASS=$((PASS + 1))
else
  echo "  FAIL  Batch not accepted (response: $BODY)"
  FAIL=$((FAIL + 1))
fi
echo ""

# 12. Rate limiting
echo "[12] Rate Limiting — 11 rapid requests (last should be 429)"
sleep 1  # wait for rate limit window to reset
RESULTS=""
for i in $(seq 1 11); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/logs/json" -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" -d '[{"timestamp":"2024-01-01T00:00:00Z","level":"info","message":"rate test"}]')
  RESULTS="$RESULTS $CODE"
done
LAST=$(echo "$RESULTS" | awk '{print $NF}')
if [ "$LAST" = "429" ]; then
  echo "  PASS  11th request rate-limited (codes:$RESULTS)"
  PASS=$((PASS + 1))
else
  echo "  FAIL  Expected 429 on 11th request (codes:$RESULTS)"
  FAIL=$((FAIL + 1))
fi
echo ""

# 13. Optional meta (no meta field)
sleep 1  # wait for rate limit window to reset after test 12
echo "[13] Ingestion — Entry without meta field"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/logs/json" -H "Content-Type: application/json" -H "Authorization: Bearer $API_KEY" -d '[{"timestamp":"2024-01-01T00:00:00Z","level":"info","message":"no meta"}]')
check "POST without meta returns 202" "202" "$STATUS"
echo ""

# Wait for worker to process
echo "[14] Worker — Waiting 3s for background processing..."
sleep 3
echo "  Check server terminal for processed log entries and any retry/backoff logs."
echo ""

# Summary
echo "========================================="
echo " Results: $PASS passed, $FAIL failed"
echo "========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
