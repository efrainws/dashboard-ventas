import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const topCustomersSource = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/TopCustomers.tsx"),
  "utf8"
);

describe("modal de detalle de Top Clientes", () => {
  it("conserva el resumen únicamente en el pie de la tabla", () => {
    expect(topCustomersSource).not.toContain("!selectedTxn && (");
    expect(topCustomersSource).toContain("Total ({rows.length} transacciones)");
    expect(topCustomersSource).toContain("S/ {fmtCurrency(totalMonto)}");
  });

  it("reserva una altura de viewport y un área de transacciones desplazable", () => {
    expect(topCustomersSource).toContain('h-[min(90dvh,56rem)]');
    expect(topCustomersSource).toContain('max-h-[calc(100dvh-2rem)]');
    expect(topCustomersSource).toContain('overflow-y-auto overscroll-contain');
    expect(topCustomersSource).toContain('aria-label="Lista de transacciones del cliente"');
  });
});
