import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { dbConnections } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// ── Encryption helpers ──────────────────────────────────────────────────────
// Uses AES-256-CBC with a key derived from JWT_SECRET.
// This is adequate for protecting credentials at rest in the DB.

function getEncryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET ?? "fallback-secret-change-in-prod";
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

export function encryptPassword(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptPassword(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivHex, encHex] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

// ── Guard helper ─────────────────────────────────────────────────────────────
function requireSystemSpecialist(role: string) {
  if (role !== "system_specialist") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Solo los especialistas de sistemas pueden gestionar conexiones de base de datos.",
    });
  }
}

// ── Input schema ─────────────────────────────────────────────────────────────
const connectionInput = z.object({
  name: z.string().min(1, "El nombre es requerido").max(128),
  description: z.string().max(500).optional(),
  host: z.string().min(1, "El host es requerido").max(255),
  port: z.number().int().min(1).max(65535).default(5432),
  database: z.string().min(1, "La base de datos es requerida").max(128),
  username: z.string().min(1, "El usuario es requerido").max(128),
  /** Contraseña en texto plano — se cifra antes de guardar */
  password: z.string().min(1, "La contraseña es requerida"),
  sslEnabled: z.boolean().default(true),
  sslMode: z.enum(["disable", "require", "verify-ca", "verify-full"]).default("require"),
  purpose: z.enum(["sales", "stock", "both", "other"]).default("both"),
  isActive: z.boolean().default(true),
});

