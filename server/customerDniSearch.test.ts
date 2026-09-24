import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applySalesStoreScope } from "./_core/trpc";
import { buildCustomerByDniQuery } from "./customerDniSearch";

const topCustomers = readFileSync(
  path.resolve(import.meta.dirname, "../client/src/pages/TopCustomers.tsx"),
  "utf8",
);
const salesRouter = readFileSync(
  path.resolve(import.meta.dirname, "./salesRouter.ts"),
  "utf8",
);

describe("búsqueda directa de clientes por DNI", () => {
  it("usa una coincidencia exacta sobre el DNI indexado y limita resultados", () => {
    const { query, params } = buildCustomerByDniQuery({
      dni: "12345678",
      fechaMin: "2026-09-01",
      fechaMax: "2026-09-15",
    });

    expect(query).toContain("WHERE c.ruc_dni = $1");
    expect(query).toContain("AND EXISTS");
    expect(query).toContain("LIMIT 2");
    expect(query).not.toContain("ILIKE");
    expect(params).toEqual(["12345678", "2026-09-01", "2026-09-15"]);
  });

  it("propaga los filtros de tienda y canal dentro de las ventas elegibles", () => {
    const { query, params } = buildCustomerByDniQuery({
      dni: "12345678",
      fechaMin: "2026-09-01",
      fechaMax: "2026-09-15",
      branchSapId: "FF11",
      salesChannel: "Rappi",
    });

    expect(query).toContain("b.sap_id = $4");
    expect(query).toContain("payment_account_id");
    expect(query).toContain("= $5");
    expect(params).toEqual(["12345678", "2026-09-01", "2026-09-15", "FF11", "Rappi"]);
  });

  it("mantiene el alcance de la sucursal de un usuario tienda", () => {
    const input = applySalesStoreScope({
      dni: "12345678",
      fecha_min: "2026-09-01",
      fecha_max: "2026-09-15",
      branch_sap_id: "FF99",
    }, {
      role: "store_user",
      assignedStoreCode: "FF11",
    });

    expect(input).toMatchObject({ branch_sap_id: "FF11" });
  });

  it("valida ocho dígitos y muestra estados de búsqueda en la interfaz", () => {
    expect(salesRouter).toContain('dni: z.string().regex(/^\\d{8}$/');
    expect(salesRouter).toContain("getCustomerByDni");
    expect(topCustomers).toContain("trpc.sales.getCustomerByDni.useQuery");
    expect(topCustomers).toContain('placeholder="DNI de 8 dígitos"');
    expect(topCustomers).toContain("No se encontraron ventas para este DNI con los filtros actuales.");
    expect(topCustomers).toContain("No se pudo completar la búsqueda por DNI. Inténtalo nuevamente.");
    expect(topCustomers).toContain("setSelectedCustomer(customer)");
  });
});
