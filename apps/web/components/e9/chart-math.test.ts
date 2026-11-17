import { describe, expect, it } from "vitest";
import {
  certSteps,
  cityCounts,
  heatStep,
  labelFits,
  monthTicks,
  roundShares,
  scheduleRows,
  spanBox,
  stageCounts,
  timelineDomain,
  timePosition,
} from "./chart-math";
import type { TE9Project } from "./types";

const day = (iso: string) => {
  const [year, month, date] = iso.split("-").map(Number);
  return new Date(year, month - 1, date);
};

const site = (id: string, values: Partial<TE9Project["e9"]> & { cert?: TE9Project["cert_state"]; percent?: number }) =>
  ({
    id,
    name: `Site ${id}`,
    identifier: id.toUpperCase(),
    created_at: "2026-01-05T10:00:00Z",
    work_items: { total: 0, completed: 0 },
    cert_state: values.cert ?? "in_progress",
    billing_open: values.cert === "certified" || values.cert === "part_certified",
    tracker: values.percent === undefined ? undefined : { rows: 10, percent: values.percent },
    e9: { status: "site_audit", city: "", start_date: null, deadline: null, ...values },
  }) as unknown as TE9Project;

describe("roundShares", () => {
  it("gives whole percentages that add up to 100", () => {
    const shares = roundShares([1, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(shares).toEqual([34, 33, 33]);
  });

  it("keeps a zero part at zero and survives an empty whole", () => {
    expect(roundShares([3, 0, 1])).toEqual([75, 0, 25]);
    expect(roundShares([0, 0])).toEqual([0, 0]);
  });
});

describe("labelFits", () => {
  it("lets a label in only when the block is wide enough for it", () => {
    expect(labelFits(60, "46%")).toBe(true);
    expect(labelFits(20, "46%")).toBe(false);
  });
});

describe("heatStep", () => {
  it("goes from 0 for nothing to 5 for everything", () => {
    expect(heatStep(0, 10)).toBe(0);
    expect(heatStep(1, 10)).toBe(1);
    expect(heatStep(5, 10)).toBe(3);
    expect(heatStep(9, 10)).toBe(4);
    expect(heatStep(10, 10)).toBe(5);
  });

  it("stays at 0 when there is nothing to do", () => {
    expect(heatStep(0, 0)).toBe(0);
  });
});

describe("stageCounts", () => {
  it("counts the sites at each stage in working order, with On hold last", () => {
    const counts = stageCounts([
      site("a", { status: "site_audit" }),
      site("b", { status: "site_audit" }),
      site("c", { status: "on_hold" }),
    ]);
    expect(counts.map((row) => row.key).at(-1)).toBe("on_hold");
    expect(counts.find((row) => row.key === "site_audit")?.count).toBe(2);
    expect(counts.find((row) => row.key === "on_hold")?.count).toBe(1);
    expect(counts.reduce((sum, row) => sum + row.count, 0)).toBe(3);
  });
});

describe("certSteps", () => {
  it("puts every site at exactly one certification step", () => {
    const steps = certSteps([
      site("a", {}),
      site("b", { cert: "jmc_pending" }),
      site("c", { cert: "part_certified" }),
      site("d", { cert: "certified" }),
      site("e", { cert: "certified" }),
    ]);
    expect(steps.map((step) => step.count)).toEqual([1, 1, 1, 2]);
  });
});

describe("cityCounts", () => {
  it("ranks cities by open sites and leaves closed sites out", () => {
    const rows = cityCounts([
      site("a", { city: "Pune" }),
      site("b", { city: "Mumbai" }),
      site("c", { city: "Pune" }),
      site("d", { city: "Pune", status: "completed" }),
      site("e", { city: " " }),
    ]);
    expect(rows[0]).toEqual({ city: "Pune", count: 2 });
    expect(rows.map((row) => row.city)).toContain("No city set");
  });

  it("folds the tail into Other cities", () => {
    const rows = cityCounts(
      ["A", "B", "C", "D", "E"].map((city) => site(city, { city })),
      3
    );
    expect(rows).toHaveLength(3);
    expect(rows[2]).toEqual({ city: "Other cities", count: 3 });
  });
});

describe("timelineDomain", () => {
  const today = day("2026-11-17");

  it("always includes today, with a little padding", () => {
    const domain = timelineDomain([{ start: day("2026-11-01"), end: day("2026-12-20") }], today);
    expect(domain.from <= day("2026-11-01")).toBe(true);
    expect(domain.to >= day("2026-12-20")).toBe(true);
    expect(timePosition(today, domain)).toBeGreaterThan(0);
    expect(timePosition(today, domain)).toBeLessThan(1);
  });

  it("does not let one very old or far-off site stretch the chart", () => {
    const domain = timelineDomain([{ start: day("2024-01-01"), end: day("2029-01-01") }], today);
    expect(domain.from >= day("2026-08-01")).toBe(true);
    expect(domain.to <= day("2027-05-01")).toBe(true);
  });

  it("is at least six weeks wide with no dates at all", () => {
    const domain = timelineDomain([], today);
    expect((domain.to.getTime() - domain.from.getTime()) / 86_400_000).toBeGreaterThanOrEqual(42);
  });
});

describe("spanBox", () => {
  const domain = { from: day("2026-11-01"), to: day("2026-12-01") };

  it("places a site between its start and its handover date", () => {
    const box = spanBox(day("2026-11-01"), day("2026-11-16"), domain);
    expect(box?.left).toBe(0);
    expect(box?.width).toBeCloseTo(0.5, 2);
    expect(box?.clippedStart).toBe(false);
  });

  it("marks a bar that runs off the edge", () => {
    const box = spanBox(day("2026-10-01"), day("2027-01-01"), domain);
    expect(box).toMatchObject({ left: 0, width: 1, clippedStart: true, clippedEnd: true });
  });

  it("draws nothing without a handover date, or when the site is outside the chart", () => {
    expect(spanBox(day("2026-11-01"), null, domain)).toBeNull();
    expect(spanBox(day("2026-01-01"), day("2026-02-01"), domain)).toBeNull();
  });

  it("draws a short stub when only the handover date is known", () => {
    const box = spanBox(null, day("2026-11-16"), domain);
    expect(box?.width).toBeGreaterThan(0);
    expect((box?.left ?? 0) + (box?.width ?? 0)).toBeCloseTo(0.5, 2);
  });
});

describe("monthTicks", () => {
  it("marks the first of each month and gives January its year", () => {
    const ticks = monthTicks({ from: day("2026-11-10"), to: day("2027-02-10") });
    expect(ticks.map((tick) => tick.label)).toEqual(["Dec", "Jan 27", "Feb"]);
    expect(ticks.every((tick) => tick.at > 0 && tick.at < 1)).toBe(true);
  });
});

describe("scheduleRows", () => {
  const today = day("2026-11-17");

  it("lists open sites with the most urgent handover first and undated sites last", () => {
    const { rows } = scheduleRows(
      [
        site("late", { deadline: "2026-11-10", start_date: "2026-10-01" }),
        site("nodate", {}),
        site("soon", { deadline: "2026-11-20", start_date: "2026-11-01" }),
        site("done", { deadline: "2026-11-01", status: "completed" }),
      ],
      today
    );
    expect(rows.map((row) => row.project.id)).toEqual(["late", "soon", "nodate"]);
    expect(rows[0].daysLeft).toBe(-7);
    expect(rows[2].box).toBeNull();
  });

  it("says how many sites it left out", () => {
    const many = Array.from({ length: 11 }, (_, index) => site(`s${index}`, { deadline: "2026-12-01" }));
    const { rows, hidden } = scheduleRows(many, today, 8);
    expect(rows).toHaveLength(8);
    expect(hidden).toBe(3);
  });

  it("carries each site's progress", () => {
    const { rows } = scheduleRows([site("a", { deadline: "2026-12-01", percent: 40 })], today);
    expect(rows[0].progress).toBe(40);
  });
});
