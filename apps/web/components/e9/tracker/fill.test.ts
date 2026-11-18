import { describe, expect, it } from "vitest";
import { bumpText, canCountUp, fillValues } from "./fill";

describe("counting up like Excel", () => {
  it("adds one to the last number in a text", () => {
    expect(bumpText("Wall 1", 1)).toBe("Wall 2");
    expect(bumpText("Cabin-01 Wall-11", 1)).toBe("Cabin-01 Wall-12");
    expect(bumpText("Floor", 1)).toBeNull();
    expect(bumpText("BO007", 3)).toBe("BO010");
  });

  it("keeps ordinals right (1st, 2nd, 3rd, 4th, 11th)", () => {
    expect(bumpText("1st Floor", 1)).toBe("2nd Floor");
    expect(bumpText("1st Floor", 2)).toBe("3rd Floor");
    expect(bumpText("1st Floor", 3)).toBe("4th Floor");
    expect(bumpText("10th Floor", 1)).toBe("11th Floor");
    expect(bumpText("21st Floor", 1)).toBe("22nd Floor");
  });

  it("does not go below zero", () => {
    expect(bumpText("Wall 1", -2)).toBeNull();
  });

  it("knows when a selection can count up", () => {
    expect(canCountUp(["1st Floor"])).toBe(true);
    expect(canCountUp(["93.5"])).toBe(false); // a lone number is copied, like Excel
    expect(canCountUp(["Ground"])).toBe(false);
    expect(canCountUp(["10", "20"])).toBe(true);
    expect(canCountUp(["10", "20", "35"])).toBe(false);
  });
});

describe("filling cells", () => {
  it("counts up a single text, downwards and upwards", () => {
    expect(fillValues(["1st Floor"], 3, "down", "series")).toEqual(["2nd Floor", "3rd Floor", "4th Floor"]);
    expect(fillValues(["5th Floor"], 2, "up", "series")).toEqual(["4th Floor", "3rd Floor"]);
  });

  it("copies when asked to", () => {
    expect(fillValues(["1st Floor"], 3, "down", "copy")).toEqual(["1st Floor", "1st Floor", "1st Floor"]);
  });

  it("copies a lone number even in count-up mode", () => {
    expect(fillValues(["93.5"], 2, "down", "series")).toEqual(["93.5", "93.5"]);
  });

  it("continues a steady number series", () => {
    expect(fillValues(["10", "20"], 3, "down", "series")).toEqual(["30", "40", "50"]);
    expect(fillValues(["30", "40"], 2, "up", "series")).toEqual(["20", "10"]);
  });

  it("repeats a selected block in copy mode", () => {
    expect(fillValues(["A", "B"], 5, "down", "copy")).toEqual(["A", "B", "A", "B", "A"]);
    expect(fillValues(["A", "B"], 3, "up", "copy")).toEqual(["B", "A", "B"]);
  });
});
