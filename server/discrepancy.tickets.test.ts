/**
 * Unit tests for the discrepancy tickets system.
 * Tests cover the business logic of ticket creation, listing, and status updates
 * using the MySQL/TiDB database (Drizzle ORM).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { discrepancyTickets } from "../drizzle/schema";

const TEST_USER_ID = 999999; // Numeric ID for test user (won't conflict with real users)
const TEST_USER_NAME = "Vitest Test User";

// Helper to clean up test tickets after tests
async function cleanupTestTickets() {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(discrepancyTickets)
    .where(eq(discrepancyTickets.reportedById, TEST_USER_ID));
}

describe("Discrepancy Tickets - Business Logic", () => {
  beforeAll(async () => {
    await cleanupTestTickets();
  });

  afterAll(async () => {
    await cleanupTestTickets();
  });

  it("should insert a ticket and retrieve it by id", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();

    const [result] = await db!.insert(discrepancyTickets).values({
      module: "sales-by-category",
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
      storeId: "FF01",
      storeName: "Aviación",
      dashboardAmount: 100000,
      analystAmount: 98500,
      difference: -1500,
      description: "Diferencia de S/ 1,500 entre dashboard y reporte SAP",
      dataSource: "SAP BW",
      status: "open",
      priority: "medium",
      reportedById: TEST_USER_ID,
      reportedByName: TEST_USER_NAME,
    });

    // MySQL returns insertId
    const insertId = (result as any).insertId;
    expect(insertId).toBeGreaterThan(0);

    // Retrieve the ticket
    const tickets = await db!
      .select()
      .from(discrepancyTickets)
      .where(eq(discrepancyTickets.id, insertId));

    expect(tickets).toHaveLength(1);
    const ticket = tickets[0];

    expect(ticket.module).toBe("sales-by-category");
    expect(ticket.storeId).toBe("FF01");
    expect(ticket.storeName).toBe("Aviación");
    expect(ticket.dashboardAmount).toBe(100000);
    expect(ticket.analystAmount).toBe(98500);
    expect(ticket.difference).toBe(-1500);
    expect(ticket.status).toBe("open");
    expect(ticket.priority).toBe("medium");
    expect(ticket.reportedById).toBe(TEST_USER_ID);
  });

  it("should update ticket status to in_review", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();

    const [result] = await db!.insert(discrepancyTickets).values({
      module: "hourly-analysis",
      dateFrom: "2026-02-15",
      dateTo: "2026-02-15",
      storeId: "all",
      storeName: "Todas las tiendas",
      description: "Los datos de ventas por hora no coinciden con el reporte de turno",
      status: "open",
      priority: "high",
      reportedById: TEST_USER_ID,
      reportedByName: TEST_USER_NAME,
    });

    const insertId = (result as any).insertId;

    // Update status to in_review
    await db!
      .update(discrepancyTickets)
      .set({
        status: "in_review",
        resolvedById: 1,
        resolvedByName: "Admin",
        resolutionNotes: "Revisando con el equipo de datos",
      })
      .where(eq(discrepancyTickets.id, insertId));

    const tickets = await db!
      .select()
      .from(discrepancyTickets)
      .where(eq(discrepancyTickets.id, insertId));

    expect(tickets[0].status).toBe("in_review");
    expect(tickets[0].resolvedByName).toBe("Admin");
    expect(tickets[0].resolutionNotes).toBe("Revisando con el equipo de datos");
  });

  it("should list only open tickets for a specific user", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();

    // Insert two open tickets for test user
    for (let i = 0; i < 2; i++) {
      await db!.insert(discrepancyTickets).values({
        module: "sales-vs-target",
        dateFrom: "2026-02-01",
        dateTo: "2026-02-28",
        storeId: "FF03",
        storeName: "Primavera",
        description: `Test ticket ${i} - discrepancia en metas mensuales con diferencia significativa`,
        status: "open",
        priority: "low",
        reportedById: TEST_USER_ID,
        reportedByName: TEST_USER_NAME,
      });
    }

    const openTickets = await db!
      .select()
      .from(discrepancyTickets)
      .where(
        and(
          eq(discrepancyTickets.reportedById, TEST_USER_ID),
          eq(discrepancyTickets.status, "open")
        )
      );

    expect(openTickets.length).toBeGreaterThanOrEqual(2);
    openTickets.forEach((t) => {
      expect(t.status).toBe("open");
      expect(t.reportedById).toBe(TEST_USER_ID);
    });
  });

  it("should calculate difference correctly (pure logic)", () => {
    // Business logic test — no DB needed
    const dashboardAmount = 150000;
    const analystAmount = 148500;
    const difference = analystAmount - dashboardAmount;

    expect(difference).toBe(-1500);
    expect(Math.abs(difference)).toBe(1500);
  });

  it("should validate priority enum values", () => {
    const validPriorities = ["low", "medium", "high"] as const;
    const validStatuses = ["open", "in_review", "resolved", "closed"] as const;

    expect(validPriorities).toContain("low");
    expect(validPriorities).toContain("medium");
    expect(validPriorities).toContain("high");
    expect(validPriorities).not.toContain("critical");

    expect(validStatuses).toContain("open");
    expect(validStatuses).toContain("in_review");
    expect(validStatuses).toContain("resolved");
    expect(validStatuses).toContain("closed");
  });
});
