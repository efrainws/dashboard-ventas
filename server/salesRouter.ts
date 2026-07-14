import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as XLSX from "xlsx";
import { pool, queryWithRetry } from "./postgres";
import { z } from "zod";
import { cached, TTL } from "./queryCache";
import { ENV } from "./_core/env";

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

      // OPTIMIZACIÓN: filtrar sales_header por fecha PRIMERO (usa índice en doc_date),
      // luego hacer JOIN con sales_detail solo para las filas del rango.
      // Esto evita el full scan de 4M filas de sales_detail.
      const query = `
        WITH filtered_headers AS (
          SELECT
            sh.id,
            sh.doc_date,
            sh.branch_id,
            sh.source_system_id,
            INITCAP(LOWER(COALESCE(b.name,'')))    AS branch_name,
            INITCAP(LOWER(COALESCE(b.address,''))) AS branch_address,
            b.sap_id                               AS branch_sap_id,
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
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date >= '${fechaMinDate}'::date
            AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day')
            AND sh.doc_date IS NOT NULL
        ),
        base AS (
          SELECT
            fh.id AS sale_id,
            fh.doc_date,
            fh.branch_id,
            fh.branch_name,
            fh.branch_address,
            fh.branch_sap_id,
            fh.sales_channel,
            ${amtCol} AS line_total,
            cp.category_id AS leaf_category_id,
            c.name AS leaf_category_name,
            p.id   AS parent_category_id,
            p.name AS parent_category_name,
            g.id   AS grandparent_category_id,
            g.name AS grandparent_category_name
          FROM filtered_headers fh
          JOIN sales_detail sd ON sd.header_id = fh.id
          LEFT JOIN categories_products cp
            ON cp.product_id = sd.product_id
           AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
          LEFT JOIN categories c ON c.id = cp.category_id
          LEFT JOIN categories p ON p.id = c.parent_category_id
          LEFT JOIN categories g ON g.id = p.parent_category_id
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
          array_agg(DISTINCT sale_id) AS sale_ids
        FROM base
        WHERE 1=1
          ${additionalFilters.join('\n          ')}
        GROUP BY
          doc_date::date, branch_id, branch_sap_id,
          branch_name, branch_address,
          sales_channel,
          category_abuelo_id, category_abuelo_name
        ORDER BY doc_date, CAST(SUBSTRING(branch_sap_id FROM '[0-9]+') AS INTEGER), category_abuelo_name;
      `;

      const igvKey = include_igv ? 'igv' : 'noigv';
      const cacheKey = `sales:aggregated:${fechaMinDate}:${fechaMaxDate}:${branch_id ?? 'all'}:${category_id ?? 'all'}:${igvKey}`;
      try {
        return await cached(cacheKey, TTL.DYNAMIC, async () => {
          const result = await queryWithRetry(query, queryParams);
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
        });
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

      // OPTIMIZACIÓN: filtrar sales_header por fecha PRIMERO
      const query = `
        WITH filtered_headers AS (
          SELECT
            sh.id,
            sh.doc_date,
            sh.branch_id,
            sh.source_system_id,
            INITCAP(LOWER(COALESCE(b.name,'')))    AS branch_name,
            INITCAP(LOWER(COALESCE(b.address,''))) AS branch_address,
            b.sap_id                               AS branch_sap_id,
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
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date >= '${fechaMinDate}'::date
            AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day')
            AND sh.doc_date IS NOT NULL
        )
        SELECT
          date_trunc('hour', fh.doc_date) AS hour_ts,
          fh.branch_id,
          fh.branch_sap_id,
          fh.branch_name,
          fh.branch_address,
          fh.sales_channel,
          SUM(${amtCol}) AS sales_amount,
          COUNT(DISTINCT fh.id) AS tickets_count
        FROM filtered_headers fh
        JOIN sales_detail sd ON sd.header_id = fh.id
        WHERE 1=1
          ${additionalFilters.join('\n          ')}
        GROUP BY
          hour_ts, fh.branch_id, fh.branch_sap_id,
          fh.branch_name, fh.branch_address,
          fh.sales_channel
        ORDER BY hour_ts, CAST(SUBSTRING(fh.branch_sap_id FROM '[0-9]+') AS INTEGER);
      `;

      try {
        const result = await queryWithRetry(query, queryParams);
        
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

      // OPTIMIZACIÓN: filtrar sales_header por fecha PRIMERO, luego JOIN con sales_detail
      // Incluye JOIN a branches (para filtrar por branch_id) y categories (para category_id)
      const query = `
        WITH filtered_headers AS (
          SELECT
            sh.id,
            sh.doc_date,
            sh.branch_id,
            b.sap_id AS branch_sap_id,
            CASE
              WHEN sh.doc_date >= '${fechaMinDate}'::date AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day')
                THEN 'current'
              WHEN sh.doc_date >= '${prevStartStr}'::date AND sh.doc_date < ('${prevEndStr}'::date + INTERVAL '1 day')
                THEN 'previous'
            END AS period
          FROM sales_header sh
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND (
              (sh.doc_date >= '${fechaMinDate}'::date AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day'))
              OR (sh.doc_date >= '${prevStartStr}'::date AND sh.doc_date < ('${prevEndStr}'::date + INTERVAL '1 day'))
            )
            ${additionalFilters.filter(f => f.includes('b.sap_id')).join('\n            ')}
        ),
        agg_detail AS (
          SELECT
            sd.header_id,
            SUM(${amtCol}) AS line_total,
            COALESCE(g.id, p.id, c.id) AS category_id
          FROM sales_detail sd
          INNER JOIN filtered_headers fh ON fh.id = sd.header_id
          LEFT JOIN categories_products cp
            ON cp.product_id = sd.product_id
           AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
          LEFT JOIN categories c ON c.id = cp.category_id
          LEFT JOIN categories p ON p.id = c.parent_category_id
          LEFT JOIN categories g ON g.id = p.parent_category_id
          GROUP BY sd.header_id, COALESCE(g.id, p.id, c.id)
        )
        SELECT
          fh.period,
          SUM(ad.line_total) AS total_sales,
          COUNT(DISTINCT fh.id) AS total_tickets
        FROM filtered_headers fh
        JOIN agg_detail ad ON ad.header_id = fh.id
        WHERE fh.period IS NOT NULL
          ${additionalFilters.filter(f => f.includes('category')).map(f => f.replace('COALESCE(grandparent_category_id, parent_category_id, leaf_category_id)', 'ad.category_id')).join('\n          ')}
        GROUP BY fh.period;
      `;

      const igvKey = include_igv ? 'igv' : 'noigv';
      const cacheKey = `sales:comparison:${fechaMinDate}:${fechaMaxDate}:${branch_id ?? 'all'}:${category_id ?? 'all'}:${igvKey}`;
      try {
        return await cached(cacheKey, TTL.DYNAMIC, async () => {
          const result = await queryWithRetry(query, queryParams);
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
        });
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
              WHEN sh.doc_date >= '${fechaMinDate}'::date AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day')
                THEN 'current'
              WHEN sh.doc_date >= '${prevStartStr}'::date AND sh.doc_date < ('${prevEndStr}'::date + INTERVAL '1 day')
                THEN 'previous'
              ELSE NULL
            END AS period
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND (
              (sh.doc_date >= '${fechaMinDate}'::date AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day'))
              OR (sh.doc_date >= '${prevStartStr}'::date AND sh.doc_date < ('${prevEndStr}'::date + INTERVAL '1 day'))
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
        const result = await queryWithRetry(query, queryParams);
        
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

      // Construir filtro de categoría para el JOIN con sales_detail (si aplica)
      let categoryJoin = '';
      let categoryFilter = '';
      if (category_id && category_id !== 'all') {
        // Necesitamos filtrar por categoría a nivel de sales_detail
        categoryJoin = `
          LEFT JOIN products p ON p.id = sd.product_id
          LEFT JOIN categories_products cp ON cp.product_id = p.id AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
          LEFT JOIN categories leaf_cat ON leaf_cat.id = cp.category_id
          LEFT JOIN categories parent_cat ON parent_cat.id = leaf_cat.parent_category_id
          LEFT JOIN categories grandparent_cat ON grandparent_cat.id = parent_cat.parent_category_id`;
        categoryFilter = `AND COALESCE(grandparent_cat.id, parent_cat.id, leaf_cat.id) = $${paramIndex}`;
        queryParams.push(category_id);
        paramIndex++;
      }

      // OPTIMIZACIÓN: filtrar sales_header por fecha PRIMERO, luego pre-agregar sales_detail
      const query = `
        WITH filtered_headers AS (
          SELECT
            sh.id,
            sh.doc_date,
            sh.branch_id,
            INITCAP(LOWER(COALESCE(b.name,''))) AS branch_name,
            b.sap_id AS branch_sap_id,
            CASE
              WHEN sh.doc_date >= '${fechaMinDate}'::date AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day')
                THEN 'current'
              WHEN sh.doc_date >= '${prevStartStr}'::date AND sh.doc_date < ('${prevEndStr}'::date + INTERVAL '1 day')
                THEN 'previous'
            END AS period
          FROM sales_header sh
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND (
              (sh.doc_date >= '${fechaMinDate}'::date AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day'))
              OR (sh.doc_date >= '${prevStartStr}'::date AND sh.doc_date < ('${prevEndStr}'::date + INTERVAL '1 day'))
            )
        ),
        agg_detail AS (
          SELECT sd.header_id, SUM(${amtCol}) AS line_total
          FROM sales_detail sd
          INNER JOIN filtered_headers fh ON fh.id = sd.header_id
          ${categoryJoin}
          WHERE 1=1 ${categoryFilter}
          GROUP BY sd.header_id
        )
        SELECT
          fh.period,
          fh.branch_id,
          fh.branch_name,
          fh.branch_sap_id,
          SUM(ad.line_total) AS total_sales,
          COUNT(DISTINCT fh.id) AS total_tickets,
          COUNT(DISTINCT DATE(fh.doc_date)) AS total_days
        FROM filtered_headers fh
        JOIN agg_detail ad ON ad.header_id = fh.id
        WHERE fh.period IS NOT NULL
        GROUP BY fh.period, fh.branch_id, fh.branch_name, fh.branch_sap_id
        ORDER BY fh.branch_sap_id;
      `;

      const igvKey = include_igv ? 'igv' : 'noigv';
      const cacheKey = `sales:branchComparison:${fechaMinDate}:${fechaMaxDate}:${category_id ?? 'all'}:${igvKey}`;
      try {
        return await cached(cacheKey, TTL.DYNAMIC, async () => {
          const result = await queryWithRetry(query, queryParams);
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
              branch.current = { total_sales: totalSales, total_tickets: totalTickets, avg_ticket: avgTicket, avg_sales_per_day: avgSalesPerDay };
            } else if (row.period === 'previous') {
              branch.previous = { total_sales: totalSales, total_tickets: totalTickets, avg_ticket: avgTicket, avg_sales_per_day: avgSalesPerDay };
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
        });
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

      // OPTIMIZACIÓN: filtrar sales_header por fecha PRIMERO, luego JOIN con sales_detail y categories
      const query = `
        WITH filtered_headers AS (
          SELECT
            sh.id,
            sh.doc_date,
            sh.branch_id,
            CASE
              WHEN sh.doc_date >= '${fechaMinDate}'::date AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day')
                THEN 'current'
              WHEN sh.doc_date >= '${prevStartStr}'::date AND sh.doc_date < ('${prevEndStr}'::date + INTERVAL '1 day')
                THEN 'previous'
            END AS period
          FROM sales_header sh
          WHERE sh.doc_date IS NOT NULL
            AND (
              (sh.doc_date >= '${fechaMinDate}'::date AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day'))
              OR (sh.doc_date >= '${prevStartStr}'::date AND sh.doc_date < ('${prevEndStr}'::date + INTERVAL '1 day'))
            )
        ),
        base AS (
          SELECT
            fh.id AS sale_id,
            fh.period,
            ${amtCol} AS line_total,
            cp.category_id AS leaf_category_id,
            c.name AS leaf_category_name,
            p.id AS parent_category_id,
            p.name AS parent_category_name,
            g.id AS grandparent_category_id,
            g.name AS grandparent_category_name
          FROM filtered_headers fh
          JOIN sales_detail sd ON sd.header_id = fh.id
          LEFT JOIN branches b ON b.id = fh.branch_id
          LEFT JOIN categories_products cp
            ON cp.product_id = sd.product_id
           AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
          LEFT JOIN categories c ON c.id = cp.category_id
          LEFT JOIN categories p ON p.id = c.parent_category_id
          LEFT JOIN categories g ON g.id = p.parent_category_id
          WHERE fh.period IS NOT NULL
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
        GROUP BY period, category_id, category_name
        ORDER BY category_name;
      `;

      const igvKey = include_igv ? 'igv' : 'noigv';
      const cacheKey = `sales:categoryComparison:${fechaMinDate}:${fechaMaxDate}:${branch_id ?? 'all'}:${igvKey}`;
      try {
        return await cached(cacheKey, TTL.DYNAMIC, async () => {
          const result = await queryWithRetry(query, queryParams);
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
              category.current = { total_sales: parseFloat(row.total_sales || 0) };
            } else if (row.period === 'previous') {
              category.previous = { total_sales: parseFloat(row.total_sales || 0) };
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
        });
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
            AND sh.doc_date >= '${fechaMinDate}'::date AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day')
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
            AND sh.doc_date >= '${fechaMinDate}'::date AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day')
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
          AND sh.doc_date >= '${fechaMinDate}'::date AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day')
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
        const result = await queryWithRetry(query, queryParams);

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
      // Transacciones con time = 00:00:00 exacto no tienen hora real (importadas sin hora);
      // se agrupan como hour_of_day = -1 para que el frontend las muestre como "Sin hora".
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
            AND sh.doc_date >= '${fechaMinDate}'::date AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day')
            ${additionalFilters.join('\n            ')}
        )
        SELECT
          EXTRACT(DOW FROM doc_date)::int   AS day_of_week,
          CASE
            WHEN doc_date::time = TIME '00:00:00' THEN -1
            ELSE EXTRACT(HOUR FROM doc_date)::int
          END                               AS hour_of_day,
          ${metricExpr.replace('sd.total', 'line_total').replace('sh.id', 'sale_id')} AS value
        FROM base
        GROUP BY day_of_week, hour_of_day
        ORDER BY day_of_week, hour_of_day;
      `;

      try {
        const result = await queryWithRetry(query, queryParams);
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

      // OPTIMIZACIÓN: agregar rango de timestamp para que PostgreSQL use el índice en doc_date
      // El rango cubre desde la fecha más antigua hasta la más reciente de targetDates
      // Luego el IN filtra las fechas exactas (días de semana específicos)
      const minDate = targetDates[0];                    // fecha más antigua (orden cronológico)
      const maxDate = targetDates[targetDates.length - 1]; // fecha más reciente

      const metricExpr = metric === 'amount'
        ? 'SUM(line_total)'
        : 'COUNT(DISTINCT sale_id)';

      // OPTIMIZACIÓN: filtrar sales_header por rango de fechas PRIMERO (usa índice),
      // luego filtrar por fechas exactas con IN (días de semana específicos)
      const query = `
        WITH filtered_headers AS (
          SELECT
            sh.id,
            sh.doc_date,
            sh.branch_id,
            b.sap_id AS branch_sap_id
          FROM sales_header sh
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date >= '${minDate}'::date
            AND sh.doc_date < ('${maxDate}'::date + INTERVAL '1 day')
            AND sh.doc_date::date IN (${datePlaceholders})
            ${additionalFilters.join('\n            ')}
        ),
        base AS (
          SELECT
            fh.id AS sale_id,
            fh.doc_date,
            ${amtCol} AS line_total
          FROM filtered_headers fh
          JOIN sales_detail sd ON sd.header_id = fh.id
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
        const result = await queryWithRetry(query, queryParams);
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
          AND sh.doc_date >= $1::date AND sh.doc_date < ($2::date + INTERVAL '1 day')
          AND b.sap_id = $3
        GROUP BY sh.cashier_id, c.name, c.num_doc
        ORDER BY total_transactions DESC;
      `;

      try {
        const result = await queryWithRetry(query, [fechaMin, fechaMax, branch_sap_id]);
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

  /**
   * Resumen de Notas de Crédito por tienda y día.
   * Identifica las NC usando sales_header.order_serial → pos_by_branch.serie WHERE is_nc = TRUE.
   */
  getCreditNotes: publicProcedure
    .input(
      z.object({
        fecha_min: z.string(),
        fecha_max: z.string(),
        branch_sap_id: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_sap_id } = input;
      const fechaMin = fecha_min.substring(0, 10);
      const fechaMax = fecha_max.substring(0, 10);

      const additionalFilters: string[] = [];
      const queryParams: any[] = [fechaMin, fechaMax];
      let paramIndex = 3;

      if (branch_sap_id && branch_sap_id !== 'all') {
        additionalFilters.push(`AND b.sap_id = $${paramIndex}`);
        queryParams.push(branch_sap_id);
        paramIndex++;
      }

      const query = `
        WITH nc_data AS (
          SELECT
            DATE(sh.doc_date)   AS sale_day,
            b.name              AS nombre,
            b.sap_id            AS codigo_tienda,
            COUNT(*)            AS total_nc,
            SUM(sh.total)       AS monto_total_nc,
            SUM(sh.subtotal)    AS monto_subtotal_nc
          FROM public.sales_header sh
          INNER JOIN public.pos_by_branch pbb
            ON pbb.serie = sh.order_serial
            AND pbb.is_nc = TRUE
          LEFT JOIN public.branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date >= $1::date AND sh.doc_date < ($2::date + INTERVAL '1 day')
            ${additionalFilters.join('\n            ')}
          GROUP BY
            DATE(sh.doc_date),
            b.name,
            b.sap_id
        ),
        total_ventas AS (
          SELECT
            b2.sap_id            AS codigo_tienda,
            COUNT(*)             AS total_txn,
            SUM(sh2.total)       AS monto_total_ventas,
            SUM(sh2.subtotal)    AS monto_subtotal_ventas
          FROM public.sales_header sh2
          LEFT JOIN public.branches b2 ON b2.id = sh2.branch_id
          WHERE sh2.doc_date IS NOT NULL
            AND DATE(sh2.doc_date) >= $1::date
            AND DATE(sh2.doc_date) <= $2::date
            ${additionalFilters.join('\n            ')}
          GROUP BY b2.sap_id
        )
        SELECT
          nc.sale_day,
          nc.nombre,
          nc.codigo_tienda,
          nc.total_nc,
          nc.monto_total_nc,
          nc.monto_subtotal_nc,
          COALESCE(tv.total_txn, 0)              AS total_txn_tienda,
          COALESCE(tv.monto_total_ventas, 0)     AS monto_total_ventas,
          COALESCE(tv.monto_subtotal_ventas, 0)  AS monto_subtotal_ventas
        FROM nc_data nc
        LEFT JOIN total_ventas tv USING (codigo_tienda)
        ORDER BY
          nc.sale_day,
          CAST(SUBSTRING(nc.codigo_tienda FROM '[0-9]+') AS INTEGER) NULLS LAST;
      `;

      try {
        const result = await queryWithRetry(query, queryParams);
        const rows = result.rows.map((row: any) => ({
          sale_day: row.sale_day instanceof Date
            ? row.sale_day.toISOString().substring(0, 10)
            : String(row.sale_day),
          nombre:                  row.nombre ?? 'Sin nombre',
          codigo_tienda:           row.codigo_tienda ?? '',
          total_nc:                Number(row.total_nc),
          monto_total_nc:          row.monto_total_nc !== null ? Number(row.monto_total_nc) : 0,
          monto_subtotal_nc:       row.monto_subtotal_nc !== null ? Number(row.monto_subtotal_nc) : 0,
          total_txn_tienda:        Number(row.total_txn_tienda ?? 0),
          monto_total_ventas:      row.monto_total_ventas !== null ? Number(row.monto_total_ventas) : 0,
          monto_subtotal_ventas:   row.monto_subtotal_ventas !== null ? Number(row.monto_subtotal_ventas) : 0,
        }));
        return {
          success: true,
          data: rows,
          metadata: {
            total_rows: rows.length,
            fecha_min: fechaMin,
            fecha_max: fechaMax,
            branch_sap_id: branch_sap_id || 'all',
            generated_at: new Date().toISOString(),
          },
        };
      } catch (error) {
        console.error('[PostgreSQL] Error executing credit notes query:', error);
        throw new Error('Error al consultar notas de crédito');
      }
    }),

  /**
   * Detalle de Notas de Crédito por cajero para una tienda y período dados.
   */
  getCreditNotesByCashier: publicProcedure
    .input(
      z.object({
        fecha_min: z.string(),
        fecha_max: z.string(),
        branch_sap_id: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_sap_id } = input;
      const fechaMin = fecha_min.substring(0, 10);
      const fechaMax = fecha_max.substring(0, 10);

      const query = `
        SELECT
          sh.cashier_id,
          c.name                AS cashier_name,
          c.num_doc             AS cashier_num_doc,
          COUNT(*)              AS total_nc,
          SUM(sh.total)         AS monto_total_nc,
          SUM(sh.subtotal)      AS monto_subtotal_nc
        FROM public.sales_header sh
        INNER JOIN public.pos_by_branch pbb
          ON pbb.serie = sh.order_serial
          AND pbb.is_nc = TRUE
        LEFT JOIN public.branches b  ON b.id  = sh.branch_id
        LEFT JOIN public.cashier  c  ON c.id  = sh.cashier_id
        WHERE sh.doc_date IS NOT NULL
          AND sh.doc_date >= $1::date AND sh.doc_date < ($2::date + INTERVAL '1 day')
          AND b.sap_id = $3
        GROUP BY sh.cashier_id, c.name, c.num_doc
        ORDER BY total_nc DESC;
      `;

      try {
        const result = await queryWithRetry(query, [fechaMin, fechaMax, branch_sap_id]);
        return {
          success: true,
          data: result.rows.map((row: any) => ({
            cashier_id:        row.cashier_id ?? null,
            cashier_name:      row.cashier_name ?? 'Sin nombre',
            cashier_num_doc:   row.cashier_num_doc ?? null,
            total_nc:          Number(row.total_nc),
            monto_total_nc:    row.monto_total_nc !== null ? Number(row.monto_total_nc) : 0,
            monto_subtotal_nc: row.monto_subtotal_nc !== null ? Number(row.monto_subtotal_nc) : 0,
          })),
        };
      } catch (error) {
        console.error('[PostgreSQL] Error executing credit notes by cashier query:', error);
        throw new Error('Error al consultar notas de crédito por cajero');
      }
    }),

  /**
   * Top X clientes por tienda en un período dado.
   * Devuelve, para cada tienda, los N clientes con mayor monto de compra,
   * junto con el porcentaje que representan sobre el total de ventas de la tienda.
   * UUID excluido: 8572af00-5600-46ff-958c-9f4ff701a4a2 (cliente genérico / sin identificar)
   */
  getTopCustomersByBranch: publicProcedure
    .input(
      z.object({
        fecha_min:     z.string(),
        fecha_max:     z.string(),
        top_n:         z.number().int().min(1).max(100).default(10),
        include_igv:   z.boolean().default(true),
        branch_sap_id: z.string().optional(),
        sales_channel: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, top_n, include_igv, branch_sap_id, sales_channel } = input;
      const fechaMin  = fecha_min.substring(0, 10);
      const fechaMax  = fecha_max.substring(0, 10);
      const amtCol    = include_igv ? 'sh.total' : 'sh.subtotal';
      const GENERIC_CUSTOMER = '8572af00-5600-46ff-958c-9f4ff701a4a2';

      const branchFilter = branch_sap_id && branch_sap_id !== 'all'
        ? `AND b.sap_id = '${branch_sap_id.replace(/'/g, "''")}'`
        : '';

      // Canal: Presencial / eCommerce / Rappi
      const channelCaseExpr = `
        CASE
          WHEN EXISTS (
            SELECT 1 FROM methods_payment mp
            WHERE mp.header_id = sh.id
              AND mp.payment_account_id = '7a8fefe8-ddaa-40d1-ace5-d0aebb1b3204'::uuid
          ) THEN 'Rappi'
          WHEN sh.source_system_id = 'be387046-08e4-4229-a52c-7ff5c1569c89'::uuid
            THEN 'eCommerce'
          ELSE 'Presencial'
        END`;

      const channelFilter = sales_channel && sales_channel !== 'all'
        ? `AND (${channelCaseExpr}) = '${sales_channel.replace(/'/g, "''")}'`
        : '';

      const query = `
        WITH branch_totals AS (
          SELECT
            b.sap_id            AS codigo_tienda,
            b.name              AS nombre_tienda,
            SUM(${amtCol})      AS total_tienda,
            COUNT(*)            AS txn_tienda
          FROM public.sales_header sh
          LEFT JOIN public.branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date >= '${fechaMin}'::date AND sh.doc_date < ('${fechaMax}'::date + INTERVAL '1 day')
            ${branchFilter}
            ${channelFilter}
          GROUP BY b.sap_id, b.name
        ),
        customer_branch AS (
          SELECT
            b.sap_id            AS codigo_tienda,
            b.name              AS nombre_tienda,
            sh.customer_id,
            c.commercial_name   AS customer_name,
            SUM(${amtCol})      AS monto,
            COUNT(*)            AS transacciones
          FROM public.sales_header sh
          LEFT JOIN public.branches  b ON b.id = sh.branch_id
          LEFT JOIN public.customers c ON c.id = sh.customer_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date >= '${fechaMin}'::date AND sh.doc_date < ('${fechaMax}'::date + INTERVAL '1 day')
            AND sh.customer_id IS NOT NULL
            AND sh.customer_id <> '${GENERIC_CUSTOMER}'
            ${branchFilter}
            ${channelFilter}
          GROUP BY b.sap_id, b.name, sh.customer_id, c.commercial_name
        ),
        ranked AS (
          SELECT
            cb.*,
            bt.total_tienda,
            bt.txn_tienda,
            ROUND(100.0 * cb.monto / NULLIF(bt.total_tienda, 0), 2) AS pct_tienda,
            ROW_NUMBER() OVER (
              PARTITION BY cb.codigo_tienda
              ORDER BY cb.monto DESC
            ) AS rn
          FROM customer_branch cb
          LEFT JOIN branch_totals bt USING (codigo_tienda)
        )
        SELECT *
        FROM ranked
        WHERE rn <= ${top_n}
        ORDER BY
          CAST(SUBSTRING(codigo_tienda FROM '[0-9]+') AS INTEGER) NULLS LAST,
          rn;
      `;

      try {
        const result = await queryWithRetry(query);
        return {
          success: true,
          data: result.rows.map((row: any) => ({
            codigo_tienda:  row.codigo_tienda ?? '',
            nombre_tienda:  row.nombre_tienda ?? 'Sin nombre',
            customer_id:    row.customer_id ?? null,
            customer_name:  row.customer_name ?? 'Sin nombre',
            monto:          row.monto !== null ? Number(row.monto) : 0,
            transacciones:  Number(row.transacciones),
            total_tienda:   row.total_tienda !== null ? Number(row.total_tienda) : 0,
            txn_tienda:     Number(row.txn_tienda ?? 0),
            pct_tienda:     row.pct_tienda !== null ? Number(row.pct_tienda) : 0,
            rn:             Number(row.rn),
          })),
          metadata: { fecha_min: fechaMin, fecha_max: fechaMax, top_n, sales_channel: sales_channel ?? 'all', generated_at: new Date().toISOString() },
        };
      } catch (error) {
        console.error('[PostgreSQL] Error en getTopCustomersByBranch:', error);
        throw new Error('Error al consultar top clientes por tienda');
      }
    }),

  /**
   * Tabla general de clientes: métricas agregadas de todo el período.
   * Incluye monto total, transacciones, promedios mensuales y lista de tiendas.
   */
  getTopCustomersGeneral: publicProcedure
    .input(
      z.object({
        fecha_min:     z.string(),
        fecha_max:     z.string(),
        top_n:         z.number().int().min(1).max(100).default(10),
        include_igv:   z.boolean().default(true),
        branch_sap_id: z.string().optional(),
        sales_channel: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, top_n, include_igv, branch_sap_id, sales_channel } = input;
      const fechaMin  = fecha_min.substring(0, 10);
      const fechaMax  = fecha_max.substring(0, 10);
      const amtCol    = include_igv ? 'sh.total' : 'sh.subtotal';
      const GENERIC_CUSTOMER = '8572af00-5600-46ff-958c-9f4ff701a4a2';

      const branchFilter = branch_sap_id && branch_sap_id !== 'all'
        ? `AND b.sap_id = '${branch_sap_id.replace(/'/g, "''")}'`
        : '';

      const channelCaseExprG = `
        CASE
          WHEN EXISTS (
            SELECT 1 FROM methods_payment mp
            WHERE mp.header_id = sh.id
              AND mp.payment_account_id = '7a8fefe8-ddaa-40d1-ace5-d0aebb1b3204'::uuid
          ) THEN 'Rappi'
          WHEN sh.source_system_id = 'be387046-08e4-4229-a52c-7ff5c1569c89'::uuid
            THEN 'eCommerce'
          ELSE 'Presencial'
        END`;

      const channelFilterG = sales_channel && sales_channel !== 'all'
        ? `AND (${channelCaseExprG}) = '${sales_channel.replace(/'/g, "''")}'`
        : '';

      // Calcular número de meses en el rango para promedios
      const query = `
        WITH date_range AS (
          SELECT
            DATE_PART('year', AGE('${fechaMax}'::date, '${fechaMin}'::date)) * 12
            + DATE_PART('month', AGE('${fechaMax}'::date, '${fechaMin}'::date)) + 1 AS num_months
        ),
        customer_data AS (
          SELECT
            sh.customer_id,
            c.commercial_name                     AS customer_name,
            SUM(${amtCol})                        AS monto_total,
            COUNT(*)                              AS total_transacciones,
            ARRAY_AGG(DISTINCT b.name ORDER BY b.name) AS tiendas
          FROM public.sales_header sh
          LEFT JOIN public.branches  b ON b.id = sh.branch_id
          LEFT JOIN public.customers c ON c.id = sh.customer_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date >= '${fechaMin}'::date AND sh.doc_date < ('${fechaMax}'::date + INTERVAL '1 day')
            AND sh.customer_id IS NOT NULL
            AND sh.customer_id <> '${GENERIC_CUSTOMER}'
            ${branchFilter}
            ${channelFilterG}
          GROUP BY sh.customer_id, c.commercial_name
        )
        SELECT
          cd.*,
          ROUND((cd.monto_total::numeric)        / dr.num_months::numeric, 2) AS monto_promedio_mes,
          ROUND((cd.total_transacciones::numeric) / dr.num_months::numeric, 2) AS txn_promedio_mes
        FROM customer_data cd
        CROSS JOIN date_range dr
        ORDER BY cd.monto_total DESC
        LIMIT ${top_n};
      `;

      try {
        const result = await queryWithRetry(query);
        return {
          success: true,
          data: result.rows.map((row: any) => ({
            customer_id:          row.customer_id ?? null,
            customer_name:        row.customer_name ?? 'Sin nombre',
            monto_total:          row.monto_total !== null ? Number(row.monto_total) : 0,
            total_transacciones:  Number(row.total_transacciones),
            monto_promedio_mes:   row.monto_promedio_mes !== null ? Number(row.monto_promedio_mes) : 0,
            txn_promedio_mes:     row.txn_promedio_mes !== null ? Number(row.txn_promedio_mes) : 0,
            tiendas:              Array.isArray(row.tiendas) ? row.tiendas.filter(Boolean) : [],
          })),
          metadata: { fecha_min: fechaMin, fecha_max: fechaMax, top_n, generated_at: new Date().toISOString() },
        };
      } catch (error) {
        console.error('[PostgreSQL] Error en getTopCustomersGeneral:', error);
        throw new Error('Error al consultar tabla general de clientes');
      }
    }),

  /**
   * Transacciones de un cliente específico en el período filtrado.
   * Devuelve: número de comprobante (order_serial), fecha (doc_date), tienda, monto con IGV.
   */
  getCustomerTransactions: publicProcedure
    .input(
      z.object({
        customer_id:   z.string(),
        fecha_min:     z.string(),
        fecha_max:     z.string(),
        include_igv:   z.boolean().default(true),
        branch_sap_id: z.string().optional(),
        sales_channel: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { customer_id, fecha_min, fecha_max, include_igv, branch_sap_id, sales_channel } = input;
      const fechaMin = fecha_min.substring(0, 10);
      const fechaMax = fecha_max.substring(0, 10);
      const amtCol  = include_igv ? 'sh.total' : 'sh.subtotal';

      const branchFilter = branch_sap_id && branch_sap_id !== 'all'
        ? `AND b.sap_id = '${branch_sap_id.replace(/'/g, "''")}'`
        : '';

      const channelCaseExpr = `
        CASE
          WHEN EXISTS (
            SELECT 1 FROM methods_payment mp
            WHERE mp.header_id = sh.id
              AND mp.payment_account_id = '7a8fefe8-ddaa-40d1-ace5-d0aebb1b3204'::uuid
          ) THEN 'Rappi'
          WHEN sh.source_system_id = 'be387046-08e4-4229-a52c-7ff5c1569c89'::uuid
            THEN 'eCommerce'
          ELSE 'Presencial'
        END`;

      const channelFilter = sales_channel && sales_channel !== 'all'
        ? `AND (${channelCaseExpr}) = '${sales_channel.replace(/'/g, "''")}'`
        : '';

      const query = `
        SELECT
          sh.id                              AS header_id,
          sh.order_serial                    AS comprobante,
          sh.doc_date                        AS fecha,
          b.name                             AS tienda_nombre,
          b.sap_id                           AS tienda_sap_id,
          ${amtCol}                          AS monto_total
        FROM public.sales_header sh
        JOIN public.branches b ON b.id = sh.branch_id
        WHERE sh.customer_id = '${customer_id.replace(/'/g, "''")}'
          AND sh.doc_date IS NOT NULL
          AND sh.doc_date >= '${fechaMin}'::date AND sh.doc_date < ('${fechaMax}'::date + INTERVAL '1 day')
          ${branchFilter}
          ${channelFilter}
        ORDER BY sh.doc_date DESC
        LIMIT 500;
      `;

      try {
        const result = await queryWithRetry(query);
        return {
          success: true,
          data: result.rows.map((row: any) => ({
            header_id:     row.header_id,
            comprobante:   row.comprobante ?? '—',
            fecha:         row.fecha,
            tienda_nombre: row.tienda_nombre ?? '—',
            tienda_sap_id: row.tienda_sap_id ?? '—',
            monto_total:   row.monto_total !== null ? Number(row.monto_total) : 0,
          })),
        };
      } catch (error) {
        console.error('[PostgreSQL] Error en getCustomerTransactions:', error);
        throw new Error('Error al consultar transacciones del cliente');
      }
    }),

  /**
   * Detalle de artículos de una transacción específica.
   * Devuelve: nombre del artículo, SKU, cantidad, monto total por línea.
   */
  /**
   * Venta por Góndola / Shelf
   * Agrupa ventas por tienda + producto + estado de shelf (con o sin asignación en stocks)
   * Filtros: fecha, sucursal, categoría, IGV. Sin filtro de canal.
   */
  getSalesByShelf: publicProcedure
    .input(
      z.object({
        fecha_min:   z.string(),
        fecha_max:   z.string(),
        branch_id:   z.string().optional(),
        category_id: z.string().optional(),
        include_igv: z.boolean().default(true),
        // Filtro de estado de shelf: 'all' | 'sin_registro' | 'sin_gondola' | 'con_gondola'
        shelf_status: z.enum(['all', 'sin_registro', 'sin_gondola', 'con_gondola']).default('all'),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_id, category_id, include_igv, shelf_status } = input;
      const amtCol = include_igv ? 'sd.total' : 'sd.subtotal';
      const fechaMinDate = fecha_min.substring(0, 10);
      const fechaMaxDate = fecha_max.substring(0, 10);

      const params: any[] = [];
      let pi = 1;

      // Filtro de sucursal
      const branchClause = (branch_id && branch_id !== 'all')
        ? `AND b.sap_id = $${pi++}` : '';
      if (branch_id && branch_id !== 'all') params.push(branch_id);

      // Filtro de categoría (usando la jerarquía de categorías)
      const categoryClause = (category_id && category_id !== 'all')
        ? `AND COALESCE(g.id, p2.id, c2.id) = $${pi++}::uuid` : '';
      if (category_id && category_id !== 'all') params.push(category_id);

      // Filtro de estado de shelf
      const shelfStatusClause =
        shelf_status === 'sin_registro' ? 'AND st.id IS NULL' :
        shelf_status === 'sin_gondola'    ? 'AND st.id IS NOT NULL AND st.shelf_id IS NULL' :
        shelf_status === 'con_gondola'    ? 'AND st.shelf_id IS NOT NULL' :
        ''; // 'all' = sin filtro

      const query = `
        SELECT
          b.sap_id                                                     AS branch_sap_id,
          INITCAP(LOWER(b.name))                                       AS branch_name,
          st.id                                                        AS stock_id,
          sd.product_id,
          p.int_sku,
          INITCAP(LOWER(p.name))                                       AS product_name,
          CASE
            WHEN st.id IS NULL          THEN 'Sin registro en stocks'
            WHEN st.shelf_id IS NULL    THEN 'Stock sin góndola'
            ELSE                             'Con shelf asignado'
          END                                                          AS shelf_status,
          sh2.id                                                       AS shelf_id,
          COALESCE(sh2.name, '')                                       AS shelf_name,
          INITCAP(LOWER(COALESCE(g.name, p2.name, c2.name, 'Sin Categoría'))) AS category_name,
          ROUND(SUM(sd.quantity)::numeric, 2)                         AS cantidad_vendida,
          ROUND(SUM(${amtCol})::numeric, 2)                           AS monto_total
        FROM public.sales_header sh
        INNER JOIN public.sales_detail sd
          ON sd.header_id = sh.id
        INNER JOIN public.branches b
          ON b.id = sh.branch_id
        INNER JOIN public.products p
          ON p.id = sd.product_id
        LEFT JOIN public.stocks st
          ON st.product_id = sd.product_id
         AND st.branch_id  = sh.branch_id
        LEFT JOIN public.shelfs sh2
          ON sh2.id = st.shelf_id
        LEFT JOIN public.categories_products cp
          ON cp.product_id       = p.id
         AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
        LEFT JOIN public.categories c2 ON c2.id = cp.category_id
        LEFT JOIN public.categories p2 ON p2.id = c2.parent_category_id
        LEFT JOIN public.categories g  ON g.id  = p2.parent_category_id
        WHERE sh.doc_date >= '${fechaMinDate}'::date
          AND sh.doc_date <  ('${fechaMaxDate}'::date + INTERVAL '1 day')
          AND sh.doc_date IS NOT NULL
          ${branchClause}
          ${categoryClause}
          ${shelfStatusClause}
        GROUP BY
          b.sap_id,
          b.name,
          st.id,
          sd.product_id,
          p.int_sku,
          p.name,
          sh2.id,
          sh2.name,
          CASE
            WHEN st.id IS NULL          THEN 'Sin registro en stocks'
            WHEN st.shelf_id IS NULL    THEN 'Stock sin góndola'
            ELSE                             'Con shelf asignado'
          END,
          COALESCE(g.name, p2.name, c2.name, 'Sin Categoría')
        ORDER BY
          b.sap_id,
          monto_total DESC NULLS LAST;
      `;

      try {
        const result = await queryWithRetry(query, params);
        return {
          success: true,
          data: result.rows.map((row: any) => ({
            branch_sap_id:   row.branch_sap_id ?? '',
            branch_name:     row.branch_name ?? '',
            stock_id:        row.stock_id ?? null,
            product_id:      row.product_id ?? '',
            int_sku:         row.int_sku ?? '',
            product_name:    row.product_name ?? '',
            shelf_status:    row.shelf_status ?? 'Sin registro en stocks',
            shelf_id:        row.shelf_id ?? null,
            shelf_name:      row.shelf_name ?? '',
            category_name:   row.category_name ?? 'Sin Categoría',
            cantidad_vendida: Number(row.cantidad_vendida ?? 0),
            monto_total:     Number(row.monto_total ?? 0),
          })),
        };
      } catch (error) {
        console.error('[PostgreSQL] Error en getSalesByShelf:', error);
        throw new Error('Error al consultar ventas por góndola');
      }
    }),

  /**
   * Ventas por góndola AGREGADAS: agrupa por góndola (no por producto).
   * Devuelve una fila por góndola/tienda con el total de ventas y conteo de productos.
   */
  getSalesByShelfAggregated: publicProcedure
    .input(
      z.object({
        fecha_min:    z.string(),
        fecha_max:    z.string(),
        branch_id:    z.string().optional(),
        category_id:  z.string().optional(),
        include_igv:  z.boolean().default(true),
        shelf_status: z.enum(['all', 'sin_registro', 'sin_gondola', 'con_gondola']).default('all'),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_id, category_id, include_igv, shelf_status } = input;
      const amtCol = include_igv ? 'sd.total' : 'sd.subtotal';
      const fechaMinDate = fecha_min.substring(0, 10);
      const fechaMaxDate = fecha_max.substring(0, 10);

      const params: any[] = [];
      let pi = 1;

      const branchClause = (branch_id && branch_id !== 'all')
        ? `AND b.sap_id = $${pi++}` : '';
      if (branch_id && branch_id !== 'all') params.push(branch_id);

      const categoryClause = (category_id && category_id !== 'all')
        ? `AND COALESCE(g.id, p2.id, c2.id) = $${pi++}::uuid` : '';
      if (category_id && category_id !== 'all') params.push(category_id);

      const shelfStatusClause =
        shelf_status === 'sin_registro' ? 'AND st.id IS NULL' :
        shelf_status === 'sin_gondola'    ? 'AND st.id IS NOT NULL AND st.shelf_id IS NULL' :
        shelf_status === 'con_gondola'    ? 'AND st.shelf_id IS NOT NULL' :
        '';

      const query = `
        SELECT
          b.sap_id                                                     AS branch_sap_id,
          INITCAP(LOWER(b.name))                                       AS branch_name,
          sh2.id                                                       AS shelf_id,
          COALESCE(sh2.name, '(Sin góndola asignada)')                 AS shelf_name,
          CASE
            WHEN MAX(CASE WHEN st.id IS NULL THEN 1 ELSE 0 END) = 1 THEN 'Sin registro en stocks'
            WHEN MAX(CASE WHEN st.shelf_id IS NULL AND st.id IS NOT NULL THEN 1 ELSE 0 END) = 1 THEN 'Stock sin góndola'
            ELSE 'Con góndola asignada'
          END                                                          AS shelf_status,
          COUNT(DISTINCT sd.product_id)                                AS productos_distintos,
          ROUND(SUM(sd.quantity)::numeric, 2)                         AS cantidad_vendida,
          ROUND(SUM(${amtCol})::numeric, 2)                           AS monto_total
        FROM public.sales_header sh
        INNER JOIN public.sales_detail sd
          ON sd.header_id = sh.id
        INNER JOIN public.branches b
          ON b.id = sh.branch_id
        INNER JOIN public.products p
          ON p.id = sd.product_id
        LEFT JOIN public.stocks st
          ON st.product_id = sd.product_id
         AND st.branch_id  = sh.branch_id
        LEFT JOIN public.shelfs sh2
          ON sh2.id = st.shelf_id
        LEFT JOIN public.categories_products cp
          ON cp.product_id       = p.id
         AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
        LEFT JOIN public.categories c2 ON c2.id = cp.category_id
        LEFT JOIN public.categories p2 ON p2.id = c2.parent_category_id
        LEFT JOIN public.categories g  ON g.id  = p2.parent_category_id
        WHERE sh.doc_date >= '${fechaMinDate}'::date
          AND sh.doc_date <  ('${fechaMaxDate}'::date + INTERVAL '1 day')
          AND sh.doc_date IS NOT NULL
          ${branchClause}
          ${categoryClause}
          ${shelfStatusClause}
        GROUP BY
          b.sap_id,
          b.name,
          sh2.id,
          sh2.name
        ORDER BY
          b.sap_id,
          monto_total DESC NULLS LAST;
      `;

      try {
        const result = await queryWithRetry(query, params);
        return {
          success: true,
          data: result.rows.map((row: any) => ({
            branch_sap_id:       row.branch_sap_id ?? '',
            branch_name:         row.branch_name ?? '',
            shelf_id:            row.shelf_id ?? null,
            shelf_name:          row.shelf_name ?? '(Sin góndola asignada)',
            shelf_status:        row.shelf_status ?? 'Sin registro en stocks',
            productos_distintos: Number(row.productos_distintos ?? 0),
            cantidad_vendida:    Number(row.cantidad_vendida ?? 0),
            monto_total:         Number(row.monto_total ?? 0),
          })),
        };
      } catch (error) {
        console.error('[PostgreSQL] Error en getSalesByShelfAggregated:', error);
        throw new Error('Error al consultar ventas por góndola agregadas');
      }
    }),

  getTransactionDetail: publicProcedure
    .input(
      z.object({
        header_id:   z.string(),
        include_igv: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const { header_id, include_igv } = input;
      const amtCol = include_igv ? 'sd.total' : 'sd.subtotal';
      const priceCol = include_igv ? 'sd.price_tax' : 'sd.price_no_tax';

      const query = `
        SELECT
          COALESCE(p.name, sd.descripcion, 'Producto desconocido') AS producto_nombre,
          p.int_sku                 AS sku,
          sd.quantity               AS cantidad,
          ${priceCol}               AS precio_unitario,
          ${amtCol}                 AS monto_linea
        FROM public.sales_detail sd
        LEFT JOIN public.products p ON p.id = sd.product_id
        WHERE sd.header_id = '${header_id.replace(/'/g, "''")}'
        ORDER BY ${amtCol} DESC NULLS LAST;
      `;

      try {
        const result = await queryWithRetry(query);
        return {
          success: true,
          data: result.rows.map((row: any) => ({
            producto_nombre:  row.producto_nombre ?? 'Producto desconocido',
            sku:              row.sku ?? '—', // int_sku del producto
            cantidad:         row.cantidad !== null ? Number(row.cantidad) : 0,
            precio_unitario:  row.precio_unitario !== null ? Number(row.precio_unitario) : 0,
            monto_linea:      row.monto_linea !== null ? Number(row.monto_linea) : 0,
          })),
        };
      } catch (error) {
        console.error('[PostgreSQL] Error en getTransactionDetail:', error);
        throw new Error('Error al consultar detalle de transacción');
      }
    }),

  /**
   * Compara métricas de ventas por góndola entre el período actual y el anterior.
   * Devuelve para cada góndola: monto_total, cantidad_vendida, productos_distintos
   * tanto del período actual como del anterior, para calcular variaciones.
   */
  getSalesByShelfComparison: publicProcedure
    .input(
      z.object({
        fecha_min:    z.string(), // YYYY-MM-DD
        fecha_max:    z.string(), // YYYY-MM-DD
        branch_id:    z.string().optional(),
        category_id:  z.string().optional(),
        include_igv:  z.boolean().default(true),
        shelf_status: z.enum(['all', 'sin_registro', 'sin_gondola', 'con_gondola']).default('all'),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_id, category_id, include_igv, shelf_status } = input;
      const amtCol = include_igv ? 'sd.total' : 'sd.subtotal';
      const fechaMinDate = fecha_min.substring(0, 10);
      const fechaMaxDate = fecha_max.substring(0, 10);

      // Calcular período anterior (misma duración, inmediatamente antes)
      const currentStart = new Date(fechaMinDate + 'T12:00:00');
      const currentEnd   = new Date(fechaMaxDate + 'T12:00:00');
      const durationDays = Math.round((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const prevEnd      = new Date(currentStart);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart    = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - (durationDays - 1));
      const prevStartStr = prevStart.toISOString().substring(0, 10);
      const prevEndStr   = prevEnd.toISOString().substring(0, 10);

      const params: any[] = [];
      let pi = 1;
      const branchClause = (branch_id && branch_id !== 'all')
        ? `AND b.sap_id = $${pi++}` : '';
      if (branch_id && branch_id !== 'all') params.push(branch_id);
      const categoryClause = (category_id && category_id !== 'all')
        ? `AND COALESCE(g.id, p2.id, c2.id) = $${pi++}::uuid` : '';
      if (category_id && category_id !== 'all') params.push(category_id);
      const shelfStatusClause =
        shelf_status === 'sin_registro' ? 'AND st.id IS NULL' :
        shelf_status === 'sin_gondola'    ? 'AND st.id IS NOT NULL AND st.shelf_id IS NULL' :
        shelf_status === 'con_gondola'    ? 'AND st.shelf_id IS NOT NULL' : '';

      const query = `
        WITH base AS (
          SELECT
            b.sap_id                                                     AS branch_sap_id,
            INITCAP(LOWER(b.name))                                       AS branch_name,
            sh2.id                                                       AS shelf_id,
            COALESCE(sh2.name, '(Sin góndola asignada)')                 AS shelf_name,
            CASE
              WHEN st.id IS NULL THEN 'Sin registro en stocks'
              WHEN st.shelf_id IS NULL THEN 'Stock sin shelf'
              ELSE 'Con góndola asignada'
            END                                                          AS shelf_status,
            sd.product_id,
            ${amtCol}                                                    AS line_total,
            sd.quantity,
            CASE
              WHEN sh.doc_date >= '${fechaMinDate}'::date
               AND sh.doc_date <  ('${fechaMaxDate}'::date + INTERVAL '1 day')
              THEN 'current'
              WHEN sh.doc_date >= '${prevStartStr}'::date
               AND sh.doc_date <  ('${prevEndStr}'::date + INTERVAL '1 day')
              THEN 'previous'
              ELSE NULL
            END AS period
          FROM public.sales_header sh
          INNER JOIN public.sales_detail sd ON sd.header_id = sh.id
          INNER JOIN public.branches b      ON b.id = sh.branch_id
          INNER JOIN public.products p      ON p.id = sd.product_id
          LEFT JOIN  public.stocks st
            ON st.product_id = sd.product_id
           AND st.branch_id  = sh.branch_id
          LEFT JOIN  public.shelfs sh2      ON sh2.id = st.shelf_id
          LEFT JOIN  public.categories_products cp
            ON cp.product_id        = p.id
           AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
          LEFT JOIN  public.categories c2 ON c2.id = cp.category_id
          LEFT JOIN  public.categories p2 ON p2.id = c2.parent_category_id
          LEFT JOIN  public.categories g  ON g.id  = p2.parent_category_id
          WHERE sh.doc_date IS NOT NULL
            AND (
              (sh.doc_date >= '${fechaMinDate}'::date AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day'))
              OR
              (sh.doc_date >= '${prevStartStr}'::date AND sh.doc_date < ('${prevEndStr}'::date + INTERVAL '1 day'))
            )
            ${branchClause}
            ${categoryClause}
            ${shelfStatusClause}
        )
        SELECT
          branch_sap_id,
          branch_name,
          shelf_id,
          shelf_name,
          MAX(shelf_status)                                              AS shelf_status,
          period,
          COUNT(DISTINCT product_id)                                     AS productos_distintos,
          ROUND(SUM(quantity)::numeric, 2)                              AS cantidad_vendida,
          ROUND(SUM(line_total)::numeric, 2)                            AS monto_total
        FROM base
        WHERE period IS NOT NULL
        GROUP BY branch_sap_id, branch_name, shelf_id, shelf_name, period
        ORDER BY branch_sap_id, monto_total DESC NULLS LAST;
      `;

      const igvKey = include_igv ? 'igv' : 'noigv';
      const cacheKey = `sales:shelf:comparison:${fechaMinDate}:${fechaMaxDate}:${branch_id ?? 'all'}:${category_id ?? 'all'}:${shelf_status}:${igvKey}`;

      try {
        return await cached(cacheKey, TTL.DYNAMIC, async () => {
          const result = await queryWithRetry(query, params);

          // Pivotar: agrupar por (branch_sap_id, shelf_id, shelf_name) y separar current/previous
          type ShelfKey = string;
          interface ShelfEntry {
            branch_sap_id: string;
            branch_name: string;
            shelf_id: string | null;
            shelf_name: string;
            shelf_status: string;
            current:  { monto_total: number; cantidad_vendida: number; productos_distintos: number };
            previous: { monto_total: number; cantidad_vendida: number; productos_distintos: number };
          }
          const map = new Map<ShelfKey, ShelfEntry>();

          for (const row of result.rows) {
            const key: ShelfKey = `${row.branch_sap_id}::${row.shelf_id ?? 'null'}`;
            if (!map.has(key)) {
              map.set(key, {
                branch_sap_id: row.branch_sap_id ?? '',
                branch_name:   row.branch_name ?? '',
                shelf_id:      row.shelf_id ?? null,
                shelf_name:    row.shelf_name ?? '(Sin góndola asignada)',
                shelf_status:  row.shelf_status ?? 'Sin registro en stocks',
                current:  { monto_total: 0, cantidad_vendida: 0, productos_distintos: 0 },
                previous: { monto_total: 0, cantidad_vendida: 0, productos_distintos: 0 },
              });
            }
            const entry = map.get(key)!;
            const target = row.period === 'current' ? entry.current : entry.previous;
            target.monto_total        = Number(row.monto_total ?? 0);
            target.cantidad_vendida   = Number(row.cantidad_vendida ?? 0);
            target.productos_distintos = Number(row.productos_distintos ?? 0);
          }

          return {
            success: true,
            period_current:  { start: fechaMinDate, end: fechaMaxDate },
            period_previous: { start: prevStartStr,  end: prevEndStr  },
            data: Array.from(map.values()),
          };
        });
      } catch (error) {
        console.error('[PostgreSQL] Error en getSalesByShelfComparison:', error);
        throw new Error('Error al consultar comparación de ventas por góndola');
      }
    }),
  // ─── Artículos por tienda + góndola (para modal de reasignación) ────────────
  getProductsByShelfAndBranch: publicProcedure
    .input(z.object({
      branch_sap_id: z.string(),
      shelf_id:      z.string().nullable(),   // null → productos sin góndola asignada
      fecha_min:     z.string().optional(),   // YYYY-MM-DD para filtrar por ventas
      fecha_max:     z.string().optional(),   // YYYY-MM-DD para filtrar por ventas
    }))
    .query(async ({ input }) => {
      const { branch_sap_id, shelf_id, fecha_min, fecha_max } = input;

      // Condición de góndola: filtrar el stock del producto en esa tienda
      const shelfStockClause = shelf_id === null
        ? 'AND st.shelf_id IS NULL'
        : `AND st.shelf_id = '${shelf_id.replace(/'/g, "''")}'`;

      // Filtro de fecha para ventas (opcional)
      const fechaMinDate = fecha_min ? fecha_min.substring(0, 10) : null;
      const fechaMaxDate = fecha_max ? fecha_max.substring(0, 10) : null;
      const fechaClause = (fechaMinDate && fechaMaxDate)
        ? `AND sh.doc_date >= '${fechaMinDate}'::date AND sh.doc_date < ('${fechaMaxDate}'::date + INTERVAL '1 day')`
        : '';

      // Filtra solo productos que tienen ventas registradas en esa tienda+góndola.
      // El stock se obtiene exclusivamente para la tienda indicada (b2.sap_id = branch_sap_id)
      // para evitar mezclar registros de stocks de otras tiendas.
      const query = `
        SELECT DISTINCT ON (p.id)
          p.id                                                         AS product_id,
          p.int_sku                                                    AS int_sku,
          INITCAP(LOWER(p.name))                                       AS product_name,
          COALESCE(st.stock, 0)                                        AS stock,
          st.id                                                        AS stock_id,
          st.shelf_id                                                  AS shelf_id,
          COALESCE(sh2.name, '(Sin góndola)')                          AS shelf_name,
          sh2.id                                                       AS shelf_uuid
        FROM public.branches b
        INNER JOIN public.sales_header sh
          ON sh.branch_id = b.id
        INNER JOIN public.sales_detail sd
          ON sd.header_id = sh.id
        INNER JOIN public.products p
          ON p.id = sd.product_id
        -- Stock SOLO de esta tienda (b.id garantiza que es la misma tienda del header)
        INNER JOIN public.stocks st
          ON st.product_id = p.id
         AND st.branch_id  = b.id
        LEFT JOIN public.shelfs sh2
          ON sh2.id = st.shelf_id
        WHERE b.sap_id = '${branch_sap_id.replace(/'/g, "''")}'
          AND sh.doc_date IS NOT NULL
          ${fechaClause}
          ${shelfStockClause}
        ORDER BY p.id, INITCAP(LOWER(p.name))
        LIMIT 500;
      `;

      try {
        const result = await queryWithRetry(query, []);
        return {
          success: true,
          data: result.rows.map((row: any) => ({
            product_id:   row.product_id,
            int_sku:      row.int_sku ?? '',
            product_name: row.product_name ?? '',
            stock:        Number(row.stock ?? 0),
            stock_id:     row.stock_id ?? null,
            shelf_id:     row.shelf_uuid ?? row.shelf_id ?? null,
            shelf_name:   row.shelf_name ?? '(Sin góndola)',
          })),
        };
      } catch (error) {
        console.error('[PostgreSQL] Error en getProductsByShelfAndBranch:', error);
        throw new Error('Error al obtener artículos por góndola');
      }
    }),

  // ─── Lista de góndolas por tienda (para selector de reasignación) ────────────
  getShelfsByBranch: publicProcedure
    .input(z.object({
      branch_sap_id: z.string().optional(),
    }))
    .query(async () => {
      // Consultar directamente la tabla shelfs sin filtrar por tienda.
      // Las góndolas son globales (no específicas por tienda), por lo que
      // se devuelven todas las góndolas activas ordenadas alfabéticamente.
      const query = `
        SELECT
          sh.id   AS shelf_id,
          sh.name AS shelf_name
        FROM public.shelfs sh
        WHERE sh.status = true
        ORDER BY sh.name;
      `;

      try {
        const result = await queryWithRetry(query, []);
        return {
          success: true,
          data: result.rows.map((row: any) => ({
            shelf_id:   row.shelf_id,
            shelf_name: row.shelf_name ?? '',
          })),
        };
      } catch (error) {
        console.error('[PostgreSQL] Error en getShelfsByBranch:', error);
        throw new Error('Error al obtener góndolas');
      }
    }),

  // ─── Reasignar producto a góndola (proxy server-side para evitar CORS) ────────
  reassignProductShelf: publicProcedure
    .input(z.object({
      branchSapId: z.string(),
      intSku:      z.number().int(),
      shelfId:     z.string().uuid(),
    }))
    .mutation(async ({ input }) => {
      const { branchSapId, intSku, shelfId } = input;
      const FF_BASE = 'https://server.florayfauna.pe';

      // ── 1. Obtener token de autenticación ──────────────────────────────────
      let token: string;
      try {
        const loginRes = await fetch(`${FF_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: ENV.ffApiUsername,
            password: ENV.ffApiPassword,
            site:     ENV.ffApiSite,
          }),
        });
        if (!loginRes.ok) {
          const errText = await loginRes.text().catch(() => '');
          console.error(`[reassignProductShelf] Login HTTP ${loginRes.status}:`, errText);
          throw new Error(`Error al autenticarse con el servidor externo (HTTP ${loginRes.status})`);
        }
        const loginData = await loginRes.json() as { token?: string };
        if (!loginData.token) throw new Error('El servidor externo no devolvió un token de autenticación');
        token = loginData.token;
      } catch (err: any) {
        if (err.message.startsWith('Error al autenticarse') || err.message.startsWith('El servidor externo')) throw err;
        console.error('[reassignProductShelf] Login network error:', err?.message);
        throw new Error(`Error de red al autenticarse: ${err?.message ?? 'desconocido'}`);
      }

      // ── 2. Ejecutar la reasignación con el token ───────────────────────────
      let response: Response;
      try {
        response = await fetch(`${FF_BASE}/api/productos/estantes/p`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ branchSapId, intSku, shelfId }),
        });
      } catch (err: any) {
        console.error('[reassignProductShelf] PUT network error:', err?.message);
        throw new Error(`Error de red al reasignar: ${err?.message ?? 'desconocido'}`);
      }
      if (!response.ok) {
        let detail = '';
        let userMessage = `Error del servidor externo (HTTP ${response.status})`;
        try {
          const raw = await response.text();
          detail = raw;
          // Intentar extraer mensaje legible del JSON de error
          const parsed = JSON.parse(raw);
          if (parsed?.message) userMessage = parsed.message;
          else if (typeof parsed === 'string') userMessage = parsed;
        } catch {}
        console.error(`[reassignProductShelf] POST HTTP ${response.status}:`, detail);
        throw new Error(userMessage);
      }
       return { success: true };
    }),

  /**
   * Catálogo de góndolas activas para la plantilla de carga masiva
   * Devuelve id y nombre de todas las góndolas con status=true
   */
  getShelfCatalog: publicProcedure
    .query(async () => {
      const query = `
        SELECT id AS shelf_id, name AS shelf_name
        FROM public.shelfs
        WHERE status = true
        ORDER BY name;
      `;
      try {
        const result = await queryWithRetry(query, []);
        return result.rows.map((r: any) => ({
          shelf_id:   r.shelf_id as string,
          shelf_name: (r.shelf_name ?? '') as string,
        }));
      } catch (err) {
        console.error('[PostgreSQL] Error en getShelfCatalog:', err);
        throw new Error('Error al obtener catálogo de góndolas');
      }
    }),

  /**
   * Carga masiva de asociaciones producto-góndola-tienda desde un Excel
   * Acepta shelf_name (nombre de la góndola) en lugar de shelf_id (UUID)
   * Solo accesible para cst_user, commercial_specialist y system_specialist
   */
  bulkAssignProductShelf: protectedProcedure
    .input(z.object({
      fileBase64: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verificar rol del usuario
      const allowedRoles = ['cst_user', 'commercial_specialist', 'system_specialist'];
      if (!allowedRoles.includes(ctx.user.role)) {
        throw new Error('No tienes permisos para realizar esta operación');
      }

      // Cargar catálogo de góndolas (nombre normalizado → UUID)
      let shelfMap: Map<string, string>;
      try {
        const catResult = await queryWithRetry(
          `SELECT id AS shelf_id, LOWER(TRIM(name)) AS shelf_name_lower FROM public.shelfs WHERE status = true`,
          []
        );
        shelfMap = new Map(
          catResult.rows.map((r: any) => [r.shelf_name_lower as string, r.shelf_id as string])
        );
      } catch (err: any) {
        throw new Error(`Error al cargar catálogo de góndolas: ${err?.message ?? 'desconocido'}`);
      }

      // Parsear el Excel desde base64
      // Acepta columna 'shelf_name' (nuevo) o 'shelf_id' (retrocompatibilidad con UUID directo)
      let rows: { int_sku: string; branch_sap_id: string; shelf_name: string }[];
      try {
        const buffer = Buffer.from(input.fileBase64, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
        rows = rawRows
          .filter((r: any) => r.int_sku && r.branch_sap_id && (r.shelf_name || r.shelf_id))
          .map((r: any) => ({
            int_sku:      String(r.int_sku).trim(),
            branch_sap_id: String(r.branch_sap_id).trim().toUpperCase(),
            // Preferir shelf_name; si no existe, usar shelf_id como fallback
            shelf_name:   String(r.shelf_name ?? r.shelf_id ?? '').trim(),
          }));
        if (rows.length === 0) {
          throw new Error('El archivo no contiene filas válidas. Verifica que las columnas sean: int_sku, branch_sap_id, shelf_name');
        }
      } catch (err: any) {
        if (err.message.startsWith('El archivo')) throw err;
        throw new Error(`Error al leer el archivo Excel: ${err?.message ?? 'desconocido'}`);
      }

      // Resolver shelf_name → shelf_id para cada fila
      // Si el valor ya es un UUID válido, se usa directamente (retrocompatibilidad)
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const resolvedRows: { int_sku: string; branch_sap_id: string; shelf_name: string; shelf_id: string | null; resolveError?: string }[] =
        rows.map((row) => {
          if (UUID_RE.test(row.shelf_name)) {
            // Ya es un UUID — usar directamente
            return { ...row, shelf_id: row.shelf_name };
          }
          const uuid = shelfMap.get(row.shelf_name.toLowerCase());
          if (!uuid) {
            return { ...row, shelf_id: null, resolveError: `Góndola no encontrada: "${row.shelf_name}"` };
          }
          return { ...row, shelf_id: uuid };
        });

      // Obtener token de autenticación con la API de Flora & Fauna
      const FF_BASE = 'https://server.florayfauna.pe';
      let token: string;
      try {
        const loginRes = await fetch(`${FF_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: ENV.ffApiUsername,
            password: ENV.ffApiPassword,
            site:     ENV.ffApiSite,
          }),
        });
        if (!loginRes.ok) {
          const errText = await loginRes.text().catch(() => '');
          console.error(`[bulkAssignProductShelf] Login HTTP ${loginRes.status}:`, errText);
          throw new Error(`Error al autenticarse con el servidor externo (HTTP ${loginRes.status})`);
        }
        const loginData = await loginRes.json() as { token?: string };
        if (!loginData.token) throw new Error('El servidor externo no devolvió un token de autenticación');
        token = loginData.token;
      } catch (err: any) {
        if (err.message.startsWith('Error al autenticarse') || err.message.startsWith('El servidor externo')) throw err;
        throw new Error(`Error de red al autenticarse: ${err?.message ?? 'desconocido'}`);
      }

      // Procesar cada fila secuencialmente
      const results: { int_sku: string; branch_sap_id: string; shelf_name: string; success: boolean; error?: string }[] = [];
      for (const row of resolvedRows) {
        // Si no se pudo resolver el nombre, reportar error sin llamar a la API
        if (!row.shelf_id) {
          results.push({ int_sku: row.int_sku, branch_sap_id: row.branch_sap_id, shelf_name: row.shelf_name, success: false, error: row.resolveError });
          continue;
        }
        try {
          const response = await fetch(`${FF_BASE}/api/productos/estantes/p`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              branchSapId: row.branch_sap_id,
              intSku: parseInt(row.int_sku, 10),
              shelfId: row.shelf_id,
            }),
          });
          if (!response.ok) {
            let userMessage = `HTTP ${response.status}`;
            try {
              const raw = await response.text();
              const parsed = JSON.parse(raw);
              if (parsed?.message) userMessage = parsed.message;
            } catch {}
            results.push({ int_sku: row.int_sku, branch_sap_id: row.branch_sap_id, shelf_name: row.shelf_name, success: false, error: userMessage });
          } else {
            results.push({ int_sku: row.int_sku, branch_sap_id: row.branch_sap_id, shelf_name: row.shelf_name, success: true });
          }
        } catch (err: any) {
          results.push({ int_sku: row.int_sku, branch_sap_id: row.branch_sap_id, shelf_name: row.shelf_name, success: false, error: err?.message ?? 'Error de red' });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      return { results, successCount, errorCount, total: rows.length };
    }),
});
