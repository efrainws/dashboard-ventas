import { describe, expect, it } from "vitest";
import { parseTemporalState } from "@shared/temporalFilterState";

const NOW = new Date("2026-10-05T10:00:00");

describe("P07 /sales-by-category", () => {
  it("usa sus 15 días completos y reconstruye la comparación personalizada desde la URL", () => {
    const defaults = parseTemporalState("P07", "", NOW);
    expect(defaults.state.primary).toEqual({ start: "2026-09-20", end: "2026-10-04" });
    expect(defaults.state.comparison).toEqual({ start: "2026-09-05", end: "2026-09-19" });

    const sharedUrl = parseTemporalState(
      "P07",
      "?fecha_min=2026-09-20&fecha_max=2026-10-04&modalidad_comparacion=days&comparacion_fecha_min=2026-09-06&comparacion_fecha_max=2026-09-20&branch_id=FF01",
      NOW,
    );
    expect(sharedUrl.issue).toBeUndefined();
    expect(sharedUrl.state).toMatchObject({
      primary: { start: "2026-09-20", end: "2026-10-04" },
      comparison: { start: "2026-09-06", end: "2026-09-20" },
      comparisonMode: "days",
    });
  });
});
