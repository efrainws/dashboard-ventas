import { describe, expect, it } from "vitest";
import { compareMetric } from "@shared/comparisonMetrics";

describe("compareMetric", () => {
  it("calcula diferencia y porcentaje entre la misma entidad", () => {
    expect(compareMetric(150, 100)).toEqual({ current: 150, comparison: 100, difference: 50, percentage: 50 });
  });

  it("evita porcentajes infinitos cuando el comparativo es cero", () => {
    expect(compareMetric(20, 0)).toEqual({ current: 20, comparison: 0, difference: 20, percentage: null });
  });
});
