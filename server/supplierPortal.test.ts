/**
 * Tests para el supplierPortalRouter.
 *
 * Verifica:
 * 1. Que los endpoints requieren autenticación.
 * 2. Que supplier_user sin assigned_supplier_id recibe BAD_REQUEST.
 * 3. Que roles no autorizados reciben FORBIDDEN.
 * 4. Que supplier_user con proveedor asignado puede acceder.
 */

import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: null,
    username: "testuser",
    password: null,
    name: "Test User",
    email: "test@example.com",
    loginMethod: "local",
    role: "supplier_user",
    assignedStoreCode: null,
    assignedSupplierId: "3b8f3e24-28b3-4096-9c66-d125a29a7ddd",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function makeCtx(user: User | null = null): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: () => {},
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("SupplierPortal — Autenticación requerida", () => {
  it("getMySupplier lanza UNAUTHORIZED si no hay usuario", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.supplierPortal.getMySupplier()).rejects.toThrow();
  });

  it("getSalesSummary lanza UNAUTHORIZED si no hay usuario", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.supplierPortal.getSalesSummary({})).rejects.toThrow();
  });

  it("getDailySales lanza UNAUTHORIZED si no hay usuario", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.supplierPortal.getDailySales({})).rejects.toThrow();
  });
});

describe("SupplierPortal — Control de acceso por rol", () => {
  it("store_user recibe FORBIDDEN en getMySupplier", async () => {
    const user = makeUser({ role: "store_user", assignedSupplierId: null, assignedStoreCode: "FF01" });
    const caller = appRouter.createCaller(makeCtx(user));
    await expect(caller.supplierPortal.getMySupplier()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("cst_user recibe FORBIDDEN en getMySupplier", async () => {
    const user = makeUser({ role: "cst_user", assignedSupplierId: null });
    const caller = appRouter.createCaller(makeCtx(user));
    await expect(caller.supplierPortal.getMySupplier()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("commercial_specialist sin proveedor seleccionado recibe BAD_REQUEST (debe seleccionar proveedor)", async () => {
    const user = makeUser({ role: "commercial_specialist", assignedSupplierId: null });
    const caller = appRouter.createCaller(makeCtx(user));
    // commercial_specialist tiene acceso al portal pero debe seleccionar un proveedor
    await expect(caller.supplierPortal.getMySupplier()).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("SupplierPortal — Validación de proveedor asignado", () => {
  it("supplier_user sin assignedSupplierId recibe BAD_REQUEST en getMySupplier", async () => {
    const user = makeUser({ role: "supplier_user", assignedSupplierId: null });
    const caller = appRouter.createCaller(makeCtx(user));
    await expect(caller.supplierPortal.getMySupplier()).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("supplier_user sin assignedSupplierId recibe BAD_REQUEST en getSalesSummary", async () => {
    const user = makeUser({ role: "supplier_user", assignedSupplierId: null });
    const caller = appRouter.createCaller(makeCtx(user));
    await expect(caller.supplierPortal.getSalesSummary({})).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("supplier_user sin assignedSupplierId recibe BAD_REQUEST en getTopProducts", async () => {
    const user = makeUser({ role: "supplier_user", assignedSupplierId: null });
    const caller = appRouter.createCaller(makeCtx(user));
    await expect(caller.supplierPortal.getTopProducts({})).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("SupplierPortal — Acceso correcto para supplier_user con proveedor", () => {
  it("supplier_user con proveedor asignado puede llamar getMySupplier (no FORBIDDEN/BAD_REQUEST)", async () => {
    const user = makeUser({
      role: "supplier_user",
      assignedSupplierId: "3b8f3e24-28b3-4096-9c66-d125a29a7ddd",
    });
    const caller = appRouter.createCaller(makeCtx(user));
    // Puede fallar por DB en test, pero no por FORBIDDEN ni BAD_REQUEST
    try {
      await caller.supplierPortal.getMySupplier();
    } catch (err: any) {
      expect(err.code).not.toBe("FORBIDDEN");
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  });

  it("supplier_user con proveedor asignado puede llamar getSalesSummary (no FORBIDDEN)", async () => {
    const user = makeUser({
      role: "supplier_user",
      assignedSupplierId: "3b8f3e24-28b3-4096-9c66-d125a29a7ddd",
    });
    const caller = appRouter.createCaller(makeCtx(user));
    try {
      await caller.supplierPortal.getSalesSummary({});
    } catch (err: any) {
      expect(err.code).not.toBe("FORBIDDEN");
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  });

  it("system_specialist puede acceder al portal de proveedor pasando supplierId como parámetro", async () => {
    const user = makeUser({
      role: "system_specialist",
      assignedSupplierId: null, // system_specialist no tiene supplier asignado en DB
    });
    const caller = appRouter.createCaller(makeCtx(user));
    try {
      // El system_specialist pasa el supplierId como parámetro de input
      await caller.supplierPortal.getMySupplier({ supplierId: "3b8f3e24-28b3-4096-9c66-d125a29a7ddd" });
    } catch (err: any) {
      // No debe fallar por FORBIDDEN ni por BAD_REQUEST (puede fallar por NOT_FOUND si el ID no existe)
      expect(err.code).not.toBe("FORBIDDEN");
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  });
});

describe("SupplierPortal — Paginación y búsqueda", () => {
  it("getStockByProduct acepta parámetros de paginación válidos", async () => {
    const user = makeUser({
      role: "supplier_user",
      assignedSupplierId: "3b8f3e24-28b3-4096-9c66-d125a29a7ddd",
    });
    const caller = appRouter.createCaller(makeCtx(user));
    try {
      await caller.supplierPortal.getStockByProduct({ limit: 10, offset: 0 });
    } catch (err: any) {
      expect(err.code).not.toBe("FORBIDDEN");
    }
  });

  it("getProductCatalog acepta búsqueda por texto", async () => {
    const user = makeUser({
      role: "supplier_user",
      assignedSupplierId: "3b8f3e24-28b3-4096-9c66-d125a29a7ddd",
    });
    const caller = appRouter.createCaller(makeCtx(user));
    try {
      await caller.supplierPortal.getProductCatalog({ search: "yumbox", limit: 5, offset: 0 });
    } catch (err: any) {
      expect(err.code).not.toBe("FORBIDDEN");
    }
  });
});

describe("SupplierPortal — Bug fix: getStockByProduct no usa b.active (columna inexistente)", () => {
  it("commercial_specialist con supplierId puede llamar getStockByProduct sin error de columna", async () => {
    const user = makeUser({
      role: "commercial_specialist",
      assignedSupplierId: null,
    });
    const caller = appRouter.createCaller(makeCtx(user));
    try {
      // Pasa supplierId como override (como lo hace el frontend para admin roles)
      await caller.supplierPortal.getStockByProduct({
        supplierId: "0a307477-19f1-414d-b87c-9f5f850733b7",
        productId: "6637ec1d-2019-485c-ad31-fe225f22170d",
        limit: 20,
        offset: 0,
      });
    } catch (err: any) {
      // No debe fallar con INTERNAL_SERVER_ERROR por columna inexistente
      expect(err.code).not.toBe("INTERNAL_SERVER_ERROR");
      expect(err.code).not.toBe("FORBIDDEN");
      expect(err.code).not.toBe("BAD_REQUEST");
    }
  });

  it("system_specialist puede llamar getStockByProduct con supplierId y recibir resultados", async () => {
    const user = makeUser({
      role: "system_specialist",
      assignedSupplierId: null,
    });
    const caller = appRouter.createCaller(makeCtx(user));
    try {
      const result = await caller.supplierPortal.getStockByProduct({
        supplierId: "0a307477-19f1-414d-b87c-9f5f850733b7",
        productId: "6637ec1d-2019-485c-ad31-fe225f22170d",
        limit: 20,
        offset: 0,
      });
      // Si la query funciona, debe retornar un array (puede estar vacío si el proveedor no existe)
      expect(Array.isArray(result.rows)).toBe(true);
    } catch (err: any) {
      // No debe ser INTERNAL_SERVER_ERROR
      expect(err.code).not.toBe("INTERNAL_SERVER_ERROR");
    }
  });
});
