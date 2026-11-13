import { describe, expect, it } from "vitest";
import { fromDisplay, sizeHeading, toDisplay } from "./sizes";

describe("size units", () => {
  it("keeps inches as they are", () => {
    expect(toDisplay("96.00", "in")).toBe("96");
    expect(fromDisplay("96", "in")).toBe("96.00");
  });
  it("shows and stores decimal feet", () => {
    expect(toDisplay("102.00", "ft")).toBe("8.5");
    expect(fromDisplay("8.5", "ft")).toBe("102.00");
  });
  it("shows and stores millimetres", () => {
    expect(toDisplay("94.49", "mm")).toBe("2400");
    expect(fromDisplay("2400", "mm")).toBe("94.49");
  });
  it("treats blanks and bad text properly", () => {
    expect(toDisplay(null, "ft")).toBeNull();
    expect(fromDisplay("", "ft")).toBeNull();
    expect(fromDisplay("abc", "ft")).toBeUndefined();
    expect(fromDisplay("-3", "mm")).toBeUndefined();
  });
  it("renames the heading", () => {
    expect(sizeHeading("H (in)", "mm")).toBe("H (mm)");
    expect(sizeHeading("Prod. W (in)", "ft")).toBe("Prod. W (ft)");
    expect(sizeHeading("Qty", "ft")).toBe("Qty");
  });
});
