/**
 * supplierPortalRouter.ts
 * Endpoints para el portal exclusivo de proveedores (supplier_user).
 * Todas las queries son READ-ONLY sobre PostgreSQL.
 *
 * NOTA DE DISEÑO: La relación entre productos y proveedores se gestiona
 * principalmente a través de la tabla relacional `products_supplier`.
 * El campo `products.supplier_id` es un campo legacy que no siempre está
 * poblado. Por eso todos los queries usan un subquery de IDs de productos
 * obtenidos desde `products_supplier` para garantizar cobertura total.
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { pool } from "./postgres";
import { TRPCError } from "@trpc/server";

// Roles que pueden acceder al portal de proveedores
const ALLOWED_ROLES = ["supplier_user", "system_specialist", "commercial_specialist"];
const ADMIN_ROLES = ["system_specialist", "commercial_specialist"];

// Helper: obtener supplier_id del usuario autenticado o del parámetro de override (para system_specialist / commercial_specialist)
function getSupplierIdFromCtx(
  ctx: { user: { assignedSupplierId?: string | null; role: string } },
  overrideSupplierId?: string | null
) {
  if (!ALLOWED_ROLES.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acceso solo para proveedores." });
  }
  // system_specialist y commercial_specialist pueden pasar un supplierId explícito
  if (ADMIN_ROLES.includes(ctx.user.role)) {
    if (!overrideSupplierId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Selecciona un proveedor para continuar." });
    }
    return overrideSupplierId;
  }
  if (!ctx.user.assignedSupplierId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No tienes un proveedor asignado." });
  }
  return ctx.user.assignedSupplierId;
}

/**
 * Subquery reutilizable: IDs de productos que pertenecen a un proveedor.
 * Combina products_supplier (fuente principal) con products.supplier_id (legacy)
 * para máxima cobertura sin duplicados.
 */
const SUPPLIER_PRODUCTS_SUBQUERY = `
  (
    SELECT product_id FROM public.products_supplier WHERE supplier_id = $1
    UNION
    SELECT id FROM public.products WHERE supplier_id = $1
  )
`;

const dateRangeSchema = z.object({
  from: z.string().optional(), // ISO date string YYYY-MM-DD
  to: z.string().optional(),
});

