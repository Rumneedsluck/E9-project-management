import { defineConfig } from "@playwright/test";

/**
 * Browser tests for the E9 site. They open the site like a person would, so the website
 * (port 3000) and the API (port 8000) must already be running.
 * Every test makes its own made-up project, so nothing real is touched.
 *
 *   E9_E2E_EMAIL / E9_E2E_PASSWORD   login of a workspace admin (required)
 *   E9_WEB_URL / E9_API_URL / E9_WORKSPACE   optional, default to the local setup
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E9_WEB_URL ?? "http://localhost:3000",
    storageState: ".auth/state.json",
    viewport: { width: 1440, height: 900 },
    trace: "off",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
