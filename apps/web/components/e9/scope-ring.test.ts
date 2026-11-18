import { describe, expect, it } from "vitest";
import { allocateTicks, ringTicks } from "./scope-ring";

describe("allocateTicks", () => {
  it("shares the ring by size, leaving one gap tick per scope", () => {
    // 13 wall graphics and 31 signages: 118 ticks to share (120 minus 2 gaps)
    const counts = allocateTicks([
      { key: "wall_graphics", value: 13 },
      { key: "internal_signages", value: 31 },
    ]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(118);
    expect(counts[1]).toBeGreaterThan(counts[0] * 2);
  });

  it("gives a tiny scope at least one tick", () => {
    const counts = allocateTicks([
      { key: "a", value: 1000 },
      { key: "b", value: 1 },
    ]);
    expect(counts[1]).toBe(1);
    expect(counts[0]).toBe(117);
  });

  it("uses the whole ring with no gap when there is one scope", () => {
    expect(allocateTicks([{ key: "a", value: 5 }])).toEqual([120]);
  });

  it("gives nothing when no scope has work, and skips empty scopes", () => {
    expect(allocateTicks([{ key: "a", value: 0 }])).toEqual([0]);
    expect(
      allocateTicks([
        { key: "a", value: 0 },
        { key: "b", value: 4 },
      ])
    ).toEqual([0, 120]);
  });
});

describe("ringTicks", () => {
  it("starts at the top and goes round in sector order", () => {
    const ticks = ringTicks([
      { key: "a", value: 1 },
      { key: "b", value: 1 },
      { key: "c", value: 1 },
    ]);
    expect(ticks[0]).toEqual({ index: 0, angle: 0, sector: 0 });
    const sectors = ticks.map((tick) => tick.sector);
    expect(sectors.every((sector, i) => i === 0 || sector >= sectors[i - 1])).toBe(true);
    expect(ticks.length).toBe(117);
    expect(Math.max(...ticks.map((tick) => tick.angle))).toBeLessThan(360);
  });
});
