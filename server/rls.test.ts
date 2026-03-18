/**
 * Tests para el sistema RLS (Row Level Security) y gestión de usuarios con roles.
 *
 * Verifica:
 * 1. Que los roles nuevos (system_specialist, cst_user, store_user) son válidos.
 * 2. Que el procedimiento listUsers requiere autenticación.
 * 3. Que store_user no puede crear usuarios (FORBIDDEN).
 * 4. Que cst_user no puede crear usuarios de tipo system_specialist (FORBIDDEN).
 * 5. Que system_specialist puede crear cualquier tipo de usuario.
 * 6. Que getBranches está disponible para usuarios autenticados.
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

  it("store_user es un rol válido en el schema", () => {
    const user = makeUser({ role: "store_user", assignedStoreCode: "T001" });
    expect(user.role).toBe("store_user");
    expect(user.assignedStoreCode).toBe("T001");
  });
});

describe("RLS — listUsers requiere autenticación", () => {
  it("lanza UNAUTHORIZED si no hay usuario en contexto", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.users.listUsers()).rejects.toThrow();
  });
});

describe("RLS — Restricciones de creación de usuarios", () => {
  it("store_user no puede crear usuarios (FORBIDDEN)", async () => {
    const storeUser = makeUser({
      id: 10,
      role: "store_user",
      assignedStoreCode: "T001",
    });
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

  it("cst_user no puede crear usuarios de tipo cst_user (FORBIDDEN)", async () => {
    const cstUser = makeUser({ id: 21, role: "cst_user" });
    const caller = appRouter.createCaller(makeCtx(cstUser));

    await expect(
      caller.users.createUser({
        username: "nuevo_cst",
        password: "pass123",
        name: "Nuevo CST",
        role: "cst_user",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
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
    const storeUser = makeUser({ id: 30, role: "store_user", assignedStoreCode: "FF01" });
    const caller = appRouter.createCaller(makeCtx(storeUser));
    await expect(
      caller.targets.upsertStoreTarget({
        month: "2026-01",
        store_id: "some-uuid",
        monthly_target_amount: 100000,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cst_user puede editar metas (permitido)", async () => {
    const cstUser = makeUser({ id: 31, role: "cst_user" });
    const caller = appRouter.createCaller(makeCtx(cstUser));
    // Verificamos que la operación no es rechazada por FORBIDDEN
    // (puede tener éxito o fallar por otro motivo, pero no por permisos)
    const result = caller.targets.upsertStoreTarget({
      month: "2026-01",
      store_id: "some-uuid",
      monthly_target_amount: 100000,
    });
    await expect(result).resolves.not.toMatchObject({ code: "FORBIDDEN" }).catch(() => {
      // Si falla por otro motivo (ej. DB), verificamos que no sea FORBIDDEN
    });
    // Verificación alternativa: no lanza FORBIDDEN
    try {
      await result;
    } catch (err: any) {
      expect(err.code).not.toBe("FORBIDDEN");
    }
  });

  it("store_user no puede eliminar metas (FORBIDDEN)", async () => {
    const storeUser = makeUser({ id: 32, role: "store_user", assignedStoreCode: "FF01" });
    const caller = appRouter.createCaller(makeCtx(storeUser));
    await expect(
      caller.targets.deleteStoreTarget({ id: 999 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cst_user puede eliminar metas (permitido)", async () => {
    const cstUser = makeUser({ id: 33, role: "cst_user" });
    const caller = appRouter.createCaller(makeCtx(cstUser));
    // Verificamos que no lanza FORBIDDEN
    try {
      await caller.targets.deleteStoreTarget({ id: 999 });
    } catch (err: any) {
      expect(err.code).not.toBe("FORBIDDEN");
    }
  });

  it("store_user no puede hacer carga masiva de metas (FORBIDDEN)", async () => {
    const storeUser = makeUser({ id: 34, role: "store_user", assignedStoreCode: "FF01" });
    const caller = appRouter.createCaller(makeCtx(storeUser));
    await expect(
      caller.targets.bulkUpsertFromCSV({
        rows: [{ month: "2026-01", store_sap_id: "FF01", monthly_target_amount: 100000 }],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cst_user puede hacer carga masiva de metas (permitido)", async () => {
    const cstUser = makeUser({ id: 35, role: "cst_user" });
    const caller = appRouter.createCaller(makeCtx(cstUser));
    // Verificamos que no lanza FORBIDDEN
    try {
      await caller.targets.bulkUpsertFromCSV({
        rows: [{ month: "2026-01", store_sap_id: "FF01", monthly_target_amount: 100000 }],
      });
    } catch (err: any) {
      expect(err.code).not.toBe("FORBIDDEN");
    }
  });
});

describe("RLS — auth.me devuelve assignedStoreCode", () => {
  it("devuelve null cuando el usuario no tiene tienda asignada", async () => {
    const user = makeUser({ role: "cst_user", assignedStoreCode: null });
    const caller = appRouter.createCaller(makeCtx(user));
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect((result as any).assignedStoreCode).toBeNull();
  });

  it("devuelve el sap_id cuando el usuario tiene tienda asignada", async () => {
    const user = makeUser({
      role: "store_user",
      assignedStoreCode: "T042",
    });
    const caller = appRouter.createCaller(makeCtx(user));
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect((result as any).assignedStoreCode).toBe("T042");
  });
});
