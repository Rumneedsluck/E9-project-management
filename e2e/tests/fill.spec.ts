import { expect, test, type Page } from "@playwright/test";
import { makeProject, projectUrl } from "../helpers";

const floorCell = (page: Page, row: number) => page.locator("tr[data-item]").nth(row).locator('td[data-col="floor"] input');
const floors = (page: Page, count: number) =>
  Promise.all(Array.from({ length: count }, (_, row) => floorCell(page, row).inputValue()));

async function centre(page: Page, row: number) {
  const box = await page.locator("tr[data-item]").nth(row).locator('td[data-col="floor"]').boundingBox();
  if (!box) throw new Error("cell not visible");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Drag across floor cells from row `from` to row `to` (selects a block). */
async function dragSelect(page: Page, from: number, to: number) {
  const start = await centre(page, from);
  const end = await centre(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

test("fill down by dragging, copy cells instead, copy-paste a block, Ctrl+D and undo", async ({ page, request }) => {
  const project = await makeProject(request, "fill");
  await page.goto(projectUrl(project.id, "tracker"));
  await expect(page.getByText(/No wall graphics yet/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Add row/ }).first().click();
  await page.getByRole("button", { name: "More sheet tools" }).click();
  await page.getByRole("button", { name: "Add 10 rows" }).click();
  await expect(page.locator("tr[data-item]")).toHaveCount(11, { timeout: 30_000 });

  // type "1st Floor" in the first row
  await floorCell(page, 0).click();
  await page.keyboard.type("1st Floor");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  await floorCell(page, 0).click();

  // drag the little square down 3 rows: it counts up like Excel
  const handle = page.locator("[data-fill-handle]");
  await expect(handle).toBeVisible();
  const hb = (await handle.boundingBox())!;
  const target = await centre(page, 3);
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole("group", { name: "Auto fill options" })).toBeVisible();
  await expect.poll(() => floors(page, 4)).toEqual(["1st Floor", "2nd Floor", "3rd Floor", "4th Floor"]);

  // "Copy cells" in the options chip turns the same fill into plain copies
  await page.getByRole("button", { name: /Copy cells/ }).click();
  await expect.poll(() => floors(page, 4)).toEqual(["1st Floor", "1st Floor", "1st Floor", "1st Floor"]);

  // select rows 1-3, copy, paste at row 6 (a block pastes at the top-left of the selection)
  await dragSelect(page, 0, 2);
  await page.keyboard.press("Control+c");
  await floorCell(page, 5).click();
  await page.keyboard.press("Control+v");
  await expect.poll(() => floors(page, 9)).toEqual([
    "1st Floor", "1st Floor", "1st Floor", "1st Floor", "", "1st Floor", "1st Floor", "1st Floor", "",
  ]);

  // Ctrl+D copies the top cell of a selection down it
  await floorCell(page, 7).click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Terrace");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  await dragSelect(page, 7, 9);
  await page.keyboard.press("Control+d");
  await expect.poll(() => floors(page, 10)).toEqual([
    "1st Floor", "1st Floor", "1st Floor", "1st Floor", "", "1st Floor", "1st Floor", "Terrace", "Terrace", "Terrace",
  ]);

  // Ctrl+Z takes the whole fill back in one step
  await page.keyboard.press("Control+z");
  await expect.poll(() => floors(page, 10).then((all) => all.slice(7))).toEqual(["Terrace", "", ""]);
});
