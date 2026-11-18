import { describe, expect, it } from "vitest";
import { ago, lastDays } from "./activity-utils";

describe("activity bars", () => {
  it("gives one bar per day ending today, with the right counts", () => {
    const bars = lastDays(
      new Map([
        ["2026-11-14", 4],
        ["2026-11-10", 2],
      ]),
      new Date(2026, 10, 14),
      30
    );
    expect(bars).toHaveLength(30);
    expect(bars.at(-1)?.iso).toBe("2026-11-14");
    expect(bars.at(-1)?.count).toBe(4);
    expect(bars.find((bar) => bar.iso === "2026-11-10")?.count).toBe(2);
    expect(bars[0].iso).toBe("2026-10-16");
  });
});

describe("time ago", () => {
  const now = new Date(2026, 10, 14, 13, 0);
  it("says minutes, hours, yesterday and dates", () => {
    expect(ago(new Date(2026, 10, 14, 12, 55).toISOString(), now)).toBe("5 min ago");
    expect(ago(new Date(2026, 10, 14, 10, 0).toISOString(), now)).toBe("3 h ago");
    expect(ago(new Date(2026, 10, 13, 9, 0).toISOString(), now)).toBe("Yesterday");
    expect(ago(new Date(2026, 10, 2, 9, 0).toISOString(), now)).toContain("Nov");
  });
});
