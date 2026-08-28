import { describe, expect, it } from "vitest";
import { buildCreditNoteTransactionsByCashierQuery } from "./creditNoteQueries";

describe("buildCreditNoteTransactionsByCashierQuery", () => {
  it("usa parámetros enlazados para fecha, tienda y cajero", () => {
    const query = buildCreditNoteTransactionsByCashierQuery(true);

    expect(query).toContain("sh.doc_date >= $1::date");
    expect(query).toContain("sh.doc_date < ($2::date + INTERVAL '1 day')");
    expect(query).toContain("branch.sap_id = $3");
    expect(query).toContain("sh.cashier_id IS NOT DISTINCT FROM $4::uuid");
  });

  it("selecciona los importes con IGV o sin IGV de forma consistente", () => {
    expect(buildCreditNoteTransactionsByCashierQuery(true)).toContain(
      "COALESCE(sd.total, 0)::numeric AS monto_producto"
    );
    expect(buildCreditNoteTransactionsByCashierQuery(true)).toContain(
      "COALESCE(sh.total, 0)::numeric AS monto_transaccion"
    );
    expect(buildCreditNoteTransactionsByCashierQuery(false)).toContain(
      "COALESCE(sd.subtotal, 0)::numeric AS monto_producto"
    );
    expect(buildCreditNoteTransactionsByCashierQuery(false)).toContain(
      "COALESCE(sh.subtotal, 0)::numeric AS monto_transaccion"
    );
  });
});
