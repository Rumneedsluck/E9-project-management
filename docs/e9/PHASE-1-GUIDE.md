# E9 Creative – Phase 1 guide

This explains what Phase 1 added on top of Plane, and how to run the website **for free on your own Windows computer**. Nothing here is deployed online.

---

## 1. What Phase 1 adds

| Feature                                                                                                         | Where to find it                                                            |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| E9-branded sign-in page (red & white, E9 logo, invitation-only)                                                 | `http://localhost:3000`                                                     |
| E9 dashboard: active / due this week / overdue / completed, pipeline by stage, "needs attention", team workload | Sidebar → **E9 Operations → Dashboard** (opens automatically after sign-in) |
| Project list with search, stage and priority filters, sorting                                                   | Sidebar → **E9 Operations → E9 Projects**                                   |
| Project details: client, site, dates, stage tracker, coordinator and team                                       | Click any project                                                           |
| Create and edit projects: status, priority, start date, handover deadline, team                                 | **New project** / **Edit project** buttons                                  |
| Works on phones and desktops, light and dark mode                                                               | Resize the browser or open on a phone on the same Wi-Fi                     |

Everything else in Plane (work items, pages, members, roles, notifications) still works as before. The **Work items** button on a project opens Plane's own task board for that project.

### Who can do what (reuses Plane's roles)

| Role                 | Sees                 | Can create projects | Can edit a project                                           |
| -------------------- | -------------------- | ------------------- | ------------------------------------------------------------ |
| Workspace **Admin**  | All projects         | Yes                 | Yes                                                          |
| Workspace **Member** | Projects they are on | Yes                 | Only if they are that project's admin (e.g. its coordinator) |
| Workspace **Guest**  | Projects they are on | No                  | No                                                           |

Public sign-up is switched off: an admin invites people from **Settings → Members**.

---

## 2. How the code is organised (for later phases)

All E9 code lives in its own folders so Plane updates stay easy to merge:

```
apps/api/plane/e9/                 ← backend (Django app)
  models.py                        ← E9ProjectProfile: client, site, status, priority, dates
  views.py, urls.py                ← /api/workspaces/<slug>/e9/projects/…
  migrations/0001_initial.py       ← creates ONE new table: e9_project_profiles
  management/commands/e9_demo_setup.py  ← loads made-up demo data
apps/api/plane/tests/contract/app/test_e9_projects_app.py  ← backend tests

apps/web/components/e9/            ← all E9 screens and helpers
  brand.tsx                        ← company name, tagline, logo  (edit here to rebrand)
  constants.ts                     ← stage list, colours, priorities
apps/web/styles/e9-theme.css       ← E9 red brand colour (light + dark)
apps/web/app/(all)/[workspaceSlug]/(projects)/e9/   ← the page files
apps/web/app/routes/extended.ts    ← registers the E9 pages
```

Small edits were made to a few Plane files, only for branding: the sign-in screens, the sidebar (adds the E9 section, removes the "Community" upgrade badge), the top bar (removes "Star us on GitHub"), the page title, and the page you land on after sign-in.

### About the database change

Phase 1 adds **one new table** (`e9_project_profiles`) through a new migration in `apps/api/plane/e9/migrations/`. It **does not change any of Plane's existing tables or migrations**.

- Each Plane project can have one E9 profile. If a project has none yet, the website shows sensible defaults (stage "Awarded", priority "Medium").
- The change can be undone: `python manage.py migrate e9 zero` removes the table again (this deletes the E9 details, not the projects).
- When Plane releases updates, its migrations and ours run side by side.

---

## 3. Run it on Windows – step by step

You need about **10 GB of free disk space**. With 8 GB of RAM it will run, but close other heavy apps (and extra browser tabs) while it is running. Everything below is free.

> **Why WSL?** Plane is built for Linux. WSL ("Windows Subsystem for Linux") is a free Microsoft feature that runs a real Linux (Ubuntu) inside Windows. Everything runs faster and with fewer errors there.

### Step 1 – Turn on WSL (one time)

1. Click **Start**, type **PowerShell**, right-click it and choose **Run as administrator**.
2. Run:
   ```
   wsl --install
   ```
3. Restart the computer when asked. After the restart an **Ubuntu** window opens and asks you to create a Linux username and password. Remember them.

### Step 2 – Give Linux a sensible memory limit (recommended on 8 GB)

1. Open Notepad and paste:
   ```
   [wsl2]
   memory=5GB
   swap=4GB
   ```
