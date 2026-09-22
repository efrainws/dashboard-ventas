import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("vistas de Top Productos", () => {
  it("prioriza tarjetas por tienda y limita la consulta apropiada por vista", () => {
    const page = source("client/src/pages/TopProducts.tsx");

    expect(page).toContain('useState<"cards" | "table">("cards")');
    expect(page).toContain('useState<20 | 50>(20)');
    expect(page).toContain('useState<50 | 100>(50)');
    expect(page).toContain('const activeViewMode = isStoreUser ? "table" : viewMode;');
    expect(page).toContain("trpc.sales.getTopProductsByStore.useQuery");
    expect(page).toContain('enabled: !authLoading && activeViewMode === "cards"');
    expect(page).toContain("trpc.sales.getTopProducts.useQuery");
    expect(page).toContain('enabled: !authLoading && activeViewMode === "table"');
    expect(page).toContain("TopProductsStoreCards");
  });

  it("ofrece los límites solicitados para cada vista", () => {
    const page = source("client/src/pages/TopProducts.tsx");
    const router = source("server/salesRouter.ts");

    expect(page).toContain('value="20">Top 20</SelectItem>');
    expect(page).toContain('value="50">Top 50</SelectItem>');
    expect(page).toContain('value="100">Top 100</SelectItem>');
    expect(page).toContain("Tarjetas por tienda");
    expect(page).toContain("Tabla general");
    expect(router).toContain('limit: z.union([z.literal(50), z.literal(100)]).default(50)');
    expect(router).toContain("LIMIT $${limitParameter};");
    expect(router).toContain("pool.query(query, queryParams)");
  });

  it("mantiene las tarjetas compactas y entrega el resto de detalles en un tooltip", () => {
    const cards = source("client/src/components/TopProductsStoreCards.tsx");

    expect(cards).toContain("Top {limit} productos por tienda");
    expect(cards).toContain("product.productName");
    expect(cards).toContain("formatCurrency(product.totalAmount)");
    expect(cards).toContain("<ProductMetricsTooltip product={product} />");
    ["SKU:", "Posición", "Unidades", "Stock", "Venta diaria", "Cobertura"].forEach((detail) => {
      expect(cards).toContain(detail);
    });
  });

  it("renombra la página y sus rutas de descubrimiento", () => {
    const page = source("client/src/pages/TopProducts.tsx");
    const navigation = source("client/src/components/NavigationMenu.tsx");
    const home = source("client/src/pages/Home.tsx");

    expect(page).toContain("Top Productos");
    expect(navigation).toContain("Top Productos");
    expect(home).toContain('title: "Top productos"');
    expect(navigation).not.toContain("Top 50 Productos");
  });
});
