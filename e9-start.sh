#!/usr/bin/env bash
# E9: start everything from ONE Ubuntu tab.
#
#     bash ~/E9-project-management/e9-start.sh
#
# 0. Starts the database + server containers in Docker (needed after every laptop restart).
# 1. Gets the latest version from GitHub (and updates the database if needed).
# 2. Keeps checking GitHub every 5 minutes in the background (notes go to e9-auto-update.log).
# 3. Starts ONLY the E9 website (port 3000) – not Plane's admin / space apps – so the laptop
#    is not overloaded. Leave the tab open; Ctrl + C stops both.
#
# The whole script sits inside { … } so bash reads it completely before running:
# step 1 may replace this very file, and that must not confuse the running copy.
{
cd "$(dirname "$0")" || exit 1
BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "E9: starting the database and server (Docker)…"
if docker compose -f docker-compose-local.yml up -d >/dev/null 2>&1; then
  echo "E9: database and server are running."
else
  echo "E9: could not start Docker containers. Is Docker Desktop open and showing 'Engine running'?"
fi

echo "E9: getting the latest version…"
BEFORE=$(git rev-parse HEAD)
if git pull -q --ff-only origin "$BRANCH"; then
  if git diff --name-only "$BEFORE" HEAD | grep -q '^apps/api/plane/.*/migrations/'; then
    echo "E9: updating the database…"
    docker compose -f docker-compose-local.yml exec -T api python manage.py migrate --settings=plane.settings.local \
      >/dev/null && echo "E9: database updated."
  fi
else
  echo "E9: could not get the latest version (no internet, or files changed by hand). Starting anyway."
fi

# auto-update in the background; stopped together with the website
bash ./e9-auto-update.sh >> e9-auto-update.log 2>&1 &
UPDATER=$!
trap 'kill "$UPDATER" 2>/dev/null' EXIT
echo "E9: auto-update is ON in the background (checks GitHub every 5 minutes)."
echo "E9: starting the website (takes 1–3 minutes the first time)…"
echo "E9: when you see  'Local: http://localhost:3000'  open that address in Chrome."

pnpm turbo run dev --filter=web --concurrency=4
exit
}
