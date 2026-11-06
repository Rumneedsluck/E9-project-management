#!/usr/bin/env bash
# E9: start everything from ONE Ubuntu tab.
#
#     bash ~/E9-project-management/e9-start.sh
#
# 1. Gets the latest version from GitHub (and updates the database if needed).
# 2. Keeps checking GitHub every 5 minutes in the background (notes go to e9-auto-update.log).
# 3. Starts the website (pnpm dev). Leave the tab open; Ctrl + C stops both.

cd "$(dirname "$0")" || exit 1
BRANCH=$(git rev-parse --abbrev-ref HEAD)

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
echo "E9: starting the website… open http://localhost:3000 when it is ready."

pnpm dev
