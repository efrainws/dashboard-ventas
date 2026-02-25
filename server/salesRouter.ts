import { publicProcedure, router } from "./_core/trpc";
import { pool } from "./postgres";
import { z } from "zod";

export const salesRouter = router({
  /**
   * Obtiene ventas agregadas por fecha, tienda y departamento
   * Consulta optimizada para Gerencia de Operaciones y Jefes de Tienda
   * Soporta filtros opcionales de sucursal y categoría
   */
  getAggregatedSales: publicProcedure
    .input(
      z.object({
        fecha_min: z.string().datetime(), // ISO 8601 format: "2024-01-01T00:00:00Z"
        fecha_max: z.string().datetime(), // ISO 8601 format: "2024-01-31T23:59:59Z"
        branch_id: z.string().optional(), // Filtro opcional de sucursal
        category_id: z.string().optional(), // Filtro opcional de departamento
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_id, category_id } = input;

      // Construir filtros adicionales dinámicamente
      const additionalFilters: string[] = [];
      const queryParams: any[] = [fecha_min, fecha_max];
      let paramIndex = 3;

      if (branch_id && branch_id !== 'all') {
        additionalFilters.push(`AND branch_id = $${paramIndex}`);
        queryParams.push(branch_id);
        paramIndex++;
      }

      if (category_id && category_id !== 'all') {
        additionalFilters.push(`AND COALESCE(grandparent_category_id, parent_category_id, leaf_category_id) = $${paramIndex}`);
        queryParams.push(category_id);
        paramIndex++;
      }

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
          doc_date::date AS doc_date,
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
          COUNT(DISTINCT sale_id) AS tickets_count,
          -- Incluir array de sale_ids únicos para conteo correcto en frontend
          array_agg(DISTINCT sale_id) AS sale_ids
        FROM base
        WHERE doc_date >= $1
          AND doc_date <  $2
          ${additionalFilters.join('\n          ')}
        GROUP BY
          doc_date::date, branch_id, branch_sap_id,
          branch_name, branch_address,
          category_abuelo_id, category_abuelo_name
        ORDER BY doc_date, CAST(SUBSTRING(branch_sap_id FROM '[0-9]+') AS INTEGER), category_abuelo_name;
      `;

      try {
        const result = await pool.query(query, queryParams);
        
        return {
          success: true,
          data: result.rows,
          metadata: {
            total_rows: result.rows.length,
            fecha_min,
            fecha_max,
            branch_id: branch_id || 'all',
            category_id: category_id || 'all',
            generated_at: new Date().toISOString(),
          },
        };
      } catch (error) {
        console.error('[PostgreSQL] Error executing aggregated sales query:', error);
        throw new Error('Error al consultar ventas agregadas');
      }
    }),

  /**
   * Obtiene ventas agregadas por hora y tienda (sin categorías)
   * Incluye métricas de transacciones para análisis de patrones horarios
   * Soporta filtro opcional de sucursal
   */
  getHourlySales: publicProcedure
    .input(
      z.object({
        fecha_min: z.string().datetime(), // ISO 8601 format: "2024-01-01T00:00:00Z"
        fecha_max: z.string().datetime(), // ISO 8601 format: "2024-01-31T23:59:59Z"
        branch_id: z.string().optional(), // Filtro opcional de sucursal
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_id } = input;

      // Construir filtros adicionales dinámicamente
      const additionalFilters: string[] = [];
      const queryParams: any[] = [fecha_min, fecha_max];
      let paramIndex = 3;

      if (branch_id && branch_id !== 'all') {
        additionalFilters.push(`AND branch_id = $${paramIndex}`);
        queryParams.push(branch_id);
        paramIndex++;
      }

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
            CASE
              WHEN EXISTS (
                SELECT 1 FROM methods_payment mp
                WHERE mp.header_id = sh.id
                  AND mp.payment_account_id = '7a8fefe8-ddaa-40d1-ace5-d0aebb1b3204'::uuid
              ) THEN 'Rappi'
              WHEN sh.source_system_id = 'be387046-08e4-4229-a52c-7ff5c1569c89'::uuid
                THEN 'eCommerce'
              ELSE 'Presencial'
            END AS sales_channel
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
        )
        SELECT
          date_trunc('hour', doc_date) AS hour_ts,
          branch_id,
          branch_sap_id,
          branch_name,
          branch_address,
          sales_channel,
          SUM(line_total) AS sales_amount,
          COUNT(DISTINCT sale_id) AS tickets_count
        FROM base
        WHERE doc_date >= $1
          AND doc_date <  $2
          ${additionalFilters.join('\n          ')}
        GROUP BY
          hour_ts, branch_id, branch_sap_id,
          branch_name, branch_address,
          sales_channel
        ORDER BY hour_ts, CAST(SUBSTRING(branch_sap_id FROM '[0-9]+') AS INTEGER);
      `;

      try {
        const result = await pool.query(query, queryParams);
        
        return {
          success: true,
          data: result.rows,
          metadata: {
            total_rows: result.rows.length,
            fecha_min,
            fecha_max,
            branch_id: branch_id || 'all',
            generated_at: new Date().toISOString(),
          },
        };
      } catch (error) {
        console.error('[PostgreSQL] Error executing hourly sales query:', error);
        throw new Error('Error al consultar ventas por hora');
      }
    }),

  /**
   * Obtiene métricas resumidas del período actual y anterior para comparación
   * Calcula automáticamente el período anterior basado en la duración del período actual
   */
  getAggregatedComparison: publicProcedure
    .input(
      z.object({
        fecha_min: z.string().datetime(),
        fecha_max: z.string().datetime(),
        branch_id: z.string().optional(),
        category_id: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_id, category_id } = input;

      // Calcular duración del período actual y período anterior
      const currentStart = new Date(fecha_min);
      const currentEnd = new Date(fecha_max);
      const durationMs = currentEnd.getTime() - currentStart.getTime();
      const previousStart = new Date(currentStart.getTime() - durationMs);
      const previousEnd = currentStart;

      // Construir filtros adicionales
      const additionalFilters: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (branch_id && branch_id !== 'all') {
        additionalFilters.push(`AND branch_id = $${paramIndex}`);
        queryParams.push(branch_id);
        paramIndex++;
      }

      if (category_id && category_id !== 'all') {
        additionalFilters.push(`AND COALESCE(grandparent_category_id, parent_category_id, leaf_category_id) = $${paramIndex}`);
        queryParams.push(category_id);
        paramIndex++;
      }

      const query = `
        WITH base AS (
          SELECT
            sh.id AS sale_id,
            sh.doc_date,
            sh.branch_id,
            sd.total AS line_total,
            cp.category_id AS leaf_category_id,
            c.parent_category_id,
            p.parent_category_id AS grandparent_category_id,
            CASE
              WHEN sh.doc_date >= '${currentStart.toISOString()}' AND sh.doc_date < '${currentEnd.toISOString()}'
                THEN 'current'
              WHEN sh.doc_date >= '${previousStart.toISOString()}' AND sh.doc_date < '${previousEnd.toISOString()}'
                THEN 'previous'
              ELSE NULL
            END AS period
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          LEFT JOIN categories_products cp
            ON cp.product_id = sd.product_id
           AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
          LEFT JOIN categories c ON c.id = cp.category_id
          LEFT JOIN categories p ON p.id = c.parent_category_id
          WHERE sh.doc_date IS NOT NULL
            AND (
              (sh.doc_date >= '${currentStart.toISOString()}' AND sh.doc_date < '${currentEnd.toISOString()}')
              OR (sh.doc_date >= '${previousStart.toISOString()}' AND sh.doc_date < '${previousEnd.toISOString()}')
            )
            ${additionalFilters.join('\n            ')}
        )
        SELECT
          period,
          SUM(line_total) AS total_sales,
          COUNT(DISTINCT sale_id) AS total_tickets
        FROM base
        WHERE period IS NOT NULL
        GROUP BY period;
      `;

      try {
        const result = await pool.query(query, queryParams);
        
        const currentMetrics = result.rows.find(r => r.period === 'current') || { total_sales: 0, total_tickets: 0 };
        const previousMetrics = result.rows.find(r => r.period === 'previous') || { total_sales: 0, total_tickets: 0 };

        return {
          success: true,
          current: {
            total_sales: parseFloat(currentMetrics.total_sales || 0),
            total_tickets: parseInt(currentMetrics.total_tickets || 0, 10),
          },
          previous: {
            total_sales: parseFloat(previousMetrics.total_sales || 0),
            total_tickets: parseInt(previousMetrics.total_tickets || 0, 10),
          },
          metadata: {
            current_period: { start: currentStart.toISOString(), end: currentEnd.toISOString() },
            previous_period: { start: previousStart.toISOString(), end: previousEnd.toISOString() },
          },
        };
      } catch (error) {
        console.error('[PostgreSQL] Error executing comparison query:', error);
        throw new Error('Error al consultar comparación de períodos');
      }
    }),

  /**
   * Obtiene métricas resumidas del período actual y anterior para análisis por horas
   */
  getHourlyComparison: publicProcedure
    .input(
      z.object({
        fecha_min: z.string().datetime(),
        fecha_max: z.string().datetime(),
        branch_id: z.string().optional(),
        sales_channel: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_id, sales_channel } = input;

      // Calcular duración del período actual y período anterior
      const currentStart = new Date(fecha_min);
      const currentEnd = new Date(fecha_max);
      const durationMs = currentEnd.getTime() - currentStart.getTime();
      const previousStart = new Date(currentStart.getTime() - durationMs);
      const previousEnd = currentStart;

      // Construir filtros adicionales
      const additionalFilters: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (branch_id && branch_id !== 'all') {
        additionalFilters.push(`AND branch_id = $${paramIndex}`);
        queryParams.push(branch_id);
        paramIndex++;
      }

      if (sales_channel && sales_channel !== 'all') {
        additionalFilters.push(`AND sales_channel = $${paramIndex}`);
        queryParams.push(sales_channel);
        paramIndex++;
      }

      const query = `
        WITH base AS (
          SELECT
            sh.id AS sale_id,
            sh.doc_date,
            sh.branch_id,
            sd.total AS line_total,
            CASE
              WHEN EXISTS (
                SELECT 1 FROM methods_payment mp
                WHERE mp.header_id = sh.id
                  AND mp.payment_account_id = '7a8fefe8-ddaa-40d1-ace5-d0aebb1b3204'::uuid
              ) THEN 'Rappi'
              WHEN sh.source_system_id = 'be387046-08e4-4229-a52c-7ff5c1569c89'::uuid
                THEN 'eCommerce'
              ELSE 'Presencial'
            END AS sales_channel,
            CASE
              WHEN sh.doc_date >= '${currentStart.toISOString()}' AND sh.doc_date < '${currentEnd.toISOString()}'
                THEN 'current'
              WHEN sh.doc_date >= '${previousStart.toISOString()}' AND sh.doc_date < '${previousEnd.toISOString()}'
                THEN 'previous'
              ELSE NULL
            END AS period
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          WHERE sh.doc_date IS NOT NULL
            AND (
              (sh.doc_date >= '${currentStart.toISOString()}' AND sh.doc_date < '${currentEnd.toISOString()}')
              OR (sh.doc_date >= '${previousStart.toISOString()}' AND sh.doc_date < '${previousEnd.toISOString()}')
            )
            ${additionalFilters.join('\n            ')}
        )
        SELECT
          period,
          SUM(line_total) AS total_sales,
          COUNT(DISTINCT sale_id) AS total_tickets
        FROM base
        WHERE period IS NOT NULL
        GROUP BY period;
      `;

      try {
        const result = await pool.query(query, queryParams);
        
        const currentMetrics = result.rows.find(r => r.period === 'current') || { total_sales: 0, total_tickets: 0 };
        const previousMetrics = result.rows.find(r => r.period === 'previous') || { total_sales: 0, total_tickets: 0 };

        return {
          success: true,
          current: {
            total_sales: parseFloat(currentMetrics.total_sales || 0),
            total_tickets: parseInt(currentMetrics.total_tickets || 0, 10),
          },
          previous: {
            total_sales: parseFloat(previousMetrics.total_sales || 0),
            total_tickets: parseInt(previousMetrics.total_tickets || 0, 10),
          },
          metadata: {
            current_period: { start: currentStart.toISOString(), end: currentEnd.toISOString() },
            previous_period: { start: previousStart.toISOString(), end: previousEnd.toISOString() },
          },
        };
      } catch (error) {
        console.error('[PostgreSQL] Error executing hourly comparison query:', error);
        throw new Error('Error al consultar comparación de períodos por hora');
      }
    }),

  /**
   * Obtiene comparación detallada por sucursal entre período actual y anterior
   */
  getBranchComparison: publicProcedure
    .input(
      z.object({
        fecha_min: z.string().datetime(),
        fecha_max: z.string().datetime(),
        category_id: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, category_id } = input;

      // Calcular período anterior
      const currentStart = new Date(fecha_min);
      const currentEnd = new Date(fecha_max);
      const durationMs = currentEnd.getTime() - currentStart.getTime();
      const previousStart = new Date(currentStart.getTime() - durationMs);
      const previousEnd = currentStart;

      // Construir filtros adicionales
      const additionalFilters: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (category_id && category_id !== 'all') {
        additionalFilters.push(`AND COALESCE(grandparent_category_id, parent_category_id, leaf_category_id) = $${paramIndex}`);
        queryParams.push(category_id);
        paramIndex++;
      }

      const query = `
        WITH base AS (
          SELECT
            sh.id AS sale_id,
            sh.doc_date,
            sh.branch_id,
            INITCAP(LOWER(COALESCE(b.name,''))) AS branch_name,
            b.sap_id AS branch_sap_id,
            sd.total AS line_total,
            cp.category_id AS leaf_category_id,
            c.parent_category_id,
            p.parent_category_id AS grandparent_category_id,
            CASE
              WHEN sh.doc_date >= '${currentStart.toISOString()}' AND sh.doc_date < '${currentEnd.toISOString()}'
                THEN 'current'
              WHEN sh.doc_date >= '${previousStart.toISOString()}' AND sh.doc_date < '${previousEnd.toISOString()}'
                THEN 'previous'
              ELSE NULL
            END AS period
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          LEFT JOIN branches b ON b.id = sh.branch_id
          LEFT JOIN categories_products cp
            ON cp.product_id = sd.product_id
           AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
          LEFT JOIN categories c ON c.id = cp.category_id
          LEFT JOIN categories p ON p.id = c.parent_category_id
          WHERE sh.doc_date IS NOT NULL
            AND (
              (sh.doc_date >= '${currentStart.toISOString()}' AND sh.doc_date < '${currentEnd.toISOString()}')
              OR (sh.doc_date >= '${previousStart.toISOString()}' AND sh.doc_date < '${previousEnd.toISOString()}')
            )
            ${additionalFilters.join('\n            ')}
        )
        SELECT
          period,
          branch_id,
          branch_name,
          branch_sap_id,
          SUM(line_total) AS total_sales,
          COUNT(DISTINCT sale_id) AS total_tickets,
          COUNT(DISTINCT DATE(doc_date)) AS total_days
        FROM base
        WHERE period IS NOT NULL
        GROUP BY period, branch_id, branch_name, branch_sap_id
        ORDER BY branch_sap_id;
      `;

      try {
        const result = await pool.query(query, queryParams);
        
        // Agrupar por sucursal
        const branchMap = new Map<string, any>();
        
        result.rows.forEach(row => {
          const branchId = row.branch_id;
          if (!branchMap.has(branchId)) {
            branchMap.set(branchId, {
              branch_id: branchId,
              branch_name: row.branch_name,
              branch_sap_id: row.branch_sap_id,
              current: { total_sales: 0, total_tickets: 0, avg_ticket: 0, avg_sales_per_day: 0 },
              previous: { total_sales: 0, total_tickets: 0, avg_ticket: 0, avg_sales_per_day: 0 },
            });
          }
          
          const branch = branchMap.get(branchId);
          const totalSales = parseFloat(row.total_sales || 0);
          const totalTickets = parseInt(row.total_tickets || 0, 10);
          const totalDays = parseInt(row.total_days || 1, 10);
          const avgTicket = totalTickets > 0 ? totalSales / totalTickets : 0;
          const avgSalesPerDay = totalDays > 0 ? totalSales / totalDays : 0;
          
          if (row.period === 'current') {
            branch.current = {
              total_sales: totalSales,
              total_tickets: totalTickets,
              avg_ticket: avgTicket,
              avg_sales_per_day: avgSalesPerDay,
            };
          } else if (row.period === 'previous') {
            branch.previous = {
              total_sales: totalSales,
              total_tickets: totalTickets,
              avg_ticket: avgTicket,
              avg_sales_per_day: avgSalesPerDay,
            };
          }
        });

        return {
          success: true,
          data: Array.from(branchMap.values()),
          metadata: {
            current_period: { start: currentStart.toISOString(), end: currentEnd.toISOString() },
            previous_period: { start: previousStart.toISOString(), end: previousEnd.toISOString() },
          },
        };
      } catch (error) {
        console.error('[PostgreSQL] Error executing branch comparison query:', error);
        throw new Error('Error al consultar comparación por sucursal');
      }
    }),

  /**
   * Obtiene comparación detallada por categoría entre período actual y anterior
   */
  getCategoryComparison: publicProcedure
    .input(
      z.object({
        fecha_min: z.string().datetime(),
        fecha_max: z.string().datetime(),
        branch_id: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_id } = input;

      // Calcular período anterior
      const currentStart = new Date(fecha_min);
      const currentEnd = new Date(fecha_max);
      const durationMs = currentEnd.getTime() - currentStart.getTime();
      const previousStart = new Date(currentStart.getTime() - durationMs);
      const previousEnd = currentStart;

      // Construir filtros adicionales
      const additionalFilters: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (branch_id && branch_id !== 'all') {
        additionalFilters.push(`AND branch_id = $${paramIndex}`);
        queryParams.push(branch_id);
        paramIndex++;
      }

      const query = `
        WITH base AS (
          SELECT
            sh.id AS sale_id,
            sh.doc_date,
            sh.branch_id,
            sd.total AS line_total,
            cp.category_id AS leaf_category_id,
            c.name AS leaf_category_name,
            p.id AS parent_category_id,
            p.name AS parent_category_name,
            g.id AS grandparent_category_id,
            g.name AS grandparent_category_name,
            CASE
              WHEN sh.doc_date >= '${currentStart.toISOString()}' AND sh.doc_date < '${currentEnd.toISOString()}'
                THEN 'current'
              WHEN sh.doc_date >= '${previousStart.toISOString()}' AND sh.doc_date < '${previousEnd.toISOString()}'
                THEN 'previous'
              ELSE NULL
            END AS period
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          LEFT JOIN categories_products cp
            ON cp.product_id = sd.product_id
           AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
          LEFT JOIN categories c ON c.id = cp.category_id
          LEFT JOIN categories p ON p.id = c.parent_category_id
          LEFT JOIN categories g ON g.id = p.parent_category_id
          WHERE sh.doc_date IS NOT NULL
            AND (
              (sh.doc_date >= '${currentStart.toISOString()}' AND sh.doc_date < '${currentEnd.toISOString()}')
              OR (sh.doc_date >= '${previousStart.toISOString()}' AND sh.doc_date < '${previousEnd.toISOString()}')
            )
            ${additionalFilters.join('\n            ')}
        )
        SELECT
          period,
          COALESCE(grandparent_category_id, parent_category_id, leaf_category_id) AS category_id,
          INITCAP(LOWER(COALESCE(
            grandparent_category_name,
            parent_category_name,
            leaf_category_name,
            'Sin Categoría'
          ))) AS category_name,
          SUM(line_total) AS total_sales
        FROM base
        WHERE period IS NOT NULL
        GROUP BY period, category_id, category_name
        ORDER BY category_name;
      `;

      try {
        const result = await pool.query(query, queryParams);
        
        // Agrupar por categoría
        const categoryMap = new Map<string, any>();
        
        result.rows.forEach(row => {
          const categoryId = row.category_id;
          if (!categoryMap.has(categoryId)) {
            categoryMap.set(categoryId, {
              category_id: categoryId,
              category_name: row.category_name,
              current: { total_sales: 0 },
              previous: { total_sales: 0 },
            });
          }
          
          const category = categoryMap.get(categoryId);
          if (row.period === 'current') {
            category.current = {
              total_sales: parseFloat(row.total_sales || 0),
            };
          } else if (row.period === 'previous') {
            category.previous = {
              total_sales: parseFloat(row.total_sales || 0),
            };
          }
        });

        return {
          success: true,
          data: Array.from(categoryMap.values()),
          metadata: {
            current_period: { start: currentStart.toISOString(), end: currentEnd.toISOString() },
            previous_period: { start: previousStart.toISOString(), end: previousEnd.toISOString() },
          },
        };
      } catch (error) {
        console.error('[PostgreSQL] Error executing category comparison query:', error);
        throw new Error('Error al consultar comparación por categoría');
      }
    }),
});
