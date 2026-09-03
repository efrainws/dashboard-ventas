import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

type CookieCall = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

function createPublicContext(): { ctx: TrpcContext; setCookies: CookieCall[] } {
  const setCookies: CookieCall[] = [];

  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookies.push({ name, value, options });
      },
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx, setCookies };
}

describe("auth.login", () => {
  const TEST_USERNAME = "test_login_specialist";
  const TEST_EMAIL = "logintest@test.com";
  const TEST_PASSWORD = "testpass123";

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available for testing");

    // Limpiar usuario de prueba previo si existe
    await db.delete(users).where(eq(users.username, TEST_USERNAME));

    // Crear usuario de prueba
    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
    await db.insert(users).values({
      username: TEST_USERNAME,
      password: hashedPassword,
      name: "Test Login Specialist",
      email: TEST_EMAIL,
      role: "system_specialist",
      loginMethod: "local",
    });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(users).where(eq(users.username, TEST_USERNAME));
  });

  it("login exitoso con credenciales correctas", async () => {
    const { ctx, setCookies } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.login({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user.username).toBe(TEST_USERNAME);
    expect(result.user.role).toBe("system_specialist");
    expect((result.user as any).password).toBeUndefined();

    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]?.name).toBe(COOKIE_NAME);
    expect(setCookies[0]?.value).toBeDefined();
    expect(setCookies[0]?.options).toMatchObject({
      httpOnly: true,
      path: "/",
    });
  });

  it("falla con contraseña incorrecta", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({
        email: TEST_EMAIL,
        password: "wrongpassword",
      })
    ).rejects.toThrow("Credenciales inválidas");
  });

  it("falla con usuario inexistente", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({
        email: "nonexistent_xyz@example.com",
        password: "anypassword",
      })
    ).rejects.toThrow("Credenciales inválidas");
  });

  it("falla con email vacío", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({ email: "", password: TEST_PASSWORD })
    ).rejects.toThrow();
  });

  it("falla con password vacío", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({ email: TEST_EMAIL, password: "" })
    ).rejects.toThrow();
  });
});
