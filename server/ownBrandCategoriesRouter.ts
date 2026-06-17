/**
 * ownBrandCategoriesRouter.ts
 * Gestión de categorías internas de Marca Propia y mapeo marca→categoría.
 *
 * Las categorías son independientes de las categorías de PostgreSQL.
 * Se almacenan en la BD interna de Manus (MySQL).
 *
 * La clasificación se realiza a nivel de MARCA (brand_id de PostgreSQL),
 * no a nivel de producto individual. Todos los productos de una marca
 * quedan automáticamente en la categoría asignada a esa marca.
 *
 * Roles con acceso de lectura: own_brand_user, system_specialist, admin, commercial_specialist
 * Roles con acceso de escritura: admin, own_brand_user, system_specialist
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { ownBrandCategories, ownBrandCategoryBrands } from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { invalidateOwnBrandIdsCache } from "./ownBrandRouter";

// Roles que pueden acceder al Portal Marca Propia
const ALLOWED_ROLES = ["own_brand_user", "system_specialist", "admin", "commercial_specialist"];

// Roles que pueden gestionar categorías y asignaciones
const CATEGORY_ADMIN_ROLES = ["admin", "own_brand_user", "system_specialist"];

function assertAccess(role: string) {
  if (!ALLOWED_ROLES.includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acceso solo para usuarios de Marca Propia." });
  }
}

function assertCategoryAdmin(role: string) {
  if (!CATEGORY_ADMIN_ROLES.includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo administradores y usuarios Marca Propia pueden gestionar las categorías." });
  }
}

export const ownBrandCategoriesRouter = router({

  // ─── CATEGORÍAS ──────────────────────────────────────────────────────────────

  /**
   * Lista todas las categorías internas activas.
   */
  listCategories: protectedProcedure.query(async ({ ctx }) => {
    assertAccess((ctx.user as any).role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
    return db
      .select()
      .from(ownBrandCategories)
      .orderBy(ownBrandCategories.name);
  }),

  /**
   * Crea una nueva categoría interna.
   */
  createCategory: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      description: z.string().optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertCategoryAdmin((ctx.user as any).role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      // Verificar que no exista una categoría con el mismo nombre
      const existing = await db
        .select({ id: ownBrandCategories.id })
        .from(ownBrandCategories)
        .where(eq(ownBrandCategories.name, input.name));
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `Ya existe una categoría con el nombre "${input.name}".` });
      }
      await db.insert(ownBrandCategories).values({
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? "#008064",
        isActive: 1,
      });
      return { success: true };
    }),

  /**
   * Actualiza una categoría interna existente.
   */
  updateCategory: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(128).optional(),
      description: z.string().optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      isActive: z.number().int().min(0).max(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertCategoryAdmin((ctx.user as any).role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      const { id, ...updates } = input;
      if (Object.keys(updates).length === 0) return { success: true };
      await db
        .update(ownBrandCategories)
        .set(updates)
        .where(eq(ownBrandCategories.id, id));
      return { success: true };
    }),

  /**
   * Elimina una categoría interna (solo si no tiene marcas asignadas).
   */
  deleteCategory: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertCategoryAdmin((ctx.user as any).role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      // Verificar que no haya marcas asignadas a esta categoría
      const assigned = await db
        .select({ id: ownBrandCategoryBrands.id })
        .from(ownBrandCategoryBrands)
        .where(eq(ownBrandCategoryBrands.categoryId, input.id));
      if (assigned.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `No se puede eliminar: hay ${assigned.length} marca(s) asignada(s) a esta categoría. Reasígnalas primero.`,
        });
      }
      await db.delete(ownBrandCategories).where(eq(ownBrandCategories.id, input.id));
      return { success: true };
    }),

  // ─── MAPEO MARCA → CATEGORÍA ─────────────────────────────────────────────────

  /**
   * Lista todos los mapeos brand_id → category_id existentes.
   */
  listCategoryBrands: protectedProcedure.query(async ({ ctx }) => {
    assertAccess((ctx.user as any).role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
    return await db.select().from(ownBrandCategoryBrands);
  }),

  /**
   * Asigna una marca (brand_id de PostgreSQL) a una categoría interna.
   * Si la marca ya estaba asignada a otra categoría, la reasigna.
   */
  assignBrandToCategory: protectedProcedure
    .input(z.object({
      brandId: z.string().uuid(),
      categoryId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAccess((ctx.user as any).role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      // Verificar que la categoría existe
      const cat = await db.select({ id: ownBrandCategories.id })
        .from(ownBrandCategories)
        .where(and(eq(ownBrandCategories.id, input.categoryId), eq(ownBrandCategories.isActive, 1)));
      if (cat.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Categoría no encontrada o inactiva." });
      }
      // Upsert: si ya existe el brand_id, actualizar la categoría
      const existing = await db.select({ id: ownBrandCategoryBrands.id })
        .from(ownBrandCategoryBrands)
        .where(eq(ownBrandCategoryBrands.brandId, input.brandId));
      if (existing.length > 0) {
        await db.update(ownBrandCategoryBrands)
          .set({ categoryId: input.categoryId })
          .where(eq(ownBrandCategoryBrands.brandId, input.brandId));
      } else {
        await db.insert(ownBrandCategoryBrands).values({
          brandId: input.brandId,
          categoryId: input.categoryId,
        });
      }
      invalidateOwnBrandIdsCache();
      return { success: true };
    }),

  /**
   * Elimina el mapeo de una marca a cualquier categoría.
   */
  removeBrandFromCategory: protectedProcedure
    .input(z.object({ brandId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      assertAccess((ctx.user as any).role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      await db.delete(ownBrandCategoryBrands).where(eq(ownBrandCategoryBrands.brandId, input.brandId));
      invalidateOwnBrandIdsCache();
      return { success: true };
    }),
});
