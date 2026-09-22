import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  path.resolve(import.meta.dirname, "../client/src/pages/SalesByShelf.tsx"),
  "utf8",
);
const router = readFileSync(
  path.resolve(import.meta.dirname, "./salesRouter.ts"),
  "utf8",
);

describe("Ranking por góndola para Gerencia", () => {
  it("abre el ranking en lugar del modal de reasignación para el rol Gerencia", () => {
    expect(page).toContain('const isManagementUser = userRole === "management_user"');
    expect(page).toContain("const openShelfDetails");
    expect(page).toContain("setShelfRankingTarget");
    expect(page).toContain("isManagementUser ? 'Clic para ver el ranking de productos'");
  });

  it("expone las tres métricas y controles de orden requeridos", () => {
    expect(page).toContain("SHELF_RANKING_SORT_OPTIONS");
    expect(page).toContain("value: 'amount'");
    expect(page).toContain("value: 'quantity'");
    expect(page).toContain("value: 'transactions'");
    expect(page).toContain(">Monto</TableHead>");
    expect(page).toContain(">Unidades</TableHead>");
    expect(page).toContain(">Transacciones</TableHead>");
  });

  it("mantiene el ranking limitado y exclusivo para Gerencia en servidor", () => {
    expect(router).toContain("getShelfProductRanking");
    expect(router).toContain("ctx.user.role !== 'management_user'");
    expect(router).toContain("limit: z.number().int().min(1).max(200).default(100)");
    expect(router).toContain("buildShelfProductRankingQuery");
  });
});
