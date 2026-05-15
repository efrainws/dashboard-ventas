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
        fecha_min: z.string(), // Fecha en formato YYYY-MM-DD o ISO 8601
        fecha_max: z.string(), // Fecha en formato YYYY-MM-DD o ISO 8601
        branch_id: z.string().optional(), // Filtro opcional de sucursal
        category_id: z.string().optional(), // Filtro opcional de departamento
        include_igv: z.boolean().default(true), // true = con IGV (sd.total), false = sin IGV (sd.subtotal)
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_id, category_id, include_igv } = input;
      const amtCol = include_igv ? 'sd.total' : 'sd.subtotal';

      // Extraer solo la parte de fecha (YYYY-MM-DD) para evitar problemas de zona horaria
      const fechaMinDate = fecha_min.substring(0, 10);
      const fechaMaxDate = fecha_max.substring(0, 10);

      // Construir filtros adicionales dinámicamente (sin fechas - ya están en el SQL)
      const additionalFilters: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (branch_id && branch_id !== 'all') {
        additionalFilters.push(`AND branch_sap_id = $${paramIndex}`);
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
            ${amtCol} AS line_total,
            cp.category_id AS leaf_category_id,
            c.name AS leaf_category_name,
            p.id   AS parent_category_id,
            p.name AS parent_category_name,
            g.id   AS grandparent_category_id,
            g.name AS grandparent_category_name,
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
          sales_channel,
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
        WHERE doc_date::date >= '${fechaMinDate}'::date
          AND doc_date::date <= '${fechaMaxDate}'::date
          ${additionalFilters.join('\n          ')}
        GROUP BY
          doc_date::date, branch_id, branch_sap_id,
          branch_name, branch_address,
          sales_channel,
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
        fecha_min: z.string(), // Fecha en formato YYYY-MM-DD o ISO 8601
        fecha_max: z.string(), // Fecha en formato YYYY-MM-DD o ISO 8601
        branch_id: z.string().optional(), // Filtro opcional de sucursal
        include_igv: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_id, include_igv } = input;
      const amtCol = include_igv ? 'sd.total' : 'sd.subtotal';

      // Extraer solo la parte de fecha (YYYY-MM-DD) para evitar problemas de zona horaria
      const fechaMinDate = fecha_min.substring(0, 10);
      const fechaMaxDate = fecha_max.substring(0, 10);

      // Construir filtros adicionales dinámicamente (sin fechas - ya están en el SQL)
      const additionalFilters: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (branch_id && branch_id !== 'all') {
        additionalFilters.push(`AND branch_sap_id = $${paramIndex}`);
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
            ${amtCol} AS line_total,
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
        WHERE doc_date::date >= '${fechaMinDate}'::date
          AND doc_date::date <= '${fechaMaxDate}'::date
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
        fecha_min: z.string(), // Fecha en formato YYYY-MM-DD o ISO 8601
        fecha_max: z.string(), // Fecha en formato YYYY-MM-DD o ISO 8601
        branch_id: z.string().optional(),
        category_id: z.string().optional(),
        include_igv: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_id, category_id, include_igv } = input;
      const amtCol = include_igv ? 'sd.total' : 'sd.subtotal';

      // Extraer solo la parte de fecha (YYYY-MM-DD) para evitar problemas de zona horaria
      const fechaMinDate = fecha_min.substring(0, 10);
      const fechaMaxDate = fecha_max.substring(0, 10);

      // Calcular duración del período actual en días
      const currentStartDate = new Date(fechaMinDate + 'T12:00:00'); // Mediodía para evitar DST
      const currentEndDate = new Date(fechaMaxDate + 'T12:00:00');
      const durationDays = Math.round((currentEndDate.getTime() - currentStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // Calcular período anterior (misma duración, inmediatamente antes)
      const prevEndDate = new Date(currentStartDate);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
      const prevStartDate = new Date(prevEndDate);
      prevStartDate.setDate(prevStartDate.getDate() - (durationDays - 1));

      const prevStartStr = prevStartDate.toISOString().substring(0, 10);
      const prevEndStr = prevEndDate.toISOString().substring(0, 10);

      // Construir filtros adicionales
      const additionalFilters: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (branch_id && branch_id !== 'all') {
        additionalFilters.push(`AND b.sap_id = $${paramIndex}`);
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
            ${amtCol} AS line_total,
            cp.category_id AS leaf_category_id,
            c.parent_category_id,
            p.parent_category_id AS grandparent_category_id,
            CASE
              WHEN sh.doc_date::date >= '${fechaMinDate}'::date AND sh.doc_date::date <= '${fechaMaxDate}'::date
                THEN 'current'
              WHEN sh.doc_date::date >= '${prevStartStr}'::date AND sh.doc_date::date <= '${prevEndStr}'::date
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
              (sh.doc_date::date >= '${fechaMinDate}'::date AND sh.doc_date::date <= '${fechaMaxDate}'::date)
              OR (sh.doc_date::date >= '${prevStartStr}'::date AND sh.doc_date::date <= '${prevEndStr}'::date)
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
            current_period: { start: fechaMinDate, end: fechaMaxDate },
            previous_period: { start: prevStartStr, end: prevEndStr },
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
        fecha_min: z.string(), // Fecha en formato YYYY-MM-DD o ISO 8601
        fecha_max: z.string(), // Fecha en formato YYYY-MM-DD o ISO 8601
        branch_id: z.string().optional(),
        sales_channel: z.string().optional(),
        include_igv: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_id, sales_channel, include_igv } = input;
      const amtCol = include_igv ? 'sd.total' : 'sd.subtotal';

      // Extraer solo la parte de fecha (YYYY-MM-DD) para evitar problemas de zona horaria
      const fechaMinDate = fecha_min.substring(0, 10);
      const fechaMaxDate = fecha_max.substring(0, 10);

      // Calcular período anterior en días
      const currentStartDate = new Date(fechaMinDate + 'T12:00:00');
      const currentEndDate = new Date(fechaMaxDate + 'T12:00:00');
      const durationDays = Math.round((currentEndDate.getTime() - currentStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const prevEndDate = new Date(currentStartDate);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
      const prevStartDate = new Date(prevEndDate);
      prevStartDate.setDate(prevStartDate.getDate() - (durationDays - 1));
      const prevStartStr = prevStartDate.toISOString().substring(0, 10);
      const prevEndStr = prevEndDate.toISOString().substring(0, 10);

      // Construir filtros adicionales
      const additionalFilters: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (branch_id && branch_id !== 'all') {
        additionalFilters.push(`AND b.sap_id = $${paramIndex}`);
        queryParams.push(branch_id);
        paramIndex++;
      }

      // Construir filtro de sales_channel para aplicar después del CTE
      const channelFilter = (sales_channel && sales_channel !== 'all') 
        ? `AND sales_channel = '${sales_channel}'` 
        : '';

      const query = `
        WITH base AS (
          SELECT
            sh.id AS sale_id,
            sh.doc_date,
            sh.branch_id,
            ${amtCol} AS line_total,
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
              WHEN sh.doc_date::date >= '${fechaMinDate}'::date AND sh.doc_date::date <= '${fechaMaxDate}'::date
                THEN 'current'
              WHEN sh.doc_date::date >= '${prevStartStr}'::date AND sh.doc_date::date <= '${prevEndStr}'::date
                THEN 'previous'
              ELSE NULL
            END AS period
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND (
              (sh.doc_date::date >= '${fechaMinDate}'::date AND sh.doc_date::date <= '${fechaMaxDate}'::date)
              OR (sh.doc_date::date >= '${prevStartStr}'::date AND sh.doc_date::date <= '${prevEndStr}'::date)
            )
            ${additionalFilters.join('\n            ')}
        )
        SELECT
          period,
          SUM(line_total) AS total_sales,
          COUNT(DISTINCT sale_id) AS total_tickets
        FROM base
        WHERE period IS NOT NULL
          ${channelFilter}
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
            current_period: { start: fechaMinDate, end: fechaMaxDate },
            previous_period: { start: prevStartStr, end: prevEndStr },
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
        fecha_min: z.string(),
        fecha_max: z.string(),
        category_id: z.string().optional(),
        include_igv: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, category_id, include_igv } = input;
      const amtCol = include_igv ? 'sd.total' : 'sd.subtotal';

      // Extraer solo la parte de fecha (YYYY-MM-DD) para evitar problemas de zona horaria
      const fechaMinDate = fecha_min.substring(0, 10);
      const fechaMaxDate = fecha_max.substring(0, 10);

      // Calcular período anterior en días
      const currentStartDate = new Date(fechaMinDate + 'T12:00:00');
      const currentEndDate = new Date(fechaMaxDate + 'T12:00:00');
      const durationDays = Math.round((currentEndDate.getTime() - currentStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const prevEndDate = new Date(currentStartDate);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
      const prevStartDate = new Date(prevEndDate);
      prevStartDate.setDate(prevStartDate.getDate() - (durationDays - 1));
      const prevStartStr = prevStartDate.toISOString().substring(0, 10);
      const prevEndStr = prevEndDate.toISOString().substring(0, 10);

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
            ${amtCol} AS line_total,
            cp.category_id AS leaf_category_id,
            c.parent_category_id,
            p.parent_category_id AS grandparent_category_id,
            CASE
              WHEN sh.doc_date::date >= '${fechaMinDate}'::date AND sh.doc_date::date <= '${fechaMaxDate}'::date
                THEN 'current'
              WHEN sh.doc_date::date >= '${prevStartStr}'::date AND sh.doc_date::date <= '${prevEndStr}'::date
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
              (sh.doc_date::date >= '${fechaMinDate}'::date AND sh.doc_date::date <= '${fechaMaxDate}'::date)
              OR (sh.doc_date::date >= '${prevStartStr}'::date AND sh.doc_date::date <= '${prevEndStr}'::date)
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
            current_period: { start: fechaMinDate, end: fechaMaxDate },
            previous_period: { start: prevStartStr, end: prevEndStr },
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
        fecha_min: z.string(),
        fecha_max: z.string(),
        branch_id: z.string().optional(),
        include_igv: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_id, include_igv } = input;
      const amtCol = include_igv ? 'sd.total' : 'sd.subtotal';

      // Extraer solo la parte de fecha (YYYY-MM-DD) para evitar problemas de zona horaria
      const fechaMinDate = fecha_min.substring(0, 10);
      const fechaMaxDate = fecha_max.substring(0, 10);

      // Calcular período anterior en días
      const currentStartDate = new Date(fechaMinDate + 'T12:00:00');
      const currentEndDate = new Date(fechaMaxDate + 'T12:00:00');
      const durationDays = Math.round((currentEndDate.getTime() - currentStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const prevEndDate = new Date(currentStartDate);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
      const prevStartDate = new Date(prevEndDate);
      prevStartDate.setDate(prevStartDate.getDate() - (durationDays - 1));
      const prevStartStr = prevStartDate.toISOString().substring(0, 10);
      const prevEndStr = prevEndDate.toISOString().substring(0, 10);

      // Construir filtros adicionales
      const additionalFilters: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (branch_id && branch_id !== 'all') {
        additionalFilters.push(`AND b.sap_id = $${paramIndex}`);
        queryParams.push(branch_id);
        paramIndex++;
      }

      const query = `
        WITH base AS (
          SELECT
            sh.id AS sale_id,
            sh.doc_date,
            sh.branch_id,
            ${amtCol} AS line_total,
            cp.category_id AS leaf_category_id,
            c.name AS leaf_category_name,
            p.id AS parent_category_id,
            p.name AS parent_category_name,
            g.id AS grandparent_category_id,
            g.name AS grandparent_category_name,
            CASE
              WHEN sh.doc_date::date >= '${fechaMinDate}'::date AND sh.doc_date::date <= '${fechaMaxDate}'::date
                THEN 'current'
              WHEN sh.doc_date::date >= '${prevStartStr}'::date AND sh.doc_date::date <= '${prevEndStr}'::date
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
          LEFT JOIN categories g ON g.id = p.parent_category_id
          WHERE sh.doc_date IS NOT NULL
            AND (
              (sh.doc_date::date >= '${fechaMinDate}'::date AND sh.doc_date::date <= '${fechaMaxDate}'::date)
              OR (sh.doc_date::date >= '${prevStartStr}'::date AND sh.doc_date::date <= '${prevEndStr}'::date)
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
            current_period: { start: fechaMinDate, end: fechaMaxDate },
            previous_period: { start: prevStartStr, end: prevEndStr },
          },
        };
      } catch (error) {
        console.error('[PostgreSQL] Error executing category comparison query:', error);
        throw new Error('Error al consultar comparación por categoría');
      }
    }),

  /**
   * Obtiene el Top 50 productos por cantidad vendida y por monto de ventas
   * Soporta filtros de fecha, sucursal y categoría (igual que las otras páginas)
   */
  getTopProducts: publicProcedure
    .input(
      z.object({
        fecha_min: z.string(),
        fecha_max: z.string(),
        branch_id: z.string().optional(),
        category_id: z.string().optional(),
        include_igv: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_id, category_id, include_igv } = input;
      const amtCol = include_igv ? 'sd.total' : 'sd.subtotal';

      const fechaMinDate = fecha_min.substring(0, 10);
      const fechaMaxDate = fecha_max.substring(0, 10);

      const params: any[] = [];
      let pi = 1;

      const branchClause = (branch_id && branch_id !== 'all')
        ? (() => { params.push(branch_id); return `AND b.sap_id = $${pi++}`; })()
        : '';

      const categoryClause = (category_id && category_id !== 'all')
        ? (() => { params.push(category_id); return `AND COALESCE(g.id, p2.id, c2.id) = $${pi++}`; })()
        : '';

      // Cláusula de stock: si hay filtro de tienda, solo el stock de esa tienda;
      // si no, suma el stock de todas las tiendas (a través del branch_id de branches).
      const stockBranchClause = (branch_id && branch_id !== 'all')
        ? `AND sb.sap_id = '${branch_id.replace(/'/g, "''")}' `
        : '';

      // Número de días del período para calcular venta diaria promedio
      const daysDiff = Math.max(
        1,
        Math.round(
          (new Date(fechaMaxDate).getTime() - new Date(fechaMinDate).getTime()) / 86_400_000
        ) + 1
      );

      const query = `
        WITH line_items AS (
          SELECT
            prod.id                                   AS product_id,
            prod.name                                 AS product_name,
            prod.int_sku                              AS sku,
            INITCAP(LOWER(COALESCE(b.name, '')))      AS branch_name,
            b.sap_id                                  AS branch_sap_id,
            INITCAP(LOWER(COALESCE(
              g.name, p2.name, c2.name, 'Sin Categoría'
            )))                                       AS category_name,
            sd.quantity                               AS qty,
            ${amtCol}                                 AS amount
          FROM public.sales_header sh
          JOIN public.sales_detail  sd   ON sd.header_id  = sh.id
          JOIN public.products       prod ON prod.id       = sd.product_id
          LEFT JOIN public.branches  b    ON b.id          = sh.branch_id
          LEFT JOIN public.categories_products cp
            ON cp.product_id       = prod.id
           AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
          LEFT JOIN public.categories c2 ON c2.id = cp.category_id
          LEFT JOIN public.categories p2 ON p2.id = c2.parent_category_id
          LEFT JOIN public.categories g  ON g.id  = p2.parent_category_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date::date >= '${fechaMinDate}'::date
            AND sh.doc_date::date <= '${fechaMaxDate}'::date
            ${branchClause}
            ${categoryClause}
        ),
        aggregated AS (
          SELECT
            product_id,
            product_name,
            sku,
            MAX(category_name)   AS category_name,
            SUM(qty)             AS total_qty,
            SUM(amount)          AS total_amount,
            COUNT(DISTINCT branch_sap_id) AS branch_count
          FROM line_items
          GROUP BY product_id, product_name, sku
        ),
        -- Stock actual: suma del stock de todas las tiendas en scope
        stock_agg AS (
          SELECT
            s.product_id,
            SUM(GREATEST(s.stock::numeric, 0)) AS total_stock
          FROM public.stocks s
          LEFT JOIN public.branches sb ON sb.id = s.branch_id
          WHERE 1=1
            ${stockBranchClause}
          GROUP BY s.product_id
        )
        SELECT
          a.product_id,
          a.product_name,
          a.sku,
          a.category_name,
          a.total_qty::numeric                                         AS total_qty,
          a.total_amount::numeric                                      AS total_amount,
          a.branch_count,
          COALESCE(sa.total_stock, 0)::numeric                        AS total_stock,
          -- Venta diaria promedio = total_qty / días del período
          ROUND((a.total_qty::numeric / ${daysDiff}), 2)              AS avg_daily_qty,
          -- Cobertura = stock / venta_diaria (NULL si venta_diaria = 0)
          CASE
            WHEN a.total_qty > 0
            THEN ROUND(
              COALESCE(sa.total_stock, 0)::numeric
              / (a.total_qty::numeric / ${daysDiff}),
              1
            )
            ELSE NULL
          END                                                          AS coverage_days,
          RANK() OVER (ORDER BY a.total_qty    DESC) AS rank_qty,
          RANK() OVER (ORDER BY a.total_amount DESC) AS rank_amount
        FROM aggregated a
        LEFT JOIN stock_agg sa ON sa.product_id = a.product_id
        WHERE a.total_qty > 0
        ORDER BY rank_qty
        LIMIT 50;
      `;

      // Segunda query para top 50 por monto (necesitamos orden diferente)
      const queryByAmount = `
        WITH line_items AS (
          SELECT
            prod.id                                   AS product_id,
            prod.name                                 AS product_name,
            prod.int_sku                              AS sku,
            INITCAP(LOWER(COALESCE(b.name, '')))      AS branch_name,
            b.sap_id                                  AS branch_sap_id,
            INITCAP(LOWER(COALESCE(
              g.name, p2.name, c2.name, 'Sin Categoría'
            )))                                       AS category_name,
            sd.quantity                               AS qty,
            ${amtCol}                                 AS amount
          FROM public.sales_header sh
          JOIN public.sales_detail  sd   ON sd.header_id  = sh.id
          JOIN public.products       prod ON prod.id       = sd.product_id
          LEFT JOIN public.branches  b    ON b.id          = sh.branch_id
          LEFT JOIN public.categories_products cp
            ON cp.product_id       = prod.id
           AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
          LEFT JOIN public.categories c2 ON c2.id = cp.category_id
          LEFT JOIN public.categories p2 ON p2.id = c2.parent_category_id
          LEFT JOIN public.categories g  ON g.id  = p2.parent_category_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date::date >= '${fechaMinDate}'::date
            AND sh.doc_date::date <= '${fechaMaxDate}'::date
            ${branchClause}
            ${categoryClause}
        ),
        aggregated AS (
          SELECT
            product_id,
            product_name,
            sku,
            MAX(category_name)   AS category_name,
            SUM(qty)             AS total_qty,
            SUM(amount)          AS total_amount,
            COUNT(DISTINCT branch_sap_id) AS branch_count
          FROM line_items
          GROUP BY product_id, product_name, sku
        ),
        stock_agg AS (
          SELECT
            s.product_id,
            SUM(GREATEST(s.stock::numeric, 0)) AS total_stock
          FROM public.stocks s
          LEFT JOIN public.branches sb ON sb.id = s.branch_id
          WHERE 1=1
            ${stockBranchClause}
          GROUP BY s.product_id
        )
        SELECT
          a.product_id,
          a.product_name,
          a.sku,
          a.category_name,
          a.total_qty::numeric                                         AS total_qty,
          a.total_amount::numeric                                      AS total_amount,
          a.branch_count,
          COALESCE(sa.total_stock, 0)::numeric                        AS total_stock,
          ROUND((a.total_qty::numeric / ${daysDiff}), 2)              AS avg_daily_qty,
          CASE
            WHEN a.total_qty > 0
            THEN ROUND(
              COALESCE(sa.total_stock, 0)::numeric
              / (a.total_qty::numeric / ${daysDiff}),
              1
            )
            ELSE NULL
          END                                                          AS coverage_days,
          RANK() OVER (ORDER BY a.total_qty    DESC) AS rank_qty,
          RANK() OVER (ORDER BY a.total_amount DESC) AS rank_amount
        FROM aggregated a
        LEFT JOIN stock_agg sa ON sa.product_id = a.product_id
        WHERE a.total_amount > 0
        ORDER BY rank_amount
        LIMIT 50;
      `;

      try {
        const [resultByQty, resultByAmount] = await Promise.all([
          pool.query(query, params),
          pool.query(queryByAmount, params),
        ]);

        const mapRow = (row: any, idx: number) => ({
          rank: idx + 1,
          product_id: row.product_id,
          product_name: row.product_name ?? '',
          sku: row.sku ?? '',
          category_name: row.category_name ?? 'Sin Categoría',
          total_qty: Number(row.total_qty ?? 0),
          total_amount: Number(row.total_amount ?? 0),
          branch_count: Number(row.branch_count ?? 0),
          total_stock: Number(row.total_stock ?? 0),
          avg_daily_qty: Number(row.avg_daily_qty ?? 0),
          coverage_days: row.coverage_days != null ? Number(row.coverage_days) : null,
        });

        return {
          success: true,
          byQuantity: resultByQty.rows.map(mapRow),
          byAmount: resultByAmount.rows.map(mapRow),
          metadata: {
            fecha_min: fechaMinDate,
            fecha_max: fechaMaxDate,
            branch_id: branch_id || 'all',
            category_id: category_id || 'all',
            generated_at: new Date().toISOString(),
          },
        };
      } catch (error) {
        console.error('[PostgreSQL] Error executing top products query:', error);
        throw new Error('Error al consultar top productos');
      }
    }),

  /**
   * Obtiene transacciones identificadas por tienda y día
   * Calcula total de transacciones, identificadas y porcentaje de identificación
   * Soporta filtros de fecha y sucursal
   */
  getIdentifiedTransactions: publicProcedure
    .input(
      z.object({
        fecha_min: z.string(), // Fecha en formato YYYY-MM-DD
        fecha_max: z.string(), // Fecha en formato YYYY-MM-DD
        branch_sap_id: z.string().optional(), // Filtro opcional de tienda por sap_id
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_sap_id } = input;

      const fechaMinDate = fecha_min.substring(0, 10);
      const fechaMaxDate = fecha_max.substring(0, 10);

      const additionalFilters: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (branch_sap_id && branch_sap_id !== 'all') {
        additionalFilters.push(`AND b.sap_id = $${paramIndex}`);
        queryParams.push(branch_sap_id);
        paramIndex++;
      }

      const query = `
        SELECT
          DATE(sh.doc_date) AS sale_day,
          b.name            AS nombre,
          b.sap_id          AS codigo_tienda,
          COUNT(*)          AS total_transactions,
          COUNT(*) FILTER (
            WHERE sh.customer_id IS NOT NULL
              AND sh.customer_id <> '8572af00-5600-46ff-958c-9f4ff701a4a2'
          )                 AS identified_transactions,
          ROUND(
            100.0 * COUNT(*) FILTER (
              WHERE sh.customer_id IS NOT NULL
                AND sh.customer_id <> '8572af00-5600-46ff-958c-9f4ff701a4a2'
            ) / NULLIF(COUNT(*), 0),
            2
          )                 AS identified_percentage
        FROM public.sales_header sh
        LEFT JOIN public.branches b ON b.id = sh.branch_id
        WHERE sh.doc_date IS NOT NULL
          AND DATE(sh.doc_date) >= '${fechaMinDate}'::date
          AND DATE(sh.doc_date) <= '${fechaMaxDate}'::date
          ${additionalFilters.join('\n          ')}
        GROUP BY
          DATE(sh.doc_date),
          b.name,
          b.sap_id
        ORDER BY
          sale_day,
          CAST(SUBSTRING(b.sap_id FROM '[0-9]+') AS INTEGER) NULLS LAST;
      `;

      try {
        const result = await pool.query(query, queryParams);

        // Convertir bigint a number para serialización JSON
        const rows = result.rows.map((row: any) => ({
          sale_day: row.sale_day instanceof Date
            ? row.sale_day.toISOString().substring(0, 10)
            : String(row.sale_day),
          nombre: row.nombre ?? 'Sin nombre',
          codigo_tienda: row.codigo_tienda ?? '',
          total_transactions: Number(row.total_transactions),
          identified_transactions: Number(row.identified_transactions),
          identified_percentage: row.identified_percentage !== null
            ? Number(row.identified_percentage)
            : 0,
        }));

        return {
          success: true,
          data: rows,
          metadata: {
            total_rows: rows.length,
            fecha_min: fechaMinDate,
            fecha_max: fechaMaxDate,
            branch_sap_id: branch_sap_id || 'all',
            generated_at: new Date().toISOString(),
          },
        };
      } catch (error) {
        console.error('[PostgreSQL] Error executing identified transactions query:', error);
        throw new Error('Error al consultar transacciones identificadas');
      }
    }),

  /**
   * Devuelve datos agregados por día de semana × hora para el mapa de calor.
   * Usa la misma lógica que getHourlySales + HourlyLineChart:
   * - getHourlySales devuelve hour_ts = date_trunc('hour', doc_date) en UTC
   * - HourlyLineChart extrae la hora con getUTCHours()
   * Por lo tanto, el heatmap también debe extraer EXTRACT(HOUR FROM doc_date)
   * (que es UTC) para que ambos gráficos muestren los mismos valores por hora.
   */
  getHeatmapData: publicProcedure
    .input(
      z.object({
        fecha_min: z.string(),
        fecha_max: z.string(),
        branch_id: z.string().optional(),
        metric: z.enum(['amount', 'transactions']).default('amount'),
        include_igv: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_id, metric, include_igv } = input;
      const amtCol = include_igv ? 'sd.total' : 'sd.subtotal';
      const fechaMinDate = fecha_min.substring(0, 10);
      const fechaMaxDate = fecha_max.substring(0, 10);

      const additionalFilters: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (branch_id && branch_id !== 'all') {
        additionalFilters.push(`AND b.sap_id = $${paramIndex}`);
        queryParams.push(branch_id);
        paramIndex++;
      }

      // Extraer hora y día de semana directamente en UTC (sin conversión de zona horaria)
      // para que coincida con HourlyLineChart que usa date.getUTCHours().
      const metricExpr = metric === 'amount'
        ? 'SUM(line_total)'
        : 'COUNT(DISTINCT sale_id)';

      const query = `
        WITH base AS (
          SELECT
            sh.id AS sale_id,
            sh.doc_date,
            ${amtCol} AS line_total
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date::date >= '${fechaMinDate}'::date
            AND sh.doc_date::date <= '${fechaMaxDate}'::date
            ${additionalFilters.join('\n            ')}
        )
        SELECT
          EXTRACT(DOW FROM doc_date)::int   AS day_of_week,
          EXTRACT(HOUR FROM doc_date)::int  AS hour_of_day,
          ${metricExpr.replace('sd.total', 'line_total').replace('sh.id', 'sale_id')} AS value
        FROM base
        GROUP BY day_of_week, hour_of_day
        ORDER BY day_of_week, hour_of_day;
      `;

      try {
        const result = await pool.query(query, queryParams);
        return {
          success: true,
          data: result.rows as Array<{ day_of_week: number; hour_of_day: number; value: string }>,
          metadata: { fecha_min: fechaMinDate, fecha_max: fechaMaxDate, metric },
        };
      } catch (error) {
        console.error('[PostgreSQL] Error executing heatmap query:', error);
        throw new Error('Error al consultar datos del mapa de calor');
      }
    }),

  /**
   * Modo "Comparar día específico": obtiene datos de las últimas N semanas
   * para un día de semana específico (0=Dom ... 6=Sáb, igual que EXTRACT(DOW)).
   * Devuelve filas con: date_label (YYYY-MM-DD), hour_of_day, value.
   * Preparado para ampliar a 8, 12 o 16 semanas cambiando weeks_back.
   */
  getHeatmapDayComparison: publicProcedure
    .input(
      z.object({
        base_date: z.string(),                              // YYYY-MM-DD: fecha de referencia
        day_of_week: z.number().int().min(0).max(6),       // 0=Dom ... 6=Sáb
        weeks_back: z.number().int().min(1).max(52).default(6),
        branch_id: z.string().optional(),
        metric: z.enum(['amount', 'transactions']).default('amount'),
        include_igv: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const { base_date, day_of_week, weeks_back, branch_id, metric, include_igv } = input;
      const amtCol = include_igv ? 'sd.total' : 'sd.subtotal';

      // Calcular las fechas de las últimas N ocurrencias del día seleccionado
      // partiendo desde base_date hacia atrás, en orden cronológico ascendente
      const baseDateObj = new Date(base_date + 'T00:00:00Z');
      const targetDates: string[] = [];
      const cursor = new Date(baseDateObj);
      // Retroceder hasta encontrar el día de semana correcto
      while (cursor.getUTCDay() !== day_of_week) {
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }
      for (let i = 0; i < weeks_back; i++) {
        const yyyy = cursor.getUTCFullYear();
        const mm = String(cursor.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(cursor.getUTCDate()).padStart(2, '0');
        targetDates.unshift(`${yyyy}-${mm}-${dd}`); // orden cronológico ascendente
        cursor.setUTCDate(cursor.getUTCDate() - 7);
      }

      const additionalFilters: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (branch_id && branch_id !== 'all') {
        additionalFilters.push(`AND b.sap_id = $${paramIndex}`);
        queryParams.push(branch_id);
        paramIndex++;
      }

      // Construir cláusula IN con las fechas calculadas
      const datePlaceholders = targetDates.map((d) => {
        queryParams.push(d);
        const ph = `$${paramIndex}`;
        paramIndex++;
        return ph;
      }).join(', ');

      const metricExpr = metric === 'amount'
        ? 'SUM(line_total)'
        : 'COUNT(DISTINCT sale_id)';

      const query = `
        WITH base AS (
          SELECT
            sh.id AS sale_id,
            sh.doc_date,
            ${amtCol} AS line_total
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date::date IN (${datePlaceholders})
            ${additionalFilters.join('\n            ')}
        )
        SELECT
          doc_date::date::text                   AS date_label,
          EXTRACT(HOUR FROM doc_date)::int       AS hour_of_day,
          ${metricExpr}                          AS value
        FROM base
        GROUP BY date_label, hour_of_day
        ORDER BY date_label, hour_of_day;
      `;

      try {
        const result = await pool.query(query, queryParams);
        return {
          success: true,
          data: result.rows as Array<{ date_label: string; hour_of_day: number; value: string }>,
          target_dates: targetDates,
          metadata: { base_date, day_of_week, weeks_back, metric },
        };
      } catch (error) {
        console.error('[PostgreSQL] Error executing heatmap day comparison query:', error);
        throw new Error('Error al consultar datos de comparación por día');
      }
    }),

  /**
   * Detalle de transacciones identificadas por cajero para una tienda y período dados.
   * Retorna el breakdown de total / identificadas / % por cajero,
   * junto con el nombre y num_doc del cajero (num_doc solo para tooltip).
   */
  getIdentifiedTransactionsByCashier: publicProcedure
    .input(
      z.object({
        fecha_min: z.string(),
        fecha_max: z.string(),
        branch_sap_id: z.string(), // sap_id de la tienda
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_sap_id } = input;
      const fechaMin = fecha_min.substring(0, 10);
      const fechaMax = fecha_max.substring(0, 10);

      const query = `
        SELECT
          sh.cashier_id,
          c.name                                         AS cashier_name,
          c.num_doc                                      AS cashier_num_doc,
          COUNT(*)                                       AS total_transactions,
          COUNT(*) FILTER (
            WHERE sh.customer_id IS NOT NULL
              AND sh.customer_id <> '8572af00-5600-46ff-958c-9f4ff701a4a2'
          )                                              AS identified_transactions,
          ROUND(
            100.0 * COUNT(*) FILTER (
              WHERE sh.customer_id IS NOT NULL
                AND sh.customer_id <> '8572af00-5600-46ff-958c-9f4ff701a4a2'
            ) / NULLIF(COUNT(*), 0),
            2
          )                                              AS identified_percentage
        FROM public.sales_header sh
        LEFT JOIN public.branches b   ON b.id  = sh.branch_id
        LEFT JOIN public.cashier  c   ON c.id  = sh.cashier_id
        WHERE sh.doc_date IS NOT NULL
          AND DATE(sh.doc_date) >= $1::date
          AND DATE(sh.doc_date) <= $2::date
          AND b.sap_id = $3
        GROUP BY sh.cashier_id, c.name, c.num_doc
        ORDER BY total_transactions DESC;
      `;

      try {
        const result = await pool.query(query, [fechaMin, fechaMax, branch_sap_id]);
        return {
          success: true,
          data: result.rows.map((row: any) => ({
            cashier_id:              row.cashier_id ?? null,
            cashier_name:            row.cashier_name ?? 'Sin nombre',
            cashier_num_doc:         row.cashier_num_doc ?? null,
            total_transactions:      Number(row.total_transactions),
            identified_transactions: Number(row.identified_transactions),
            identified_percentage:   row.identified_percentage !== null
              ? Number(row.identified_percentage)
              : 0,
          })),
        };
      } catch (error) {
        console.error('[PostgreSQL] Error executing cashier breakdown query:', error);
        throw new Error('Error al consultar detalle por cajero');
      }
    }),
});
