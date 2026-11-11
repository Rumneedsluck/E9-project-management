import { chromium } from "@playwright/test";
import { rmSync } from "node:fs";
import { MADE_FILE, WEB, signIn } from "./helpers";

/** Log in once and keep the session for every test. */
export default async function globalSetup() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: WEB });
  const page = await context.newPage();
  await signIn(page);
  await page.waitForURL(/\/e9/, { timeout: 30_000 });
  await context.storageState({ path: ".auth/state.json" });
  await browser.close();
  rmSync(MADE_FILE, { force: true });
}
