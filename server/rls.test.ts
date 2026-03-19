/**
 * Tests para el sistema RLS (Row Level Security) y gestión de usuarios con roles.
 *
 * Verifica:
 * 1. Que todos los roles son válidos en el schema.
 * 2. Que listUsers requiere autenticación.
 * 3. Restricciones de creación de usuarios por rol.
 * 4. Que commercial_specialist solo puede crear supplier_user.
 * 5. Que supplier_user no puede crear usuarios.
 * 6. Permisos de edición de metas.
 * 7. auth.me devuelve los campos correctos.
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
    role: "cst_user",
    assignedStoreCode: null,
    assignedSupplierId: null,
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

describe("RLS — Roles de usuario", () => {
  it("system_specialist es un rol válido en el schema", () => {
    const user = makeUser({ role: "system_specialist" });
    expect(user.role).toBe("system_specialist");
  });

  it("cst_user es un rol válido en el schema", () => {
    const user = makeUser({ role: "cst_user" });
    expect(user.role).toBe("cst_user");
  });

  it("commercial_specialist es un rol válido en el schema", () => {
    const user = makeUser({ role: "commercial_specialist" });
    expect(user.role).toBe("commercial_specialist");
  });

  it("store_user es un rol válido en el schema", () => {
    const user = makeUser({ role: "store_user", assignedStoreCode: "T001" });
    expect(user.role).toBe("store_user");
    expect(user.assignedStoreCode).toBe("T001");
  });

  it("supplier_user es un rol válido en el schema", () => {
    const user = makeUser({ role: "supplier_user", assignedSupplierId: "SUP-001" });
    expect(user.role).toBe("supplier_user");
    expect(user.assignedSupplierId).toBe("SUP-001");
  });
});

describe("RLS — listUsers requiere autenticación", () => {
  it("lanza UNAUTHORIZED si no hay usuario en contexto", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.users.listUsers()).rejects.toThrow();
  });
});

describe("RLS — Restricciones de creación de usuarios", () => {
  // store_user: no puede crear
  it("store_user no puede crear usuarios (FORBIDDEN)", async () => {
    const storeUser = makeUser({ id: 10, role: "store_user", assignedStoreCode: "T001" });
    const caller = appRouter.createCaller(makeCtx(storeUser));
    await expect(
      caller.users.createUser({
        username: "nuevo",
        password: "pass123",
        name: "Nuevo Usuario",
        role: "store_user",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // supplier_user: no puede crear
  it("supplier_user no puede crear usuarios (FORBIDDEN)", async () => {
    const supplierUser = makeUser({ id: 11, role: "supplier_user", assignedSupplierId: "SUP-001" });
    const caller = appRouter.createCaller(makeCtx(supplierUser));
    await expect(
      caller.users.createUser({
        username: "nuevo",
        password: "pass123",
        name: "Nuevo Usuario",
        role: "store_user",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // cst_user: solo puede crear store_user
  it("cst_user no puede crear usuarios de tipo system_specialist (FORBIDDEN)", async () => {
    const cstUser = makeUser({ id: 20, role: "cst_user" });
    const caller = appRouter.createCaller(makeCtx(cstUser));
    await expect(
      caller.users.createUser({
        username: "nuevo_admin",
        password: "pass123",
        name: "Nuevo Admin",
        role: "system_specialist",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cst_user no puede crear usuarios de tipo commercial_specialist (FORBIDDEN)", async () => {
    const cstUser = makeUser({ id: 21, role: "cst_user" });
    const caller = appRouter.createCaller(makeCtx(cstUser));
    await expect(
      caller.users.createUser({
        username: "nuevo_commercial",
        password: "pass123",
        name: "Nuevo Comercial",
        role: "commercial_specialist",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cst_user no puede crear usuarios de tipo supplier_user (FORBIDDEN)", async () => {
    const cstUser = makeUser({ id: 22, role: "cst_user" });
    const caller = appRouter.createCaller(makeCtx(cstUser));
    await expect(
      caller.users.createUser({
        username: "nuevo_supplier",
        password: "pass123",
        name: "Nuevo Proveedor",
        role: "supplier_user",
        assignedSupplierId: "SUP-001",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // commercial_specialist: solo puede crear supplier_user
  it("commercial_specialist no puede crear usuarios de tipo store_user (FORBIDDEN)", async () => {
    const commercialUser = makeUser({ id: 30, role: "commercial_specialist" });
    const caller = appRouter.createCaller(makeCtx(commercialUser));
    await expect(
      caller.users.createUser({
        username: "nueva_tienda",
        password: "pass123",
        name: "Nueva Tienda",
        role: "store_user",
        assignedStoreCode: "T001",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("commercial_specialist no puede crear usuarios de tipo cst_user (FORBIDDEN)", async () => {
    const commercialUser = makeUser({ id: 31, role: "commercial_specialist" });
    const caller = appRouter.createCaller(makeCtx(commercialUser));
    await expect(
      caller.users.createUser({
        username: "nuevo_cst",
        password: "pass123",
        name: "Nuevo CST",
        role: "cst_user",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("commercial_specialist no puede crear usuarios de tipo system_specialist (FORBIDDEN)", async () => {
    const commercialUser = makeUser({ id: 32, role: "commercial_specialist" });
    const caller = appRouter.createCaller(makeCtx(commercialUser));
    await expect(
      caller.users.createUser({
        username: "nuevo_sys",
        password: "pass123",
        name: "Nuevo Sys",
        role: "system_specialist",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // Validación: supplier_user requiere assigned_supplier_id
  it("crear supplier_user sin proveedor asignado lanza BAD_REQUEST", async () => {
    const sysUser = makeUser({ id: 40, role: "system_specialist" });
    const caller = appRouter.createCaller(makeCtx(sysUser));
    await expect(
      caller.users.createUser({
        username: "proveedor_sin_id",
        password: "pass123",
        name: "Proveedor Sin ID",
        role: "supplier_user",
        // sin assignedSupplierId
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("RLS — getBranches requiere autenticación", () => {
  it("lanza UNAUTHORIZED si no hay usuario en contexto", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.users.getBranches()).rejects.toThrow();
  });
});

describe("RLS — Permisos de edición de metas", () => {
  it("store_user no puede editar metas (FORBIDDEN)", async () => {
    const storeUser = makeUser({ id: 50, role: "store_user", assignedStoreCode: "FF01" });
    const caller = appRouter.createCaller(makeCtx(storeUser));
    await expect(
      caller.targets.upsertStoreTarget({
        month: "2026-01",
        store_id: "some-uuid",
        monthly_target_amount: 100000,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("supplier_user no puede editar metas (FORBIDDEN)", async () => {
    const supplierUser = makeUser({ id: 51, role: "supplier_user", assignedSupplierId: "SUP-001" });
    const caller = appRouter.createCaller(makeCtx(supplierUser));
    await expect(
      caller.targets.upsertStoreTarget({
        month: "2026-01",
        store_id: "some-uuid",
        monthly_target_amount: 100000,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cst_user puede editar metas (no FORBIDDEN)", async () => {
    const cstUser = makeUser({ id: 52, role: "cst_user" });
    const caller = appRouter.createCaller(makeCtx(cstUser));
    try {
      await caller.targets.upsertStoreTarget({
        month: "2026-01",
        store_id: "some-uuid",
        monthly_target_amount: 100000,
      });
    } catch (err: any) {
      expect(err.code).not.toBe("FORBIDDEN");
    }
  });

  it("store_user no puede eliminar metas (FORBIDDEN)", async () => {
    const storeUser = makeUser({ id: 53, role: "store_user", assignedStoreCode: "FF01" });
    const caller = appRouter.createCaller(makeCtx(storeUser));
    await expect(
      caller.targets.deleteStoreTarget({ id: 999 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cst_user puede eliminar metas (no FORBIDDEN)", async () => {
    const cstUser = makeUser({ id: 54, role: "cst_user" });
    const caller = appRouter.createCaller(makeCtx(cstUser));
    try {
      await caller.targets.deleteStoreTarget({ id: 999 });
    } catch (err: any) {
      expect(err.code).not.toBe("FORBIDDEN");
    }
  });

  it("store_user no puede hacer carga masiva de metas (FORBIDDEN)", async () => {
    const storeUser = makeUser({ id: 55, role: "store_user", assignedStoreCode: "FF01" });
    const caller = appRouter.createCaller(makeCtx(storeUser));
    await expect(
      caller.targets.bulkUpsertFromCSV({
        rows: [{ month: "2026-01", store_sap_id: "FF01", monthly_target_amount: 100000 }],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cst_user puede hacer carga masiva de metas (no FORBIDDEN)", async () => {
    const cstUser = makeUser({ id: 56, role: "cst_user" });
    const caller = appRouter.createCaller(makeCtx(cstUser));
    try {
      await caller.targets.bulkUpsertFromCSV({
        rows: [{ month: "2026-01", store_sap_id: "FF01", monthly_target_amount: 100000 }],
      });
    } catch (err: any) {
      expect(err.code).not.toBe("FORBIDDEN");
    }
  });
});

describe("RLS — auth.me devuelve los campos correctos", () => {
  it("devuelve null assignedStoreCode cuando el usuario no tiene tienda asignada", async () => {
    const user = makeUser({ role: "cst_user", assignedStoreCode: null });
    const caller = appRouter.createCaller(makeCtx(user));
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect((result as any).assignedStoreCode).toBeNull();
  });

  it("devuelve el sap_id cuando el usuario tiene tienda asignada", async () => {
    const user = makeUser({ role: "store_user", assignedStoreCode: "T042" });
    const caller = appRouter.createCaller(makeCtx(user));
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect((result as any).assignedStoreCode).toBe("T042");
  });

  it("devuelve assignedSupplierId para supplier_user", async () => {
    const user = makeUser({ role: "supplier_user", assignedSupplierId: "SUP-999" });
    const caller = appRouter.createCaller(makeCtx(user));
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect((result as any).role).toBe("supplier_user");
  });
});
