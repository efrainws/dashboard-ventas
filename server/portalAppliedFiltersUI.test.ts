import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const readSource = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("Filtros aplicados en portales", () => {
  const supplier = readSource("client/src/pages/SupplierPortal.tsx");
  const ownBrand = readSource("client/src/pages/OwnBrandPortal.tsx");

  it.each([
    ["Portal de Proveedores", supplier],
    ["Portal Marca Propia", ownBrand],
  ])("separa borrador, consultas aplicadas y URL en %s", (_name, source) => {
    expect(source).toContain("draftFilters");
    expect(source).toContain("appliedFilters");
    expect(source).toContain("useSearch()");
    expect(source).toContain("buildPortalLocation");
    expect(source).toContain("const applyFilters");
    expect(source).toContain("const resetFilters");
    expect(source).toContain("<PortalFilterActions");
    expect(source).toContain("compareFrom");
    expect(source).toContain("compareTo");
    expect(source).toContain("<PortalPeriodComparison");
  });

  it("mantiene IGV como cambio pendiente controlado antes de aplicar", () => {
    for (const source of [supplier, ownBrand]) {
      expect(source).toContain('value={draftFilters.includeIgv}');
      expect(source).toContain('onChange={(value) => updateDraftFilters({ includeIgv: value })}');
    }
    const igvToggle = readSource("client/src/components/IgvToggle.tsx");
    expect(igvToggle).toContain("value?: boolean");
    expect(igvToggle).toContain("onChange?: (value: boolean) => void");
  });

  it("expone acciones explícitas de aplicar y restablecer", () => {
    const actions = readSource("client/src/components/PortalFilterActions.tsx");
    expect(actions).toContain("Aplicar filtros");
    expect(actions).toContain("Restablecer filtros");
    expect(actions).toContain("Cambios pendientes");
  });
});
