import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) =>
  readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("analíticas en el modal de Top Clientes", () => {
  it("conecta las tres consultas del detalle antes de la tabla de transacciones", () => {
    const page = source("client/src/pages/TopCustomers.tsx");
    const analyticsIndex = page.indexOf("<CustomerDetailAnalytics");
    const transactionTableIndex = page.indexOf("Haz clic en una fila para ver el detalle de artículos.");

    expect(page).toContain("trpc.sales.getCustomerDetailAnalytics.useQuery");
    expect(page).toContain("trpc.sales.getCustomerTopProducts.useQuery");
    expect(analyticsIndex).toBeGreaterThan(-1);
    expect(analyticsIndex).toBeLessThan(transactionTableIndex);
    expect(page).toContain('width: "min(95vw, 1240px)"');
  });

  it("ofrece métricas intercambiables y límites de Top 10, 20, 50 y 100", () => {
    const component = source("client/src/components/CustomerDetailAnalytics.tsx");

    expect(component).toContain("Distribución por tienda");
    expect(component).toContain("Distribución por departamento");
    expect(component).toContain("Productos más comprados");
    expect(component).toContain("Transacciones");
    ["10", "20", "50", "100"].forEach((limit) => {
      expect(component).toContain(`value=\"${limit}\"`);
    });
    expect(component).toContain("max-h-80 overflow-auto");
  });
});
