/**
 * ownBrandRouter.ts
 * Endpoints para el Portal Marca Propia (own_brand_user, system_specialist, admin).
 * Todas las queries son READ-ONLY sobre PostgreSQL, filtradas por las marcas
 * configuradas globalmente en la tabla MySQL `own_brand_brands`.
 *
 * DIFERENCIA CLAVE vs supplierPortalRouter:
 * En lugar de filtrar por proveedor, se filtra por las marcas (brand_id) configuradas
 * en own_brand_brands. Cualquier own_brand_user ve todos los artículos de esas marcas.
 *
 * FILTRO DE CATEGORÍA INTERNA:
 * Los procedimientos que aceptan `categoryId` consultan MySQL para obtener los UUIDs
 * de productos asignados a esa categoría, y luego los usan como filtro adicional en
 * las queries de PostgreSQL con `AND p.id = ANY($N::uuid[])`.
 * Si categoryId no se proporciona, se muestran todos los productos de Marca Propia.
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { pool } from "./postgres";
import { getDb } from "./db";
import { ownBrandBrands, ownBrandProductCategories } from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

// Roles que pueden acceder al Portal Marca Propia
const ALLOWED_ROLES = ["own_brand_user", "system_specialist", "admin", "commercial_specialist"];

function assertAccess(role: string) {
  if (!ALLOWED_ROLES.includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acceso solo para usuarios de Marca Propia." });
  }
}

// Roles que pueden administrar la configuración de marcas
const BRAND_ADMIN_ROLES = ["admin", "own_brand_user", "system_specialist"];

function assertBrandAdmin(role: string) {
  if (!BRAND_ADMIN_ROLES.includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo administradores y usuarios Marca Propia pueden gestionar las marcas." });
  }
}

const dateRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

/** Schema base con rango de fechas + filtro de categoría interna opcional */
const dateRangeCategorySchema = dateRangeSchema.extend({
  categoryId: z.number().int().positive().optional(),
  include_igv: z.boolean().default(true),
});

/**
 * Obtiene los brand_ids configurados como Marca Propia desde MySQL.
 * Retorna un array de strings (UUIDs).
 */
async function getOwnBrandIds(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ brandId: ownBrandBrands.brandId }).from(ownBrandBrands);
  return rows.map((r: { brandId: string }) => r.brandId);
}

/**
 * Obtiene los IDs de artículos (UUIDs de PostgreSQL) asignados a una categoría interna.
 * Consulta MySQL una sola vez y devuelve los UUIDs para usarlos como filtro en PostgreSQL.
 * Retorna null si no se especifica categoryId (sin filtro de categoría).
 */
async function getProductIdsByCategory(categoryId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ articleId: ownBrandProductCategories.articleId })
    .from(ownBrandProductCategories)
    .where(eq(ownBrandProductCategories.categoryId, categoryId));
  return rows.map((r: { articleId: string }) => r.articleId);
}

/**
 * Construye el subquery de IDs de productos cuya marca está en la lista de marcas propias.
 * Retorna { subquery, params } donde subquery usa $N para los brand_ids.
 * startParamIdx: índice del primer parámetro disponible (1-based).
 */
function buildBrandProductsSubquery(brandIds: string[], startParamIdx: number): { subquery: string; params: string[] } {
  if (brandIds.length === 0) {
    return { subquery: "(SELECT NULL::uuid WHERE false)", params: [] };
  }
  const placeholders = brandIds.map((_, i) => `$${startParamIdx + i}`).join(", ");
  return {
    subquery: `(SELECT id FROM public.products WHERE brand_id IN (${placeholders}))`,
    params: brandIds,
  };
}

/**
 * Agrega la cláusula de filtro por categoría interna a los params y clauses.
 * Si categoryProductIds es null, no agrega ningún filtro.
 * Si categoryProductIds es un array vacío, agrega una cláusula que no devuelve resultados.
 */
function addCategoryFilter(
  params: (string | number | string[])[],
  clauses: string[],
  categoryProductIds: string[] | null
): void {
  if (categoryProductIds === null) return;
  if (categoryProductIds.length === 0) {
    // Sin productos en la categoría → forzar resultado vacío
    clauses.push("AND false");
    return;
  }
  params.push(categoryProductIds);
  clauses.push(`AND p.id = ANY($${params.length}::uuid[])`);
}

