import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_SCOPE_ROLES,
  hasCommercialOrSystemScope,
  hasCommercialScope,
  MANAGEMENT_ROLE,
} from "../shared/roleAccess";

const root = path.resolve(import.meta.dirname, "..");
const source = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("Rol Gerencia", () => {
  it("comparte el grupo de alcance comercial sin heredar privilegios de sistema", () => {
    expect(MANAGEMENT_ROLE).toBe("management_user");
    expect(COMMERCIAL_SCOPE_ROLES).toEqual(["commercial_specialist", "management_user"]);
    expect(hasCommercialScope("commercial_specialist")).toBe(true);
    expect(hasCommercialScope("management_user")).toBe(true);
    expect(hasCommercialScope("system_specialist")).toBe(false);
    expect(hasCommercialOrSystemScope("system_specialist")).toBe(true);
    expect(hasCommercialOrSystemScope("management_user")).toBe(true);
    expect(hasCommercialOrSystemScope("store_user")).toBe(false);
  });

  it("declara Gerencia en el esquema, contratos y migración", () => {
    expect(source("drizzle/schema.ts")).toContain('"management_user"');
    expect(source("drizzle/0024_special_black_crow.sql")).toContain("'management_user'");
    expect(source("server/userRouter.ts")).toContain("management_user: 'Gerencia'");
    expect(source("client/src/pages/UserManagement.tsx")).toContain("management_user: 'Gerencia'");
  });

  it("mantiene la paridad de acceso comercial en los módulos protegidos", () => {
    const protectedSources = [
      "server/_core/trpc.ts",
      "server/supplierPortalRouter.ts",
      "server/ownBrandRouter.ts",
      "server/ownBrandCategoriesRouter.ts",
      "server/supplierTrialRouter.ts",
      "server/activationRouter.ts",
      "server/salesRouter.ts",
      "client/src/App.tsx",
      "client/src/components/NavigationMenu.tsx",
      "client/src/pages/SupplierPortal.tsx",
      "client/src/pages/SupplierMonitor.tsx",
      "client/src/pages/AffiliationReport.tsx",
      "client/src/pages/OwnBrandPortal.tsx",
      "client/src/pages/SalesByShelf.tsx",
      "client/src/pages/SalesVsTarget.tsx",
    ];

    for (const file of protectedSources) {
      const content = source(file);
      expect(
        content.includes("management_user") || content.includes("hasCommercialScope") || content.includes("hasCommercialOrSystemScope"),
        file,
      ).toBe(true);
    }
  });
});
