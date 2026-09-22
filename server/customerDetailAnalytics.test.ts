import { describe, expect, it } from "vitest";
import {
  buildCustomerDistributionsQuery,
  buildCustomerTopProductsQuery,
  mapCustomerDistributions,
  mapCustomerTopProducts,
} from "./customerDetailAnalytics";

const baseInput = {
  customerId: "af1ad1f1-fafe-4f1d-9bbd-555555555555",
  fechaMin: "2026-08-01",
  fechaMax: "2026-08-31",
  includeIgv: true,
};

describe("agregaciones de detalle de cliente", () => {
  it("filtra primero las cabeceras y parametriza los filtros del gráfico", () => {
    const built = buildCustomerDistributionsQuery({
      ...baseInput,
      branchSapId: "FF01",
      salesChannel: "Rappi",
    });

    expect(built.params).toEqual([
      baseInput.customerId,
      baseInput.fechaMin,
      baseInput.fechaMax,
      "FF01",
      "Rappi",
    ]);
    expect(built.query).toContain("header_scope AS");
    expect(built.query).toContain("filtered_headers AS");
    expect(built.query).toContain("INNER JOIN public.sales_detail sd ON sd.header_id = fh.id");
    expect(built.query).toContain("b.sap_id = $4");
    expect(built.query).toContain("WHERE sales_channel = $5");
    expect(built.query).toContain("COUNT(DISTINCT header_id)::int AS transactions");
    expect(built.query).not.toContain(baseInput.customerId);
  });

  it("limita en PostgreSQL el ranking de productos por unidades", () => {
    const built = buildCustomerTopProductsQuery({
      ...baseInput,
      includeIgv: false,
      salesChannel: "eCommerce",
      limit: 50,
    });

    expect(built.params).toEqual([
      baseInput.customerId,
      baseInput.fechaMin,
      baseInput.fechaMax,
      "eCommerce",
      50,
    ]);
    expect(built.query).toContain("sd.subtotal");
    expect(built.query).toContain("COALESCE(p.int_sku::text, '—') AS sku");
    expect(built.query).toContain("ORDER BY quantity DESC, sales_amount DESC, product_name ASC");
    expect(built.query).toContain("LIMIT $5");
  });

  it("normaliza distribuciones y productos a números seguros para la interfaz", () => {
    expect(
      mapCustomerDistributions({
        stores: [{ id: "FF01", name: "La Mar", sales_amount: "1234.50", transactions: "4" }],
        departments: JSON.stringify([
          { id: "D1", name: "Alimentos", sales_amount: 200, transactions: 2 },
        ]),
      })
    ).toEqual({
      stores: [{ id: "FF01", name: "La Mar", salesAmount: 1234.5, transactions: 4 }],
      departments: [{ id: "D1", name: "Alimentos", salesAmount: 200, transactions: 2 }],
    });

    expect(
      mapCustomerTopProducts([
        { product_id: "P1", product_name: "Producto", sku: "SKU-1", quantity: "3", sales_amount: "39.90", transactions: "2" },
      ])
    ).toEqual([
      { productId: "P1", productName: "Producto", sku: "SKU-1", quantity: 3, salesAmount: 39.9, transactions: 2 },
    ]);
  });
});
