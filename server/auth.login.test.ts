import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import { getDb, getUserByUsername } from "./db";

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
  beforeAll(async () => {
    // Verificar que la base de datos esté disponible y tenga usuarios
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available for testing");
    }
    
    const adminUser = await getUserByUsername("admin");
    if (!adminUser) {
      throw new Error("Admin user not found in database. Run seed script first.");
    }
  });

  it("should login successfully with correct credentials", async () => {
    const { ctx, setCookies } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.login({
      username: "admin",
      password: "admin123",
    });

    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user.username).toBe("admin");
    expect(result.user.role).toBe("admin");
    expect(result.user.password).toBeUndefined(); // Password should not be returned
    
    // Verify cookie was set
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]?.name).toBe(COOKIE_NAME);
    expect(setCookies[0]?.value).toBeDefined();
    expect(setCookies[0]?.options).toMatchObject({
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });

  it("should fail with incorrect password", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({
        username: "admin",
        password: "wrongpassword",
      })
    ).rejects.toThrow("Credenciales inválidas");
  });

  it("should fail with non-existent user", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({
        username: "nonexistent",
        password: "anypassword",
      })
    ).rejects.toThrow("Credenciales inválidas");
  });

  it("should fail with empty username", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({
        username: "",
        password: "admin123",
      })
    ).rejects.toThrow();
  });

  it("should fail with empty password", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.login({
        username: "admin",
        password: "",
      })
    ).rejects.toThrow();
  });
});
