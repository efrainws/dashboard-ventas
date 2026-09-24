import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCreditNoteTransactionsByCashierQuery } from "./creditNoteQueries";
import { buildTransactionNumberSql } from "./transactionIdentifiers";

const salesRouter = readFileSync(
  path.resolve(import.meta.dirname, "./salesRouter.ts"),
  "utf8",
);
const topCustomers = readFileSync(
  path.resolve(import.meta.dirname, "../client/src/pages/TopCustomers.tsx"),
  "utf8",
);
const sqlInventory = readFileSync(
  path.resolve(import.meta.dirname, "../docs/inventario-consultas-sql.md"),
  "utf8",
);

describe("identificador visible de transacciones", () => {
  it("construye Serie-Número con resguardo para datos históricos incompletos", () => {
    const expression = buildTransactionNumberSql();

    expect(expression).toContain("CONCAT_WS(");
    expect(expression).toContain("NULLIF(sh.order_serial::text, '')");
    expect(expression).toContain("NULLIF(sh.order_number::text, '')");
    expect(expression).toContain("sh.id::text");
  });

  it("reutiliza la misma expresión para documentos de crédito", () => {
    const query = buildCreditNoteTransactionsByCashierQuery(true);

    expect(query).toContain(buildTransactionNumberSql().trim());
    expect(query).toContain("AS numero_transaccion");
  });

  it("devuelve el número completo para el modal de clientes", () => {
    expect(salesRouter).toContain("const transactionNumberSql = buildTransactionNumberSql();");
    expect(salesRouter).toContain("${transactionNumberSql}            AS numero_transaccion");
    expect(salesRouter).toContain("numero_transaccion: row.numero_transaccion ?? '—'");
    expect(salesRouter).not.toContain("sh.order_serial                    AS comprobante");
  });

  it("presenta la misma etiqueta y el mismo valor en la tabla y el detalle", () => {
    expect(topCustomers).toContain("N.° de transacción");
    expect(topCustomers).toContain("numero_transaccion: string;");
    expect(topCustomers.match(/transaction\.numero_transaccion/g)).toHaveLength(1);
    expect(topCustomers.match(/r\.numero_transaccion/g)).toHaveLength(1);
    expect(topCustomers).not.toContain("r.comprobante");
    expect(topCustomers).not.toContain("transaction.comprobante");
  });

  it("documenta el formato Serie-Número en el inventario SQL", () => {
    expect(sqlInventory).toContain("AS numero_transaccion");
    expect(sqlInventory).toContain("NULLIF(sh.order_number::text, '')");
    expect(sqlInventory).not.toContain("sh.order_serial                    AS comprobante");
  });
});
