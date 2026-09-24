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

describe("Ranking por góndola", () => {
  it("abre el ranking en lugar del modal de reasignación para el rol Gerencia", () => {
    expect(page).toContain('const isManagementUser = userRole === "management_user"');
    expect(page).toContain("const createShelfTarget");
    expect(page).toContain("const openShelfRanking");
    expect(page).toContain("setShelfRankingTarget");
    expect(page).toContain("onClick={isManagementUser ? () => openShelfRanking(actionTarget) : undefined}");
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

  it("mantiene el ranking limitado para perfiles autorizados en servidor", () => {
    expect(router).toContain("getShelfProductRanking");
    expect(router).toContain("limit: z.number().int().min(1).max(200).default(100)");
    expect(router).toContain("buildShelfProductRankingQuery");
    expect(router).not.toContain("Este ranking detallado está disponible para el rol Gerencia.");
  });
});