export const supplierPortalRouter = router({
  /**
   * Lista todos los proveedores (solo para system_specialist y commercial_specialist)
   * Permite seleccionar un proveedor para ver su portal
   */
  listAllSuppliers: protectedProcedure.query(async ({ ctx }) => {
    if (!ADMIN_ROLES.includes((ctx.user as any).role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Solo para especialistas de sistemas o comerciales." });
    }
    const res = await pool.query(
      `SELECT id, ruc, name
       FROM public.suppliers
       ORDER BY name ASC
       LIMIT 500`
    );
    return res.rows as Array<{ id: string; ruc: string; name: string }>;
  }),

  /**
   * Información básica del proveedor asignado al usuario
   */
  getMySupplier: protectedProcedure
    .input(z.object({ supplierId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const supplierId = getSupplierIdFromCtx(ctx as any, input?.supplierId);
    const res = await pool.query(
      `SELECT id, ruc, name, description, sap_id, status
       FROM public.suppliers
       WHERE id = $1`,
      [supplierId]
    );
    if (!res.rows[0]) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Proveedor no encontrado." });
    }
    return res.rows[0] as {
      id: string;
      ruc: string;
      name: string;
      description: string | null;
      sap_id: string;
      status: boolean | null;
    };
  }),

  /**
   * KPIs de ventas del proveedor en el rango de fechas
   */
  getSalesSummary: protectedProcedure
    .input(dateRangeSchema.extend({ supplierId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const supplierId = getSupplierIdFromCtx(ctx as any, input.supplierId);
      const from = input.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      const to = input.to ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];

      const res = await pool.query(
        `SELECT
           COUNT(DISTINCT sh.id)::int                    AS total_tickets,
           COUNT(DISTINCT p.id)::int                     AS productos_vendidos,
           ROUND(SUM(sd.total)::numeric, 2)              AS total_ventas,
           ROUND(SUM(sd.quantity)::numeric, 2)           AS total_unidades,
           COUNT(DISTINCT sh.branch_id)::int             AS tiendas_activas
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           AND sh.doc_date::date BETWEEN $2 AND $3`,
        [supplierId, from, to]
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
   * Ventas diarias del proveedor (para gráfico de tendencia)
   */
  getDailySales: protectedProcedure
    .input(dateRangeSchema.extend({ supplierId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const supplierId = getSupplierIdFromCtx(ctx as any, input.supplierId);
      const from = input.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      const to = input.to ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];

      const res = await pool.query(
        `SELECT
           sh.doc_date::date                             AS fecha,
           ROUND(SUM(sd.total)::numeric, 2)              AS total_ventas,
           COUNT(DISTINCT sh.id)::int                    AS tickets,
           ROUND(SUM(sd.quantity)::numeric, 2)           AS unidades
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           AND sh.doc_date::date BETWEEN $2 AND $3
         GROUP BY sh.doc_date::date
         ORDER BY fecha ASC`,
        [supplierId, from, to]
      );
      return res.rows as Array<{
        fecha: string;
        total_ventas: string;
        tickets: number;
        unidades: string;
      }>;
    }),

  /**
   * Top productos más vendidos del proveedor
   */
  getTopProducts: protectedProcedure
    .input(
      dateRangeSchema.extend({
        limit: z.number().min(1).max(50).default(10),
        supplierId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const supplierId = getSupplierIdFromCtx(ctx as any, input.supplierId);
      const from = input.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      const to = input.to ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];

      const res = await pool.query(
        `SELECT
           p.name                                        AS producto,
           p.int_sku,
           ROUND(SUM(sd.total)::numeric, 2)              AS total_ventas,
           ROUND(SUM(sd.quantity)::numeric, 2)           AS unidades_vendidas,
           COUNT(DISTINCT sh.id)::int                    AS tickets
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           AND sh.doc_date::date BETWEEN $2 AND $3
         GROUP BY p.id, p.name, p.int_sku
         ORDER BY total_ventas DESC
         LIMIT $4`,
        [supplierId, from, to, input.limit]
      );
      return res.rows as Array<{
        producto: string;
        int_sku: string;
        total_ventas: string;
        unidades_vendidas: string;
        tickets: number;
      }>;
    }),

  /**
   * Ventas por tienda del proveedor
   */
  getSalesByBranch: protectedProcedure
    .input(dateRangeSchema.extend({ supplierId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const supplierId = getSupplierIdFromCtx(ctx as any, input.supplierId);
      const from = input.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      const to = input.to ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];

      const res = await pool.query(
        `SELECT
           b.name                                        AS tienda,
           b.sap_id,
           ROUND(SUM(sd.total)::numeric, 2)              AS total_ventas,
           ROUND(SUM(sd.quantity)::numeric, 2)           AS unidades,
           COUNT(DISTINCT sh.id)::int                    AS tickets
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         JOIN public.branches b ON b.id = sh.branch_id
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           AND sh.doc_date::date BETWEEN $2 AND $3
         GROUP BY b.id, b.name, b.sap_id
         ORDER BY total_ventas DESC`,
        [supplierId, from, to]
      );
      return res.rows as Array<{
        tienda: string;
        sap_id: string;
        total_ventas: string;
        unidades: string;
        tickets: number;
      }>;
    }),

  /**
   * Tiendas que tienen stock de productos del proveedor (para el selector de filtro)
   */
  getBranchesForStock: protectedProcedure
    .input(z.object({ supplierId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const supplierId = getSupplierIdFromCtx(ctx as any, input?.supplierId);
    const res = await pool.query(
      `SELECT DISTINCT b.id, b.name, b.sap_id
       FROM public.stocks st
       JOIN public.products p ON p.id = st.product_id
       JOIN public.branches b ON b.id = st.branch_id
       WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
         AND st.stock > 0
       ORDER BY b.name ASC`,
      [supplierId]
    );
    return res.rows as Array<{ id: string; name: string; sap_id: string }>;
  }),

  /**
   * Stock actual de los productos del proveedor por tienda.
   * Acepta filtros opcionales por tienda (branch_id) y por producto (search en nombre o int_sku).
   */
  getStockByProduct: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),       // filtra por nombre o int_sku del producto
        branchId: z.string().optional(),     // filtra por tienda específica
        supplierId: z.string().optional(),   // override para system_specialist
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const supplierId = getSupplierIdFromCtx(ctx as any, input.supplierId);

      // Construir cláusulas dinámicas y lista de parámetros
      const extraClauses: string[] = [];
      const params: (string | number)[] = [supplierId, input.limit, input.offset];

      if (input.search) {
        params.push(`%${input.search}%`);
        extraClauses.push(`AND (p.name ILIKE $${params.length} OR p.int_sku::text ILIKE $${params.length})`);
      }
      if (input.branchId) {
        params.push(input.branchId);
        extraClauses.push(`AND b.id = $${params.length}`);
      }

      const whereExtra = extraClauses.join(" ");

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
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           AND st.stock > 0
           ${whereExtra}
         ORDER BY p.name ASC, b.name ASC
         LIMIT $2 OFFSET $3`,
        params
      );

      // Total para paginación (mismos filtros, sin LIMIT/OFFSET)
      const countParams: (string | number)[] = [supplierId];
      const countClauses: string[] = [];
      if (input.search) {
        countParams.push(`%${input.search}%`);
        countClauses.push(`AND (p.name ILIKE $${countParams.length} OR p.int_sku::text ILIKE $${countParams.length})`);
      }
      if (input.branchId) {
        countParams.push(input.branchId);
        countClauses.push(`AND b.id = $${countParams.length}`);
      }

      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM public.stocks st
         JOIN public.products p ON p.id = st.product_id
         JOIN public.branches b ON b.id = st.branch_id
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           AND st.stock > 0
           ${countClauses.join(" ")}`,
        countParams
      );

      return {
        rows: res.rows as Array<{
          producto: string;
          int_sku: string;
          branch_id: string;
          tienda: string;
          sap_id: string;
          stock_actual: number;
          min_stock: number | null;
        }>,
        total: countRes.rows[0].total as number,
      };
    }),

  /**
   * Recepciones (órdenes de compra) del proveedor
   */
  getReceptions: protectedProcedure
    .input(
      z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        supplierId: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const supplierId = getSupplierIdFromCtx(ctx as any, input.supplierId);
      const from = input.from ?? new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
      const to = input.to ?? new Date().toISOString().split("T")[0];

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
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           AND r.date::date BETWEEN $2 AND $3
         ORDER BY r.date DESC
         LIMIT $4 OFFSET $5`,
        [supplierId, from, to, input.limit, input.offset]
      );

      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM public.receptions r
         JOIN public.products p ON p.id = r.product_id
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           AND r.date::date BETWEEN $2 AND $3`,
        [supplierId, from, to]
      );

      return {
        rows: res.rows as Array<{
          oc: string;
          fecha: string;
          tienda: string;
          sap_id: string;
          producto: string;
          int_sku: string;
          ordered_quantity: number;
          received_quantity: number | null;
          status: string | null;
        }>,
        total: countRes.rows[0].total as number,
      };
    }),

  /**
   * Ventas por mes (últimos 6 meses) para gráfico de barras
   */
  getMonthlySales: protectedProcedure
    .input(z.object({ supplierId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const supplierId = getSupplierIdFromCtx(ctx as any, input?.supplierId);
    const res = await pool.query(
      `SELECT
         TO_CHAR(sh.doc_date, 'YYYY-MM')                AS mes,
         ROUND(SUM(sd.total)::numeric, 2)               AS total_ventas,
         COUNT(DISTINCT sh.id)::int                     AS tickets,
         ROUND(SUM(sd.quantity)::numeric, 2)            AS unidades
       FROM public.sales_detail sd
       JOIN public.products p ON p.id = sd.product_id
       JOIN public.sales_header sh ON sh.id = sd.header_id
       WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
         AND sh.doc_date >= NOW() - INTERVAL '6 months'
       GROUP BY TO_CHAR(sh.doc_date, 'YYYY-MM')
       ORDER BY mes ASC`,
      [supplierId]
    );
    return res.rows as Array<{
      mes: string;
      total_ventas: string;
      tickets: number;
      unidades: string;
    }>;
  }),

  /**
   * Catálogo de productos del proveedor con stock total.
   * Se carga automáticamente al entrar a la tab Catálogo.
   * El buscador filtra solo dentro de los productos del proveedor.
   */
  getProductCatalog: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        supplierId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const supplierId = getSupplierIdFromCtx(ctx as any, input.supplierId);

      // Construir cláusula de búsqueda solo si hay texto
      const searchClause = input.search
        ? `AND (p.name ILIKE $4 OR p.int_sku::text ILIKE $4)`
        : "";
      const params: (string | number)[] = [supplierId, input.limit, input.offset];
      if (input.search) params.push(`%${input.search}%`);

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
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           ${searchClause}
         GROUP BY p.id, p.name, p.int_sku, p.short_description
         ORDER BY p.name ASC
         LIMIT $2 OFFSET $3`,
        params
      );

      const countParams: (string | number)[] = [supplierId];
      if (input.search) countParams.push(`%${input.search}%`);
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM public.products p
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           ${input.search ? "AND (p.name ILIKE $2 OR p.int_sku::text ILIKE $2)" : ""}`,
        countParams
      );

      return {
        rows: res.rows as Array<{
          id: string;
          name: string;
          int_sku: string;
          description: string | null;
          stock_total: number;
          tiendas_con_stock: number;
        }>,
        total: countRes.rows[0].total as number,
      };
    }),

  /**
   * Ventas por artículo × tienda en un rango de fechas.
   * Retorna una fila por cada combinación (producto, sucursal) con cantidad y monto.
   * Soporta paginación y búsqueda por nombre de producto o SKU.
   */
  getSalesByProductBranch: protectedProcedure
    .input(
      dateRangeSchema.extend({
        supplierId: z.string().optional(),
        search: z.string().optional(),
        branchId: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const supplierId = getSupplierIdFromCtx(ctx as any, input.supplierId);
      const from = input.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      const to = input.to ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];

      const params: (string | number)[] = [supplierId, from, to, input.limit, input.offset];
      const clauses: string[] = [];

      if (input.search) {
        params.push(`%${input.search}%`);
        clauses.push(`AND (p.name ILIKE $${params.length} OR p.int_sku::text ILIKE $${params.length})`);
      }
      if (input.branchId) {
        params.push(input.branchId);
        clauses.push(`AND b.id = $${params.length}`);
      }

      const whereExtra = clauses.join(" ");

      const res = await pool.query(
        `SELECT
           p.id                                          AS product_id,
           p.name                                        AS producto,
           p.int_sku::text                               AS sku,
           b.id                                          AS branch_id,
           b.name                                        AS tienda,
           b.sap_id,
           SUM(sd.quantity)::numeric                     AS cantidad,
           ROUND(SUM(sd.total)::numeric, 2)              AS monto,
           COUNT(DISTINCT sh.id)::int                    AS tickets
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         JOIN public.branches b ON b.id = sh.branch_id
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           AND sh.doc_date::date BETWEEN $2 AND $3
           ${whereExtra}
         GROUP BY p.id, p.name, p.int_sku, b.id, b.name, b.sap_id
         ORDER BY monto DESC
         LIMIT $4 OFFSET $5`,
        params
      );

      // Count total rows (same filters, no LIMIT)
      const countParams: (string | number)[] = [supplierId, from, to];
      const countClauses: string[] = [];
      if (input.search) {
        countParams.push(`%${input.search}%`);
        countClauses.push(`AND (p.name ILIKE $${countParams.length} OR p.int_sku::text ILIKE $${countParams.length})`);
      }
      if (input.branchId) {
        countParams.push(input.branchId);
        countClauses.push(`AND b.id = $${countParams.length}`);
      }

      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM (
           SELECT p.id, b.id AS bid
           FROM public.sales_detail sd
           JOIN public.products p ON p.id = sd.product_id
           JOIN public.sales_header sh ON sh.id = sd.header_id
           JOIN public.branches b ON b.id = sh.branch_id
           WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
             AND sh.doc_date::date BETWEEN $2 AND $3
             ${countClauses.join(" ")}
           GROUP BY p.id, b.id
         ) sub`,
        countParams
      );

      return {
        rows: res.rows as Array<{
          product_id: string;
          producto: string;
          sku: string;
          branch_id: string;
          tienda: string;
          sap_id: string;
          cantidad: string;
          monto: string;
          tickets: number;
        }>,
        total: countRes.rows[0].total as number,
      };
    }),

  /**
   * Detalle de ventas día a día para un producto+tienda específicos.
   * Se usa en el modal de detalle al hacer clic en una fila de getSalesByProductBranch.
   */
  getSalesDailyDetail: protectedProcedure
    .input(
      z.object({
        supplierId: z.string().optional(),
        productId: z.string(),
        branchId: z.string(),
        from: z.string(),
        to: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const supplierId = getSupplierIdFromCtx(ctx as any, input.supplierId);

      const res = await pool.query(
        `SELECT
           sh.doc_date::date                             AS fecha,
           SUM(sd.quantity)::numeric                     AS cantidad,
           ROUND(SUM(sd.total)::numeric, 2)              AS monto,
           COUNT(DISTINCT sh.id)::int                    AS tickets
         FROM public.sales_detail sd
         JOIN public.sales_header sh ON sh.id = sd.header_id
         JOIN public.products p ON p.id = sd.product_id
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           AND sd.product_id = $2
           AND sh.branch_id = $3
           AND sh.doc_date::date BETWEEN $4 AND $5
         GROUP BY sh.doc_date::date
         ORDER BY fecha ASC`,
        [supplierId, input.productId, input.branchId, input.from, input.to]
      );

      return res.rows as Array<{
        fecha: string;
        cantidad: string;
        monto: string;
        tickets: number;
      }>;
    }),

  /**
   * Lista todos los productos del proveedor (id, nombre, sku) para el Select desplegable.
   * Ordenados alfabéticamente por nombre.
   */
  getProductsForSupplier: protectedProcedure
    .input(z.object({ supplierId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const supplierId = getSupplierIdFromCtx(ctx as any, input?.supplierId);

      const res = await pool.query(
        `SELECT DISTINCT
           p.id,
           p.name,
           p.int_sku::text AS sku
         FROM public.products p
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
         ORDER BY p.name ASC
         LIMIT 2000`,
        [supplierId]
      );

      return res.rows as Array<{ id: string; name: string; sku: string }>;
    }),
});
