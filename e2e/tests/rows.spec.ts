/* oxlint-disable no-await-in-loop -- the steps of a browser test run one after another on purpose */
import { expect, test } from "@playwright/test";
import { makeProject, projectUrl } from "../helpers";

const rowCodes = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("tr[data-item]")].map((row) => row.querySelector("td")?.textContent?.trim())
  );
const describe = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("tr[data-item]")].map(
      (row) => (row.querySelector('td[data-col="desc"] input') as HTMLInputElement | null)?.value ?? ""
    )
  );

test("insert a row in the middle, add a part, then undo", async ({ page, request }) => {
  const project = await makeProject(request, "rows");
  await page.goto(projectUrl(project.id, "tracker"));
  await expect(page.getByText(/No wall graphics yet/i)).toBeVisible({ timeout: 30_000 });

  // three rows, each with a name so we can follow it
  await page
    .getByRole("button", { name: /Add row/ })
    .first()
    .click();
  await expect(page.locator("tr[data-item]")).toHaveCount(1);
  await page
    .getByRole("button", { name: /Add row/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Add row/ })
    .first()
    .click();
  await expect(page.locator("tr[data-item]")).toHaveCount(3);
  for (const [index, name] of ["Alpha", "Beta", "Gamma"].entries()) {
    const box = page.locator('tr[data-item] td[data-col="desc"] input').nth(index);
    await box.click();
    await page.keyboard.type(name);
    await page.keyboard.press("Enter");
  }
  await page.waitForTimeout(800);

  // right-click the second row -> Insert row above: Beta moves down and keeps its data
  await page
    .locator("tr[data-item]")
    .nth(1)
    .click({ button: "right", position: { x: 20, y: 10 } });
  await page.getByRole("menuitem", { name: "Insert row above" }).click();
  await expect(page.locator("tr[data-item]")).toHaveCount(4);
  expect(await rowCodes(page)).toEqual(["W1", "W2", "W3", "W4"]);
  expect(await describe(page)).toEqual(["Alpha", "", "Beta", "Gamma"]);

  // add a part under Beta: it shows "part of W3" and takes no W-number
  await page
    .locator("tr[data-item]")
    .nth(2)
    .click({ button: "right", position: { x: 20, y: 10 } });
  await page.getByRole("menuitem", { name: "Add part below" }).click();
  await expect(page.locator("tr[data-item]")).toHaveCount(5);
  await expect(page.locator("tr[data-item]").nth(3)).toContainText("part of W3");
  expect(await rowCodes(page)).not.toContain("W5");

  // undo the part, then undo the insert: back to Alpha, Beta, Gamma
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+z");
  await expect(page.locator("tr[data-item]")).toHaveCount(4);
  await page.keyboard.press("Control+z");
  await expect(page.locator("tr[data-item]")).toHaveCount(3);
  expect(await describe(page)).toEqual(["Alpha", "Beta", "Gamma"]);
});

test("arrow keys move between the project tabs", async ({ page, request }) => {
  const project = await makeProject(request, "tabs");
  await page.goto(projectUrl(project.id, "tracker"));
  const tracker = page.getByRole("tab", { name: "Tracker", exact: true });
  await expect(tracker).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
  await tracker.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "BOQ", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(tracker).toHaveAttribute("aria-selected", "true");
});
