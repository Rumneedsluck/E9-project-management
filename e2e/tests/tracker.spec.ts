import { expect, test } from "@playwright/test";
import { makeProject, projectUrl } from "../helpers";

const rowCodes = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("tr[data-item]")].map((row) => row.querySelector("td")?.textContent?.trim())
  );

test("add a row, type in it, undo, delete it and bring it back", async ({ page, request }) => {
  const project = await makeProject(request, "tracker");
  await page.goto(projectUrl(project.id, "tracker"));
  await expect(page.getByText(/No wall graphics yet/i)).toBeVisible({ timeout: 30_000 });

  // add a row
  await page
    .getByRole("button", { name: /Add row/ })
    .first()
    .click();
  await expect(page.locator("tr[data-item]")).toHaveCount(1);
  expect(await rowCodes(page)).toEqual(["W1"]);

  // type a height, press Enter: it is saved and survives a reload
  const height = page.locator('td[data-col="h"] input').first();
  await height.click();
  await page.keyboard.type("120");
  await page.keyboard.press("Enter");
  await expect(height).toHaveValue("120");
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('td[data-col="h"] input').first()).toHaveValue("120");

  // Ctrl+Z puts the old (empty) value back
  await page.locator('td[data-col="h"] input').first().click();
  await page.keyboard.type("999");
  await page.keyboard.press("Enter");
  await expect(page.locator('td[data-col="h"] input').first()).toHaveValue("999");
  await page.waitForTimeout(500);
  await page.keyboard.press("Control+z");
  await expect(page.locator('td[data-col="h"] input').first()).toHaveValue("120");

  // delete the row (the in-page box asks first), then Ctrl+Z brings it back
  await page.getByRole("button", { name: "Delete W1" }).click();
  const holdToDelete = page.getByRole("button", { name: /Hold to delete/ });
  // a quick click is not enough: nothing is deleted
  await holdToDelete.click();
  await page.waitForTimeout(300);
  await expect(page.locator("tr[data-item]")).toHaveCount(1);
  // press and hold until the red fill completes
  const box = (await holdToDelete.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await expect(page.locator("tr[data-item]")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.locator("tr[data-item]")).toHaveCount(1);
  expect(await rowCodes(page)).toEqual(["W1"]);
});
