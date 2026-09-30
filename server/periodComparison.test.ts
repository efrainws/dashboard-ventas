import { describe, expect, it } from "vitest";
import { getEquivalentPreviousRange, percentageVariation } from "../shared/periodComparison";

describe("periodComparison", () => {
  it("crea un período anterior de la misma longitud calendario", () => {
    expect(getEquivalentPreviousRange("2026-09-01", "2026-09-29")).toEqual({
      from: "2026-08-03",
      to: "2026-08-31",
    });
  });

  it("calcula variación y trata la base cero como no comparable", () => {
    expect(percentageVariation(125, 100)).toBe(25);
    expect(percentageVariation(75, 100)).toBe(-25);
    expect(percentageVariation(100, 0)).toBeNull();
  });
});
