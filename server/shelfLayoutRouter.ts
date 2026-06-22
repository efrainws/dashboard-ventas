/**
 * shelfLayoutRouter.ts
 * Gestión de layouts de tienda y zonas de góndola para el módulo Venta por Góndola.
 * - Layouts: imagen del plano de tienda almacenada en S3, referenciada por SAP ID en MySQL.
 * - Zonas: coordenadas Konva.js de cada góndola por tienda, almacenadas en MySQL.
 */
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { storeLayouts, shelfZones } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { storagePut } from "./storage";
import { TRPCError } from "@trpc/server";

// ─── Helpers ────────────────────────────────────────────────────────────────

function randomSuffix() {
  return Math.random().toString(36).substring(2, 10);
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const shelfLayoutRouter = router({
  // ── Layouts ────────────────────────────────────────────────────────────────

  /** Lista todos los layouts de tienda existentes */
  listLayouts: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
    return db.select().from(storeLayouts).orderBy(storeLayouts.sapId);
  }),

  /** Obtiene el layout de una tienda específica por SAP ID */
  getLayout: protectedProcedure
    .input(z.object({ sapId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      const rows = await db
        .select()
        .from(storeLayouts)
        .where(eq(storeLayouts.sapId, input.sapId))
        .limit(1);
      return rows[0] ?? null;
    }),

  /**
   * Sube o reemplaza el layout de una tienda.
   * El cliente envía la imagen como base64 + metadata.
   */
  upsertLayout: protectedProcedure
    .input(
      z.object({
        sapId: z.string().min(1).max(16),
        branchName: z.string().min(1).max(128),
        /** Base64 del archivo de imagen */
        imageBase64: z.string().min(1),
        mimeType: z.enum(["image/png", "image/jpeg", "image/svg+xml", "image/webp"]),
        /** Nombre original del archivo (para extensión) */
        fileName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      // Determinar extensión
      const extMap: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/svg+xml": "svg",
        "image/webp": "webp",
      };
      const ext = extMap[input.mimeType] ?? "png";
      const fileKey = `store-layouts/${input.sapId}-${randomSuffix()}.${ext}`;

      // Decodificar base64 y subir a S3
      const buffer = Buffer.from(input.imageBase64, "base64");
      const { url } = await storagePut(fileKey, buffer, input.mimeType);

      // Verificar si ya existe un layout para esta tienda
      const existing = await db
        .select()
        .from(storeLayouts)
        .where(eq(storeLayouts.sapId, input.sapId))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(storeLayouts)
          .set({
            branchName: input.branchName,
            imageUrl: url,
            imageKey: fileKey,
            mimeType: input.mimeType,
            uploadedBy: ctx.user.id,
          })
          .where(eq(storeLayouts.sapId, input.sapId));
      } else {
        await db.insert(storeLayouts).values({
          sapId: input.sapId,
          branchName: input.branchName,
          imageUrl: url,
          imageKey: fileKey,
          mimeType: input.mimeType,
          uploadedBy: ctx.user.id,
        });
      }

      return { success: true, imageUrl: url };
    }),

  /** Elimina el layout de una tienda */
  deleteLayout: protectedProcedure
    .input(z.object({ sapId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      await db.delete(storeLayouts).where(eq(storeLayouts.sapId, input.sapId));
      return { success: true };
    }),

  // ── Zonas de Góndola ────────────────────────────────────────────────────────

  /** Lista todas las zonas de una tienda específica */
  listZones: protectedProcedure
    .input(z.object({ sapId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      return db
        .select()
        .from(shelfZones)
        .where(eq(shelfZones.sapId, input.sapId))
        .orderBy(shelfZones.id);
    }),

  /** Crea una nueva zona de góndola */
  createZone: protectedProcedure
    .input(
      z.object({
        sapId: z.string().min(1).max(16),
        shelfId: z.string().uuid().nullable().optional(),
        shelfName: z.string().max(256).nullable().optional(),
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),
        rotation: z.number().optional().default(0),
        fillColor: z.string().max(16).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      const result = await db.insert(shelfZones).values({
        sapId: input.sapId,
        shelfId: input.shelfId ?? null,
        shelfName: input.shelfName ?? null,
        x: String(input.x),
        y: String(input.y),
        width: String(input.width),
        height: String(input.height),
        rotation: String(input.rotation ?? 0),
        fillColor: input.fillColor ?? null,
        createdBy: ctx.user.id,
      });
      return { success: true, id: Number(result[0].insertId) };
    }),

  /** Actualiza una zona existente (posición, tamaño, nombre de góndola) */
  updateZone: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        sapId: z.string(),
        shelfId: z.string().uuid().nullable().optional(),
        shelfName: z.string().max(256).nullable().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
        rotation: z.number().optional(),
        fillColor: z.string().max(16).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      const updateData: Record<string, unknown> = {};
      if (input.shelfId !== undefined) updateData.shelfId = input.shelfId;
      if (input.shelfName !== undefined) updateData.shelfName = input.shelfName;
      if (input.x !== undefined) updateData.x = String(input.x);
      if (input.y !== undefined) updateData.y = String(input.y);
      if (input.width !== undefined) updateData.width = String(input.width);
      if (input.height !== undefined) updateData.height = String(input.height);
      if (input.rotation !== undefined) updateData.rotation = String(input.rotation);
      if (input.fillColor !== undefined) updateData.fillColor = input.fillColor;

      await db
        .update(shelfZones)
        .set(updateData)
        .where(and(eq(shelfZones.id, input.id), eq(shelfZones.sapId, input.sapId)));

      return { success: true };
    }),

  /** Elimina una zona de góndola */
  deleteZone: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), sapId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      await db
        .delete(shelfZones)
        .where(and(eq(shelfZones.id, input.id), eq(shelfZones.sapId, input.sapId)));
      return { success: true };
    }),

  /** Reemplaza todas las zonas de una tienda (bulk save desde el canvas) */
  saveAllZones: protectedProcedure
    .input(
      z.object({
        sapId: z.string().min(1).max(16),
        zones: z.array(
          z.object({
            shelfId: z.string().uuid().nullable().optional(),
            shelfName: z.string().max(256).nullable().optional(),
            x: z.number(),
            y: z.number(),
            width: z.number().positive(),
            height: z.number().positive(),
            rotation: z.number().optional().default(0),
            fillColor: z.string().max(16).nullable().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      // Eliminar todas las zonas actuales de la tienda
      await db.delete(shelfZones).where(eq(shelfZones.sapId, input.sapId));

      // Insertar las nuevas zonas
      if (input.zones.length > 0) {
        await db.insert(shelfZones).values(
          input.zones.map((zone) => ({
            sapId: input.sapId,
            shelfId: zone.shelfId ?? null,
            shelfName: zone.shelfName ?? null,
            x: String(zone.x),
            y: String(zone.y),
            width: String(zone.width),
            height: String(zone.height),
            rotation: String(zone.rotation ?? 0),
            fillColor: zone.fillColor ?? null,
            createdBy: ctx.user.id,
          }))
        );
      }

      return { success: true, count: input.zones.length };
    }),
});
