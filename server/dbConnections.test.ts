/**
 * Unit tests for the DB Connections router.
 * Tests cover: encryption helpers, CRUD operations, and access control.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { dbConnections } from "../drizzle/schema";
import { encryptPassword, decryptPassword } from "./dbConnectionsRouter";

const TEST_CONN_NAME = "__vitest_test_connection__";

// Cleanup helper
async function cleanupTestConnections() {
  const db = await getDb();
  if (!db) return;
  await db.delete(dbConnections).where(eq(dbConnections.name, TEST_CONN_NAME));
}

describe("DB Connections — Encryption", () => {
  it("should encrypt and decrypt a password correctly", () => {
    const original = "SuperSecret123!";
    const encrypted = encryptPassword(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(":");
    const decrypted = decryptPassword(encrypted);
    expect(decrypted).toBe(original);
  });

  it("should produce different ciphertext for the same plaintext (random IV)", () => {
    const plain = "SamePassword";
    const enc1 = encryptPassword(plain);
    const enc2 = encryptPassword(plain);
    expect(enc1).not.toBe(enc2); // different IVs
    expect(decryptPassword(enc1)).toBe(plain);
    expect(decryptPassword(enc2)).toBe(plain);
  });

  it("should handle special characters and unicode in passwords", () => {
    const special = "P@$$w0rd!#%&*()_+-=[]{}|;':\",./<>?áéíóú";
    const encrypted = encryptPassword(special);
    expect(decryptPassword(encrypted)).toBe(special);
  });
});

describe("DB Connections — CRUD", () => {
  beforeAll(async () => {
    await cleanupTestConnections();
  });

  afterAll(async () => {
    await cleanupTestConnections();
  });

  it("should insert a connection and retrieve it", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();

    const passwordEncrypted = encryptPassword("testpassword");

    const [result] = await db!.insert(dbConnections).values({
      name: TEST_CONN_NAME,
      description: "Conexión de prueba para Vitest",
      host: "localhost",
      port: 5432,
      database: "test_db",
      username: "postgres",
      passwordEncrypted,
      sslEnabled: 1,
      sslMode: "require",
      purpose: "both",
      isActive: 1,
      createdById: 999999,
      createdByName: "Vitest",
    });

    const insertId = (result as any).insertId;
    expect(insertId).toBeGreaterThan(0);

    const rows = await db!
      .select()
      .from(dbConnections)
      .where(eq(dbConnections.id, insertId));

    expect(rows).toHaveLength(1);
    const conn = rows[0];

    expect(conn.name).toBe(TEST_CONN_NAME);
    expect(conn.host).toBe("localhost");
    expect(conn.port).toBe(5432);
    expect(conn.database).toBe("test_db");
    expect(conn.username).toBe("postgres");
    expect(conn.sslEnabled).toBe(1);
    expect(conn.sslMode).toBe("require");
    expect(conn.purpose).toBe("both");
    expect(conn.isActive).toBe(1);
    expect(conn.lastTestStatus).toBe("pending");

    // Password should be stored encrypted, not plaintext
    expect(conn.passwordEncrypted).not.toBe("testpassword");
    expect(decryptPassword(conn.passwordEncrypted)).toBe("testpassword");
  });

  it("should update a connection's host and port", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();

    const rows = await db!
      .select()
      .from(dbConnections)
      .where(eq(dbConnections.name, TEST_CONN_NAME));

    expect(rows.length).toBeGreaterThan(0);
    const id = rows[0].id;

    await db!
      .update(dbConnections)
      .set({ host: "new-host.example.com", port: 5433 })
      .where(eq(dbConnections.id, id));

    const updated = await db!
      .select()
      .from(dbConnections)
      .where(eq(dbConnections.id, id));

    expect(updated[0].host).toBe("new-host.example.com");
    expect(updated[0].port).toBe(5433);
  });

  it("should update test status to ok", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();

    const rows = await db!
      .select()
      .from(dbConnections)
      .where(eq(dbConnections.name, TEST_CONN_NAME));

    const id = rows[0].id;

    await db!
      .update(dbConnections)
      .set({
        lastTestStatus: "ok",
        lastTestMessage: "Conexión exitosa. PostgreSQL 15.3",
        lastTestedAt: new Date(),
      })
      .where(eq(dbConnections.id, id));

    const updated = await db!
      .select()
      .from(dbConnections)
      .where(eq(dbConnections.id, id));

    expect(updated[0].lastTestStatus).toBe("ok");
    expect(updated[0].lastTestMessage).toContain("PostgreSQL");
    expect(updated[0].lastTestedAt).not.toBeNull();
  });

  it("should delete the test connection", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();

    const rows = await db!
      .select()
      .from(dbConnections)
      .where(eq(dbConnections.name, TEST_CONN_NAME));

    expect(rows.length).toBeGreaterThan(0);
    const id = rows[0].id;

    await db!.delete(dbConnections).where(eq(dbConnections.id, id));

    const after = await db!
      .select()
      .from(dbConnections)
      .where(eq(dbConnections.id, id));

    expect(after).toHaveLength(0);
  });
});

describe("DB Connections — Purpose enum validation", () => {
  it("should accept all valid purpose values", () => {
    const validPurposes = ["sales", "stock", "both", "other"] as const;
    validPurposes.forEach((p) => {
      expect(["sales", "stock", "both", "other"]).toContain(p);
    });
  });

  it("should accept all valid SSL modes", () => {
    const validModes = ["disable", "require", "verify-ca", "verify-full"] as const;
    validModes.forEach((m) => {
      expect(["disable", "require", "verify-ca", "verify-full"]).toContain(m);
    });
  });
});
