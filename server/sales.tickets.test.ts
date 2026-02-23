import { describe, it, expect } from 'vitest';
import { pool } from './postgres';

describe('getAggregatedSales - Tickets Count Validation', () => {
  it('should count unique sale_ids correctly for Aviación (FF02) on 2026-02-19', async () => {
    // Query simplificada para contar tickets únicos por sucursal
    const query = `
      SELECT
        COUNT(DISTINCT sh.id) AS unique_tickets
      FROM sales_header sh
      LEFT JOIN branches b ON b.id = sh.branch_id
      WHERE sh.doc_date >= $1
        AND sh.doc_date < $2
        AND b.sap_id = $3;
    `;

    const startDate = '2026-02-19';
    const endDate = '2026-02-20'; // Fecha máxima + 1 día para incluir todo el 19
    const branchSapId = 'FF02';

    const result = await pool.query(query, [startDate, endDate, branchSapId]);

    const uniqueTicketsCount = parseInt(result.rows[0].unique_tickets, 10);

    // Verificar que el conteo de tickets únicos sea 467
    expect(uniqueTicketsCount).toBe(467);
  });

  it('should count unique sale_ids correctly across all branches on 2026-02-19', async () => {
    // Query para contar tickets únicos globales
    const query = `
      SELECT
        COUNT(DISTINCT sh.id) AS unique_tickets
      FROM sales_header sh
      WHERE sh.doc_date >= $1
        AND sh.doc_date < $2;
    `;

    const startDate = '2026-02-19';
    const endDate = '2026-02-20';

    const result = await pool.query(query, [startDate, endDate]);

    const uniqueTicketsCount = parseInt(result.rows[0].unique_tickets, 10);

    // Verificar que el conteo de tickets únicos sea mayor a 0
    expect(uniqueTicketsCount).toBeGreaterThan(0);

    console.log(`Total unique tickets on 2026-02-19: ${uniqueTicketsCount}`);
  });

  it('should verify that BranchBarChart logic counts unique sale_ids correctly', async () => {
    // Simular la consulta getAggregatedSales con array_agg
    const query = `
      SELECT
        sh.doc_date::date AS doc_date,
        b.sap_id AS branch_sap_id,
        array_agg(DISTINCT sh.id) AS sale_ids
      FROM sales_header sh
      LEFT JOIN branches b ON b.id = sh.branch_id
      WHERE sh.doc_date >= $1
        AND sh.doc_date < $2
        AND b.sap_id = $3
      GROUP BY sh.doc_date::date, b.sap_id;
    `;

    const startDate = '2026-02-19';
    const endDate = '2026-02-20';
    const branchSapId = 'FF02';

    const result = await pool.query(query, [startDate, endDate, branchSapId]);

    // Contar sale_ids únicos usando Set (como en BranchBarChart)
    const allSaleIds = new Set<string>();
    result.rows.forEach((row: any) => {
      if (row.sale_ids) {
        row.sale_ids.forEach((saleId: string) => allSaleIds.add(saleId));
      }
    });

    const uniqueTicketsCount = allSaleIds.size;

    // Verificar que el conteo de tickets únicos sea 467
    expect(uniqueTicketsCount).toBe(467);
  });
});
