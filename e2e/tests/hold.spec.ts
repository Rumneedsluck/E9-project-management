import { expect, test } from "@playwright/test";
import { makeProject, projectUrl } from "../helpers";

test("an item on hold shows on the hold list and the client report, and comes back when released", async ({
  page,
  request,
}) => {
  const project = await makeProject(request, "hold");
  await page.goto(projectUrl(project.id, "tracker"));
  await page.getByRole("button", { name: /Add row/ }).first().click();
  await expect(page.locator("tr[data-item]")).toHaveCount(1, { timeout: 30_000 });

  // type a size so the row counts, then open the "On hold / cancel / billing" group and put the row on hold
  const height = page.locator('td[data-col="h"] input').first();
  await height.click();
  await page.keyboard.type("120");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  await page.locator('thead button[aria-label^="Open On hold"]').first().click();
  const status = page.locator('td[data-col="holdstatus"] select').first();
  await status.selectOption("On Hold");
  await expect(status).toHaveValue("On Hold");
  await page.locator('td[data-col="holdreason"] select').first().selectOption("Site not ready");
  await page.waitForTimeout(800);

  // the hold list shows it, with today's date filled in
  await page.goto(projectUrl(project.id, "issues") + "&sub=hold");
  await expect(page.getByText("On hold · 1")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("row", { name: /W1/ })).toContainText("Site not ready");

  // the client report counts it as on hold
  await page.goto(projectUrl(project.id, "reports") + "&sub=report");
  await expect(page.getByText("Items counted")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("div", { hasText: /^On hold1$/ }).first()).toBeVisible();

  // release it: the hold list is empty again
  await page.goto(projectUrl(project.id, "tracker"));
  await page.locator('td[data-col="holdstatus"] select').first().selectOption("");
  await page.waitForTimeout(800);
  await page.goto(projectUrl(project.id, "issues") + "&sub=hold");
  await expect(page.getByText("Nothing is on hold.")).toBeVisible({ timeout: 30_000 });
});
