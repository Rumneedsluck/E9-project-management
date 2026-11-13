# E9 — developer guide (for you, the developer)

Plain steps. Nothing here costs money or puts anything online.

## 1. What the project is made of

| Part                      | Where                              | What it is                                               |
| ------------------------- | ---------------------------------- | -------------------------------------------------------- |
| Website (what people see) | `apps/web`                         | React. E9 screens are in `apps/web/components/e9/`       |
| Server + database logic   | `apps/api`                         | Django. E9 code is in `apps/api/plane/e9/`               |
| Look (colours, fonts)     | `apps/web/styles/e9-theme.css`     | One file: change a colour here and it changes everywhere |
| E9 name, logo, wording    | `apps/web/components/e9/brand.tsx` | Name, logo drawing, login text                           |
| Browser tests             | `e2e/`                             | A robot that clicks through login, tracker, billing      |

Everything else is Plane, the open-source tool this started from. Leave it alone unless needed, so updates from Plane stay easy.

## 2. Day-to-day: change something and see it

1. Start the site in developer mode (shows changes at once):
   ```bash
   bash ~/E9-project-management/e9-start.sh dev
   ```
2. Open `http://localhost:3000`, edit a file, the page updates itself.
3. Before you save your work, run the checks (they must all be clean):
   ```bash
   pnpm check:types
   pnpm check:lint
   pnpm --filter web test
   ```
4. Save and share the change with the team's copy:
   ```bash
   git add -A
   git commit -m "feat: what you changed"
   git push
   ```

Other laptops running `e9-auto-update.sh` pick the change up within 5 minutes.

## 3. Rules that keep it bug-free

- Never edit a database "migration" file that already exists. Add a new one (`apps/api/plane/e9/migrations/`). Old ones are history.
- Every new feature gets a test. Back end: `apps/api/plane/tests`. Front end: a `.test.ts` next to the file.
- Made-up data only. The repository is public, so never commit real client names, prices, files or passwords.
- The commit check (lint) is strict on purpose. If it complains, fix what it says.

## 3b. Handy commands (run in `apps/api`, developer mode)

| What                                                              | Command                                                                    |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Fill one made-up project with 300 rows (speed tests)              | `python manage.py e9_demo_perf --items 300`                                |
| Time the tracker like a person (needs the site running)           | `cd e2e && node perf/tracker-perf.mjs`                                     |
| Import a tracker Excel file from your own computer                | `python manage.py e9_import_tracker --file "<file>.xlsx" --project "Name"` |
| Keep one project, remove the rest (lists first, then add `--yes`) | `python manage.py e9_keep_only --keep "Name"`                              |
| Remove the made-up demo projects                                  | `python manage.py e9_demo_clear` (then `--yes`)                            |

Real client files are imported on your own computer only. They are never copied into the repository.

## 4. Making it an app for all E9 members

Three levels, from easiest. Pick one; none needs an app store.

1. **Installable web app (PWA)** — recommended first step. The site already has an app name, icon and colour. On a phone or computer the browser can "Install" it and it then opens in its own window with the E9 icon. No store, no cost. Needs the site to be reachable by the members' devices (see 5).
2. **Desktop app (Windows/Mac)** — a thin wrapper (Electron or Tauri) that opens the same site. Only worth it if members need things a browser cannot do. Free tools, but extra work to keep updated.
3. **Phone-store app (Play Store / App Store)** — needs paid developer accounts and review. Not recommended: the installable web app does the same job.

## 5. Where the site lives (a decision for you)

Right now it runs on one laptop. For the whole team it has to run on a computer that stays on, and members must be able to reach it. Options:

- **An office PC or mini-PC on the office Wi-Fi** — free. Members open `http://<that PC's address>:3000` while in the office. No outside access.
- **Free private tunnel** (for example Tailscale personal plan) — members outside the office can reach the office PC securely. Free tier exists, but it is "putting it online" in a private way, so decide on that yourself first.
- **Paid hosting** — a small cloud server (a few hundred rupees a month). Only when you decide to spend.

Until you decide, nothing is deployed.

## 6. Backups (important once real data is in)

The data lives in the database inside Docker. Before real use, set up a daily backup of it (ask Claude for the exact commands). Without a backup, a broken laptop means lost data.
