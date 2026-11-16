import { describe, expect, it } from "vitest";
import { dueByDay } from "./helpers";
import type { TE9Project } from "./types";

const site = (deadline: string | null, status = "production") =>
  ({ e9: { deadline, status } }) as unknown as TE9Project;

describe("sites due on each of the next 7 days", () => {
  const today = new Date(2026, 10, 16);
  it("counts open sites by day, today first, and leaves out late, far-off, undated and completed ones", () => {
    const week = dueByDay(
      [
        site("2026-11-16"),
        site("2026-11-18"),
        site("2026-11-18"),
        site("2026-11-22"),
        site("2026-11-23"), // day 7: outside the week
        site("2026-11-10"), // already late
        site(null),
        site("2026-11-17", "completed"),
      ],
      today
    );
    expect(week).toEqual([1, 0, 2, 0, 0, 0, 1]);
  });
});