// ── Router ────────────────────────────────────────────────────────────────────
export const dbConnectionsRouter = router({
  /**
   * List all database connections (passwords are NOT returned).
   * Only system_specialist.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    requireSystemSpecialist(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });

    const rows = await db
      .select({
        id: dbConnections.id,
        name: dbConnections.name,
        description: dbConnections.description,
        host: dbConnections.host,
        port: dbConnections.port,
        database: dbConnections.database,
        username: dbConnections.username,
        sslEnabled: dbConnections.sslEnabled,
        sslMode: dbConnections.sslMode,
        purpose: dbConnections.purpose,
        isActive: dbConnections.isActive,
        lastTestStatus: dbConnections.lastTestStatus,
        lastTestMessage: dbConnections.lastTestMessage,
        lastTestedAt: dbConnections.lastTestedAt,
        createdById: dbConnections.createdById,
        createdByName: dbConnections.createdByName,
        createdAt: dbConnections.createdAt,
        updatedAt: dbConnections.updatedAt,
      })
      .from(dbConnections)
      .orderBy(desc(dbConnections.createdAt));

    return rows;
  }),

  /**
   * Get a single connection by id (password NOT returned).
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      requireSystemSpecialist(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });

      const rows = await db
        .select({
          id: dbConnections.id,
          name: dbConnections.name,
          description: dbConnections.description,
          host: dbConnections.host,
          port: dbConnections.port,
          database: dbConnections.database,
          username: dbConnections.username,
          sslEnabled: dbConnections.sslEnabled,
          sslMode: dbConnections.sslMode,
          purpose: dbConnections.purpose,
          isActive: dbConnections.isActive,
          lastTestStatus: dbConnections.lastTestStatus,
          lastTestMessage: dbConnections.lastTestMessage,
          lastTestedAt: dbConnections.lastTestedAt,
          createdByName: dbConnections.createdByName,
          createdAt: dbConnections.createdAt,
          updatedAt: dbConnections.updatedAt,
        })
        .from(dbConnections)
        .where(eq(dbConnections.id, input.id));

      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conexión no encontrada" });
      }
      return rows[0];
    }),

  /**
   * Create a new connection. Password is encrypted before storage.
   */
  create: protectedProcedure
    .input(connectionInput)
    .mutation(async ({ ctx, input }) => {
      requireSystemSpecialist(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });

      const passwordEncrypted = encryptPassword(input.password);

      const [result] = await db.insert(dbConnections).values({
        name: input.name,
        description: input.description ?? null,
        host: input.host,
        port: input.port,
        database: input.database,
        username: input.username,
        passwordEncrypted,
        sslEnabled: input.sslEnabled ? 1 : 0,
        sslMode: input.sslMode,
        purpose: input.purpose,
        isActive: input.isActive ? 1 : 0,
        createdById: ctx.user.id,
        createdByName: ctx.user.name ?? ctx.user.username ?? "Sistema",
      });

      return { id: (result as any).insertId as number };
    }),

  /**
   * Update an existing connection.
   * If password is provided, it is re-encrypted. Otherwise the existing one is kept.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1).max(128),
        description: z.string().max(500).optional(),
        host: z.string().min(1).max(255),
        port: z.number().int().min(1).max(65535),
        database: z.string().min(1).max(128),
        username: z.string().min(1).max(128),
        /** Si se omite o es vacío, se mantiene la contraseña actual */
        password: z.string().optional(),
        sslEnabled: z.boolean(),
        sslMode: z.enum(["disable", "require", "verify-ca", "verify-full"]),
        purpose: z.enum(["sales", "stock", "both", "other"]),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireSystemSpecialist(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });

      // Verify the connection exists
      const existing = await db
        .select({ id: dbConnections.id, passwordEncrypted: dbConnections.passwordEncrypted })
        .from(dbConnections)
        .where(eq(dbConnections.id, input.id));

      if (existing.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conexión no encontrada" });
      }

      const passwordEncrypted =
        input.password && input.password.trim().length > 0
          ? encryptPassword(input.password)
          : existing[0].passwordEncrypted;

      await db
        .update(dbConnections)
        .set({
          name: input.name,
          description: input.description ?? null,
          host: input.host,
          port: input.port,
          database: input.database,
          username: input.username,
          passwordEncrypted,
          sslEnabled: input.sslEnabled ? 1 : 0,
          sslMode: input.sslMode,
          purpose: input.purpose,
          isActive: input.isActive ? 1 : 0,
        })
        .where(eq(dbConnections.id, input.id));

      return { success: true };
    }),

  /**
   * Delete a connection.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      requireSystemSpecialist(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });

      await db.delete(dbConnections).where(eq(dbConnections.id, input.id));
      return { success: true };
    }),

  /**
   * Test a connection by attempting to connect and run a simple query.
   * Updates last_test_status and last_test_message in the DB.
   */
  testConnection: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      requireSystemSpecialist(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB no disponible" });

      // Fetch the connection including encrypted password
      const rows = await db
        .select()
        .from(dbConnections)
        .where(eq(dbConnections.id, input.id));

      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conexión no encontrada" });
      }

      const conn = rows[0];
      let status: "ok" | "error" = "error";
      let message = "";

      try {
        const plainPassword = decryptPassword(conn.passwordEncrypted);

        // Dynamically import pg to avoid bundling issues
        const { Client } = await import("pg");

        const client = new Client({
          host: conn.host,
          port: conn.port,
          database: conn.database,
          user: conn.username,
          password: plainPassword,
          ssl: conn.sslEnabled
            ? { rejectUnauthorized: conn.sslMode === "verify-full" || conn.sslMode === "verify-ca" }
            : false,
          connectionTimeoutMillis: 8000,
          statement_timeout: 5000,
        });

        await client.connect();
        const result = await client.query("SELECT version()");
        await client.end();

        status = "ok";
        message = `Conexión exitosa. ${result.rows[0]?.version?.split(" ").slice(0, 2).join(" ") ?? ""}`;
      } catch (err: any) {
        status = "error";
        message = err?.message ?? "Error desconocido";
      }

      // Persist test result
      await db
        .update(dbConnections)
        .set({
          lastTestStatus: status,
          lastTestMessage: message,
          lastTestedAt: new Date(),
        })
        .where(eq(dbConnections.id, input.id));

      return { status, message };
    }),
});
