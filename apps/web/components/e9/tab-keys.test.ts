import { describe, expect, it } from "vitest";
import { nextTabIndex } from "./tab-keys";

describe("tab arrow keys", () => {
  it("moves right and wraps to the first tab", () => {
    expect(nextTabIndex("ArrowRight", 0, 8)).toBe(1);
    expect(nextTabIndex("ArrowRight", 7, 8)).toBe(0);
  });
  it("moves left and wraps to the last tab", () => {
    expect(nextTabIndex("ArrowLeft", 3, 8)).toBe(2);
    expect(nextTabIndex("ArrowLeft", 0, 8)).toBe(7);
  });
  it("jumps with Home and End", () => {
    expect(nextTabIndex("Home", 5, 8)).toBe(0);
    expect(nextTabIndex("End", 2, 8)).toBe(7);
  });
  it("ignores other keys and empty lists", () => {
    expect(nextTabIndex("a", 1, 8)).toBeNull();
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
});
