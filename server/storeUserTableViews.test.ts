import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("vistas por tienda para store_user", () => {
  it("fuerza la tabla y evita las consultas de tarjetas en los rankings", () => {
    const topProducts = source("client/src/pages/TopProducts.tsx");
    const topCustomers = source("client/src/pages/TopCustomers.tsx");

    for (const page of [topProducts, topCustomers]) {
      expect(page).toContain('const activeViewMode = isStoreUser ? "table" : viewMode;');
      expect(page).toContain("!isStoreUser && (");
      expect(page).toContain('activeViewMode === "table"');
      expect(page).toContain('activeViewMode === "cards"');
    }

    expect(topProducts).toContain('enabled: !authLoading && activeViewMode === "cards"');
    expect(topCustomers).toContain('enabled: !authLoading && activeViewMode === "cards"');
  });

  it("presenta detalle por tienda en tablas operativas para store_user", () => {
    const identifiedTransactions = source("client/src/pages/IdentifiedTransactions.tsx");
    const creditNotes = source("client/src/pages/CreditNotes.tsx");
    const salesVsTarget = source("client/src/pages/SalesVsTarget.tsx");

    expect(identifiedTransactions).toContain('isStoreUser ? (');
    expect(identifiedTransactions).toContain("Ver cajeros");
    expect(identifiedTransactions).toContain("Identificación");

    expect(creditNotes).toContain('isStoreUser ? (');
    expect(creditNotes).toContain("Notas de crédito");
    expect(creditNotes).toContain("NC / ventas");

    expect(salesVsTarget).toContain("!isStoreUser && !isLoading && totals");
    expect(salesVsTarget).toContain('data?.stores && data.stores.length > 0 ? isStoreUser ? (');
    expect(salesVsTarget).toContain("Cumplimiento de tu tienda");
  });
});
