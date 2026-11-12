#!/usr/bin/env bash
# E9: keep this computer's copy of the website up to date by itself.
#
# Run it in its own Ubuntu tab and leave it open:
#     bash ~/E9-project-management/e9-auto-update.sh
# Every 5 minutes it checks GitHub. When Claude has pushed changes it downloads
# them and updates the database. In fast mode it also rebuilds the website (1 to 3 minutes);
# in developer mode the website picks the changes up on its own. Then refresh Chrome.
# Stop it with Ctrl + C.

cd "$(dirname "$0")" || exit 1
BRANCH=$(git rev-parse --abbrev-ref HEAD)
CHECK_EVERY=${CHECK_EVERY:-300}

echo "E9 auto-update is ON for branch $BRANCH. Checking GitHub every $((CHECK_EVERY / 60)) minutes."
echo "Leave this tab open. Press Ctrl + C to stop."

while true; do
  if git fetch -q origin "$BRANCH" 2>/dev/null; then
    if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$BRANCH")" ]; then
      echo ""
      echo "$(date '+%d %b %H:%M')  New changes found – updating…"
      BEFORE=$(git rev-parse HEAD)
      if git pull -q --ff-only origin "$BRANCH"; then
        git log --format='   • %s' "$BEFORE..HEAD"
        if git diff --name-only "$BEFORE" HEAD | grep -q '^apps/api/plane/.*/migrations/'; then
          echo "   Updating the database…"
          docker compose -f docker-compose-local.yml exec -T api python manage.py migrate --settings=plane.settings.local \
            >/dev/null && echo "   Database updated."
        fi
        if git diff --name-only "$BEFORE" HEAD | grep -qE 'pnpm-lock.yaml|apps/api/(pyproject.toml|uv.lock)'; then
          echo "   NOTE: new software packages were added. Ask Claude for the one-time restart steps."
        fi
        if [ "${E9_MODE:-dev}" = "fast" ]; then
          bash ./e9-build.sh | sed 's/^/   /'
        fi
        echo "   Done. Refresh Chrome (Ctrl + Shift + R) to see the changes."
      else
        echo "   Could not update automatically (files on this computer were changed by hand). Ask Claude."
      fi
    else
      echo "$(date '+%d %b %H:%M')  Checked GitHub – up to date."
    fi
  else
    echo "$(date '+%H:%M')  No internet / GitHub not reachable – will try again."
  fi
  sleep "$CHECK_EVERY"
done