2. Save it as `C:\Users\<your Windows user name>\.wslconfig` (choose "All files" so Notepad doesn't add `.txt`).
3. In PowerShell run `wsl --shutdown` to apply it.

### Step 3 – Install Docker Desktop (one time)

Docker runs the database and the backend for you.

1. Download **Docker Desktop for Windows** from <https://www.docker.com/products/docker-desktop/> and install it with the default options (keep "Use WSL 2" ticked).
2. Open Docker Desktop → **Settings → Resources → WSL integration** → switch on **Ubuntu** → **Apply & restart**.

Docker Desktop is free for personal use and for small businesses (fewer than 250 employees **and** under US$10 million revenue).

### Step 4 – Install Node.js inside Ubuntu (one time)

Open the **Ubuntu** app from the Start menu and run these one at a time:

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Close the Ubuntu window and open it again, then:

```bash
nvm install 22
```

```bash
corepack enable
```

### Step 5 – Download the project (one time)

Still in Ubuntu:

```bash
git clone https://github.com/Rumneedsluck/E9-project-management.git
```

```bash
cd E9-project-management
```

```bash
git checkout claude/busy-wozniak-rbgecz
```

### Step 6 – Prepare settings and install packages (one time, ~5–10 minutes)

```bash
./setup.sh
```

This creates the settings files (`.env`), generates secret keys and installs the website packages.

### Step 7 – Start the backend (database, API, background worker)

The first time this builds the backend, which takes 10–20 minutes. Later starts take seconds.

```bash
docker compose -f docker-compose-local.yml up -d --build
```

Check that the database setup finished (look for "Applying e9.0001_initial... OK" or "No migrations to apply"):

```bash
docker compose -f docker-compose-local.yml logs migrator
```

### Step 8 – Load the E9 demo data (one time)

```bash
docker compose -f docker-compose-local.yml exec api python manage.py e9_demo_setup --settings=plane.settings.local
```

It prints the sign-in details. All companies and people in the demo are made up.

### Step 9 – Start the website

First time only (prepares shared packages):

```bash
pnpm turbo run build --filter='web^...'
```

Then, every time:

```bash
cd apps/web
```

```bash
pnpm dev
```

Wait until you see `Local: http://127.0.0.1:3000/`.

### Step 10 – Open it

Open **Chrome or Edge on Windows** and go to <http://localhost:3000>

| Login                                                  | Password      | Role                                 |
| ------------------------------------------------------ | ------------- | ------------------------------------ |
| `admin@example.com`                                    | `E9Demo@2026` | Workspace admin (sees everything)    |
| `aarav.mehta@example.com`                              | `E9Demo@2026` | Member, coordinator of some projects |
| `kavya.rao@example.com` (and others in the Team panel) | `E9Demo@2026` | Member                               |

**To see it on your phone:** connect the phone to the same Wi-Fi. This needs extra network setup with WSL, so it is simplest to test the mobile layout on the computer: press **F12** in Chrome and click the phone icon.

---

## 4. Everyday use

| I want to…                    | Do this                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Stop everything               | Press `Ctrl + C` in the window running `pnpm dev`, then run `docker compose -f docker-compose-local.yml stop`              |
| Start again later             | Open Ubuntu → `cd E9-project-management` → `docker compose -f docker-compose-local.yml up -d` → `cd apps/web` → `pnpm dev` |
| Get the latest changes        | `git pull` in the project folder, then run Step 7 again                                                                    |
| Run the website's unit tests  | `cd apps/web` → `pnpm test`                                                                                                |
| Run the backend tests         | See `apps/api/tests/RUNNING_TESTS.md`                                                                                      |
| Wipe the demo and start fresh | `docker compose -f docker-compose-local.yml down -v` (deletes ALL local data), then Steps 7–8                              |

## 5. If something goes wrong

| Problem                                         | Fix                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `docker: command not found` in Ubuntu           | Docker Desktop isn't running, or WSL integration for Ubuntu is off (Step 3)                          |
| Website shows "We couldn't load this right now" | The backend isn't running: run `docker compose -f docker-compose-local.yml ps` and start it (Step 7) |
| Sign-in says the instance is not set up         | Run Step 8 again                                                                                     |
| Computer becomes very slow                      | Close other apps; lower `memory=` in `.wslconfig`; stop the backend when you aren't using it         |
| `pnpm: command not found`                       | Run `corepack enable` again, or reopen Ubuntu                                                        |

---

## 6. Not in Phase 1 (planned later)

Scope items (walls, glass, signages with sq ft / Nos.), site audit and photos, pre-press, Job Cards, Delivery Challans, BOQ, dispatch QC, snag list, department work updates, client portal, real E9 logo file, and online hosting.
