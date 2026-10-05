import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectFile = (relativePath: string) =>
  readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

describe("Ventas vs Meta y sus variantes visuales", () => {
  it("centraliza el selector de canales en variantes globales", () => {
    const page = projectFile("client/src/pages/SalesVsTarget.tsx");

    expect(page).toContain("ff-channel-filter");
    expect(page).toContain("aria-pressed={isActive}");
    expect(page).toContain("ff-channel-chip");
    expect(page).not.toContain('bg-[#1A6894]/10');
  });

  it("mantiene filtros pendientes y aplicados en URL sin agregar comparación temporal", () => {
    const page = projectFile("client/src/pages/SalesVsTarget.tsx");

    expect(page).toContain('useTemporalUrlState("P03")');
    expect(page).toContain("const [draftControls, setDraftControls]");
    expect(page).toContain("const [appliedControls, setAppliedControls]");
    expect(page).toContain("temporal.applied.primary.start");
    expect(page).toContain("temporal.applied.primary.end");
    expect(page).toContain("<AppliedFilterActions");
    expect(page).toContain("onApply={applyFilters}");
    expect(page).toContain("onReset={resetFilters}");
    expect(page).toContain("TARGET_CONTROL_QUERY_KEYS.forEach");
    expect(page).toContain('params.set("store_ids", draftControls.storeIds.join(","))');
    expect(page).toContain('params.set("channels", draftControls.channels.join(","))');
    expect(page).not.toContain("comparison_fecha_min");
    expect(page).not.toContain("comparison_fecha_max");
    expect(page).not.toContain("modalidad_comparacion");
  });

  it("usa tonos semánticos y barras rectangulares para el cumplimiento", () => {
    const card = projectFile("client/src/components/StoreTargetCard.tsx");
    const modal = projectFile("client/src/components/TargetEditModal.tsx");
    const styles = projectFile("client/src/index.css");

    expect(card).toContain("getComplianceTone");
    expect(card).toContain("ff-target-progress");
    expect(card).toContain("ff-target-value");
    expect(modal).toContain("ff-target-state--info");
    expect(modal).toContain("ff-target-table-shell");
    expect(modal).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
    expect(styles).toContain(".ff-target-tone--complete");
    expect(styles).toContain(".ff-target-tone--critical");
  });
});
