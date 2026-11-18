import { existsSync, readFileSync, rmSync } from "node:fs";
import { request } from "@playwright/test";
import { API, MADE_FILE, WEB, WORKSPACE } from "./helpers";

/** Remove the made-up projects the tests created. */
export default async function globalTeardown() {
  if (!existsSync(MADE_FILE)) return;
  const ids = readFileSync(MADE_FILE, "utf8").split("\n").filter(Boolean);
  const context = await request.newContext({ storageState: ".auth/state.json" });
  const csrf = (await context.storageState()).cookies.find((cookie) => cookie.name === "csrftoken")?.value ?? "";
  for (const id of ids) {
    await context.delete(`${API}/api/workspaces/${WORKSPACE}/projects/${id}/`, {
      headers: { "X-CSRFToken": csrf, Referer: `${WEB}/` },
    });
  }
  await context.dispose();
  rmSync(MADE_FILE);
}
