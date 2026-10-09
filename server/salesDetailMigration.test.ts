import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (file: string) => readFileSync(resolve(process.cwd(), "server", file), "utf8");

describe("migración de módulos de Ventas a sales_detail", () => {
  it.each([
    ["salesRouter.ts", "Análisis General, Horas, Top Productos y Góndolas"],
    ["targetsRouter.ts", "Ventas vs Meta"],
    ["categoryAnalysisRouter.ts", "Análisis por Categorías"],
    ["topProductsByStore.ts", "Tarjetas de Top Productos"],
    ["shelfProductRanking.ts", "Ranking de Góndola"],
    ["shelfComparisonRouter.ts", "Comparativo de Góndola"],
  ])("usa dimensions de sales_detail en %s (%s)", (file) => {
    const content = source(file);
    expect(content).toContain("salesDetailBranchJoin");
    expect(content).toContain("sales_detail sd");
  });

  it("usa costing_code3 para los canales de Ventas vs Meta", () => {
    const content = source("targetsRouter.ts");
    expect(content).toContain("BTRIM(sd.costing_code3) = 'CF'");
    expect(content).toContain("BTRIM(sd.costing_code3) = 'ECM'");
    expect(content).toContain("BTRIM(sd.costing_code3) = 'UMI'");
    expect(content).not.toContain("methods_payment mp_ch");
  });

  it("mantiene los módulos explícitamente excluidos con sales_header", () => {
    const content = source("salesRouter.ts");
    expect(content).toContain("getTopCustomers");
    expect(content).toContain("getCustomerTransactions");
    expect(content).toContain("FROM public.sales_header sh");
  });
});
