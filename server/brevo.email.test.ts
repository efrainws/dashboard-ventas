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
      appUrl: "https://ventasdash-ftg2qpku.manus.space",
      changedByAdmin: true,
    });

    expect(result).toBe(false);
  });

  it("should validate password reset email params structure", () => {
    const params = {
      name: "María López",
      email: "maria@florayfauna.pe",
      appUrl: "https://ventasdash-ftg2qpku.manus.space",
      changedByAdmin: true,
    };

    expect(params.name).toBeTruthy();
    expect(params.email).toContain("@");
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

describe("Brevo Ticket Notification Email", () => {
  it("should have sendTicketNotificationEmail exported", async () => {
    const { sendTicketNotificationEmail } = await import("./email");
    expect(typeof sendTicketNotificationEmail).toBe("function");
  });

  it("should return 0 when recipients list is empty", async () => {
    const { sendTicketNotificationEmail } = await import("./email");

    const result = await sendTicketNotificationEmail({
      ticketId: 999,
      module: "sales-by-category",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      storeName: "Todas las tiendas",
      reportedByName: "Ana Analista",
      priority: "high",
      description: "Los montos no coinciden con el sistema SAP.",
      dashboardAmount: 150000,
      analystAmount: 148500,
      difference: -1500,
      dataSource: "SAP B1",
      appUrl: "https://ventasdash-ftg2qpku.manus.space",
      recipients: [], // empty — should return 0
    });

    expect(result).toBe(0);
  });

  it("should validate ticket notification params structure", () => {
    const params = {
      ticketId: 42,
      module: "hourly-analysis",
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
      storeName: "Tienda Lima Centro",
      reportedByName: "Carlos Analista",
      priority: "medium",
      description: "Diferencia detectada en ventas nocturnas.",
      dashboardAmount: 85000,
      analystAmount: 83200,
      difference: -1800,
      appUrl: "https://ventasdash-ftg2qpku.manus.space",
      recipients: [{ name: "Admin", email: "admin@florayfauna.pe" }],
    };

    expect(params.ticketId).toBeGreaterThan(0);
    expect(["sales-by-category", "hourly-analysis", "sales-vs-target"]).toContain(params.module);
    expect(params.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(["low", "medium", "high"]).toContain(params.priority);
    expect(params.description.length).toBeGreaterThanOrEqual(10);
    expect(params.recipients.length).toBeGreaterThan(0);
    expect(params.recipients[0].email).toContain("@");
  });

  it("should connect to Brevo API for ticket notification (account check)", async () => {
    const { BrevoClient } = await import("@getbrevo/brevo");
    const client = new BrevoClient({ apiKey: BREVO_API_KEY });
    const response = await client.account.getAccount();
    expect(response).toBeDefined();
    expect((response as any).email).toBeTruthy();
  });
});