export const ownBrandRouter = router({
  // ─── GESTIÓN DE MARCAS ────────────────────────────────────────────────────────

  /**
   * Lista todas las marcas configuradas como Marca Propia (con nombre desde PostgreSQL).
   */
  listBrands: protectedProcedure.query(async ({ ctx }) => {
    assertBrandAdmin((ctx.user as any).role);
    const brandIds = await getOwnBrandIds();
    if (brandIds.length === 0) return [];

    const placeholders = brandIds.map((_, i) => `$${i + 1}`).join(", ");
    const res = await pool.query(
      `SELECT id, name FROM public.brands WHERE id IN (${placeholders}) ORDER BY name ASC`,
      brandIds
    );

    // Incluir brand_ids que no tienen nombre en PostgreSQL (por si acaso)
    const found = new Set(res.rows.map((r: any) => r.id));
    const extra = brandIds.filter((id) => !found.has(id)).map((id) => ({ id, name: id }));

    return [...res.rows, ...extra] as Array<{ id: string; name: string }>;
  }),

  /**
   * Lista todas las marcas disponibles en PostgreSQL para el selector de agregar.
   */
  listAllBrands: protectedProcedure.query(async ({ ctx }) => {
    assertBrandAdmin((ctx.user as any).role);
    const res = await pool.query(
      `SELECT id, name FROM public.brands ORDER BY name ASC LIMIT 1000`
    );
    return res.rows as Array<{ id: string; name: string }>;
  }),

  /**
   * Agrega una marca a la configuración global de Marca Propia.
   */
  addBrand: protectedProcedure
    .input(z.object({ brandId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      assertBrandAdmin((ctx.user as any).role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
      await db.insert(ownBrandBrands).ignore().values({ brandId: input.brandId });
      return { ok: true };
    }),

  /**
   * Elimina una marca de la configuración global de Marca Propia.
   */
  removeBrand: protectedProcedure
    .input(z.object({ brandId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertBrandAdmin((ctx.user as any).role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible." });
      await db.delete(ownBrandBrands).where(eq(ownBrandBrands.brandId, input.brandId));
      return { ok: true };
    }),

  // ─── KPIs Y VENTAS ────────────────────────────────────────────────────────────

  /**
   * KPIs de ventas de los productos Marca Propia en el rango de fechas.
   * Acepta categoryId opcional para filtrar por categoría interna.
   */
  getSalesSummary: protectedProcedure
    .input(dateRangeCategorySchema)
    .query(async ({ ctx, input }) => {
      assertAccess((ctx.user as any).role);
      const brandIds = await getOwnBrandIds();
      const from = input.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      const to = input.to ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];

      if (brandIds.length === 0) {
        return { total_tickets: 0, productos_vendidos: 0, total_ventas: "0", total_unidades: "0", tiendas_activas: 0 };
      }

      // Filtro de categoría interna: consulta MySQL una sola vez
      const categoryProductIds = input.categoryId != null
        ? await getProductIdsByCategory(input.categoryId)
        : null;
      if (categoryProductIds !== null && categoryProductIds.length === 0) {
        return { total_tickets: 0, productos_vendidos: 0, total_ventas: "0", total_unidades: "0", tiendas_activas: 0 };
      }

      const amtCol = input.include_igv ? 'sd.total' : 'sd.subtotal';
      const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);
      const params: (string | number | string[])[] = [...brandParams];
      const clauses: string[] = [];
      addCategoryFilter(params, clauses, categoryProductIds);
      const fromIdx = params.length + 1;
      const toIdx = fromIdx + 1;

      const res = await pool.query(
        `SELECT
           COUNT(DISTINCT sh.id)::int                    AS total_tickets,
           COUNT(DISTINCT p.id)::int                     AS productos_vendidos,
           ROUND(SUM(${amtCol})::numeric, 2)              AS total_ventas,
           ROUND(SUM(sd.quantity)::numeric, 2)           AS total_unidades,
           COUNT(DISTINCT sh.branch_id)::int             AS tiendas_activas
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         WHERE p.id IN ${subquery}
           ${clauses.join(" ")}
           AND sh.doc_date::date BETWEEN $${fromIdx} AND $${toIdx}`,
        [...params, from, to]
      );
      return res.rows[0] as {
        total_tickets: number;
        productos_vendidos: number;
        total_ventas: string;
        total_unidades: string;
        tiendas_activas: number;
      };
    }),

  /**
   * Ventas diarias de Marca Propia (para gráfico de tendencia).
   * Acepta categoryId opcional para filtrar por categoría interna.
   */
  getDailySales: protectedProcedure
    .input(dateRangeCategorySchema)
    .query(async ({ ctx, input }) => {
      assertAccess((ctx.user as any).role);
      const brandIds = await getOwnBrandIds();
      const from = input.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      const to = input.to ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];

      if (brandIds.length === 0) return [];

      const categoryProductIds = input.categoryId != null
        ? await getProductIdsByCategory(input.categoryId)
        : null;
      if (categoryProductIds !== null && categoryProductIds.length === 0) return [];

      const amtCol = input.include_igv ? 'sd.total' : 'sd.subtotal';
      const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);
      const params: (string | number | string[])[] = [...brandParams];
      const clauses: string[] = [];
      addCategoryFilter(params, clauses, categoryProductIds);
      const fromIdx = params.length + 1;
      const toIdx = fromIdx + 1;

      const res = await pool.query(
        `SELECT
           sh.doc_date::date                             AS fecha,
           ROUND(SUM(${amtCol})::numeric, 2)              AS total_ventas,
           COUNT(DISTINCT sh.id)::int                    AS tickets,
           ROUND(SUM(sd.quantity)::numeric, 2)           AS unidades
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         WHERE p.id IN ${subquery}
           ${clauses.join(" ")}
           AND sh.doc_date::date BETWEEN $${fromIdx} AND $${toIdx}
         GROUP BY sh.doc_date::date
         ORDER BY fecha ASC`,
        [...params, from, to]
      );
      return res.rows as Array<{ fecha: string; total_ventas: string; tickets: number; unidades: string }>;
    }),

  /**
   * Top productos Marca Propia más vendidos.
   * Acepta categoryId opcional para filtrar por categoría interna.
   */
  getTopProducts: protectedProcedure
    .input(dateRangeCategorySchema.extend({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      assertAccess((ctx.user as any).role);
      const brandIds = await getOwnBrandIds();
      const from = input.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      const to = input.to ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];

      if (brandIds.length === 0) return [];

      const categoryProductIds = input.categoryId != null
        ? await getProductIdsByCategory(input.categoryId)
        : null;
      if (categoryProductIds !== null && categoryProductIds.length === 0) return [];

      const amtCol = input.include_igv ? 'sd.total' : 'sd.subtotal';
      const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);
      const params: (string | number | string[])[] = [...brandParams];
      const clauses: string[] = [];
      addCategoryFilter(params, clauses, categoryProductIds);
      const fromIdx = params.length + 1;
      const toIdx = fromIdx + 1;
      const limitIdx = toIdx + 1;

      const res = await pool.query(
        `SELECT
           p.name                                        AS producto,
           p.int_sku,
           ROUND(SUM(${amtCol})::numeric, 2)              AS total_ventas,
           ROUND(SUM(sd.quantity)::numeric, 2)           AS unidades_vendidas,
           COUNT(DISTINCT sh.id)::int                    AS tickets
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         WHERE p.id IN ${subquery}
           ${clauses.join(" ")}
           AND sh.doc_date::date BETWEEN $${fromIdx} AND $${toIdx}
         GROUP BY p.id, p.name, p.int_sku
         ORDER BY total_ventas DESC
         LIMIT $${limitIdx}`,
        [...params, from, to, input.limit]
      );
      return res.rows as Array<{ producto: string; int_sku: string; total_ventas: string; unidades_vendidas: string; tickets: number }>;
    }),

  /**
   * Ventas por tienda de Marca Propia.
   * Acepta categoryId opcional para filtrar por categoría interna.
   */
  getSalesByBranch: protectedProcedure
    .input(dateRangeCategorySchema)
    .query(async ({ ctx, input }) => {
      assertAccess((ctx.user as any).role);
      const brandIds = await getOwnBrandIds();
      const from = input.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      const to = input.to ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];

      if (brandIds.length === 0) return [];

      const categoryProductIds = input.categoryId != null
        ? await getProductIdsByCategory(input.categoryId)
        : null;
      if (categoryProductIds !== null && categoryProductIds.length === 0) return [];

      const amtCol = input.include_igv ? 'sd.total' : 'sd.subtotal';
      const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);
      const params: (string | number | string[])[] = [...brandParams];
      const clauses: string[] = [];
      addCategoryFilter(params, clauses, categoryProductIds);
      const fromIdx = params.length + 1;
      const toIdx = fromIdx + 1;

      const res = await pool.query(
        `SELECT
           b.name                                        AS tienda,
           b.sap_id,
           ROUND(SUM(${amtCol})::numeric, 2)              AS total_ventas,
           ROUND(SUM(sd.quantity)::numeric, 2)           AS unidades,
           COUNT(DISTINCT sh.id)::int                    AS tickets
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         JOIN public.branches b ON b.id = sh.branch_id
         WHERE p.id IN ${subquery}
           ${clauses.join(" ")}
           AND sh.doc_date::date BETWEEN $${fromIdx} AND $${toIdx}
         GROUP BY b.id, b.name, b.sap_id
         ORDER BY total_ventas DESC`,
        [...params, from, to]
      );
      return res.rows as Array<{ tienda: string; sap_id: string; total_ventas: string; unidades: string; tickets: number }>;
    }),

  /**
   * Ventas mensuales de Marca Propia (últimos 6 meses).
   */
  getMonthlySales: protectedProcedure.query(async ({ ctx }) => {
    assertAccess((ctx.user as any).role);
    const brandIds = await getOwnBrandIds();
    if (brandIds.length === 0) return [];

    const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);

    const res = await pool.query(
      `SELECT
         TO_CHAR(sh.doc_date, 'YYYY-MM')                AS mes,
         ROUND(SUM(sd.total)::numeric, 2)               AS total_ventas,
         COUNT(DISTINCT sh.id)::int                     AS tickets,
         ROUND(SUM(sd.quantity)::numeric, 2)            AS unidades
       FROM public.sales_detail sd
       JOIN public.products p ON p.id = sd.product_id
       JOIN public.sales_header sh ON sh.id = sd.header_id
       WHERE p.id IN ${subquery}
         AND sh.doc_date >= NOW() - INTERVAL '6 months'
       GROUP BY TO_CHAR(sh.doc_date, 'YYYY-MM')
       ORDER BY mes ASC`,
      brandParams
    );
    return res.rows as Array<{ mes: string; total_ventas: string; tickets: number; unidades: string }>;
  }),

  // ─── VENTAS POR CATEGORÍA INTERNA (para gráfico de pie en Dashboard) ──────────

  /**
   * Ventas agrupadas por categoría interna de Marca Propia.
   * Devuelve [{categoryId, categoryName, categoryColor, totalVentas, totalUnidades}]
   * para el gráfico de pie del Dashboard.
   */
  getSalesByCategory: protectedProcedure
    .input(dateRangeSchema.extend({ include_igv: z.boolean().default(true) }))
    .query(async ({ ctx, input }) => {
      assertAccess((ctx.user as any).role);
      const brandIds = await getOwnBrandIds();
      const from = input.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      const to = input.to ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];

      if (brandIds.length === 0) return [];

      // Obtener todas las asignaciones de categorías desde MySQL
      const db = await getDb();
      if (!db) return [];

      // Importar las tablas necesarias para la consulta
      const { ownBrandCategories } = await import("../drizzle/schema");

      // Obtener categorías con sus productos asignados
      const assignments = await db
        .select({
          articleId: ownBrandProductCategories.articleId,
          categoryId: ownBrandProductCategories.categoryId,
        })
        .from(ownBrandProductCategories);

      if (assignments.length === 0) return [];

      // Obtener las categorías para tener nombre y color
      const categories = await db
        .select({
          id: ownBrandCategories.id,
          name: ownBrandCategories.name,
          color: ownBrandCategories.color,
        })
        .from(ownBrandCategories);

      const categoryMap = new Map(categories.map(c => [c.id, c]));

      // Agrupar articleIds por categoryId
      const categoryArticles = new Map<number, string[]>();
      for (const a of assignments) {
        if (!categoryArticles.has(a.categoryId)) {
          categoryArticles.set(a.categoryId, []);
        }
        categoryArticles.get(a.categoryId)!.push(a.articleId);
      }

      // Para cada categoría, consultar ventas en PostgreSQL
      const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);

      const results: Array<{
        categoryId: number;
        categoryName: string;
        categoryColor: string;
        totalVentas: string;
        totalUnidades: string;
      }> = [];

      for (const [catId, articleIds] of Array.from(categoryArticles.entries())) {
        const cat = categoryMap.get(catId);
        if (!cat) continue;

        const params: (string | number | string[])[] = [...brandParams];
        params.push(articleIds);
        const catFilterIdx = params.length;
        const fromIdx = catFilterIdx + 1;
        const toIdx = fromIdx + 1;

        const amtColCat = input.include_igv ? 'sd.total' : 'sd.subtotal';
        const res = await pool.query(
          `SELECT
             ROUND(SUM(${amtColCat})::numeric, 2)  AS total_ventas,
             ROUND(SUM(sd.quantity)::numeric, 2) AS total_unidades
           FROM public.sales_detail sd
           JOIN public.products p ON p.id = sd.product_id
           JOIN public.sales_header sh ON sh.id = sd.header_id
           WHERE p.id IN ${subquery}
             AND p.id = ANY($${catFilterIdx}::uuid[])
             AND sh.doc_date::date BETWEEN $${fromIdx} AND $${toIdx}`,
          [...params, from, to]
        );

        const row = res.rows[0];
        if (row && (parseFloat(row.total_ventas) > 0 || parseFloat(row.total_unidades) > 0)) {
          results.push({
            categoryId: catId,
            categoryName: cat.name,
            categoryColor: cat.color ?? "#008064",
            totalVentas: row.total_ventas ?? "0",
            totalUnidades: row.total_unidades ?? "0",
          });
        }
      }

      // Ordenar por ventas descendente
      return results.sort((a, b) => parseFloat(b.totalVentas) - parseFloat(a.totalVentas));
    }),

  // ─── TIENDAS PARA FILTROS ─────────────────────────────────────────────────────

  /**
   * Tiendas con stock de productos Marca Propia (para el selector de filtro en Stock).
   */
  getBranchesForStock: protectedProcedure.query(async ({ ctx }) => {
    assertAccess((ctx.user as any).role);
    const brandIds = await getOwnBrandIds();
    if (brandIds.length === 0) return [];

    const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);

    const res = await pool.query(
      `SELECT DISTINCT b.id, b.name, b.sap_id
       FROM public.stocks st
       JOIN public.products p ON p.id = st.product_id
       JOIN public.branches b ON b.id = st.branch_id
       WHERE p.id IN ${subquery}
         AND st.stock > 0
       ORDER BY b.sap_id ASC`,
      brandParams
    );
    return res.rows as Array<{ id: string; name: string; sap_id: string }>;
  }),

  /**
   * Tiendas con ventas de productos Marca Propia (para el selector de filtro en Ventas).
   */
  getBranchesForSales: protectedProcedure.query(async ({ ctx }) => {
    assertAccess((ctx.user as any).role);
    const brandIds = await getOwnBrandIds();
    if (brandIds.length === 0) return [];

    const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);

    const res = await pool.query(
      `SELECT DISTINCT b.id, b.name, b.sap_id
       FROM public.sales_detail sd
       JOIN public.products p ON p.id = sd.product_id
       JOIN public.sales_header sh ON sh.id = sd.header_id
       JOIN public.branches b ON b.id = sh.branch_id
       WHERE p.id IN ${subquery}
       ORDER BY b.sap_id ASC
       LIMIT 500`,
      brandParams
    );
    return res.rows as Array<{ id: string; name: string; sap_id: string }>;
  }),

  // ─── STOCK ────────────────────────────────────────────────────────────────────

  /**
   * Stock actual de los productos Marca Propia por tienda.
   * Acepta categoryId opcional para filtrar por categoría interna.
   */
  getStockByProduct: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        productId: z.string().optional(),
        branchId: z.string().optional(),
        categoryId: z.number().int().positive().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      assertAccess((ctx.user as any).role);
      const brandIds = await getOwnBrandIds();
      if (brandIds.length === 0) return { rows: [], total: 0 };

      const categoryProductIds = input.categoryId != null
        ? await getProductIdsByCategory(input.categoryId)
        : null;
      if (categoryProductIds !== null && categoryProductIds.length === 0) {
        return { rows: [], total: 0 };
      }

      const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);

      if (input.productId) {
        // Con producto específico: CROSS JOIN para mostrar stock=0 en tiendas sin inventario
        const pidIdx = brandParams.length + 1;
        const limitIdx = pidIdx + 1;
        const offsetIdx = limitIdx + 1;
        const params: (string | number | string[])[] = [...brandParams, input.productId, input.limit, input.offset];
        const branchClause = input.branchId ? `AND b.id = $${offsetIdx + 1}` : "";
        if (input.branchId) params.push(input.branchId);

        // Si hay filtro de categoría, verificar que el producto pertenezca a esa categoría
        const catCheck = categoryProductIds !== null
          ? `AND id = ANY($${params.length + 1}::uuid[])`
          : "";
        if (categoryProductIds !== null) params.push(categoryProductIds);

        const res = await pool.query(
          `SELECT
             p.name                                        AS producto,
             p.int_sku,
             b.id                                          AS branch_id,
             b.name                                        AS tienda,
             b.sap_id,
             COALESCE(st.stock, 0)                         AS stock_actual,
             st.min_stock
           FROM public.branches b
           CROSS JOIN (
             SELECT id, name, int_sku FROM public.products
             WHERE id = $${pidIdx} AND id IN ${subquery} ${catCheck}
           ) p
           LEFT JOIN public.stocks st ON st.product_id = p.id AND st.branch_id = b.id
           WHERE 1=1 ${branchClause}
           ORDER BY b.sap_id ASC
           LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
          params
        );

        const countParams: (string | number | string[])[] = [...brandParams, input.productId];
        if (input.branchId) countParams.push(input.branchId);
        const catCheckCount = categoryProductIds !== null
          ? `AND id = ANY($${countParams.length + 1}::uuid[])`
          : "";
        if (categoryProductIds !== null) countParams.push(categoryProductIds);

        const countRes = await pool.query(
          `SELECT COUNT(*)::int AS total
           FROM public.branches b
           CROSS JOIN (
             SELECT id FROM public.products
             WHERE id = $${pidIdx} AND id IN ${subquery} ${catCheckCount}
           ) p
           WHERE 1=1 ${input.branchId ? `AND b.id = $${brandParams.length + 2}` : ""}`,
          countParams
        );

        return {
          rows: res.rows as Array<{ producto: string; int_sku: string; branch_id: string; tienda: string; sap_id: string; stock_actual: number; min_stock: number | null }>,
          total: countRes.rows[0].total as number,
        };
      }

      // Sin producto específico: solo filas con stock > 0
      const extraParams: (string | number | string[])[] = [...brandParams, input.limit, input.offset];
      const extraClauses: string[] = [];

      if (input.search) {
        extraParams.push(`%${input.search}%`);
        extraClauses.push(`AND (p.name ILIKE $${extraParams.length} OR p.int_sku::text ILIKE $${extraParams.length})`);
      }
      if (input.branchId) {
        extraParams.push(input.branchId);
        extraClauses.push(`AND b.id = $${extraParams.length}`);
      }
      addCategoryFilter(extraParams, extraClauses, categoryProductIds);

      const limitIdx = brandParams.length + 1;
      const offsetIdx = limitIdx + 1;

      const res = await pool.query(
        `SELECT
           p.name                                        AS producto,
           p.int_sku,
           b.id                                          AS branch_id,
           b.name                                        AS tienda,
           b.sap_id,
           st.stock                                      AS stock_actual,
           st.min_stock
         FROM public.stocks st
         JOIN public.products p ON p.id = st.product_id
         JOIN public.branches b ON b.id = st.branch_id
         WHERE p.id IN ${subquery}
           AND st.stock > 0
           ${extraClauses.join(" ")}
         ORDER BY p.name ASC, b.sap_id ASC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        extraParams
      );

      const countExtraParams: (string | number | string[])[] = [...brandParams];
      const countClauses: string[] = [];
      if (input.search) {
        countExtraParams.push(`%${input.search}%`);
        countClauses.push(`AND (p.name ILIKE $${countExtraParams.length} OR p.int_sku::text ILIKE $${countExtraParams.length})`);
      }
      if (input.branchId) {
        countExtraParams.push(input.branchId);
        countClauses.push(`AND b.id = $${countExtraParams.length}`);
      }
      addCategoryFilter(countExtraParams, countClauses, categoryProductIds);

      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM public.stocks st
         JOIN public.products p ON p.id = st.product_id
         JOIN public.branches b ON b.id = st.branch_id
         WHERE p.id IN ${subquery}
           AND st.stock > 0
           ${countClauses.join(" ")}`,
        countExtraParams
      );

      return {
        rows: res.rows as Array<{ producto: string; int_sku: string; branch_id: string; tienda: string; sap_id: string; stock_actual: number; min_stock: number | null }>,
        total: countRes.rows[0].total as number,
      };
    }),

  /**
   * Exportación completa del stock Marca Propia (sin paginación).
   * Acepta categoryId opcional para filtrar por categoría interna.
   */
  exportStockByProduct: protectedProcedure
    .input(z.object({
      productId: z.string().optional(),
      branchId: z.string().optional(),
      categoryId: z.number().int().positive().optional(),
    }))
    .query(async ({ ctx, input }) => {
      assertAccess((ctx.user as any).role);
      const brandIds = await getOwnBrandIds();
      if (brandIds.length === 0) return [];

      const categoryProductIds = input.categoryId != null
        ? await getProductIdsByCategory(input.categoryId)
        : null;
      if (categoryProductIds !== null && categoryProductIds.length === 0) return [];

      const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);

      if (input.productId) {
        const pidIdx = brandParams.length + 1;
        const params: (string | number | string[])[] = [...brandParams, input.productId];
        const branchClause = input.branchId ? `AND b.id = $${params.length + 1}` : "";
        if (input.branchId) params.push(input.branchId);
        const catCheck = categoryProductIds !== null
          ? `AND id = ANY($${params.length + 1}::uuid[])`
          : "";
        if (categoryProductIds !== null) params.push(categoryProductIds);

        const res = await pool.query(
          `SELECT
             p.name AS producto, p.int_sku, b.id AS branch_id, b.name AS tienda,
             b.sap_id, COALESCE(st.stock, 0) AS stock_actual, st.min_stock
           FROM public.branches b
           CROSS JOIN (
             SELECT id, name, int_sku FROM public.products
             WHERE id = $${pidIdx} AND id IN ${subquery} ${catCheck}
           ) p
           LEFT JOIN public.stocks st ON st.product_id = p.id AND st.branch_id = b.id
           WHERE 1=1 ${branchClause}
           ORDER BY b.sap_id ASC`,
          params
        );
        return res.rows as Array<{ producto: string; int_sku: string; branch_id: string; tienda: string; sap_id: string; stock_actual: number; min_stock: number | null }>;
      }

      const extraParams: (string | number | string[])[] = [...brandParams];
      const extraClauses: string[] = [];
      if (input.branchId) {
        extraParams.push(input.branchId);
        extraClauses.push(`AND b.id = $${extraParams.length}`);
      }
      addCategoryFilter(extraParams, extraClauses, categoryProductIds);

      const res = await pool.query(
        `SELECT
           p.name AS producto, p.int_sku, b.id AS branch_id, b.name AS tienda,
           b.sap_id, st.stock AS stock_actual, st.min_stock
         FROM public.stocks st
         JOIN public.products p ON p.id = st.product_id
         JOIN public.branches b ON b.id = st.branch_id
         WHERE p.id IN ${subquery}
           AND st.stock > 0
           ${extraClauses.join(" ")}
         ORDER BY p.name ASC, b.sap_id ASC`,
        extraParams
      );
      return res.rows as Array<{ producto: string; int_sku: string; branch_id: string; tienda: string; sap_id: string; stock_actual: number; min_stock: number | null }>;
    }),

  // ─── RECEPCIONES ─────────────────────────────────────────────────────────────

  /**
   * Entregas de mercadería de productos Marca Propia.
   */
  getReceptions: protectedProcedure
    .input(
      z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      assertAccess((ctx.user as any).role);
      const brandIds = await getOwnBrandIds();
      const from = input.from ?? new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
      const to = input.to ?? new Date().toISOString().split("T")[0];

      if (brandIds.length === 0) return { rows: [], total: 0 };

      const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);
      const fromIdx = brandParams.length + 1;
      const toIdx = fromIdx + 1;
      const limitIdx = toIdx + 1;
      const offsetIdx = limitIdx + 1;

      const res = await pool.query(
        `SELECT
           r.oc,
           r.date::date                                  AS fecha,
           b.name                                        AS tienda,
           b.sap_id,
           p.name                                        AS producto,
           p.int_sku,
           r.ordered_quantity,
           r.received_quantity,
           r.status
         FROM public.receptions r
         JOIN public.products p ON p.id = r.product_id
         JOIN public.branches b ON b.id = r.branch_id
         WHERE p.id IN ${subquery}
           AND r.date::date BETWEEN $${fromIdx} AND $${toIdx}
         ORDER BY r.date DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...brandParams, from, to, input.limit, input.offset]
      );

      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM public.receptions r
         JOIN public.products p ON p.id = r.product_id
         WHERE p.id IN ${subquery}
           AND r.date::date BETWEEN $${fromIdx} AND $${toIdx}`,
        [...brandParams, from, to]
      );

      return {
        rows: res.rows as Array<{ oc: string; fecha: string; tienda: string; sap_id: string; producto: string; int_sku: string; ordered_quantity: number; received_quantity: number | null; status: string | null }>,
        total: countRes.rows[0].total as number,
      };
    }),

  // ─── CATÁLOGO ─────────────────────────────────────────────────────────────────

  /**
   * Catálogo de productos Marca Propia con stock total.
   * Acepta categoryId opcional para filtrar por categoría interna.
   */
  getProductCatalog: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        categoryId: z.number().int().positive().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      assertAccess((ctx.user as any).role);
      const brandIds = await getOwnBrandIds();
      if (brandIds.length === 0) return { rows: [], total: 0 };

      const categoryProductIds = input.categoryId != null
        ? await getProductIdsByCategory(input.categoryId)
        : null;
      if (categoryProductIds !== null && categoryProductIds.length === 0) {
        return { rows: [], total: 0 };
      }

      const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);
      const params: (string | number | string[])[] = [...brandParams];
      const whereClauses: string[] = [];

      if (input.search) {
        params.push(`%${input.search}%`);
        whereClauses.push(`AND (p.name ILIKE $${params.length} OR p.int_sku::text ILIKE $${params.length})`);
      }
      addCategoryFilter(params, whereClauses, categoryProductIds);

      const limitIdx = params.length + 1;
      const offsetIdx = limitIdx + 1;

      const res = await pool.query(
        `SELECT
           p.id,
           p.name,
           p.int_sku,
           p.short_description                           AS description,
           COALESCE(SUM(st.stock), 0)::int              AS stock_total,
           COUNT(DISTINCT st.branch_id)::int             AS tiendas_con_stock
         FROM public.products p
         LEFT JOIN public.stocks st ON st.product_id = p.id AND st.stock > 0
         WHERE p.id IN ${subquery}
           ${whereClauses.join(" ")}
         GROUP BY p.id, p.name, p.int_sku, p.short_description
         ORDER BY p.name ASC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...params, input.limit, input.offset]
      );

      const countParams: (string | number | string[])[] = [...brandParams];
      const countClauses: string[] = [];
      if (input.search) {
        countParams.push(`%${input.search}%`);
        countClauses.push(`AND (p.name ILIKE $${countParams.length} OR p.int_sku::text ILIKE $${countParams.length})`);
      }
      addCategoryFilter(countParams, countClauses, categoryProductIds);

      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM public.products p
         WHERE p.id IN ${subquery}
           ${countClauses.join(" ")}`,
        countParams
      );

      return {
        rows: res.rows as Array<{ id: string; name: string; int_sku: string; description: string | null; stock_total: number; tiendas_con_stock: number }>,
        total: countRes.rows[0].total as number,
      };
    }),

  // ─── VENTAS POR ARTÍCULO × TIENDA ────────────────────────────────────────────

  /**
   * Ventas por artículo × tienda de Marca Propia (con paginación).
   * Acepta categoryId opcional para filtrar por categoría interna.
   */
  getSalesByProductBranch: protectedProcedure
    .input(
      dateRangeCategorySchema.extend({
        search: z.string().optional(),
        productIds: z.array(z.string()).optional(),
        branchId: z.string().optional(),
        groupByProduct: z.boolean().default(true),
        groupByStore: z.boolean().default(true),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      assertAccess((ctx.user as any).role);
      const brandIds = await getOwnBrandIds();
      const from = input.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      const to = input.to ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];

      if (brandIds.length === 0) return { rows: [], total: 0, totals: { cantidad: "0", monto: "0", tickets: 0 } };

      const categoryProductIds = input.categoryId != null
        ? await getProductIdsByCategory(input.categoryId)
        : null;
      if (categoryProductIds !== null && categoryProductIds.length === 0) {
        return { rows: [], total: 0, totals: { cantidad: "0", monto: "0", tickets: 0 } };
      }

       const amtCol = input.include_igv ? 'sd.total' : 'sd.subtotal';
      const gp = input.groupByProduct !== false;
      const gs = input.groupByStore !== false;

      const selectProduct = gp
        ? `p.id AS product_id, p.name AS producto, p.int_sku::text AS sku,`
        : `NULL::uuid AS product_id, '(Todos los productos)' AS producto, '—' AS sku,`;
      const selectStore = gs
        ? `b.id AS branch_id, b.name AS tienda, b.sap_id,`
        : `NULL::uuid AS branch_id, '(Todas las tiendas)' AS tienda, NULL AS sap_id,`;
      const groupByDims = [
        ...(gp ? ["p.id", "p.name", "p.int_sku"] : []),
        ...(gs ? ["b.id", "b.name", "b.sap_id"] : []),
      ].join(", ") || "1=1";
      const countGroupBy = [
        ...(gp ? ["p.id"] : []),
        ...(gs ? ["b.id"] : []),
      ].join(", ") || "1";

      const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);
      const fromIdx = brandParams.length + 1;
      const toIdx = fromIdx + 1;
      const limitIdx = toIdx + 1;
      const offsetIdx = limitIdx + 1;

      const params: (string | number | string[])[] = [...brandParams, from, to, input.limit, input.offset];
      const clauses: string[] = [];

      if (input.productIds && input.productIds.length > 0) {
        params.push(input.productIds);
        clauses.push(`AND p.id = ANY($${params.length}::uuid[])`);
      } else if (input.search) {
        params.push(`%${input.search}%`);
        clauses.push(`AND (p.name ILIKE $${params.length} OR p.int_sku::text ILIKE $${params.length})`);
      }
      if (input.branchId) {
        params.push(input.branchId);
        clauses.push(`AND b.id = $${params.length}`);
      }
      addCategoryFilter(params, clauses, categoryProductIds);

      const res = await pool.query(
        `SELECT
           ${selectProduct}
           ${selectStore}
           SUM(sd.quantity)::numeric                     AS cantidad,
           ROUND(SUM(${amtCol})::numeric, 2)              AS monto,
           COUNT(DISTINCT sh.id)::int                    AS tickets
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         JOIN public.branches b ON b.id = sh.branch_id
         WHERE p.id IN ${subquery}
           AND sh.doc_date::date BETWEEN $${fromIdx} AND $${toIdx}
           ${clauses.join(" ")}
         GROUP BY ${groupByDims}
         ORDER BY monto DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      );

      // Count
      const countParams: (string | number | string[])[] = [...brandParams, from, to];
      const countClauses: string[] = [];
      if (input.productIds && input.productIds.length > 0) {
        countParams.push(input.productIds);
        countClauses.push(`AND p.id = ANY($${countParams.length}::uuid[])`);
      } else if (input.search) {
        countParams.push(`%${input.search}%`);
        countClauses.push(`AND (p.name ILIKE $${countParams.length} OR p.int_sku::text ILIKE $${countParams.length})`);
      }
      if (input.branchId) {
        countParams.push(input.branchId);
        countClauses.push(`AND b.id = $${countParams.length}`);
      }
      addCategoryFilter(countParams, countClauses, categoryProductIds);

      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM (
           SELECT ${countGroupBy === "1" ? "1" : countGroupBy}
           FROM public.sales_detail sd
           JOIN public.products p ON p.id = sd.product_id
           JOIN public.sales_header sh ON sh.id = sd.header_id
           JOIN public.branches b ON b.id = sh.branch_id
           WHERE p.id IN ${subquery}
             AND sh.doc_date::date BETWEEN $${fromIdx} AND $${toIdx}
             ${countClauses.join(" ")}
           GROUP BY ${countGroupBy}
         ) sub`,
        countParams
      );

      // Totales
      const totalsParams: (string | number | string[])[] = [...brandParams, from, to];
      const totalsClauses: string[] = [];
      if (input.productIds && input.productIds.length > 0) {
        totalsParams.push(input.productIds);
        totalsClauses.push(`AND p.id = ANY($${totalsParams.length}::uuid[])`);
      } else if (input.search) {
        totalsParams.push(`%${input.search}%`);
        totalsClauses.push(`AND (p.name ILIKE $${totalsParams.length} OR p.int_sku::text ILIKE $${totalsParams.length})`);
      }
      if (input.branchId) {
        totalsParams.push(input.branchId);
        totalsClauses.push(`AND b.id = $${totalsParams.length}`);
      }
      addCategoryFilter(totalsParams, totalsClauses, categoryProductIds);

      const totalsRes = await pool.query(
        `SELECT
           SUM(sd.quantity)::numeric                     AS total_cantidad,
           ROUND(SUM(${amtCol})::numeric, 2)              AS total_monto,
           COUNT(DISTINCT sh.id)::int                    AS total_tickets
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         JOIN public.branches b ON b.id = sh.branch_id
         WHERE p.id IN ${subquery}
           AND sh.doc_date::date BETWEEN $${fromIdx} AND $${toIdx}
           ${totalsClauses.join(" ")}`,
        totalsParams
      );

      return {
        rows: res.rows as Array<{ product_id: string; producto: string; sku: string; branch_id: string; tienda: string; sap_id: string; cantidad: string; monto: string; tickets: number }>,
        total: countRes.rows[0].total as number,
        totals: {
          cantidad: totalsRes.rows[0].total_cantidad as string,
          monto: totalsRes.rows[0].total_monto as string,
          tickets: totalsRes.rows[0].total_tickets as number,
        },
      };
    }),

  /**
   * Detalle diario de ventas para un producto+tienda (modal).
   */
  getSalesDailyDetail: protectedProcedure
    .input(z.object({ productId: z.string(), branchId: z.string(), from: z.string(), to: z.string() }))
    .query(async ({ ctx, input }) => {
      assertAccess((ctx.user as any).role);
      const brandIds = await getOwnBrandIds();
      if (brandIds.length === 0) return [];

      const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);
      const pidIdx = brandParams.length + 1;
      const bidIdx = pidIdx + 1;
      const fromIdx = bidIdx + 1;
      const toIdx = fromIdx + 1;

      const res = await pool.query(
        `SELECT
           sh.doc_date::date                             AS fecha,
           SUM(sd.quantity)::numeric                     AS cantidad,
           ROUND(SUM(sd.total)::numeric, 2)              AS monto,
           COUNT(DISTINCT sh.id)::int                    AS tickets
         FROM public.sales_detail sd
         JOIN public.sales_header sh ON sh.id = sd.header_id
         JOIN public.products p ON p.id = sd.product_id
         WHERE p.id IN ${subquery}
           AND sd.product_id = $${pidIdx}
           AND sh.branch_id = $${bidIdx}
           AND sh.doc_date::date BETWEEN $${fromIdx} AND $${toIdx}
         GROUP BY sh.doc_date::date
         ORDER BY fecha ASC`,
        [...brandParams, input.productId, input.branchId, input.from, input.to]
      );
      return res.rows as Array<{ fecha: string; cantidad: string; monto: string; tickets: number }>;
    }),

  /**
   * Exportación completa de ventas por artículo × tienda (sin paginación).
   * Acepta categoryId opcional para filtrar por categoría interna.
   */
  exportSalesByProductBranch: protectedProcedure
    .input(dateRangeCategorySchema.extend({
      search: z.string().optional(),
      productIds: z.array(z.string()).optional(),
      branchId: z.string().optional(),
      groupByProduct: z.boolean().default(true),
      groupByStore: z.boolean().default(true),
    }))
    .query(async ({ ctx, input }) => {
      assertAccess((ctx.user as any).role);
      const brandIds = await getOwnBrandIds();
      const from = input.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      const to = input.to ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];

      if (brandIds.length === 0) return [];

      const categoryProductIds = input.categoryId != null
        ? await getProductIdsByCategory(input.categoryId)
        : null;
      if (categoryProductIds !== null && categoryProductIds.length === 0) return [];

        const amtColExport = input.include_igv ? 'sd.total' : 'sd.subtotal';
      const gp = input.groupByProduct !== false;
      const gs = input.groupByStore !== false;

      const selectProduct = gp
        ? `p.name AS producto, p.int_sku::text AS sku,`
        : `'(Todos los productos)' AS producto, '—' AS sku,`;
      const selectStore = gs
        ? `b.name AS tienda, b.sap_id,`
        : `'(Todas las tiendas)' AS tienda, NULL AS sap_id,`;
      const groupByDims = [
        ...(gp ? ["p.id", "p.name", "p.int_sku"] : []),
        ...(gs ? ["b.id", "b.name", "b.sap_id"] : []),
      ].join(", ") || "1=1";

      const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);
      const fromIdx = brandParams.length + 1;
      const toIdx = fromIdx + 1;

      const params: (string | number | string[])[] = [...brandParams, from, to];
      const clauses: string[] = [];

      if (input.productIds && input.productIds.length > 0) {
        params.push(input.productIds);
        clauses.push(`AND p.id = ANY($${params.length}::uuid[])`);
      } else if (input.search) {
        params.push(`%${input.search}%`);
        clauses.push(`AND (p.name ILIKE $${params.length} OR p.int_sku::text ILIKE $${params.length})`);
      }
      if (input.branchId) {
        params.push(input.branchId);
        clauses.push(`AND b.id = $${params.length}`);
      }
      addCategoryFilter(params, clauses, categoryProductIds);

      const res = await pool.query(
        `SELECT
           ${selectProduct}
           ${selectStore}
           SUM(sd.quantity)::numeric                     AS cantidad,
           ROUND(SUM(${amtColExport})::numeric, 2)              AS monto,
           COUNT(DISTINCT sh.id)::int                    AS tickets
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         JOIN public.branches b ON b.id = sh.branch_id
         WHERE p.id IN ${subquery}
           AND sh.doc_date::date BETWEEN $${fromIdx} AND $${toIdx}
           ${clauses.join(" ")}
         GROUP BY ${groupByDims}
         ORDER BY monto DESC
         LIMIT 10000`,
        params
      );

      return res.rows as Array<{ producto: string; sku: string; tienda: string; sap_id: string | null; cantidad: string; monto: string; tickets: number }>;
    }),

  // ─── LISTA DE PRODUCTOS PARA SELECTS ─────────────────────────────────────────

  /**
   * Lista todos los productos Marca Propia (id, nombre, sku) para los Select desplegables.
   */
  getProductsForBrand: protectedProcedure.query(async ({ ctx }) => {
    assertAccess((ctx.user as any).role);
    const brandIds = await getOwnBrandIds();
    if (brandIds.length === 0) return [];

    const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);

    const res = await pool.query(
      `SELECT DISTINCT
         p.id,
         p.name,
         p.int_sku::text AS sku
       FROM public.products p
       WHERE p.id IN ${subquery}
       ORDER BY p.name ASC
       LIMIT 2000`,
      brandParams
    );
    return res.rows as Array<{ id: string; name: string; sku: string }>;
  }),

  /**
   * Evolución temporal de ventas por período (día/semana/mes)
   * Agrupa por las mismas dimensiones que getSalesByProductBranch
   * Respeta los mismos filtros: marcas propias, productos, tienda, categoría interna, IGV
   */
  getSalesEvolution: protectedProcedure
    .input(
      dateRangeCategorySchema.extend({
        productIds: z.array(z.string()).optional(),
        branchId: z.string().optional(),
        groupByProduct: z.boolean().default(true),
        groupByStore: z.boolean().default(true),
        granularity: z.enum(['day', 'week', 'month']).default('day'),
      })
    )
    .query(async ({ ctx, input }) => {
      assertAccess((ctx.user as any).role);
      const brandIds = await getOwnBrandIds();
      if (brandIds.length === 0) return [];

      const from = input.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const to = input.to ?? new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const amtCol = input.include_igv ? 'sd.total' : 'sd.subtotal';
      const gp = input.groupByProduct !== false;
      const gs = input.groupByStore !== false;

      const categoryProductIds = input.categoryId != null
        ? await getProductIdsByCategory(input.categoryId)
        : null;
      if (categoryProductIds !== null && categoryProductIds.length === 0) return [];

      const dateTrunc = input.granularity === 'day'
        ? `sh.doc_date::date`
        : input.granularity === 'week'
          ? `date_trunc('week', sh.doc_date)::date`
          : `date_trunc('month', sh.doc_date)::date`;

      const selectProduct = gp
        ? `p.id AS product_id, p.name AS producto, p.int_sku::text AS sku,`
        : `NULL::uuid AS product_id, '(Todos)' AS producto, '—' AS sku,`;
      const selectStore = gs
        ? `b.id AS branch_id, b.name AS tienda, b.sap_id,`
        : `NULL::uuid AS branch_id, '(Todas)' AS tienda, NULL AS sap_id,`;

      const groupByDims = [
        ...(gp ? ['p.id', 'p.name', 'p.int_sku'] : []),
        ...(gs ? ['b.id', 'b.name', 'b.sap_id'] : []),
      ];

      const { subquery, params: brandParams } = buildBrandProductsSubquery(brandIds, 1);
      const fromIdx = brandParams.length + 1;
      const toIdx = fromIdx + 1;

      const params: (string | number | string[])[] = [...brandParams, from, to];
      const clauses: string[] = [];

      if (input.productIds && input.productIds.length > 0) {
        params.push(input.productIds);
        clauses.push(`AND p.id = ANY($${params.length}::uuid[])`);
      }
      if (input.branchId) {
        params.push(input.branchId);
        clauses.push(`AND b.id = $${params.length}`);
      }
      addCategoryFilter(params, clauses, categoryProductIds);

      const groupByClause = ['period', ...groupByDims].join(', ');

      const query = `
        SELECT
          ${dateTrunc} AS period,
          ${selectProduct}
          ${selectStore}
          SUM(${amtCol}) AS amount,
          SUM(sd.quantity) AS quantity
        FROM public.sales_header sh
        JOIN public.sales_detail sd ON sd.header_id = sh.id
        JOIN public.products p ON p.id = sd.product_id
        LEFT JOIN public.branches b ON b.id = sh.branch_id
        WHERE sh.doc_date IS NOT NULL
          AND sh.doc_date::date >= $${fromIdx}::date
          AND sh.doc_date::date <= $${toIdx}::date
          AND p.id IN ${subquery}
          ${clauses.join(' ')}
        GROUP BY ${groupByClause}
        ORDER BY period ASC, ${gp ? 'p.name ASC,' : ''} ${gs ? 'b.sap_id ASC' : '1'}
      `;

      const res = await pool.query(query, params);
      return res.rows as Array<{
        period: string;
        product_id: string | null;
        producto: string;
        sku: string;
        branch_id: string | null;
        tienda: string;
        sap_id: string | null;
        amount: string;
        quantity: string;
      }>;
    }),
});
