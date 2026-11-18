import { expect, test, type Page } from "@playwright/test";
import { WORKSPACE, api, makeProject, projectUrl } from "../helpers";

// the grey box on the Billing page: "Not open yet · waiting for JMC: <project names>"
const waitingBox = (page: Page) => page.locator("div, p").filter({ has: page.getByText(/waiting for JMC/i) }).last();

test("billing stays closed for a project until its JMC is signed", async ({ page, request }) => {
  const project = await makeProject(request, "billing");

  // the work is finished, so the project now waits for the client to sign the JMC
  const status = await api(request, "patch", `e9/projects/${project.id}/`, { status: "sign_off" });
  expect(status.status(), await status.text()).toBe(200);

  // before: the Billing page lists it as waiting for the JMC
  await page.goto(`/${WORKSPACE}/e9/billing`);
  await expect(waitingBox(page)).toContainText(project.name, { timeout: 30_000 });

  // the bill cannot be started through the API either
  const early = await api(request, "post", `e9/projects/${project.id}/bills/`, { kind: "original" });
  expect(early.status()).toBeGreaterThanOrEqual(400);
  expect(early.status()).toBeLessThan(500);

  // sign the JMC (whole project)
  const signed = await api(request, "post", `e9/projects/${project.id}/certifications/`, {
    jmc_date: "2026-01-05",
    done_on: "2026-01-06",
    client_signatory: "Site manager",
  });
  expect(signed.status()).toBe(201);

  // after: it moves out of the waiting list and Step 1 shows as done
  await page.goto(`/${WORKSPACE}/e9/billing`);
  await expect(page.getByText(/Sites ready to bill/i)).toBeVisible({ timeout: 30_000 });
  await expect(waitingBox(page)).not.toContainText(project.name);
  await page.goto(projectUrl(project.id, "certification"));
  await expect(page.getByText(/Certification done/i).first()).toBeVisible({ timeout: 30_000 });
});
