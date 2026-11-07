import { describe, expect, it } from "vitest";
import { assess, measure } from "./photo";

function image(w: number, h: number, pixel: (x: number, y: number) => number) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = pixel(x, y);
      rgba.set([v, v, v, 255], (y * w + x) * 4);
    }
  return measure(rgba, w, h);
}

describe("on-device photo check", () => {
  it("passes a lit photo with detail", () => {
    expect(assess(image(64, 64, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? 220 : 60))).toBe("ok");
  });

  it("flags a dark photo even when it has detail", () => {
    expect(assess(image(64, 64, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? 40 : 10))).toBe("dark");
  });

  it("flags a lit photo with no edges as blurred", () => {
    expect(assess(image(64, 64, (x) => 120 + x / 4))).toBe("blurred");
  });
});
