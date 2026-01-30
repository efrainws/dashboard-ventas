import { publicProcedure, router } from "./_core/trpc";
import { pool } from "./postgres";
import { z } from "zod";

export const salesRouter = router({
  /**
   * Obtiene ventas agregadas por hora, fecha, tienda y categoría abuelo
   * Consulta optimizada para Gerencia de Operaciones y Jefes de Tienda
   */
  getAggregatedSales: publicProcedure
    .input(
      z.object({
        fecha_min: z.string().datetime(), // ISO 8601 format: "2024-01-01T00:00:00Z"
        fecha_max: z.string().datetime(), // ISO 8601 format: "2024-01-31T23:59:59Z"
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max } = input;

      const query = `
        WITH base AS (
          SELECT
            sh.id AS sale_id,
            sh.doc_date,
            sh.branch_id,
            INITCAP(LOWER(COALESCE(b.name,'')))    AS branch_name,
            INITCAP(LOWER(COALESCE(b.address,''))) AS branch_address,
            b.sap_id                               AS branch_sap_id,
            sd.total AS line_total,
            cp.category_id AS leaf_category_id,
            c.name AS leaf_category_name,
            p.id   AS parent_category_id,
            p.name AS parent_category_name,
            g.id   AS grandparent_category_id,
            g.name AS grandparent_category_name
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          LEFT JOIN branches b ON b.id = sh.branch_id
          LEFT JOIN categories_products cp
            ON cp.product_id = sd.product_id
           AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
          LEFT JOIN categories c ON c.id = cp.category_id
          LEFT JOIN categories p ON p.id = c.parent_category_id
          LEFT JOIN categories g ON g.id = p.parent_category_id
          WHERE sh.doc_date IS NOT NULL
        )
        SELECT
          date_trunc('hour', doc_date) AS hour_ts,
          branch_id,
          branch_sap_id,
          branch_name,
          branch_address,
          COALESCE(grandparent_category_id, parent_category_id, leaf_category_id)
            AS category_abuelo_id,
          INITCAP(LOWER(COALESCE(
            grandparent_category_name,
            parent_category_name,
            leaf_category_name,
            'Sin Categoría'
          ))) AS category_abuelo_name,
          SUM(line_total) AS sales_amount,
          COUNT(DISTINCT sale_id) AS tickets_count
        FROM base
        WHERE doc_date >= $1
          AND doc_date <  $2
        GROUP BY
          hour_ts, branch_id, branch_sap_id,
          branch_name, branch_address,
          category_abuelo_id, category_abuelo_name
        ORDER BY hour_ts, branch_name, category_abuelo_name;
      `;

      try {
        const result = await pool.query(query, [fecha_min, fecha_max]);
        
        return {
          success: true,
          data: result.rows,
          metadata: {
            total_rows: result.rows.length,
            fecha_min,
            fecha_max,
            generated_at: new Date().toISOString(),
          },
        };
      } catch (error) {
        console.error('[PostgreSQL] Error executing aggregated sales query:', error);
        throw new Error('Error al consultar ventas agregadas');
      }
    }),
});
