import { expect, test } from "@playwright/test";
import { makeProject, projectUrl } from "../helpers";

test("choose how many floors an item is on, then which", async ({ page, request }) => {
  const project = await makeProject(request, "floors");
  await page.goto(projectUrl(project.id, "tracker"));
  await expect(page.getByText(/No wall graphics yet/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Add row/ }).first().click();
  await expect(page.locator("tr[data-item]")).toHaveCount(1);

  await page.getByRole("button", { name: "Choose floors for W1" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "One floor more" }).click(); // 2 floors
  await expect(dialog.getByText("Floor 2")).toBeVisible();

  await dialog.getByRole("combobox", { name: "Floor 1" }).selectOption("__new__");
  await dialog.getByRole("textbox", { name: "Floor 1 name" }).fill("7th Floor");
  await dialog.getByRole("combobox", { name: "Floor 2" }).selectOption("__new__");
  await dialog.getByRole("textbox", { name: "Floor 2 name" }).fill("8th Floor");
  await expect(dialog.getByText("7th Floor, 8th Floor")).toBeVisible();
  await dialog.getByRole("button", { name: "Save floors" }).click();

  await expect(page.locator('td[data-col="floor"] input').first()).toHaveValue("7th Floor, 8th Floor");
  // each floor is listed on its own in the floor filter
  const filter = page.locator("select").filter({ hasText: "All floors" });
  await expect(filter.locator("option", { hasText: "7th Floor" })).toHaveCount(1);
  await expect(filter.locator("option", { hasText: "8th Floor" })).toHaveCount(1);
});
