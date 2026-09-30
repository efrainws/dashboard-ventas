import { describe, expect, it } from "vitest";
import {
  buildPortalLocation,
  equalStringArrays,
  getPortalSearchParams,
  readBoolean,
  readDateRange,
  readOptionalPositiveInteger,
  readStringList,
} from "../shared/portalFilters";

describe("portalFilters", () => {
  it("serializa solamente filtros aplicados y preserva listas", () => {
    expect(buildPortalLocation("/supplier", {
      from: "2026-09-01",
      to: "2026-09-29",
      supplierId: "supplier-1",
      productIds: ["a", "b"],
      channels: ["Presencial", "Rappi"],
      includeIgv: true,
      branchId: undefined,
    })).toBe("/supplier?from=2026-09-01&to=2026-09-29&supplierId=supplier-1&productIds=a%2Cb&channels=Presencial%2CRappi&includeIgv=1");
  });

  it("valida el rango de fechas y recupera los predeterminados ante parámetros inválidos", () => {
    const defaults = { from: "2026-09-01", to: "2026-09-29" };
    expect(readDateRange(getPortalSearchParams("/supplier?from=2026-09-10&to=2026-09-20"), defaults))
      .toEqual({ from: "2026-09-10", to: "2026-09-20" });
    expect(readDateRange(getPortalSearchParams("/supplier?from=2026-09-20&to=2026-09-10"), defaults))
      .toEqual(defaults);
    expect(readDateRange(getPortalSearchParams("/supplier?from=not-a-date&to=2026-09-10"), defaults))
      .toEqual(defaults);
  });

  it("normaliza listas, booleanos y enteros de la URL", () => {
    const params = getPortalSearchParams("/marca-propia?channels=Rappi%2CPresencial%2CRappi%2Cdesconocido&categoryId=9&igv=0");
    expect(readStringList(params, "channels", ["Presencial", "eCommerce", "Rappi"]))
      .toEqual(["Rappi", "Presencial"]);
    expect(readOptionalPositiveInteger(params, "categoryId")).toBe(9);
    expect(readBoolean(params, "igv", true)).toBe(false);
  });

  it("compara listas de filtros en orden estable", () => {
    expect(equalStringArrays(["a", "b"], ["a", "b"])).toBe(true);
    expect(equalStringArrays(["a", "b"], ["b", "a"])).toBe(false);
  });
});
