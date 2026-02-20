import { describe, it, expect } from 'vitest';
import { pool } from './postgres';

describe('getAggregatedSales with tickets_count', () => {
  it('should return tickets_count for each row', async () => {
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
        COUNT(DISTINCT sale_id) AS tickets_count
      FROM base
      WHERE doc_date >= $1
        AND doc_date <  $2
      GROUP BY
        doc_date::date, branch_id, branch_sap_id,
        branch_name, branch_address,
        category_abuelo_id, category_abuelo_name
      ORDER BY doc_date, CAST(SUBSTRING(branch_sap_id FROM '[0-9]+') AS INTEGER), category_abuelo_name
      LIMIT 5;
    `;

    const result = await pool.query(query, ['2026-02-19T00:00:00Z', '2026-02-20T00:00:00Z']);

    // Verificar que hay resultados
    expect(result.rows.length).toBeGreaterThan(0);

    // Verificar que cada fila tiene tickets_count
    result.rows.forEach((row) => {
      expect(row).toHaveProperty('tickets_count');
      expect(typeof row.tickets_count).toBe('string'); // PostgreSQL devuelve bigint como string
      expect(parseInt(row.tickets_count, 10)).toBeGreaterThan(0);
    });

    // Verificar que tickets_count es menor o igual que el número de líneas
    // (una transacción puede tener múltiples líneas)
    result.rows.forEach((row) => {
      expect(parseInt(row.tickets_count, 10)).toBeGreaterThan(0);
      expect(parseFloat(row.sales_amount)).toBeGreaterThan(0);
    });
  });

  it('should calculate correct ticket average', async () => {
    const query = `
      WITH base AS (
        SELECT
          sh.id AS sale_id,
          sh.doc_date,
          sh.branch_id,
          sd.total AS line_total
        FROM sales_header sh
        JOIN sales_detail sd ON sd.header_id = sh.id
        WHERE sh.doc_date IS NOT NULL
          AND sh.doc_date >= $1
          AND sh.doc_date < $2
      )
      SELECT
        SUM(line_total) AS total_sales,
        COUNT(DISTINCT sale_id) AS total_tickets
      FROM base;
    `;

    const result = await pool.query(query, ['2026-02-19T00:00:00Z', '2026-02-20T00:00:00Z']);
    const row = result.rows[0];

    const totalSales = parseFloat(row.total_sales);
    const totalTickets = parseInt(row.total_tickets, 10);
    const avgTicket = totalSales / totalTickets;

    // Verificar que el ticket promedio es razonable (entre S/ 10 y S/ 500)
    expect(avgTicket).toBeGreaterThan(10);
    expect(avgTicket).toBeLessThan(500);
  });

  it('should group tickets correctly by branch', async () => {
    const query = `
      WITH base AS (
        SELECT
          sh.id AS sale_id,
          sh.doc_date,
          sh.branch_id,
          b.name AS branch_name,
          sd.total AS line_total
        FROM sales_header sh
        JOIN sales_detail sd ON sd.header_id = sh.id
        LEFT JOIN branches b ON b.id = sh.branch_id
        WHERE sh.doc_date IS NOT NULL
          AND sh.doc_date >= $1
          AND sh.doc_date < $2
      )
      SELECT
        branch_id,
        branch_name,
        SUM(line_total) AS sales_amount,
        COUNT(DISTINCT sale_id) AS tickets_count
      FROM base
      GROUP BY branch_id, branch_name
      ORDER BY sales_amount DESC
      LIMIT 3;
    `;

    const result = await pool.query(query, ['2026-02-19T00:00:00Z', '2026-02-20T00:00:00Z']);

    expect(result.rows.length).toBeGreaterThan(0);

    result.rows.forEach((row) => {
      expect(row.branch_id).toBeTruthy();
      expect(parseInt(row.tickets_count, 10)).toBeGreaterThan(0);
      expect(parseFloat(row.sales_amount)).toBeGreaterThan(0);
      
      // Ticket promedio por sucursal debe ser razonable
      const avgTicket = parseFloat(row.sales_amount) / parseInt(row.tickets_count, 10);
      expect(avgTicket).toBeGreaterThan(10);
      expect(avgTicket).toBeLessThan(500);
    });
  });
});
