import { describe, expect, it } from "vitest";
import { calculatePositiveAverage, calculateRowTotals } from "../client/src/lib/heatmapTotals";

describe("heatmap totals", () => {
  it("sums every hourly value in each comparison date while treating empty cells as zero", () => {
    expect(calculateRowTotals([
      [120, null, 80, 0],
      [null, 50, 25, null],
      [null, null, null, null],
    ])).toEqual([200, 75, 0]);
  });

  it("matches hourly tooltip semantics by averaging only dates with activity", () => {
    expect(calculatePositiveAverage([200, 75, 0])).toBe(137.5);
    expect(calculatePositiveAverage([0, 0])).toBeNull();
  });
});
