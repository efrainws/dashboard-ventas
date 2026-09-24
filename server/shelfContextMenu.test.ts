import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canReassignShelfProducts } from "../shared/roleAccess";

const page = readFileSync(
  path.resolve(import.meta.dirname, "../client/src/pages/SalesByShelf.tsx"),
  "utf8",
);
const router = readFileSync(
  path.resolve(import.meta.dirname, "./salesRouter.ts"),
  "utf8",
);

describe("Menú contextual de góndola", () => {
  it("presenta los dos destinos y conserva el menú accesible", () => {
    expect(page).toContain("function ShelfContextActions");
    expect(page).toContain("Acciones de góndola");
    expect(page).toContain("Ver ranking de productos");
    expect(page).toContain("Reasignar artículos");
    expect(page).toContain("aria-label={`Ver opciones para la góndola ${shelfLabel}`}");
  });

  it("conecta el menú a ambos modales y mantiene el acceso directo de Gerencia", () => {
    expect(page).toContain("onOpenRanking={openShelfRanking}");
    expect(page).toContain("onOpenReassignment={openShelfReassignment}");
    expect(page).toContain("onClick={isManagementUser ? () => openShelfRanking(actionTarget) : undefined}");
    expect(page).toContain("setReassignTarget(target)");
  });

  it("muestra la reasignación solo para los roles de escritura existentes", () => {
    expect(canReassignShelfProducts("system_specialist")).toBe(true);
    expect(canReassignShelfProducts("cst_user")).toBe(true);
    expect(canReassignShelfProducts("commercial_specialist")).toBe(true);
    expect(canReassignShelfProducts("management_user")).toBe(true);
    expect(canReassignShelfProducts("store_user")).toBe(false);
    expect(canReassignShelfProducts("own_brand_user")).toBe(false);
    expect(canReassignShelfProducts("supplier_user")).toBe(false);
  });

  it("usa el mismo control de escritura en los endpoints mutables", () => {
    const permissionUses = router.match(/canReassignShelfProducts\(ctx\.user\.role\)/g) ?? [];
    expect(permissionUses).toHaveLength(2);
  });
});
