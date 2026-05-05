/**
 * ownBrandCategoriesRouter.ts
 * Gestión de categorías internas de Marca Propia y asignación de productos.
 *
 * Las categorías son independientes de las categorías de PostgreSQL.
 * Se almacenan en la BD interna de Manus (MySQL).
 *
 * Roles con acceso de lectura: own_brand_user, system_specialist, admin, commercial_specialist
 * Roles con acceso de escritura: admin, own_brand_user, system_specialist
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { ownBrandCategories, ownBrandProductCategories } from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { eq, and, inArray } from "drizzle-orm";

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
   * Elimina una categoría interna (solo si no tiene productos asignados).
   */
  deleteCategory: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertCategoryAdmin((ctx.user as any).role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      // Verificar que no haya productos asignados
      const assigned = await db
        .select({ id: ownBrandProductCategories.id })
        .from(ownBrandProductCategories)
        .where(eq(ownBrandProductCategories.categoryId, input.id));
      if (assigned.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `No se puede eliminar: hay ${assigned.length} producto(s) asignado(s) a esta categoría. Reasígnalos primero.`,
        });
      }
      await db.delete(ownBrandCategories).where(eq(ownBrandCategories.id, input.id));
      return { success: true };
    }),

  // ─── ASIGNACIÓN DE PRODUCTOS ─────────────────────────────────────────────────

  /**
   * Lista todos los productos con su categoría interna asignada.
   * Incluye productos sin categoría (para mostrar en la UI como "Sin categoría").
   */
  listProductAssignments: protectedProcedure.query(async ({ ctx }) => {
    assertAccess((ctx.user as any).role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
    const rows = await db
      .select({
        id: ownBrandProductCategories.id,
        articleId: ownBrandProductCategories.articleId,
        articleName: ownBrandProductCategories.articleName,
        articleCode: ownBrandProductCategories.articleCode,
        categoryId: ownBrandProductCategories.categoryId,
        assignedByName: ownBrandProductCategories.assignedByName,
        updatedAt: ownBrandProductCategories.updatedAt,
      })
      .from(ownBrandProductCategories)
      .orderBy(ownBrandProductCategories.articleName);
    return rows;
  }),

  /**
   * Asigna (o reasigna) un producto a una categoría interna.
   * Si el producto ya tiene asignación, la actualiza (upsert por articleId).
   */
  assignProductCategory: protectedProcedure
    .input(z.object({
      articleId: z.string().min(1).max(64),
      articleName: z.string().optional(),
      articleCode: z.string().optional(),
      categoryId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertCategoryAdmin((ctx.user as any).role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      const user = ctx.user as any;
      // Verificar que la categoría existe
      const cat = await db
        .select({ id: ownBrandCategories.id })
        .from(ownBrandCategories)
        .where(and(eq(ownBrandCategories.id, input.categoryId), eq(ownBrandCategories.isActive, 1)));
      if (cat.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Categoría no encontrada o inactiva." });
      }
      // Upsert: si ya existe la asignación para este articleId, actualizar
      const existing = await db
        .select({ id: ownBrandProductCategories.id })
        .from(ownBrandProductCategories)
        .where(eq(ownBrandProductCategories.articleId, input.articleId));
      if (existing.length > 0) {
        await db
          .update(ownBrandProductCategories)
          .set({
            categoryId: input.categoryId,
            articleName: input.articleName ?? null,
            articleCode: input.articleCode ?? null,
            assignedById: user.id,
            assignedByName: user.name,
          })
          .where(eq(ownBrandProductCategories.articleId, input.articleId));
      } else {
        await db.insert(ownBrandProductCategories).values({
          articleId: input.articleId,
          categoryId: input.categoryId,
          articleName: input.articleName ?? null,
          articleCode: input.articleCode ?? null,
          assignedById: user.id,
          assignedByName: user.name,
        });
      }
      return { success: true };
    }),

  /**
   * Asigna múltiples productos a una categoría en una sola operación (bulk).
   */
  bulkAssignProductCategory: protectedProcedure
    .input(z.object({
      categoryId: z.number().int().positive(),
      products: z.array(z.object({
        articleId: z.string().min(1).max(64),
        articleName: z.string().optional(),
        articleCode: z.string().optional(),
      })).min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      assertCategoryAdmin((ctx.user as any).role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      const user = ctx.user as any;
      // Verificar que la categoría existe
      const cat = await db
        .select({ id: ownBrandCategories.id })
        .from(ownBrandCategories)
        .where(and(eq(ownBrandCategories.id, input.categoryId), eq(ownBrandCategories.isActive, 1)));
      if (cat.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Categoría no encontrada o inactiva." });
      }
      const articleIds = input.products.map(p => p.articleId);
      // Obtener los que ya existen
      const existing = await db
        .select({ articleId: ownBrandProductCategories.articleId })
        .from(ownBrandProductCategories)
        .where(inArray(ownBrandProductCategories.articleId, articleIds));
      const existingIds = new Set(existing.map(e => e.articleId));
      const toInsert = input.products.filter(p => !existingIds.has(p.articleId));
      const toUpdate = input.products.filter(p => existingIds.has(p.articleId));
      // Insertar nuevos
      if (toInsert.length > 0) {
        await db.insert(ownBrandProductCategories).values(
          toInsert.map(p => ({
            articleId: p.articleId,
            categoryId: input.categoryId,
            articleName: p.articleName ?? null,
            articleCode: p.articleCode ?? null,
            assignedById: user.id,
            assignedByName: user.name,
          }))
        );
      }
      // Actualizar existentes
      for (const p of toUpdate) {
        await db
          .update(ownBrandProductCategories)
          .set({
            categoryId: input.categoryId,
            articleName: p.articleName ?? null,
            articleCode: p.articleCode ?? null,
            assignedById: user.id,
            assignedByName: user.name,
          })
          .where(eq(ownBrandProductCategories.articleId, p.articleId));
      }
      return { success: true, inserted: toInsert.length, updated: toUpdate.length };
    }),

  /**
   * Elimina la asignación de categoría de un producto.
   */
  removeProductAssignment: protectedProcedure
    .input(z.object({ articleId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      assertCategoryAdmin((ctx.user as any).role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
      await db
        .delete(ownBrandProductCategories)
        .where(eq(ownBrandProductCategories.articleId, input.articleId));
      return { success: true };
    }),

  /**
   * Devuelve un resumen: cuántos productos tiene cada categoría.
   */
  getCategorySummary: protectedProcedure.query(async ({ ctx }) => {
    assertAccess((ctx.user as any).role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "BD no disponible." });
    const categories = await db.select().from(ownBrandCategories).orderBy(ownBrandCategories.name);
    const assignments = await db
      .select({
        categoryId: ownBrandProductCategories.categoryId,
      })
      .from(ownBrandProductCategories);
    const countMap: Record<number, number> = {};
    for (const a of assignments) {
      countMap[a.categoryId] = (countMap[a.categoryId] ?? 0) + 1;
    }
    return categories.map(cat => ({
      ...cat,
      productCount: countMap[cat.id] ?? 0,
    }));
  }),
});
