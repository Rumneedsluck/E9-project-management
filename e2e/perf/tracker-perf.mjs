/* oxlint-disable no-await-in-loop -- the steps are timed one after another on purpose */
// How smooth is the tracker? A repeatable check that opens the site like a person and times it.
//
//   cd ~/E9-project-management/e2e
//   E9_E2E_EMAIL=... E9_E2E_PASSWORD=... node perf/tracker-perf.mjs
//
// First fill a made-up project with 300 rows (developer mode, in apps/api):
//   python manage.py e9_demo_perf --items 300
//
// It prints a table of numbers (milliseconds). "long task" = the page was frozen for that long.
// Numbers from a laptop and from a cloud test machine differ: compare a before and an after
// from the SAME machine. Only made-up data is used.
import { chromium } from "@playwright/test";

const WEB = process.env.E9_WEB_URL ?? "http://localhost:3000";
const WORKSPACE = process.env.E9_WORKSPACE ?? "e9-creative";
const PROJECT_NAME = process.env.E9_PERF_PROJECT ?? "Orbit Logistics Warehouse";
const email = process.env.E9_E2E_EMAIL;
const password = process.env.E9_E2E_PASSWORD;
if (!email || !password) throw new Error("Set E9_E2E_EMAIL and E9_E2E_PASSWORD first.");

