const CATEGORY_GROUP_ID = "07a06cd5-d1a8-4ea5-9ca5-98865d9630ca";

export type TopProductsByStoreInput = {
  fechaMin: string;
  fechaMax: string;
  includeIgv: boolean;
  limit: 20 | 50;
  branchSapId?: string;
  categoryId?: string;
};

export type TopProductByStore = {
  branchSapId: string;
  branchName: string;
  rank: number;
  productId: string;
  productName: string;
  sku: string;
  categoryName: string;
  totalQty: number;
  totalAmount: number;
  totalStock: number;
  avgDailyQty: number;
  coverageDays: number | null;
};

type BuiltQuery = {
  query: string;
  params: unknown[];
};

/**
 * Creates a bounded ranking per store. The top-N predicate is evaluated in
 * PostgreSQL before any rows reach the application, so the cards remain
 * compact even when the selected period contains millions of sale lines.
 */
export function buildTopProductsByStoreQuery(input: TopProductsByStoreInput): BuiltQuery {
  const amountColumn = input.includeIgv ? "sd.total" : "sd.subtotal";
  const params: unknown[] = [input.fechaMin, input.fechaMax];
  let parameterIndex = 3;

  const branchFilter = input.branchSapId && input.branchSapId !== "all"
    ? (() => {
        params.push(input.branchSapId);
        return `AND b.sap_id = $${parameterIndex++}`;
      })()
    : "";

  const categoryFilter = input.categoryId && input.categoryId !== "all"
    ? (() => {
        params.push(input.categoryId);
        return `AND COALESCE(grandparent_category.id, parent_category.id, leaf_category.id) = $${parameterIndex++}::uuid`;
      })()
    : "";

  const limitParameter = parameterIndex;
  params.push(input.limit);

  return {
    params,
    query: `
      WITH sales_scope AS (
        SELECT
          sh.id AS header_id,
          sh.branch_id,
          b.sap_id AS branch_sap_id,
          INITCAP(LOWER(COALESCE(b.name, 'Sin tienda'))) AS branch_name,
          sd.product_id,
          COALESCE(prod.name, sd.descripcion, 'Producto desconocido') AS product_name,
          COALESCE(prod.int_sku::text, '—') AS sku,
          INITCAP(LOWER(COALESCE(
            grandparent_category.name,
            parent_category.name,
            leaf_category.name,
            'Sin categoría'
          ))) AS category_name,
          sd.quantity AS quantity,
          ${amountColumn} AS amount
        FROM public.sales_header sh
        INNER JOIN public.branches b ON b.id = sh.branch_id
        INNER JOIN public.sales_detail sd ON sd.header_id = sh.id
        LEFT JOIN public.products prod ON prod.id = sd.product_id
        LEFT JOIN public.categories_products cp
          ON cp.product_id = sd.product_id
         AND cp.category_group_id = '${CATEGORY_GROUP_ID}'::uuid
        LEFT JOIN public.categories leaf_category ON leaf_category.id = cp.category_id
        LEFT JOIN public.categories parent_category ON parent_category.id = leaf_category.parent_category_id
        LEFT JOIN public.categories grandparent_category ON grandparent_category.id = parent_category.parent_category_id
        WHERE sh.doc_date >= $1::date
          AND sh.doc_date < ($2::date + INTERVAL '1 day')
          ${branchFilter}
          ${categoryFilter}
      ),
      active_branches AS (
        SELECT DISTINCT branch_id, branch_sap_id
        FROM sales_scope
      ),
      ranked_products AS (
        SELECT
          branch_sap_id,
          MAX(branch_name) AS branch_name,
          product_id::text AS product_id,
          MAX(product_name) AS product_name,
          MAX(sku) AS sku,
          MAX(category_name) AS category_name,
          ROUND(SUM(quantity)::numeric, 2) AS total_qty,
          ROUND(SUM(amount)::numeric, 2) AS total_amount,
          ROW_NUMBER() OVER (
            PARTITION BY branch_sap_id
            ORDER BY SUM(amount) DESC, SUM(quantity) DESC, MAX(product_name) ASC
          ) AS rank
        FROM sales_scope
        GROUP BY branch_sap_id, product_id
      ),
      stock_by_store AS (
        SELECT
          active_branches.branch_sap_id,
          stocks.product_id::text AS product_id,
          SUM(GREATEST(stocks.stock::numeric, 0)) AS total_stock
        FROM active_branches
        INNER JOIN public.stocks stocks ON stocks.branch_id = active_branches.branch_id
        GROUP BY active_branches.branch_sap_id, stocks.product_id
      ),
      period_days AS (
        SELECT GREATEST(1, ($2::date - $1::date) + 1)::numeric AS value
      )
      SELECT
        ranked_products.branch_sap_id,
        ranked_products.branch_name,
        ranked_products.rank::int AS rank,
        ranked_products.product_id,
        ranked_products.product_name,
        ranked_products.sku,
        ranked_products.category_name,
        ranked_products.total_qty,
        ranked_products.total_amount,
        COALESCE(stock_by_store.total_stock, 0)::numeric AS total_stock,
        ROUND((ranked_products.total_qty / period_days.value), 2) AS avg_daily_qty,
        CASE
          WHEN ranked_products.total_qty > 0
          THEN ROUND(
            COALESCE(stock_by_store.total_stock, 0)::numeric
            / (ranked_products.total_qty / period_days.value),
            1
          )
          ELSE NULL
        END AS coverage_days
      FROM ranked_products
      CROSS JOIN period_days
      LEFT JOIN stock_by_store
        ON stock_by_store.branch_sap_id = ranked_products.branch_sap_id
       AND stock_by_store.product_id = ranked_products.product_id
      WHERE ranked_products.rank <= $${limitParameter}
      ORDER BY ranked_products.branch_name ASC, ranked_products.rank ASC, ranked_products.product_name ASC;
    `,
  };
}

const asNumber = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

export function mapTopProductsByStore(rows: Record<string, unknown>[]): TopProductByStore[] {
  return rows.map((row) => ({
    branchSapId: String(row.branch_sap_id ?? ""),
    branchName: String(row.branch_name ?? "Sin tienda"),
    rank: asNumber(row.rank),
    productId: String(row.product_id ?? ""),
    productName: String(row.product_name ?? "Producto desconocido"),
    sku: String(row.sku ?? "—"),
    categoryName: String(row.category_name ?? "Sin categoría"),
    totalQty: asNumber(row.total_qty),
    totalAmount: asNumber(row.total_amount),
    totalStock: asNumber(row.total_stock),
    avgDailyQty: asNumber(row.avg_daily_qty),
    coverageDays: row.coverage_days == null ? null : asNumber(row.coverage_days),
  }));
}
