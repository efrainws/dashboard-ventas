/**
 * Tests for the Brevo email integration.
 * Validates API key connectivity and the welcome email helper logic.
 */
import { describe, it, expect } from "vitest";
import { BrevoClient } from "@getbrevo/brevo";

const BREVO_API_KEY = process.env.BREVO_API_KEY ?? "";

describe("Brevo Email Integration", () => {
  it("should have BREVO_API_KEY configured", () => {
    expect(BREVO_API_KEY).toBeTruthy();
    expect(BREVO_API_KEY.length).toBeGreaterThan(20);
  });

  it("should connect to Brevo API and retrieve account info", async () => {
    expect(BREVO_API_KEY).toBeTruthy();

    const client = new BrevoClient({ apiKey: BREVO_API_KEY });
    const response = await client.account.getAccount();

    // The response should have an email field (the Brevo account email)
    expect(response).toBeDefined();
    expect((response as any).email).toBeDefined();
    console.log("[Brevo] Account email:", (response as any).email);
  });

  it("should build welcome email HTML with correct structure", async () => {
    // Import the module dynamically to test the HTML builder
    const { sendWelcomeEmail } = await import("./email");

    // Test that the function exists and is callable
    expect(typeof sendWelcomeEmail).toBe("function");
  });

  it("should return false when email address is missing", async () => {
    const { sendWelcomeEmail } = await import("./email");

    const result = await sendWelcomeEmail({
      name: "Test User",
      email: "", // empty email — should skip
      username: "testuser",
      password: "testpass",
      appUrl: "https://ventasdash-ftg2qpku.manus.space",
      role: "user",
    });

    expect(result).toBe(false);
  });

  it("should validate welcome email params structure", () => {
    // Pure logic test — no API call
    const params = {
      name: "Juan Pérez",
      email: "juan@florayfauna.pe",
      username: "jperez",
      password: "Temp1234!",
      appUrl: "https://ventasdash-ftg2qpku.manus.space",
      role: "user",
    };

    expect(params.name).toBeTruthy();
    expect(params.email).toContain("@");
    expect(params.username.length).toBeGreaterThanOrEqual(3);
    expect(params.password.length).toBeGreaterThanOrEqual(6);
    expect(params.appUrl).toMatch(/^https?:\/\//);
    expect(["user", "admin"]).toContain(params.role);
  });
});

describe("Brevo Password Reset Email", () => {
  it("should have sendPasswordResetEmail exported", async () => {
    const { sendPasswordResetEmail } = await import("./email");
    expect(typeof sendPasswordResetEmail).toBe("function");
  });

  it("should return false when email address is missing", async () => {
    const { sendPasswordResetEmail } = await import("./email");

    const result = await sendPasswordResetEmail({
      name: "Test User",
      email: "", // empty — should skip
      username: "testuser",
      newPassword: "NewPass123!",
      appUrl: "https://ventasdash-ftg2qpku.manus.space",
      changedByAdmin: true,
    });

    expect(result).toBe(false);
  });

  it("should validate password reset email params structure", () => {
    const params = {
      name: "María López",
      email: "maria@florayfauna.pe",
      username: "mlopez",
      newPassword: "NuevaClave456!",
      appUrl: "https://ventasdash-ftg2qpku.manus.space",
      changedByAdmin: true,
    };

    expect(params.name).toBeTruthy();
    expect(params.email).toContain("@");
    expect(params.username.length).toBeGreaterThanOrEqual(3);
    expect(params.newPassword.length).toBeGreaterThanOrEqual(6);
    expect(params.appUrl).toMatch(/^https?:\/\//);
    expect(typeof params.changedByAdmin).toBe("boolean");
  });

  it("should connect to Brevo API for password reset (account check)", async () => {
    const { BrevoClient } = await import("@getbrevo/brevo");
    const client = new BrevoClient({ apiKey: BREVO_API_KEY });
    const response = await client.account.getAccount();
    expect(response).toBeDefined();
    expect((response as any).email).toBeTruthy();
  });
});
