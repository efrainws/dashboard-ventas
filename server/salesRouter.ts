import { publicProcedure, router } from "./_core/trpc";
import { productionPool } from "./postgres";
import { z } from "zod";

export const salesRouter = router({
  getSalesByGrandparentCategory: publicProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { startDate, endDate } = input;

      // Por defecto, última semana si no se especifican fechas
      const defaultEndDate = new Date().toISOString();
      const defaultStartDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const query = `
        WITH product_categories AS (
          SELECT
            p.id    AS product_id,
            p.sku   AS product_sku,
            p.name  AS product_name,
            c.id    AS category_id,
            c.name  AS category_name,
            cp.id   AS parent_category_id,
            cp.name AS parent_category_name,
            COALESCE(cg.id, cp.id, c.id) AS grandparent_category_id,
            COALESCE(cg.name, cp.name, c.name) AS grandparent_category_name
          FROM products p
          JOIN categories_products cpr
            ON cpr.product_id = p.id
           AND cpr.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
          JOIN categories c
            ON c.id = cpr.category_id
          LEFT JOIN categories cp
            ON cp.id = c.parent_category_id
          LEFT JOIN categories cg
            ON cg.id = cp.parent_category_id
        )
        SELECT 
          pc.grandparent_category_id as id,
          pc.grandparent_category_name as name,
          COUNT(DISTINCT sd.header_id) as transaction_count,
          CAST(SUM(sd.total) AS DECIMAL(10,2)) as total_sales,
          COUNT(sd.id) as items_sold
        FROM sales_detail sd
        INNER JOIN sales_header sh ON sd.header_id = sh.id
        INNER JOIN product_categories pc ON sd.product_id = pc.product_id
        WHERE sh.doc_date IS NOT NULL
          ${
            startDate
              ? `AND sh.doc_date >= $1::timestamp`
              : `AND sh.doc_date >= '${defaultStartDate}'::timestamp`
          }
          ${
            endDate
              ? `AND sh.doc_date <= $${startDate ? '2' : '1'}::timestamp`
              : `AND sh.doc_date <= '${defaultEndDate}'::timestamp`
          }
        GROUP BY pc.grandparent_category_id, pc.grandparent_category_name
        ORDER BY total_sales DESC
      `;

      const params = [];
      if (startDate) params.push(startDate);
      if (endDate) params.push(endDate);

      const result = await productionPool.query(query, params.length > 0 ? params : undefined);

      return {
        categories: result.rows,
        metadata: {
          total_categories: result.rows.length,
          date_range: {
            start: startDate || defaultStartDate,
            end: endDate || defaultEndDate,
          },
        },
      };
    }),

  // Obtener datos de ventas con filtros opcionales
  getSalesData: publicProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().min(1).max(10000).default(1000),
      }).optional()
    )
    .query(async ({ input }) => {
      const { startDate, endDate, limit = 1000 } = input || {};

      try {
        // Query para obtener encabezados de ventas con información de sucursal y métodos de pago
        const query = `
          SELECT 
            sh.id,
            sh.order_number,
            to_char(sh.doc_date, 'YYYY-MM-DD') as date_str,
            to_char(sh.doc_date, 'YYYY-MM') as month_str,
            sh.total,
            b.name as branch_name,
            sh.currency,
            sh.country,
            COALESCE(
              json_agg(
                DISTINCT pa.name
              ) FILTER (WHERE pa.name IS NOT NULL),
              '[]'::json
            ) as payment_methods
          FROM sales_header sh
          LEFT JOIN branches b ON sh.branch_id = b.id
          LEFT JOIN methods_payment mp ON sh.id = mp.header_id AND mp.position <> -1
          LEFT JOIN payment_accounts pa ON mp.payment_account_id = pa.id
          WHERE sh.doc_date IS NOT NULL
            ${startDate ? `AND sh.doc_date >= $1::timestamp` : ''}
            ${endDate ? `AND sh.doc_date <= $${startDate ? '2' : '1'}::timestamp` : ''}
          GROUP BY sh.id, sh.order_number, sh.doc_date, sh.total, b.name, sh.currency, sh.country
          ORDER BY sh.doc_date DESC
          LIMIT $${startDate && endDate ? '3' : startDate || endDate ? '2' : '1'}
        `;

        const params: any[] = [];
        if (startDate) params.push(startDate);
        if (endDate) params.push(endDate);
        params.push(limit);

        const result = await productionPool.query(query, params);

        // Obtener listas únicas de sucursales y métodos de pago
        const branchesSet = new Set<string>();
        result.rows.forEach((r: any) => {
          if (r.branch_name) branchesSet.add(r.branch_name);
        });
        const branches: string[] = [];
        branchesSet.forEach(b => branches.push(b));
        const paymentMethodsSet = new Set<string>();
        result.rows.forEach((row: any) => {
          if (Array.isArray(row.payment_methods)) {
            row.payment_methods.forEach((pm: string) => paymentMethodsSet.add(pm));
          }
        });
        const payment_methods: string[] = [];
        paymentMethodsSet.forEach(pm => payment_methods.push(pm));

        // Calcular rango de fechas
        const dates = result.rows.map((r: any) => r.date_str).filter(Boolean);
        const dateRange = {
          start: dates.length > 0 ? dates[dates.length - 1] : null,
          end: dates.length > 0 ? dates[0] : null,
        };

        return {
          metadata: {
            generated_at: new Date().toISOString(),
            total_records: result.rows.length,
            date_range: dateRange,
          },
          branches: branches.sort(),
          payment_methods: payment_methods.sort(),
          sales: result.rows.map((row: any) => ({
            id: row.id.toString(),
            order_number: row.order_number,
            date_str: row.date_str,
            month_str: row.month_str,
            total: parseFloat(row.total),
            branch_name: row.branch_name,
            payment_methods: Array.isArray(row.payment_methods) ? row.payment_methods : [],
            currency: row.currency,
            country: row.country,
          })),
        };
      } catch (error) {
        console.error('[PostgreSQL] Error fetching sales data:', error);
        throw new Error('Error al consultar datos de ventas desde PostgreSQL');
      }
    }),

  // Obtener estadísticas de sucursales
  getBranches: publicProcedure.query(async () => {
    try {
      const result = await productionPool.query(`
        SELECT id, name, sap_id, location, address
        FROM branches
        ORDER BY name
      `);

      return result.rows;
    } catch (error) {
      console.error('[PostgreSQL] Error fetching branches:', error);
      throw new Error('Error al consultar sucursales desde PostgreSQL');
    }
  }),
});
