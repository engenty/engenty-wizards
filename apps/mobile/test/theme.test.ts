import { describe, expect, it } from "vitest";
import { cssToHex, oklchToHex } from "../src/theme/oklch";

describe("oklch", () => {
  it("turns oklch into the sRGB hex a browser shows", () => {
    expect(oklchToHex(1, 0, 0)).toBe("#ffffff");
    expect(oklchToHex(0, 0, 0)).toBe("#000000");
    // The brand ember, oklch(71% 0.19 40), within one step per channel of the browser's value.
    const [r, g, b] = cssToHex("oklch(71% 0.19 40)")
      .slice(1)
      .match(/../g)!
      .map((h) => Number.parseInt(h, 16));
    expect(Math.abs(r - 0xfe)).toBeLessThanOrEqual(2);
    expect(Math.abs(g - 0x6f)).toBeLessThanOrEqual(2);
    expect(Math.abs(b - 0x37)).toBeLessThanOrEqual(2);
  });

  it("leaves other colours as they are", () => {
    expect(cssToHex("#fff")).toBe("#fff");
  });
});
