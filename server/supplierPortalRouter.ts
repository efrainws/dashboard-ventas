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
  include_igv: z.boolean().default(true),
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
      const amtCol = input.include_igv ? 'sd.total' : 'sd.subtotal';

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
      const amtCol = input.include_igv ? 'sd.total' : 'sd.subtotal';

      const res = await pool.query(
        `SELECT
           sh.doc_date::date                             AS fecha,
           ROUND(SUM(${amtCol})::numeric, 2)              AS total_ventas,
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
      const amtCol = input.include_igv ? 'sd.total' : 'sd.subtotal';

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
      const amtCol = input.include_igv ? 'sd.total' : 'sd.subtotal';

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
       ORDER BY b.sap_id ASC`,
      [supplierId]
    );
    return res.rows as Array<{ id: string; name: string; sap_id: string }>;
  }),

  /**
   * Tiendas que tienen ventas del proveedor en cualquier fecha (para el selector de filtro en pestaña Ventas).
   * Ordenadas por sap_id ASC.
   */
  getBranchesForSales: protectedProcedure
    .input(z.object({ supplierId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const supplierId = getSupplierIdFromCtx(ctx as any, input?.supplierId);
      const res = await pool.query(
        `SELECT DISTINCT b.id, b.name, b.sap_id
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         JOIN public.branches b ON b.id = sh.branch_id
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
         ORDER BY b.sap_id ASC
         LIMIT 500`,
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
        productId: z.string().optional(),    // ID exacto del producto (para completar con ceros)
        branchId: z.string().optional(),     // filtra por tienda específica
        supplierId: z.string().optional(),   // override para system_specialist
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const supplierId = getSupplierIdFromCtx(ctx as any, input.supplierId);

      // Cuando se filtra por un producto específico, usamos CROSS JOIN con todas las tiendas
      // para mostrar stock=0 en las tiendas sin inventario.
      if (input.productId) {
        const params: (string | number)[] = [supplierId, input.productId, input.limit, input.offset];
        const branchClause = input.branchId ? `AND b.id = $5` : "";
        if (input.branchId) params.push(input.branchId);

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
             WHERE id = $2 AND id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           ) p
           LEFT JOIN public.stocks st ON st.product_id = p.id AND st.branch_id = b.id
           WHERE 1=1 ${branchClause}
           ORDER BY b.sap_id ASC
           LIMIT $3 OFFSET $4`,
          params
        );

        const countParams: (string | number)[] = [supplierId, input.productId];
        if (input.branchId) countParams.push(input.branchId);
        const countRes = await pool.query(
          `SELECT COUNT(*)::int AS total
           FROM public.branches b
           CROSS JOIN (
             SELECT id FROM public.products
             WHERE id = $2 AND id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           ) p
           WHERE 1=1 ${input.branchId ? `AND b.id = $3` : ""}`,
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
      }

      // Sin filtro de producto específico: comportamiento original (solo filas con stock > 0)
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
         ORDER BY p.name ASC, b.sap_id ASC
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
        productIds: z.array(z.string()).optional(),
        branchId: z.string().optional(),
        groupByProduct: z.boolean().default(true),
        groupByStore: z.boolean().default(true),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const supplierId = getSupplierIdFromCtx(ctx as any, input.supplierId);
      const from = input.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      const to = input.to ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];
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
      // Para el COUNT necesitamos al menos una columna de agrupación
      const countGroupBy = [
        ...(gp ? ["p.id"] : []),
        ...(gs ? ["b.id"] : []),
      ].join(", ") || "1";

      const params: (string | number | string[])[] = [supplierId, from, to, input.limit, input.offset];
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

      const whereExtra = clauses.join(" ");

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
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           AND sh.doc_date::date BETWEEN $2 AND $3
           ${whereExtra}
         GROUP BY ${groupByDims}
         ORDER BY monto DESC
         LIMIT $4 OFFSET $5`,
        params
      );

      // Count total rows (same filters, no LIMIT)
      const countParams: (string | number | string[])[] = [supplierId, from, to];
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

      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM (
           SELECT ${countGroupBy === "1" ? "1" : countGroupBy.split(", ").map((c) => c).join(", ")}
           FROM public.sales_detail sd
           JOIN public.products p ON p.id = sd.product_id
           JOIN public.sales_header sh ON sh.id = sd.header_id
           JOIN public.branches b ON b.id = sh.branch_id
           WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
             AND sh.doc_date::date BETWEEN $2 AND $3
             ${countClauses.join(" ")}
           GROUP BY ${countGroupBy}
         ) sub`,
        countParams
      );

      // Totales globales (todos los registros filtrados, sin paginación)
      const totalsParams: (string | number | string[])[] = [supplierId, from, to];
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
      const totalsRes = await pool.query(
        `SELECT
           SUM(sd.quantity)::numeric                     AS total_cantidad,
           ROUND(SUM(${amtCol})::numeric, 2)              AS total_monto,
           COUNT(DISTINCT sh.id)::int                    AS total_tickets
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         JOIN public.branches b ON b.id = sh.branch_id
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           AND sh.doc_date::date BETWEEN $2 AND $3
           ${totalsClauses.join(" ")}`,
        totalsParams
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
        totals: {
          cantidad: totalsRes.rows[0].total_cantidad as string,
          monto: totalsRes.rows[0].total_monto as string,
          tickets: totalsRes.rows[0].total_tickets as number,
        },
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
   * Exportación completa de ventas por artículo y tienda (sin paginación).
   * Devuelve hasta 10.000 filas para descarga CSV/Excel.
   */
  exportSalesByProductBranch: protectedProcedure
    .input(
      dateRangeSchema.extend({
        supplierId: z.string().optional(),
        search: z.string().optional(),
        productIds: z.array(z.string()).optional(),
        branchId: z.string().optional(),
        groupByProduct: z.boolean().default(true),
        groupByStore: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      const supplierId = getSupplierIdFromCtx(ctx as any, input.supplierId);
      const from = input.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      const to = input.to ?? new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const gp = input.groupByProduct !== false;
      const gs = input.groupByStore !== false;

      const selectProduct = gp
        ? `p.name AS producto, p.int_sku::text AS sku,`
        : `'(Todos los productos)' AS producto, '\u2014' AS sku,`;
      const selectStore = gs
        ? `b.name AS tienda, b.sap_id,`
        : `'(Todas las tiendas)' AS tienda, NULL AS sap_id,`;
      const groupByDims = [
        ...(gp ? ["p.id", "p.name", "p.int_sku"] : []),
        ...(gs ? ["b.id", "b.name", "b.sap_id"] : []),
      ].join(", ") || "1=1";

      const params: (string | number | string[])[] = [supplierId, from, to];
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

      const res = await pool.query(
        `SELECT
           ${selectProduct}
           ${selectStore}
           SUM(sd.quantity)::numeric                     AS cantidad,
           ROUND(SUM(sd.total)::numeric, 2)              AS monto,
           COUNT(DISTINCT sh.id)::int                    AS tickets
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         JOIN public.branches b ON b.id = sh.branch_id
         WHERE p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           AND sh.doc_date::date BETWEEN $2 AND $3
           ${clauses.join(" ")}
         GROUP BY ${groupByDims}
         ORDER BY monto DESC
         LIMIT 10000`,
        params
      );

      return res.rows as Array<{
        producto: string;
        sku: string;
        tienda: string;
        sap_id: string | null;
        cantidad: string;
        monto: string;
        tickets: number;
      }>;
    }),

  /**
   * Exportación completa del stock (sin paginación) para descarga CSV.
   * Mismos filtros que getStockByProduct pero sin LIMIT/OFFSET.
   */
  exportStockByProduct: protectedProcedure
    .input(
      z.object({
        productId: z.string().optional(),
        branchId: z.string().optional(),
        supplierId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const supplierId = getSupplierIdFromCtx(ctx as any, input.supplierId);

      if (input.productId) {
        const params: (string | number)[] = [supplierId, input.productId];
        const branchClause = input.branchId ? `AND b.id = $3` : "";
        if (input.branchId) params.push(input.branchId);

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
             WHERE id = $2 AND id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
           ) p
           LEFT JOIN public.stocks st ON st.product_id = p.id AND st.branch_id = b.id
           WHERE 1=1 ${branchClause}
           ORDER BY b.sap_id ASC`,
          params
        );
        return res.rows as Array<{
          producto: string; int_sku: string; branch_id: string;
          tienda: string; sap_id: string; stock_actual: number; min_stock: number | null;
        }>;
      }

      // Sin filtro de producto: todos los registros con stock > 0
      const extraClauses: string[] = [];
      const params: (string | number)[] = [supplierId];
      if (input.branchId) {
        params.push(input.branchId);
        extraClauses.push(`AND b.id = $${params.length}`);
      }

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
           ${extraClauses.join(" ")}
         ORDER BY p.name ASC, b.sap_id ASC`,
        params
      );
      return res.rows as Array<{
        producto: string; int_sku: string; branch_id: string;
        tienda: string; sap_id: string; stock_actual: number; min_stock: number | null;
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

  /**
   * Evolución temporal de ventas por período (día/semana/mes)
   * Agrupa por las mismas dimensiones que getSalesByProductBranch
   * Respeta los mismos filtros: proveedor, productos, tienda, IGV
   */
  getSalesEvolution: protectedProcedure
    .input(
      dateRangeSchema.extend({
        supplierId: z.string().optional(),
        productIds: z.array(z.string()).optional(),
        branchId: z.string().optional(),
        groupByProduct: z.boolean().default(true),
        groupByStore: z.boolean().default(true),
        granularity: z.enum(['day', 'week', 'month']).default('day'),
      })
    )
    .query(async ({ ctx, input }) => {
      const supplierId = getSupplierIdFromCtx(ctx as any, input.supplierId);
      const from = input.from ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const to = input.to ?? new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const amtCol = input.include_igv ? 'sd.total' : 'sd.subtotal';
      const gp = input.groupByProduct !== false;
      const gs = input.groupByStore !== false;

      // Truncar fecha según granularidad
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

      const params: any[] = [supplierId, from, to];
      let pIdx = 4;

      const productFilter = (input.productIds && input.productIds.length > 0)
        ? (() => {
            const placeholders = input.productIds!.map((_, i) => `$${pIdx + i}`).join(', ');
            params.push(...input.productIds!);
            pIdx += input.productIds!.length;
            return `AND p.id IN (${placeholders})`;
          })()
        : '';

      const branchFilter = input.branchId
        ? (() => { params.push(input.branchId); return `AND b.id = $${pIdx++}`; })()
        : '';

      const groupByClause = [
        `period`,
        ...groupByDims,
      ].join(', ');

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
          AND sh.doc_date::date >= $2::date
          AND sh.doc_date::date <= $3::date
          AND p.id IN ${SUPPLIER_PRODUCTS_SUBQUERY}
          ${productFilter}
          ${branchFilter}
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
