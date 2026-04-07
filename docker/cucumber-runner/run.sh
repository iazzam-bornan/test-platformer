#!/bin/sh
# Cucumber + Playwright test runner entrypoint
# Two execution modes:
#   1. Local mode (FEATURES_DIR set): mounted volumes contain features + steps
#   2. Repo mode (GIT_REPO_URL set): clones a test repo, runs cucumber from inside
#
# In both modes the runner injects --format message:/results/cucumber.ndjson
# and runs stream-results.js in parallel for live result streaming.

set -e

RESULTS_DIR="/results"
mkdir -p "$RESULTS_DIR"

MESSAGE_FILE="$RESULTS_DIR/cucumber.ndjson"
rm -f "$MESSAGE_FILE"
export MESSAGE_FILE

BROWSER="${BROWSER:-chromium}"
HEADLESS="${HEADLESS:-true}"
BASE_URL="${BASE_URL:-http://localhost}"
STREAM_BROWSER="${STREAM_BROWSER:-false}"
STREAM_INTERACTIVE="${STREAM_INTERACTIVE:-false}"

# When browser streaming is enabled, headless must be off.
if [ "$STREAM_BROWSER" = "true" ]; then
  HEADLESS="false"
  export HEADLESS
fi

echo "=== Cucumber + Playwright Test Runner ==="
echo "Browser:  $BROWSER (headless: $HEADLESS)"
echo "BaseUrl:  $BASE_URL"
if [ "$STREAM_BROWSER" = "true" ]; then
  echo "Stream:   ENABLED (interactive: $STREAM_INTERACTIVE)"
fi
if [ -n "$TAGS" ]; then
  echo "Tags:     $TAGS"
fi

# ---------------------------------------------------------------------------
# VNC stack startup (only when STREAM_BROWSER=true)
# ---------------------------------------------------------------------------
VNC_PIDS=""
if [ "$STREAM_BROWSER" = "true" ]; then
  echo ""
  echo "=== Starting VNC stack ==="

  # Clean any stale display locks from a previous crashed run
  rm -f /tmp/.X99-lock 2>/dev/null || true
  rm -rf /tmp/.X11-unix/X99 2>/dev/null || true

  # Start Xtigervnc on display :99 — combined X server + VNC listener on 5900
  # -SecurityTypes None: no password (safe: port is docker-network internal,
  #  the platform API is the only thing that talks to it via proxy)
  # -geometry: browser window size
  Xtigervnc :99 \
    -SecurityTypes None \
    -geometry 1280x720 \
    -depth 24 \
    -rfbport 5900 \
    -localhost no \
    > /tmp/xvnc.log 2>&1 &
  VNC_PIDS="$! $VNC_PIDS"
  export DISPLAY=:99

  # Wait up to 5 seconds for the X server to become available
  for i in 1 2 3 4 5; do
    if xdpyinfo -display :99 >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  # Tiny window manager so browser windows actually get decorated/managed
  fluxbox -display :99 > /tmp/fluxbox.log 2>&1 &
  VNC_PIDS="$! $VNC_PIDS"

  # Start websockify to bridge noVNC WebSocket → VNC port 5900.
  #
  # --no-check-origin: required because the platform UI is served from a
  #   different origin (e.g. http://localhost:5173) than the websockify
  #   server (e.g. http://127.0.0.1:6080), so the default origin check
  #   would reject our WebSocket handshake.
  # --web: also serves the noVNC static files (useful for direct debugging
  #   via http://<host>:6080/vnc.html).
  websockify --web /usr/share/novnc --no-check-origin 6080 localhost:5900 \
    > /tmp/websockify.log 2>&1 &
  VNC_PIDS="$! $VNC_PIDS"

  echo "VNC stack started (DISPLAY=$DISPLAY, noVNC on :6080)"
  sleep 1
fi

cleanup_vnc() {
  if [ -n "$VNC_PIDS" ]; then
    for pid in $VNC_PIDS; do
      kill "$pid" 2>/dev/null || true
    done
  fi
}
trap cleanup_vnc EXIT

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

  # Use the runner image's pre-installed cucumber/playwright/ts-node by
  # symlinking its node_modules. This avoids running npm install in the
  # cloned repo (slow, network-dependent, and risks dependency confusion).
  echo ""
  echo "=== Linking runner dependencies ==="
  if [ -e node_modules ] && [ ! -L node_modules ]; then
    rm -rf node_modules
  fi
  ln -sfn /runner/node_modules node_modules

  CUCUMBER_BIN=/runner/node_modules/.bin/cucumber-js
  CUCUMBER_ARGS="--format message:$MESSAGE_FILE"

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
    format: ["summary", "progress"],
    formatOptions: { snippetInterface: "async-await" },
$(if [ -n "$TAGS" ]; then echo "    tags: \"$TAGS\","; fi)
  },
}
CUCUMBERCFG

  cd /runner
  CUCUMBER_BIN=/runner/node_modules/.bin/cucumber-js
  CUCUMBER_ARGS="--config $CONFIG_FILE --format message:$MESSAGE_FILE"
fi

# ---------------------------------------------------------------------------
# Live result streaming + cucumber execution
# ---------------------------------------------------------------------------
echo ""
echo "=== Running cucumber-js (live streaming results) ==="
echo ""

# Start the live stream parser in the background. It tails $MESSAGE_FILE,
# emits @@RESULT@@ lines per scenario as cucumber writes them, and exits
# cleanly when it sees the testRunFinished event.
node /runner/stream-results.js "$MESSAGE_FILE" &
STREAM_PID=$!

# Run cucumber in the foreground
set +e
$CUCUMBER_BIN $CUCUMBER_ARGS
EXIT_CODE=$?
set -e

# Give the stream parser a moment to process remaining events and exit
sleep 1

# If the stream parser is still running, force-kill it
if kill -0 $STREAM_PID 2>/dev/null; then
  kill $STREAM_PID 2>/dev/null
fi
wait $STREAM_PID 2>/dev/null || true

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

if [ ! -f "$MESSAGE_FILE" ] || [ ! -s "$MESSAGE_FILE" ]; then
  echo "ERROR: Cucumber did not produce a message file — run failed" >&2
  if [ "$EXIT_CODE" -eq 0 ]; then
    EXIT_CODE=1
  fi
fi

echo ""
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "PASSED"
else
  echo "FAILED (exit code $EXIT_CODE)"
fi

exit $EXIT_CODE
