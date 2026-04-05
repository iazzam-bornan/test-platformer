#!/bin/sh
set -e

RESULTS_DIR="/results"
mkdir -p "$RESULTS_DIR"

echo "=== JMeter Load Test ==="
echo "Target: ${TARGET_PROTOCOL:-https}://${TARGET_HOST:-jsonplaceholder.typicode.com}:${TARGET_PORT:-443}"
echo "Threads: ${THREADS:-10}, Ramp-up: ${RAMP_UP:-5}s, Loops: ${LOOPS:-3}"
echo "Error threshold: ${ERROR_THRESHOLD:-10}%"
echo "========================"

# Run JMeter
jmeter -n \
  -t /tests/test-plan.jmx \
  -l "$RESULTS_DIR/results.csv" \
  -j "$RESULTS_DIR/jmeter.log" \
  -JTARGET_HOST="${TARGET_HOST:-jsonplaceholder.typicode.com}" \
  -JTARGET_PORT="${TARGET_PORT:-443}" \
  -JTARGET_PROTOCOL="${TARGET_PROTOCOL:-https}" \
  -JTHREADS="${THREADS:-10}" \
  -JRAMP_UP="${RAMP_UP:-5}" \
  -JLOOPS="${LOOPS:-3}" \
  -JERROR_THRESHOLD="${ERROR_THRESHOLD:-10}"

# Parse results and fail if error rate exceeds threshold
TOTAL=$(tail -n +2 "$RESULTS_DIR/results.csv" | wc -l)
FAILURES=$(tail -n +2 "$RESULTS_DIR/results.csv" | awk -F',' '{print $8}' | grep -c "false" || true)

if [ "$TOTAL" -eq 0 ]; then
  echo "ERROR: No test results found"
  exit 1
fi

ERROR_RATE=$(( FAILURES * 100 / TOTAL ))
THRESHOLD="${ERROR_THRESHOLD:-10}"

echo ""
echo "=== Results ==="
echo "Total requests: $TOTAL"
echo "Failures: $FAILURES"
echo "Error rate: ${ERROR_RATE}%"
echo "Threshold: ${THRESHOLD}%"

if [ "$ERROR_RATE" -gt "$THRESHOLD" ]; then
  echo "FAILED: Error rate ${ERROR_RATE}% exceeds threshold ${THRESHOLD}%"
  exit 1
else
  echo "PASSED: Error rate ${ERROR_RATE}% within threshold ${THRESHOLD}%"
  exit 0
fi