const results = [];
const note = (name, value, hint = "") => {
  results.push({ name, value: typeof value === "number" ? Math.round(value) : value, hint });
};
const p95 = (list) => {
  if (list.length === 0) return 0;
  const sorted = list.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

// ---- sign in
await page.goto(WEB + "/");
await page.fill('input[name="email"]', email);
await page.click('button[type="submit"]');
await page.waitForSelector('input[name="password"]');
await page.fill('input[name="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL(/\/e9/);

// ---- find the project
const projects = await page.evaluate(async (workspace) => {
  const response = await fetch(`http://localhost:8000/api/workspaces/${workspace}/e9/projects/`, {
    credentials: "include",
  });
  return response.json();
}, WORKSPACE);
const project = projects.find((entry) => entry.name === PROJECT_NAME);
if (!project) throw new Error(`No project named ${PROJECT_NAME}. Run e9_demo_perf first.`);
const url = `${WEB}/${WORKSPACE}/e9/projects/${project.id}?view=tracker`;

// ---- server answer times (median of 5), as seen from the page
const timed = async (path) => {
  const spans = await page.evaluate(async (target) => {
    const out = [];
    for (let run = 0; run < 5; run += 1) {
      const t0 = performance.now();
      const response = await fetch(target, { credentials: "include" });
      await response.text();
      out.push(performance.now() - t0);
    }
    return out;
  }, `http://localhost:8000/api/workspaces/${WORKSPACE}/e9/${path}`);
  return spans.toSorted((a, b) => a - b)[2];
};
note("Server: item list of this project (ms)", await timed(`projects/${project.id}/items/`));
note("Server: project list = Dashboard data (ms)", await timed("projects/"));

// ---- page-side helpers: long tasks (freezes) and key-press timings
await page.addInitScript(() => {
  window.__long = [];
  window.__events = [];
  try {
    new PerformanceObserver((list) => window.__long.push(...list.getEntries().map((entry) => entry.duration))).observe({
      type: "longtask",
      buffered: true,
    });
    new PerformanceObserver((list) =>
      window.__events.push(
        ...list
          .getEntries()
          .filter((entry) => entry.name === "keydown")
          .map((entry) => entry.duration)
      )
    ).observe({ type: "event", durationThreshold: 16, buffered: true });
  } catch {
    // older browsers: those numbers stay empty
  }
});
const resetLong = () => page.evaluate(() => (window.__long = []));
const longest = async () => Math.max(0, ...(await page.evaluate(() => window.__long)));

// ---- 1. open the Tracker tab
const startOpen = Date.now();
await page.goto(url);
await page.waitForSelector('td[data-col="h"] input', { timeout: 60_000 });
note("Open Tracker tab, first time (ms)", Date.now() - startOpen, "includes loading the code; dev mode is slower");
const startWarm = Date.now();
await page.goto(url);
await page.waitForSelector('td[data-col="h"] input', { timeout: 60_000 });
note("Open Tracker tab, second time (ms)", Date.now() - startWarm, "target < 1500");
const rowsInDom = await page.locator("tr[data-item]").count();
note("Rows drawn at once", rowsInDom, "windowing: should be far fewer than the sheet");

// ---- 2. switching to another scope
const started = Date.now();
await page
  .getByRole("tab", { name: /Glass Film/ })
  .first()
  .click();
await page.waitForSelector('td[data-col="h"] input');
note("Switch to another scope (ms)", Date.now() - started);
await page
  .getByRole("tab", { name: /Wall Graphics/ })
  .first()
  .click();
await page.waitForSelector('td[data-col="h"] input');

// ---- 3. typing in a cell
const cell = page.locator('td[data-col="h"] input').first();
await cell.click();
await page.evaluate(() => (window.__events = []));
for (const character of "123456789012") await page.keyboard.type(character, { delay: 35 });
await page.waitForTimeout(300);
const keyTimes = await page.evaluate(() => window.__events);
note("Key press -> cell shows it, slowest (ms)", Math.max(0, ...keyTimes), "target < 50");
note("Key press -> cell shows it, 95th % (ms)", p95(keyTimes), "target < 50");
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// ---- 4. fast scrolling
const frames = await page.evaluate(async () => {
  const scroller = [...document.querySelectorAll("div")].find(
    (element) => element.scrollHeight > element.clientHeight + 200 && element.querySelector("tr[data-item]")
  );
  if (!scroller) return { gaps: [], blank: 0, note: "no scroll box found" };
  const gaps = [];
  let blank = 0;
  let last = performance.now();
  for (let step = 0; step < 90; step += 1) {
    scroller.scrollTop += 380;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const now = performance.now();
    gaps.push(now - last);
    last = now;
    // a "blank flash": nothing drawn inside the visible area
    const box = scroller.getBoundingClientRect();
    const visible = [...scroller.querySelectorAll("tr[data-item]")].some((row) => {
      const rect = row.getBoundingClientRect();
      return rect.bottom > box.top + 60 && rect.top < box.bottom;
    });
    if (!visible) blank += 1;
  }
  scroller.scrollTop = 0;
  return { gaps, blank };
});
note(
  "Scrolling: frames slower than 34 ms",
  frames.gaps.filter((gap) => gap > 34).length,
  `of ${frames.gaps.length}; target 0`
);
note("Scrolling: slowest frame (ms)", Math.max(0, ...frames.gaps));
note("Scrolling: blank flashes", frames.blank, "target 0");

// ---- 5. block select (Shift + arrows over 60 rows)
// give the first cell a fresh value so the fill below always has something to save
await page.locator('td[data-col="h"] input').first().click();
await page.keyboard.type(String(100 + Math.floor(Math.random() * 800)));
await page.keyboard.press("Enter");
await page.waitForTimeout(800);
await page.locator('td[data-col="h"] input').first().click();
await resetLong();
const startSelect = Date.now();
for (let step = 0; step < 60; step += 1) await page.keyboard.press("Shift+ArrowDown");
note("Block select 60 rows (ms)", Date.now() - startSelect);
note("Block select: longest freeze (ms)", await longest(), "target < 100");

// ---- 6. fill down over the block (Ctrl+D), then undo and redo
const requests = [];
page.on("request", (request) => {
  if (["PUT", "PATCH", "POST"].includes(request.method())) requests.push(Date.now());
});
await resetLong();
requests.length = 0;
const startFill = Date.now();
await page.keyboard.press("Control+d");
await page.waitForTimeout(2500);
note("Fill down (Ctrl+D): longest freeze (ms)", await longest(), "target < 100");
note("Fill down: save requests sent", requests.length, "fewer is better (one batch is ideal)");
note("Fill down: first -> last request (ms)", requests.length ? Math.max(...requests) - startFill : 0);
await resetLong();
const startUndo = Date.now();
for (let step = 0; step < 3; step += 1) {
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(250);
}
await page.waitForTimeout(1500);
note("Undo x3: longest freeze (ms)", await longest(), "target < 100");
note("Undo x3: total (ms)", Date.now() - startUndo - 750 - 1500);
for (let step = 0; step < 3; step += 1) {
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(250);
}
await page.waitForTimeout(1500);

// ---- 7. paste 200 rows (3 columns of made-up text and numbers)
await page.locator('td[data-col="h"] input').first().click();
await resetLong();
requests.length = 0;
const startPaste = Date.now();
await page.evaluate(() => {
  const lines = Array.from(
    { length: 200 },
    (_, index) => `Pasted wall ${index + 1}\t${60 + (index % 40)}\t${90 + (index % 70)}`
  );
  const data = new DataTransfer();
  data.setData("text/plain", lines.join("\n"));
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
});
await page.waitForTimeout(4000);
const pasteToast = await page.evaluate(() => {
  const text = document.body.innerText;
  if (/Couldn.t paste everything/.test(text)) return "FAILED";
  const match = text.match(/Pasted \d+ cells?[^\n]*/);
  return match ? match[0] : "no message";
});
note("Paste 200 rows: result", pasteToast, "should say Pasted ... cells");
note("Paste 200 rows: longest freeze (ms)", await longest(), "target < 100");
note("Paste 200 rows: save requests sent", requests.length, "target: 1 (one batch)");
note("Paste 200 rows: first -> last request (ms)", requests.length ? Math.max(...requests) - startPaste : 0);

// ---- 8. the Dashboard
await page.goto(`${WEB}/${WORKSPACE}/e9/dashboard`);
await page.waitForSelector("text=Active sites");
const startDashboard = Date.now();
await page.goto(`${WEB}/${WORKSPACE}/e9/dashboard`);
await page.waitForSelector("text=Active sites");
note("Dashboard ready, second time (ms)", Date.now() - startDashboard);

await browser.close();

// ---- print
const width = Math.max(...results.map((row) => row.name.length));
console.log(`\nTracker smoothness, ${PROJECT_NAME}, ${new Date().toISOString().slice(0, 16)}`);
console.log("-".repeat(width + 30));
for (const row of results) console.log(`${row.name.padEnd(width)}  ${String(row.value).padStart(7)}   ${row.hint}`);
console.log("");
