import { appendFileSync } from "node:fs";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const WEB = process.env.E9_WEB_URL ?? "http://localhost:3000";
export const API = process.env.E9_API_URL ?? "http://localhost:8000";
export const MADE_FILE = ".auth/made.txt";
export const WORKSPACE = process.env.E9_WORKSPACE ?? "e9-creative";

export function credentials() {
  const email = process.env.E9_E2E_EMAIL;
  const password = process.env.E9_E2E_PASSWORD;
  if (!email || !password) throw new Error("Set E9_E2E_EMAIL and E9_E2E_PASSWORD (a workspace admin) before running.");
  return { email, password };
}

export async function signIn(page: Page, password = credentials().password) {
  await page.goto("/");
  await page.fill('input[name="email"]', credentials().email);
  await page.click('button[type="submit"]');
  await page.waitForSelector('input[name="password"]');
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

/** Send an API call as the signed-in user (cookies come from the saved login). */
export async function api(request: APIRequestContext, method: "get" | "post" | "patch" | "delete", path: string, data?: object) {
  const state = await request.storageState();
  const csrf = state.cookies.find((cookie) => cookie.name === "csrftoken")?.value ?? "";
  return request.fetch(`${API}/api/workspaces/${WORKSPACE}/${path}`, {
    method,
    data,
    headers: { "X-CSRFToken": csrf, Referer: `${WEB}/` },
  });
}

/** A made-up project with the default scopes. Returns its id and name. */
export async function makeProject(request: APIRequestContext, label: string) {
  const stamp = Date.now().toString(36);
  const name = `E2E ${label} ${stamp}`;
  const response = await api(request, "post", "projects/", {
    name,
    identifier: `T${stamp.slice(-6).toUpperCase()}`,
    network: 2,
  });
  expect(response.status(), await response.text()).toBe(201);
  const { id } = await response.json();
  appendFileSync(MADE_FILE, `${id}\n`); // remembered so global-teardown can remove it
  return { id: id as string, name };
}

export const projectUrl = (id: string, view: string) => `/${WORKSPACE}/e9/projects/${id}?view=${view}`;
