import { describe, expect, it } from "vitest";
import {
  buildShelfProductRankingQuery,
  SHELF_PRODUCT_SORTS,
} from "./shelfProductRanking";

describe("buildShelfProductRankingQuery", () => {
  const baseInput = {
    branchSapId: "FF11",
    shelfId: "8e92a3c8-2232-4af2-a0d8-2a1d5d670983",
    fechaMin: "2026-09-01",
    fechaMax: "2026-09-15",
    includeIgv: true,
    sortBy: "amount" as const,
    limit: 100,
  };

  it("agrega por producto y expone monto, unidades y transacciones", () => {
    const { query, params } = buildShelfProductRankingQuery(baseInput);

    expect(query).toContain("SUM(sd.total)");
    expect(query).toContain("SUM(sd.quantity)");
    expect(query).toContain("COUNT(DISTINCT sh.id)");
    expect(query).toContain("GROUP BY sd.product_id, p.int_sku, p.name");
    expect(query).toContain("ORDER BY monto_total DESC NULLS LAST");
    expect(query).toContain("LIMIT $5::int");
    expect(params).toEqual([
      "FF11",
      "2026-09-01",
      "2026-09-15",
      "8e92a3c8-2232-4af2-a0d8-2a1d5d670983",
      "100",
    ]);
  });

  it.each([
    ["amount", "ORDER BY monto_total DESC NULLS LAST"],
    ["quantity", "ORDER BY cantidad_vendida DESC NULLS LAST"],
    ["transactions", "ORDER BY transacciones DESC NULLS LAST"],
  ] as const)("ordena de forma segura por %s", (sortBy, expectedOrder) => {
    const { query } = buildShelfProductRankingQuery({ ...baseInput, sortBy });
    expect(query).toContain(expectedOrder);
  });

  it("mantiene la condición de góndola sin asignar y parametriza categoría", () => {
    const { query, params } = buildShelfProductRankingQuery({
      ...baseInput,
      shelfId: null,
      shelfStatus: "Stock sin góndola",
      categoryId: "aab0a8b1-c11b-4e38-9688-b14a30ccf86b",
      includeIgv: false,
      sortBy: "transactions",
      limit: 50,
    });

    expect(query).toContain("SUM(sd.subtotal)");
    expect(query).toContain("AND st.id IS NOT NULL AND st.shelf_id IS NULL");
    expect(query).toContain("COALESCE(g.id, p2.id, c2.id) = $4::uuid");
    expect(query).toContain("LIMIT $5::int");
    expect(params).toEqual([
      "FF11",
      "2026-09-01",
      "2026-09-15",
      "aab0a8b1-c11b-4e38-9688-b14a30ccf86b",
      "50",
    ]);
  });

  it("declara únicamente los criterios de orden admitidos", () => {
    expect(SHELF_PRODUCT_SORTS).toEqual(["amount", "quantity", "transactions"]);
  });
});
