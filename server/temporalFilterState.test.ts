import { describe, expect, it } from "vitest";
import {
  buildTemporalNavigationHref,
  defaultTemporalRange,
  parseTemporalState,
  previousPeriod,
  serializeTemporalState,
  validateExactDaysComparison,
  validateMonthComparison,
} from "@shared/temporalFilterState";

const NOW = new Date("2026-10-05T10:00:00");

describe("periodos predeterminados del handoff", () => {
  it("asigna 30 fechas completas hasta ayer para P01, P02 y P04", () => {
    expect(defaultTemporalRange("P01", NOW)).toEqual({ start: "2026-09-05", end: "2026-10-04" });
    expect(defaultTemporalRange("P02", NOW)).toEqual({ start: "2026-09-05", end: "2026-10-04" });
    expect(defaultTemporalRange("P04", NOW)).toEqual({ start: "2026-09-05", end: "2026-10-04" });
  });

  it("asigna 15 fechas completas hasta ayer para góndola y categorías", () => {
    expect(defaultTemporalRange("P06", NOW)).toEqual({ start: "2026-09-20", end: "2026-10-04" });
    expect(defaultTemporalRange("P07", NOW)).toEqual({ start: "2026-09-20", end: "2026-10-04" });
  });

  it("mantiene Top Clientes desde hoy menos 30 días hasta hoy", () => {
    expect(defaultTemporalRange("P05", NOW)).toEqual({ start: "2026-09-05", end: "2026-10-05" });
  });

  it("usa mes actual hasta ayer y retrocede al mes cerrado el primer día", () => {
    expect(defaultTemporalRange("P03", NOW)).toEqual({ start: "2026-10-01", end: "2026-10-04" });
    expect(defaultTemporalRange("P10", new Date("2026-10-01T10:00:00"))).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    });
  });
});

describe("validación de comparación", () => {
  it("calcula el período inmediatamente anterior con la misma duración", () => {
    expect(previousPeriod({ start: "2026-09-20", end: "2026-10-04" })).toEqual({
      start: "2026-09-05",
      end: "2026-09-19",
    });
  });

  it("exige igual cantidad de días y no acepta fechas futuras", () => {
    const primary = { start: "2026-09-20", end: "2026-10-04" };
    expect(validateExactDaysComparison(primary, { start: "2026-09-05", end: "2026-09-19" }, "2026-10-05")).toBeNull();
    expect(validateExactDaysComparison(primary, { start: "2026-09-05", end: "2026-09-18" }, "2026-10-05")).toContain("misma cantidad");
    expect(validateExactDaysComparison(primary, { start: "2026-10-05", end: "2026-10-19" }, "2026-10-05")).toContain("Selecciona nuevamente");
  });

  it("valida bloques completos de meses con el mismo tamaño", () => {
    expect(
      validateMonthComparison(
        { startMonth: "2026-06", endMonth: "2026-07" },
        { startMonth: "2026-04", endMonth: "2026-05" },
        "2026-10-05",
      ),
    ).toBeNull();
    expect(
      validateMonthComparison(
        { startMonth: "2026-06", endMonth: "2026-07" },
        { startMonth: "2026-05", endMonth: "2026-05" },
        "2026-10-05",
      ),
    ).toContain("misma cantidad");
  });
});

describe("URL de filtros temporales", () => {
  it("serializa solamente la modalidad activa y mantiene filtros no temporales", () => {
    const query = serializeTemporalState("branch_id=FF01&include_igv=false", {
      primary: { start: "2026-09-20", end: "2026-10-04" },
      comparison: { start: "2026-09-05", end: "2026-09-19" },
      comparisonMode: "days",
    });
    expect(query).toContain("branch_id=FF01");
    expect(query).toContain("include_igv=false");
    expect(query).toContain("modalidad_comparacion=days");
    expect(query).not.toContain("meses_principales");
  });

  it("restaura período y reporta error con una URL comparativa inválida", () => {
    const parsed = parseTemporalState(
      "P01",
      "?fecha_min=2026-09-20&fecha_max=2026-10-04&modalidad_comparacion=days&comparacion_fecha_min=2026-10-01&comparacion_fecha_max=2026-10-20",
      NOW,
    );
    expect(parsed.issue).toBe("Selecciona nuevamente el periodo comparativo.");
    expect(parsed.state.comparisonMode).toBe("previous");
  });

  it("conserva el período en la navegación del mismo grupo y lo restablece fuera de él", () => {
    const sameGroup = buildTemporalNavigationHref("/top-products", "P01", "P04", "?fecha_min=2026-09-20&fecha_max=2026-10-04&branch_id=FF01", NOW);
    expect(sameGroup).toContain("fecha_min=2026-09-20");
    expect(sameGroup).toContain("branch_id=FF01");
    expect(sameGroup).toContain("aviso_periodo=conservado");

    const changedGroup = buildTemporalNavigationHref("/sales-by-shelf", "P01", "P06", "?fecha_min=2026-09-20&fecha_max=2026-10-04&branch_id=FF01", NOW);
    expect(changedGroup).toContain("fecha_min=2026-09-20");
    expect(changedGroup).toContain("fecha_max=2026-10-04");
    expect(changedGroup).toContain("aviso_periodo=predeterminado");
  });
});
