import { describe, expect, it } from "vitest";
import { isSavableDate } from "./target-date";

describe("a typed target date", () => {
  it("saves a complete, sensible date", () => {
    expect(isSavableDate("2026-11-20")).toBe(true);
  });
  it("waits while the year is still being typed", () => {
    expect(isSavableDate("0002-11-20")).toBe(false);
    expect(isSavableDate("0202-11-20")).toBe(false);
  });
  it("ignores empty or half-typed text", () => {
    expect(isSavableDate("")).toBe(false);
    expect(isSavableDate("2026-11")).toBe(false);
  });
});
