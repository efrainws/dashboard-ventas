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
      "COALESCE(sh.total, 0)::numeric AS monto_transaccion"
    );
    expect(buildCreditNoteTransactionsByCashierQuery(false)).toContain(
      "COALESCE(sh.subtotal, 0)::numeric AS monto_transaccion"
    );
  });

  it("agrega líneas y unidades por documento, sin devolver el detalle de productos", () => {
    const query = buildCreditNoteTransactionsByCashierQuery(true);

    expect(query).toContain("COALESCE(SUM(sd.quantity), 0)::numeric AS cantidad_total_transaccion");
    expect(query).toContain("COUNT(sd.id) AS total_lineas_producto");
    expect(query).toContain("GROUP BY");
    expect(query).not.toContain("AS producto_nombre");
  });

  it("compone el identificador visible con serie y número separados por un guion", () => {
    const query = buildCreditNoteTransactionsByCashierQuery(true);

    expect(query).toContain("CONCAT_WS(");
    expect(query).toContain("NULLIF(sh.order_serial::text, '')");
    expect(query).toContain("NULLIF(sh.order_number::text, '')");
    expect(query).toContain("sh.order_number,");
  });
});
