import { expect, test } from "@playwright/test";
import { api, makeProject, projectUrl } from "../helpers";

test("Overview: every card has its own colour, and BOQ check + Billing sit at the bottom", async ({
  page,
  request,
}) => {
  const project = await makeProject(request, "overview");
  const base = `e9/projects/${project.id}`;

  // a made-up BOQ that allows 1 sign, and 2 signs on the tracker, so the BOQ check and Billing cards appear
  const po = await api(request, "post", `${base}/boq/pos/`, { kind: "original", number: "PO-1" });
  expect(po.status(), await po.text()).toBe(201);
  const poId = (await po.json()).pos[0].id;
  const line = await api(request, "post", `${base}/boq/lines/`, {
    po: poId,
    line_no: "BO1",
    scope: "internal_signages",
    description: "Door signs",
    unit: "nos",
    qty: "1",
  });
  expect(line.status(), await line.text()).toBe(201);
  const made = await api(request, "post", `${base}/items/`, { scope: "internal_signages", count: 2 });
  expect(made.status(), await made.text()).toBe(201);
  const rows: { id: string }[] = await made.json();
  const saved = await Promise.all(
    rows.map((row) =>
      api(request, "patch", `${base}/items/${row.id}/`, { description: "Door sign", qty: "1", boq_item_no: "BO1" })
    )
  );
  for (const response of saved) expect(response.status()).toBe(200);

  await page.goto(projectUrl(project.id, "overview"));
  const cards = page.locator("section[data-tone]");
  await expect(cards.filter({ has: page.getByRole("heading", { name: "BOQ check" }) })).toBeVisible({
    timeout: 30_000,
  });

  // each card carries a colour, and no two cards share one
  const tones = await cards.evaluateAll((sections) => sections.map((section) => section.getAttribute("data-tone")));
  expect(tones.length).toBeGreaterThanOrEqual(5);
  expect(new Set(tones).size).toBe(tones.length);

  // the BOQ check and Billing come after the site issues (they used to sit in the middle of the page)
  const titles = await cards.locator("h2").allTextContents();
  const at = (title: string) => titles.indexOf(title);
  expect(at("Open site issues")).toBeGreaterThan(-1);
  expect(at("BOQ check")).toBeGreaterThan(at("Open site issues"));
  expect(at("Billing")).toBeGreaterThan(at("BOQ check"));
});
