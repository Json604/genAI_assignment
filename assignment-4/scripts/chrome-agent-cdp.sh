#!/usr/bin/env bash
# Launch Chrome with CDP for the web agent.
#
# Chrome 136+ blocks --remote-debugging-port on the default Chrome data directory
# (security: anti-cookie-theft). We use an isolated user-data-dir instead.
# On first run, seeds from Chrome "Profile 19" (usehermes2.0@gmail.com).
#
# This runs alongside your normal Chrome — no need to quit personal browsing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-9222}"
AGENT_DATA_DIR="${BROWSER_CDP_DATA_DIR:-$ROOT/data/chrome-cdp-profile}"
SOURCE_PROFILE="${BROWSER_CDP_SOURCE_PROFILE:-$HOME/Library/Application Support/Google/Chrome/Profile 19}"
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [[ ! -x "$CHROME_BIN" ]]; then
  echo "ERROR: Google Chrome not found at $CHROME_BIN" >&2
  exit 1
fi

if curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
  echo "CDP already listening on http://127.0.0.1:${PORT}"
  curl -sf "http://127.0.0.1:${PORT}/json/version" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('Browser:', d.get('Browser','?'))" 2>/dev/null || true
  exit 0
fi

if pgrep -f "user-data-dir=${AGENT_DATA_DIR}" >/dev/null 2>&1; then
  echo "Agent Chrome is running but CDP is not up yet — waiting..."
else
  if [[ ! -d "$AGENT_DATA_DIR/Default" ]]; then
    if [[ ! -d "$SOURCE_PROFILE" ]]; then
      echo "ERROR: Source profile not found: $SOURCE_PROFILE" >&2
      echo "Set BROWSER_CDP_SOURCE_PROFILE or log in manually on first launch." >&2
      mkdir -p "$AGENT_DATA_DIR"
    else
      echo "First run: seeding CDP profile from Profile 19 (usehermes2.0@gmail.com)..."
      mkdir -p "$AGENT_DATA_DIR"
      cp -R "$SOURCE_PROFILE" "$AGENT_DATA_DIR/Default"
    fi
  fi

  echo "Starting agent Chrome — CDP port: ${PORT}"
  echo "Profile dir: ${AGENT_DATA_DIR}"
  "$CHROME_BIN" \
    --user-data-dir="$AGENT_DATA_DIR" \
    --remote-debugging-port="$PORT" \
    --remote-debugging-address=127.0.0.1 \
    --no-first-run \
    --no-default-browser-check \
    >/dev/null 2>&1 &
fi

for i in $(seq 1 40); do
  sleep 0.5
  if curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
    echo "CDP up on http://127.0.0.1:${PORT}"
    echo "Agent Chrome profile: ${AGENT_DATA_DIR}/Default"
    exit 0
  fi
done

echo "ERROR: CDP endpoint did not come up on :${PORT}" >&2
echo "Chrome 136+ requires a non-default user-data-dir (this script uses one)." >&2
echo "Check that agent Chrome opened; if login cookies failed, sign in once in that window." >&2
exit 1