import { describe, expect, it } from "vitest";
import { totalsByUnit } from "./totals";

describe("totalsByUnit", () => {
  const rows = [
    { unit: "nos", qty: "10", made: "11" },
    { unit: "sqft", qty: "2089.51", made: "2146.15" },
    { unit: "sqft", qty: "146.09", made: "146.09" },
    { unit: "nos", qty: "2", made: null },
  ];
  it("adds each column per unit and never mixes sq ft with Nos", () => {
    const totals = totalsByUnit(rows, { qty: (row) => row.qty, made: (row) => row.made });
    expect(totals).toEqual([
      ["sqft", { qty: 2235.6, made: 2292.24 }],
      ["nos", { qty: 12, made: 11 }],
    ]);
  });
  it("is empty when there are no rows", () => {
    expect(totalsByUnit([], { qty: () => 1 })).toEqual([]);
  });
});
