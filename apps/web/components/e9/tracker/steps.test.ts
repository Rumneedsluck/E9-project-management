import { describe, expect, it } from "vitest";
import { furthestStep, isStageDone, reached, scopeProgress, trackerKpis } from "./logic";
import type { TE9ScopeItem } from "./logic";

const sign = (values: Partial<TE9ScopeItem>) =>
  ({
    id: Math.random().toString(36),
    scope: "internal_signages",
    unit: "nos",
    qty: "1",
    description: "Sign",
    floor_area: "Ground",
    is_part: false,
    hold_status: "",
    site_audit_status: "Not Started",
    pre_press: "Not Started",
    production_status: "Not Started",
    material_status: "",
    quality_check: "Pending",
    dispatch_status: "Not Dispatched",
    installation_status: "Not Started",
    client_sign_off: "Pending",
    ...values,
  }) as unknown as TE9ScopeItem;

describe("a later step means the earlier steps are done", () => {
  it("counts an installed sign as produced, received, checked and delivered", () => {
    const item = sign({ installation_status: "Installation Done" });
    expect(reached(item, "production")).toBe(true);
    expect(reached(item, "material")).toBe(true);
    expect(reached(item, "qc")).toBe(true);
    expect(reached(item, "delivered")).toBe(true);
    expect(reached(item, "installed")).toBe(true);
    expect(reached(item, "signed_off")).toBe(false);
  });

  it("does not move a row that has not reached a step", () => {
    const item = sign({ production_status: "In Production" });
    expect(furthestStep(item)).toBe(-1);
    expect(reached(item, "production")).toBe(false);
  });

  it("fills the scope table: 29 installed signs show 29 under production, material, QC and delivered", () => {
    const items = [
      ...Array.from({ length: 29 }, () => sign({ installation_status: "Installation Done" })),
      sign({}),
      sign({}),
    ];
    const [row] = scopeProgress(items, [{ key: "internal_signages", label: "Internal Signages", unit_mode: "nos" }]);
    expect(row.items).toBe(31);
    expect([row.productionDone, row.materialReceived, row.qcPassed, row.delivered, row.installed]).toEqual([
      29, 29, 29, 29, 29,
    ]);
    expect(row.signedOff).toBe(0);
  });

  it("treats a signed-off item as installed for the stage targets and work done", () => {
    const item = sign({ client_sign_off: "Signed Off" });
    expect(isStageDone(item, "installation")).toBe(true);
    expect(trackerKpis([item], null).percentDone).toBe(100);
  });
});
