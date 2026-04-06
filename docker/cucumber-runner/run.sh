#!/bin/sh
# Cucumber + Playwright test runner entrypoint
# Executes user's feature files and step definitions, then emits results.

set -e

RESULTS_DIR="/results"
mkdir -p "$RESULTS_DIR"

FEATURES_DIR="${FEATURES_DIR:-/project/features}"
STEPS_DIR="${STEPS_DIR:-/project/steps}"
BROWSER="${BROWSER:-chromium}"
HEADLESS="${HEADLESS:-true}"
BASE_URL="${BASE_URL:-http://localhost}"

echo "=== Cucumber + Playwright Test Runner ==="
echo "Features: $FEATURES_DIR"
echo "Steps:    $STEPS_DIR"
echo "Browser:  $BROWSER (headless: $HEADLESS)"
echo "BaseUrl:  $BASE_URL"
if [ -n "$TAGS" ]; then
  echo "Tags:     $TAGS"
fi
echo "========================================="

# Validate mounts
if [ ! -d "$FEATURES_DIR" ]; then
  echo "ERROR: Features directory not found at $FEATURES_DIR" >&2
  exit 1
fi

# Generate cucumber.js config dynamically
CONFIG_FILE="/tmp/cucumber.js"
cat > "$CONFIG_FILE" <<CUCUMBERCFG
module.exports = {
  default: {
    paths: ["$FEATURES_DIR/**/*.feature"],
    require: [
      "/runner/support/world.ts",
      "/runner/support/hooks.ts",
      "$STEPS_DIR/**/*.ts",
      "$STEPS_DIR/**/*.js",
    ],
    requireModule: ["ts-node/register"],
    format: [
      "summary",
      "progress",
      "json:$RESULTS_DIR/cucumber.json",
    ],
    formatOptions: { snippetInterface: "async-await" },
    publishQuiet: true,
    $(if [ -n "$TAGS" ]; then echo "tags: \"$TAGS\","; fi)
  },
}
CUCUMBERCFG

# Run cucumber from /runner so node_modules resolves
cd /runner

echo ""
echo "Starting test execution..."
echo ""

set +e
npx cucumber-js --config "$CONFIG_FILE"
EXIT_CODE=$?
set -e

echo ""
echo "=== Parsing Results ==="

# Parse results even if cucumber failed (so we get @@RESULT@@ lines)
if [ -f "$RESULTS_DIR/cucumber.json" ]; then
  node /runner/parse-results.js "$RESULTS_DIR/cucumber.json"
else
  echo "WARNING: No cucumber.json output found" >&2
fi

echo ""
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "PASSED"
else
  echo "FAILED (exit code $EXIT_CODE)"
fi

exit $EXIT_CODE
