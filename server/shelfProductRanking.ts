export const SHELF_PRODUCT_SORTS = ["amount", "quantity", "transactions"] as const;

export type ShelfProductSort = (typeof SHELF_PRODUCT_SORTS)[number];

export interface ShelfProductRankingInput {
  branchSapId: string;
  shelfId: string | null;
  shelfStatus?: "Sin registro en stocks" | "Stock sin góndola" | "Con góndola asignada";
  fechaMin: string;
  fechaMax: string;
  categoryId?: string;
  includeIgv: boolean;
  sortBy: ShelfProductSort;
  limit: number;
}

export interface ShelfProductRankingQuery {
  query: string;
  params: string[];
}

const SORT_COLUMN_BY_DIMENSION: Record<ShelfProductSort, string> = {
  amount: "monto_total",
  quantity: "cantidad_vendida",
  transactions: "transacciones",
};

/**
 * Builds an aggregate, bounded ranking of products sold from one shelf in one
 * branch. Dynamic values are bound as PostgreSQL parameters; the sole dynamic
 * identifier is selected from the allow-listed sort map above.
 */
export function buildShelfProductRankingQuery(input: ShelfProductRankingInput): ShelfProductRankingQuery {
  const fechaMinDate = input.fechaMin.substring(0, 10);
  const fechaMaxDate = input.fechaMax.substring(0, 10);
  const amountColumn = input.includeIgv ? "sd.total" : "sd.subtotal";
  const sortColumn = SORT_COLUMN_BY_DIMENSION[input.sortBy];
  const params: string[] = [input.branchSapId, fechaMinDate, fechaMaxDate];
  let parameterIndex = params.length + 1;

  let shelfClause: string;
  if (input.shelfId === null) {
    shelfClause = input.shelfStatus === "Sin registro en stocks"
      ? "AND st.id IS NULL"
      : input.shelfStatus === "Stock sin góndola"
        ? "AND st.id IS NOT NULL AND st.shelf_id IS NULL"
        : "AND st.shelf_id IS NULL";
  } else {
    shelfClause = `AND st.shelf_id = $${parameterIndex++}::uuid`;
    params.push(input.shelfId);
  }

  let categoryClause = "";
  if (input.categoryId) {
    categoryClause = `AND COALESCE(g.id, p2.id, c2.id) = $${parameterIndex++}::uuid`;
    params.push(input.categoryId);
  }

  const limitParameter = `$${parameterIndex}`;
  params.push(String(input.limit));

  return {
    params,
    query: `
      WITH product_sales AS (
        SELECT
          sd.product_id                                                    AS product_id,
          COALESCE(p.int_sku::text, '')                                    AS int_sku,
          COALESCE(NULLIF(INITCAP(LOWER(p.name)), ''), 'Producto sin nombre') AS product_name,
          ROUND(SUM(${amountColumn})::numeric, 2)                         AS monto_total,
          ROUND(SUM(sd.quantity)::numeric, 2)                             AS cantidad_vendida,
          COUNT(DISTINCT sh.id)                                            AS transacciones
        FROM public.sales_header sh
        INNER JOIN public.sales_detail sd
          ON sd.header_id = sh.id
        INNER JOIN public.branches b
          ON b.id = sh.branch_id
        INNER JOIN public.products p
          ON p.id = sd.product_id
        LEFT JOIN public.stocks st
          ON st.product_id = sd.product_id
         AND st.branch_id = sh.branch_id
        LEFT JOIN public.categories_products cp
          ON cp.product_id = p.id
         AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
        LEFT JOIN public.categories c2 ON c2.id = cp.category_id
        LEFT JOIN public.categories p2 ON p2.id = c2.parent_category_id
        LEFT JOIN public.categories g ON g.id = p2.parent_category_id
        WHERE b.sap_id = $1
          AND sh.doc_date >= $2::date
          AND sh.doc_date < ($3::date + INTERVAL '1 day')
          AND sh.doc_date IS NOT NULL
          ${shelfClause}
          ${categoryClause}
        GROUP BY sd.product_id, p.int_sku, p.name
      )
      SELECT
        product_id,
        int_sku,
        product_name,
        monto_total,
        cantidad_vendida,
        transacciones,
        COUNT(*) OVER() AS total_productos
      FROM product_sales
      ORDER BY ${sortColumn} DESC NULLS LAST, product_name ASC, int_sku ASC
      LIMIT ${limitParameter}::int;
    `,
  };
}
