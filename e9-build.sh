#!/usr/bin/env bash
# E9: build the FAST version of the website (the finished one, much smoother than developer mode).
# It only builds when website files changed since the last build, so it is quick to run again.
# Used by e9-start.sh and e9-auto-update.sh. Notes go to e9-build.log.
cd "$(dirname "$0")" || exit 1
MARK=apps/web/build/.e9-built
HEAD_NOW=$(git rev-parse HEAD)
BUILT=$(cat "$MARK" 2>/dev/null || echo none)
if [ -d apps/web/build/client ] && [ "$BUILT" != none ] \
   && git diff --quiet "$BUILT" "$HEAD_NOW" -- apps/web packages pnpm-lock.yaml 2>/dev/null; then
  echo "E9: the fast version is already up to date."
  exit 0
fi
echo "E9: building the fast version (about 1 to 3 minutes)…"
if NODE_OPTIONS=--max-old-space-size=3072 pnpm --filter web build >> e9-build.log 2>&1; then
  echo "$HEAD_NOW" > "$MARK"
  echo "E9: fast version is ready."
else
  echo "E9: the fast version could not be built (see e9-build.log)."
  exit 1
fi
