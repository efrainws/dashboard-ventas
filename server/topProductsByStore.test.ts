import { describe, expect, it } from "vitest";
import {
  buildTopProductsByStoreQuery,
  mapTopProductsByStore,
} from "./topProductsByStore";

const baseInput = {
  fechaMin: "2026-08-01",
  fechaMax: "2026-08-31",
  includeIgv: true,
  limit: 20 as const,
};

describe("Top Productos por tienda", () => {
  it("agrega, ordena y limita cada tienda dentro de PostgreSQL", () => {
    const built = buildTopProductsByStoreQuery({
      ...baseInput,
      branchSapId: "FF01",
      categoryId: "a0d463b1-4f99-4d1f-9251-6e2ad7a78e71",
    });

    expect(built.params).toEqual([
      baseInput.fechaMin,
      baseInput.fechaMax,
      "FF01",
      "a0d463b1-4f99-4d1f-9251-6e2ad7a78e71",
      20,
    ]);
    expect(built.query).toContain("ROW_NUMBER() OVER");
    expect(built.query).toContain("PARTITION BY branch_sap_id");
    expect(built.query).toContain("ORDER BY SUM(amount) DESC, SUM(quantity) DESC");
    expect(built.query).toContain("WHERE ranked_products.rank <= $5");
    expect(built.query).toContain("INNER JOIN public.sales_detail sd ON sd.header_id = sh.id");
    expect(built.query).toContain("FROM active_branches");
    expect(built.query).toContain("b.sap_id = $3");
    expect(built.query).toContain("= $4::uuid");
    expect(built.query).not.toContain("FF01");
  });

  it("elige subtotal al calcular tarjetas sin IGV", () => {
    const built = buildTopProductsByStoreQuery({
      ...baseInput,
      includeIgv: false,
      limit: 50,
    });

    expect(built.params).toEqual([baseInput.fechaMin, baseInput.fechaMax, 50]);
    expect(built.query).toContain("sd.subtotal AS amount");
    expect(built.query).toContain("WHERE ranked_products.rank <= $3");
  });

  it("normaliza filas de PostgreSQL para la interfaz", () => {
    expect(mapTopProductsByStore([{
      branch_sap_id: "FF01",
      branch_name: "La Mar",
      rank: "2",
      product_id: "P-01",
      product_name: "Granola",
      sku: "5001",
      category_name: "Alimentos",
      total_qty: "8.50",
      total_amount: "125.20",
      total_stock: "14",
      avg_daily_qty: "0.28",
      coverage_days: "50.0",
    }])).toEqual([{
      branchSapId: "FF01",
      branchName: "La Mar",
      rank: 2,
      productId: "P-01",
      productName: "Granola",
      sku: "5001",
      categoryName: "Alimentos",
      totalQty: 8.5,
      totalAmount: 125.2,
      totalStock: 14,
      avgDailyQty: 0.28,
      coverageDays: 50,
    }]);
  });
});
