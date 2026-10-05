import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultTemporalRange,
  parseTemporalState,
  serializeTemporalState,
} from "@shared/temporalFilterState";

const source = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/CreditNotes.tsx"),
  "utf8",
);

const NOW = new Date("2026-10-05T10:00:00");

describe("P08 Notas de crédito: filtros temporales aplicados por URL", () => {
  it("usa mes actual hasta ayer y el mes cerrado previo en el primer día", () => {
    expect(defaultTemporalRange("P08", NOW)).toEqual({
      start: "2026-10-01",
      end: "2026-10-04",
    });
    expect(defaultTemporalRange("P08", new Date("2026-10-01T10:00:00"))).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    });
  });

  it("reconstruye P08 desde URL sin período comparativo", () => {
    const parsed = parseTemporalState(
      "P08",
      "?fecha_min=2026-09-10&fecha_max=2026-09-20&branch_sap_id=FF01&include_igv=false&modalidad_comparacion=days&comparacion_fecha_min=2026-08-31&comparacion_fecha_max=2026-09-09",
      NOW,
    );

    expect(parsed.state).toEqual({
      primary: { start: "2026-09-10", end: "2026-09-20" },
      comparisonMode: "previous",
    });
    expect(
      serializeTemporalState("branch_sap_id=FF01&include_igv=false", parsed.state),
    ).toBe("branch_sap_id=FF01&include_igv=false&fecha_min=2026-09-10&fecha_max=2026-09-20");
  });

  it("mantiene borradores separados, aplica por URL y preserva la restricción store_user", () => {
    expect(source).toContain('useTemporalUrlState("P08")');
    expect(source).toContain("const [draftControls, setDraftControls]");
    expect(source).toContain("const [appliedControls, setAppliedControls]");
    expect(source).toContain('temporal.apply(params)');
    expect(source).toContain('temporal.applyState(nextTemporal, params)');
    expect(source).toContain('sapId: isStoreUser && assignedStoreCode ? assignedStoreCode : "all"');
    expect(source).toContain('const displayedQueryData = queryData ?? lastQueryData.current;');
    expect(source).toContain("<AppliedFilterActions");
    expect(source).toContain("onApply={applyFilters}");
    expect(source).toContain("onReset={handleResetFilters}");
    expect(source).not.toContain("ComparisonPeriodControls");
    expect(source).not.toContain("comparison_fecha_min");
  });
});
