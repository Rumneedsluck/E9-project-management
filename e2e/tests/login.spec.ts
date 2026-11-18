import { expect, test } from "@playwright/test";
import { signIn } from "../helpers";

// these two start logged out
test.use({ storageState: { cookies: [], origins: [] } });

test("a wrong password does not let you in", async ({ page }) => {
  await signIn(page, "definitely-not-the-password");
  await page.waitForTimeout(2500);
  await expect(page).not.toHaveURL(/\/e9/);
  await expect(page.locator('input[name="password"]')).toBeVisible();
});

test("the right password lands on the E9 home page", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/e9/, { timeout: 30_000 });
});
