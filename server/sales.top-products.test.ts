import { describe, it, expect } from "vitest";
import { pool } from "./postgres";

/**
 * Tests para el endpoint getTopProducts del salesRouter.
 * Verifica que la query SQL retorne los 50 mejores productos
 * ordenados por cantidad y por monto, con los filtros correctos.
 */
describe("getTopProducts", () => {
  const FECHA_MIN = "2026-02-01";
  const FECHA_MAX = "2026-02-28";

  // ── Helper: ejecutar la query de top productos ──────────────────────────
  async function runTopProductsQuery(opts: {
    fechaMin: string;
    fechaMax: string;
    branchId?: string;
    categoryId?: string;
    orderBy: "qty" | "amount";
  }) {
    const { fechaMin, fechaMax, branchId, categoryId, orderBy } = opts;
    const params: any[] = [];
    let pi = 1;

    const branchClause =
      branchId && branchId !== "all"
        ? (() => {
            params.push(branchId);
            return `AND b.sap_id = $${pi++}`;
          })()
        : "";

    const categoryClause =
      categoryId && categoryId !== "all"
        ? (() => {
            params.push(categoryId);
            return `AND COALESCE(g.id, p2.id, c2.id) = $${pi++}`;
          })()
        : "";

    const orderCol =
      orderBy === "qty" ? "a.total_qty DESC" : "a.total_amount DESC";
    const whereCol = orderBy === "qty" ? "a.total_qty > 0" : "a.total_amount > 0";

    // Número de días del período para calcular venta diaria y cobertura
    const daysDiff = Math.max(
      1,
      Math.round(
        (new Date(fechaMax).getTime() - new Date(fechaMin).getTime()) / 86_400_000
      ) + 1
    );

    const stockBranchClause = branchId && branchId !== 'all'
      ? `AND sb.sap_id = '${branchId.replace(/'/g, "''")}' `
      : '';

    const query = `
      WITH line_items AS (
        SELECT
          prod.id                                   AS product_id,
          prod.name                                 AS product_name,
          prod.int_sku                              AS sku,
          b.sap_id                                  AS branch_sap_id,
          INITCAP(LOWER(COALESCE(
            g.name, p2.name, c2.name, 'Sin Categoría'
          )))                                       AS category_name,
          sd.quantity                               AS qty,
          sd.total                                  AS amount
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
          AND sh.doc_date::date >= '${fechaMin}'::date
          AND sh.doc_date::date <= '${fechaMax}'::date
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
        a.total_qty::numeric                                          AS total_qty,
        a.total_amount::numeric                                       AS total_amount,
        a.branch_count,
        COALESCE(sa.total_stock, 0)::numeric                         AS total_stock,
        ROUND((a.total_qty::numeric / ${daysDiff}), 2)               AS avg_daily_qty,
        CASE
          WHEN a.total_qty > 0
          THEN ROUND(
            COALESCE(sa.total_stock, 0)::numeric / (a.total_qty::numeric / ${daysDiff}),
            1
          )
          ELSE NULL
        END                                                           AS coverage_days
      FROM aggregated a
      LEFT JOIN stock_agg sa ON sa.product_id = a.product_id
      WHERE ${whereCol}
      ORDER BY ${orderCol}
      LIMIT 50;
    `;

    return pool.query(query, params);
  }

  // ── Test 1: retorna hasta 50 filas por cantidad ─────────────────────────
  it("retorna hasta 50 productos ordenados por cantidad", { timeout: 30_000 }, async () => {
    const result = await runTopProductsQuery({
      fechaMin: FECHA_MIN,
      fechaMax: FECHA_MAX,
      orderBy: "qty",
    });

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.length).toBeLessThanOrEqual(50);

    // Verificar campos esperados en cada fila
    result.rows.forEach((row) => {
      expect(row).toHaveProperty("product_id");
      expect(row).toHaveProperty("product_name");
      expect(row).toHaveProperty("total_qty");
      expect(row).toHaveProperty("total_amount");
      expect(row).toHaveProperty("branch_count");
      expect(row).toHaveProperty("total_stock");
      expect(row).toHaveProperty("avg_daily_qty");
      expect(row).toHaveProperty("coverage_days");
      expect(Number(row.total_qty)).toBeGreaterThan(0);
      expect(Number(row.total_stock)).toBeGreaterThanOrEqual(0);
      expect(Number(row.avg_daily_qty)).toBeGreaterThan(0);
    });
  });

  // ── Test 2: retorna hasta 50 filas por monto ────────────────────────────
  it("retorna hasta 50 productos ordenados por monto", { timeout: 30_000 }, async () => {
    const result = await runTopProductsQuery({
      fechaMin: FECHA_MIN,
      fechaMax: FECHA_MAX,
      orderBy: "amount",
    });

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.length).toBeLessThanOrEqual(50);

    result.rows.forEach((row) => {
      expect(Number(row.total_amount)).toBeGreaterThan(0);
    });
  });

  // ── Test 3: el orden por cantidad es descendente ─────────────────────────
  it("los productos están correctamente ordenados por cantidad descendente", { timeout: 30_000 }, async () => {
    const result = await runTopProductsQuery({
      fechaMin: FECHA_MIN,
      fechaMax: FECHA_MAX,
      orderBy: "qty",
    });

    if (result.rows.length < 2) return; // No hay suficientes datos para comparar

    for (let i = 0; i < result.rows.length - 1; i++) {
      const current = Number(result.rows[i].total_qty);
      const next = Number(result.rows[i + 1].total_qty);
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });

  // ── Test 4: el orden por monto es descendente ────────────────────────────
  it("los productos están correctamente ordenados por monto descendente", { timeout: 30_000 }, async () => {
    const result = await runTopProductsQuery({
      fechaMin: FECHA_MIN,
      fechaMax: FECHA_MAX,
      orderBy: "amount",
    });

    if (result.rows.length < 2) return;

    for (let i = 0; i < result.rows.length - 1; i++) {
      const current = Number(result.rows[i].total_amount);
      const next = Number(result.rows[i + 1].total_amount);
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });

  // ── Test 5: el filtro de sucursal reduce los resultados ──────────────────
  it("el filtro de sucursal reduce o mantiene el número de resultados", { timeout: 30_000 }, async () => {
    const [allBranches, oneBranch] = await Promise.all([
      runTopProductsQuery({ fechaMin: FECHA_MIN, fechaMax: FECHA_MAX, orderBy: "qty" }),
      runTopProductsQuery({
        fechaMin: FECHA_MIN,
        fechaMax: FECHA_MAX,
        orderBy: "qty",
        branchId: "T001", // Primera tienda (ajustar si es necesario)
      }),
    ]);

    // La query sin filtro debe tener >= filas que con filtro
    expect(allBranches.rows.length).toBeGreaterThanOrEqual(oneBranch.rows.length);
  });

  // ── Test 6: rango de fechas vacío retorna 0 filas ────────────────────────
  it("un rango de fechas sin ventas retorna 0 filas", { timeout: 30_000 }, async () => {
    const result = await runTopProductsQuery({
      fechaMin: "2000-01-01",
      fechaMax: "2000-01-02",
      orderBy: "qty",
    });

    expect(result.rows.length).toBe(0);
  });

  // ── Test 7: los valores numéricos son válidos ────────────────────────────────
  it("total_qty y total_amount son números válidos y positivos", { timeout: 30_000 }, async () => {
    const result = await runTopProductsQuery({
      fechaMin: FECHA_MIN,
      fechaMax: FECHA_MAX,
      orderBy: "qty",
    });

    result.rows.forEach((row) => {
      const qty = Number(row.total_qty);
      const amount = Number(row.total_amount);
      expect(isNaN(qty)).toBe(false);
      expect(isNaN(amount)).toBe(false);
      expect(qty).toBeGreaterThan(0);
      expect(amount).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Test 8: cobertura se calcula correctamente ─────────────────────────────
  it("coverage_days es nulo o un número no negativo", { timeout: 30_000 }, async () => {
    const result = await runTopProductsQuery({
      fechaMin: FECHA_MIN,
      fechaMax: FECHA_MAX,
      orderBy: "qty",
    });

    result.rows.forEach((row) => {
      if (row.coverage_days !== null) {
        const coverage = Number(row.coverage_days);
        expect(isNaN(coverage)).toBe(false);
        expect(coverage).toBeGreaterThanOrEqual(0);
        // Verificar consistencia: cobertura = stock / venta_diaria
        const stock = Number(row.total_stock);
        const avgDaily = Number(row.avg_daily_qty);
        if (avgDaily > 0) {
          const expectedCoverage = Math.round((stock / avgDaily) * 10) / 10;
          expect(Math.abs(coverage - expectedCoverage)).toBeLessThan(0.2);
        }
      }
    });
  });
});