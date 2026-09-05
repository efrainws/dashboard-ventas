/**
 * Tests for the account activation flow.
 * Covers: token validation, account activation, error cases.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { activationTokens, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { createActivationToken } from "./activationRouter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(user: any = null) {
  return {
    user,
    req: { protocol: "https", get: () => "localhost", headers: { host: "localhost" } },
    res: { cookie: () => {}, clearCookie: () => {} },
  } as any;
}

// ─── Test data ────────────────────────────────────────────────────────────────

const TEST_USERNAME = `activation_test_${Date.now()}`;
const TEST_PASSWORD = "TempPass123!";
let testUserId: number;
let validToken: string;
let expiredToken: string;
let usedToken: string;
let passwordResetToken: string;

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Create a test user
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
  const [result] = await db.insert(users).values({
    username: TEST_USERNAME,
    password: hashedPassword,
    name: "Activation Test User",
    email: "activation_test@example.com",
    role: "store_user",
    assignedStoreCode: "FF01",
    loginMethod: "local",
  });
  testUserId = (result as any).insertId as number;

  // Create a valid token
  validToken = await createActivationToken(testUserId, "activation_test@example.com");

  // Token de un solo uso que permite definir una contraseña sin revelar una temporal por correo.
  passwordResetToken = await createActivationToken(testUserId, "activation_test@example.com", {
    requiresPasswordReset: true,
  });

  // Create an expired token (set expiresAt in the past)
  const expiredTokenValue = "expired_" + Date.now().toString(16);
  await db.insert(activationTokens).values({
    token: expiredTokenValue,
    userId: testUserId,
    email: "activation_test@example.com",
    expiresAt: new Date(Date.now() - 1000), // already expired
    used: 0,
  });
  expiredToken = expiredTokenValue;

  // Create a used token
  const usedTokenValue = "used_" + Date.now().toString(16);
  await db.insert(activationTokens).values({
    token: usedTokenValue,
    userId: testUserId,
    email: "activation_test@example.com",
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    used: 1,
  });
  usedToken = usedTokenValue;
});

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  // Clean up test data
  await db.delete(activationTokens).where(eq(activationTokens.userId, testUserId));
  await db.delete(users).where(eq(users.id, testUserId));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Activation Flow — validateToken", () => {
  it("returns valid=true and email for a valid token", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.activation.validateToken({ token: validToken });
    expect(result.valid).toBe(true);
    expect(result.email).toBe("activation_test@example.com");
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.requiresPasswordReset).toBe(false);
  });

  it("identifies a token configured for a secure password reset", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.activation.validateToken({ token: passwordResetToken });
    expect(result.valid).toBe(true);
    expect(result.requiresPasswordReset).toBe(true);
  });

  it("throws NOT_FOUND for an unknown token", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.activation.validateToken({ token: "totally_invalid_token_xyz" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws BAD_REQUEST for an expired token", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.activation.validateToken({ token: expiredToken })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST for an already-used token", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.activation.validateToken({ token: usedToken })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("Activation Flow — activateAccount", () => {
  it("throws BAD_REQUEST when passwords don't match", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.activation.activateAccount({
        token: validToken,
        temporaryPassword: TEST_PASSWORD,
        newPassword: "NewPass123!",
        confirmPassword: "DifferentPass456!",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws UNAUTHORIZED when temporary password is wrong", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.activation.activateAccount({
        token: validToken,
        temporaryPassword: "WrongPassword999",
        newPassword: "NewPass123!",
        confirmPassword: "NewPass123!",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("throws BAD_REQUEST when new password equals temporary password", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.activation.activateAccount({
        token: validToken,
        temporaryPassword: TEST_PASSWORD,
        newPassword: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("activates account successfully with valid data", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.activation.activateAccount({
      token: validToken,
      temporaryPassword: TEST_PASSWORD,
      newPassword: "NewSecurePass456!",
      confirmPassword: "NewSecurePass456!",
    });
    expect(result.success).toBe(true);
    expect(result.email).toBe("activation_test@example.com");
  });

  it("throws BAD_REQUEST when trying to reuse the same token", async () => {
    const caller = appRouter.createCaller(makeCtx());
    // Token was already used in the previous test
    await expect(
      caller.activation.activateAccount({
        token: validToken,
        temporaryPassword: TEST_PASSWORD,
        newPassword: "AnotherPass789!",
        confirmPassword: "AnotherPass789!",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws NOT_FOUND for an unknown token", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.activation.activateAccount({
        token: "completely_fake_token",
        temporaryPassword: TEST_PASSWORD,
        newPassword: "NewPass123!",
        confirmPassword: "NewPass123!",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws BAD_REQUEST for an expired token", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.activation.activateAccount({
        token: expiredToken,
        temporaryPassword: TEST_PASSWORD,
        newPassword: "NewPass123!",
        confirmPassword: "NewPass123!",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("allows a password-reset token to activate without a temporary password", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.activation.activateAccount({
      token: passwordResetToken,
      newPassword: "ResetSecurePass456!",
      confirmPassword: "ResetSecurePass456!",
    });
    expect(result.success).toBe(true);
    expect(result.email).toBe("activation_test@example.com");
  });
});
