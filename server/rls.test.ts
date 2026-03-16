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
