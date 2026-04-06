#!/bin/sh
# Cucumber + Playwright test runner entrypoint
# Two execution modes:
#   1. Local mode (FEATURES_DIR set): mounted volumes contain features + steps
#   2. Repo mode (GIT_REPO_URL set): clones a test repo, runs cucumber from inside

set -e

RESULTS_DIR="/results"
mkdir -p "$RESULTS_DIR"

BROWSER="${BROWSER:-chromium}"
HEADLESS="${HEADLESS:-true}"
BASE_URL="${BASE_URL:-http://localhost}"

echo "=== Cucumber + Playwright Test Runner ==="
echo "Browser:  $BROWSER (headless: $HEADLESS)"
echo "BaseUrl:  $BASE_URL"
if [ -n "$TAGS" ]; then
  echo "Tags:     $TAGS"
fi

# ---------------------------------------------------------------------------
# Repo mode: clone a test repo and run its own cucumber.js config
# ---------------------------------------------------------------------------
if [ -n "$GIT_REPO_URL" ]; then
  GIT_REPO_REF="${GIT_REPO_REF:-main}"

  if [ -z "$MODULES" ]; then
    echo "ERROR: MODULES env var is required when using repo mode" >&2
    exit 1
  fi

  echo "Mode:     repo"
  echo "Repo:     $GIT_REPO_URL"
  echo "Ref:      $GIT_REPO_REF"
  echo "Modules:  $MODULES"
  echo "========================================="

  PROJECT_DIR="/project"
  rm -rf "$PROJECT_DIR" 2>/dev/null || true
  mkdir -p "$PROJECT_DIR"

  AUTH_URL="$GIT_REPO_URL"
  if [ -n "$GIT_TOKEN" ]; then
    AUTH_URL=$(echo "$GIT_REPO_URL" | sed "s|https://|https://oauth2:${GIT_TOKEN}@|")
  fi

  echo ""
  echo "=== Cloning test repo ==="
  git clone --depth 1 --branch "$GIT_REPO_REF" "$AUTH_URL" "$PROJECT_DIR"

  cd "$PROJECT_DIR"

  if [ -f package.json ]; then
    echo ""
    echo "=== Installing test repo dependencies ==="
    npm install --omit=dev --no-audit --no-fund --silent
  fi

  echo ""
  echo "=== Running cucumber-js ==="
  echo ""

  # Tell the user's cucumber.js where to write results
  export RESULTS_FILE="$RESULTS_DIR/cucumber.json"

  set +e
  npx cucumber-js
  EXIT_CODE=$?
  set -e

# ---------------------------------------------------------------------------
# Local mode: features and steps mounted as volumes
# ---------------------------------------------------------------------------
else
  FEATURES_DIR="${FEATURES_DIR:-/project/features}"
  STEPS_DIR="${STEPS_DIR:-/project/steps}"

  echo "Mode:     local"
  echo "Features: $FEATURES_DIR"
  echo "Steps:    $STEPS_DIR"
  echo "========================================="

  if [ ! -d "$FEATURES_DIR" ]; then
    echo "ERROR: Features directory not found at $FEATURES_DIR" >&2
    exit 1
  fi

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
$(if [ -n "$TAGS" ]; then echo "    tags: \"$TAGS\","; fi)
  },
}
CUCUMBERCFG

  cd /runner

  echo ""
  echo "=== Running cucumber-js ==="
  echo ""

  set +e
  npx cucumber-js --config "$CONFIG_FILE"
  EXIT_CODE=$?
  set -e
fi

# ---------------------------------------------------------------------------
# Parse results (same for both modes)
# ---------------------------------------------------------------------------
echo ""
echo "=== Parsing Results ==="

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
