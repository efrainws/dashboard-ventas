import { describe, expect, it } from "vitest";
import {
  SALES_DETAIL_CHANNELS,
  salesDetailBranchJoin,
  salesDetailBranchName,
  salesDetailChannelCase,
} from "./salesDetailDimensions";

describe("salesDetailDimensions", () => {
  it("clasifica exclusivamente los códigos de canal aprobados", () => {
    expect(SALES_DETAIL_CHANNELS).toEqual([
      "Presencial",
      "eCommerce",
      "Rappi",
      "Sin clasificar",
    ]);

    const sql = salesDetailChannelCase("line");
    expect(sql).toContain("line.costing_code3");
    expect(sql).toContain("WHEN 'CF' THEN 'Presencial'");
    expect(sql).toContain("WHEN 'ECM' THEN 'eCommerce'");
    expect(sql).toContain("WHEN 'UMI' THEN 'Rappi'");
    expect(sql).toContain("ELSE 'Sin clasificar'");
  });

  it("resuelve tienda por costing_code contra el SAP de branches", () => {
    expect(salesDetailBranchJoin("line", "store")).toContain(
      "BTRIM(store.sap_id) = BTRIM(line.costing_code)",
    );
    expect(salesDetailBranchName("store")).toContain("Tienda sin equivalencia");
  });
});
