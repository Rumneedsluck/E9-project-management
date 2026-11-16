import { describe, expect, it } from "vitest";
import type { TE9ReportScope } from "./hold-types";
import { quantityText, reportTotals } from "./report-totals";

const scope = (values: Partial<TE9ReportScope>): TE9ReportScope => ({
  scope: "x",
  label: "X",
  items: 0,
  sqft: "0.00",
  nos: "0.00",
  on_hold: 0,
  production_done: 0,
  material_received: 0,
  qc_passed: 0,
  delivered: 0,
  installed: 0,
  signed_off: 0,
  percent: 0,
  ...values,
});

describe("client report totals", () => {
  const rows = [
    scope({ items: 13, sqft: "1955.05", production_done: 13, installed: 5 }),
    scope({ items: 5, nos: "31.00", installed: 1 }),
    scope({ items: 2, rft: "38.00" }),
  ];
  it("adds the counts, keeps units apart and works out % installed over all items", () => {
    const total = reportTotals(rows);
    expect(total.items).toBe(20);
    expect(total.production_done).toBe(13);
    expect(total.installed).toBe(6);
    expect(total.percent).toBe(30);
    expect([total.sqft, total.nos, total.rft, total.rmt]).toEqual([1955.05, 31, 38, 0]);
  });
  it("writes a quantity in its own units", () => {
    expect(quantityText(rows[0])).toBe("1,955.05 sq ft");
    expect(quantityText(reportTotals(rows))).toBe("1,955.05 sq ft + 31 Nos + 38 rft");
    expect(quantityText(scope({}))).toBe("—");
  });
});
