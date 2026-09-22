import { salesChannelCase } from "./salesChannels";

const CATEGORY_GROUP_ID = "07a06cd5-d1a8-4ea5-9ca5-98865d9630ca";

type CustomerAnalyticsScope = {
  customerId: string;
  fechaMin: string;
  fechaMax: string;
  includeIgv: boolean;
  branchSapId?: string;
  salesChannel?: string;
};

export type CustomerDistribution = {
  id: string;
  name: string;
  salesAmount: number;
  transactions: number;
};

export type CustomerTopProduct = {
  productId: string | null;
  productName: string;
  sku: string;
  quantity: number;
  salesAmount: number;
  transactions: number;
};

type BuiltQuery = {
  query: string;
  params: unknown[];
};

function isActiveFilter(value?: string) {
  return Boolean(value && value !== "all");
}

/**
 * Builds the smallest possible header scope before sales_detail is joined.
 * Parameters are bound separately to prevent user-provided filters being
 * interpolated into SQL and to retain index access on customer_id/doc_date.
 */
function buildHeaderScope(input: CustomerAnalyticsScope) {
  const amountColumn = input.includeIgv ? "sh.total" : "sh.subtotal";
  const params: unknown[] = [input.customerId, input.fechaMin, input.fechaMax];
  let parameterIndex = 4;

  const branchFilter = isActiveFilter(input.branchSapId)
    ? (() => {
        params.push(input.branchSapId!);
        return `AND b.sap_id = $${parameterIndex++}`;
      })()
    : "";

  const channelFilter = isActiveFilter(input.salesChannel)
    ? (() => {
        params.push(input.salesChannel!);
        return `WHERE sales_channel = $${parameterIndex++}`;
      })()
    : "";

  return {
    amountColumn,
    channelFilter,
    nextParameterIndex: parameterIndex,
    params,
    sql: `
      header_scope AS (
        SELECT
          sh.id,
          sh.branch_id,
          sh.doc_date,
          ${amountColumn} AS header_amount,
          b.sap_id AS branch_sap_id,
          INITCAP(LOWER(COALESCE(b.name, 'Sin tienda'))) AS branch_name,
          ${salesChannelCase("sh")} AS sales_channel
        FROM public.sales_header sh
        INNER JOIN public.branches b ON b.id = sh.branch_id
        WHERE sh.customer_id = $1::uuid
          AND sh.doc_date >= $2::date
          AND sh.doc_date < ($3::date + INTERVAL '1 day')
          ${branchFilter}
      ),
      filtered_headers AS (
        SELECT *
        FROM header_scope
        ${channelFilter}
      )`,
  };
}

/**
 * One compact query for the two pie charts. Store distribution deliberately
 * uses the header value so it reconciles with the transaction list, while the
 * department distribution uses line values and counts each transaction once.
 */
export function buildCustomerDistributionsQuery(input: CustomerAnalyticsScope): BuiltQuery {
  const scope = buildHeaderScope(input);

  return {
    params: scope.params,
    query: `
      WITH ${scope.sql},
      detail_rows AS (
        SELECT
          fh.id AS header_id,
          sd.product_id,
          ${input.includeIgv ? "sd.total" : "sd.subtotal"} AS line_amount,
          COALESCE(grandparent_category.id, parent_category.id, leaf_category.id)::text AS department_id,
          INITCAP(LOWER(COALESCE(
            grandparent_category.name,
            parent_category.name,
            leaf_category.name,
            'Sin categoría'
          ))) AS department_name
        FROM filtered_headers fh
        INNER JOIN public.sales_detail sd ON sd.header_id = fh.id
        LEFT JOIN public.categories_products cp
          ON cp.product_id = sd.product_id
         AND cp.category_group_id = '${CATEGORY_GROUP_ID}'::uuid
        LEFT JOIN public.categories leaf_category ON leaf_category.id = cp.category_id
        LEFT JOIN public.categories parent_category ON parent_category.id = leaf_category.parent_category_id
        LEFT JOIN public.categories grandparent_category ON grandparent_category.id = parent_category.parent_category_id
      ),
      store_rows AS (
        SELECT
          branch_sap_id AS id,
          branch_name AS name,
          ROUND(SUM(header_amount)::numeric, 2) AS sales_amount,
          COUNT(*)::int AS transactions
        FROM filtered_headers
        GROUP BY branch_sap_id, branch_name
      ),
      department_rows AS (
        SELECT
          COALESCE(department_id, 'uncategorized') AS id,
          department_name AS name,
          ROUND(SUM(line_amount)::numeric, 2) AS sales_amount,
          COUNT(DISTINCT header_id)::int AS transactions
        FROM detail_rows
        GROUP BY department_id, department_name
      )
      SELECT
        COALESCE(
          (SELECT jsonb_agg(
            jsonb_build_object(
              'id', id,
              'name', name,
              'sales_amount', sales_amount,
              'transactions', transactions
            ) ORDER BY sales_amount DESC, name ASC
          ) FROM store_rows),
          '[]'::jsonb
        ) AS stores,
        COALESCE(
          (SELECT jsonb_agg(
            jsonb_build_object(
              'id', id,
              'name', name,
              'sales_amount', sales_amount,
              'transactions', transactions
            ) ORDER BY sales_amount DESC, name ASC
          ) FROM department_rows),
          '[]'::jsonb
        ) AS departments;
    `,
  };
}

/**
 * Aggregates the ranking on PostgreSQL and transfers only the selected top N.
 * The rank is intentionally by units purchased, with sales as a stable tiebreaker.
 */
export function buildCustomerTopProductsQuery(
  input: CustomerAnalyticsScope & { limit: number }
): BuiltQuery {
  const scope = buildHeaderScope(input);
  const params = [...scope.params, input.limit];
  const limitParameter = scope.nextParameterIndex;
  const lineAmount = input.includeIgv ? "sd.total" : "sd.subtotal";

  return {
    params,
    query: `
      WITH ${scope.sql},
      product_rows AS (
        SELECT
          sd.product_id::text AS product_id,
          COALESCE(p.name, sd.descripcion, 'Producto desconocido') AS product_name,
          COALESCE(p.int_sku::text, '—') AS sku,
          ROUND(SUM(sd.quantity)::numeric, 2) AS quantity,
          ROUND(SUM(${lineAmount})::numeric, 2) AS sales_amount,
          COUNT(DISTINCT fh.id)::int AS transactions
        FROM filtered_headers fh
        INNER JOIN public.sales_detail sd ON sd.header_id = fh.id
        LEFT JOIN public.products p ON p.id = sd.product_id
        GROUP BY sd.product_id, p.name, sd.descripcion, p.int_sku
      )
      SELECT
        product_id,
        product_name,
        sku,
        quantity,
        sales_amount,
        transactions
      FROM product_rows
      ORDER BY quantity DESC, sales_amount DESC, product_name ASC
      LIMIT $${limitParameter};
    `,
  };
}

function asJsonArray(value: unknown): Record<string, unknown>[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed : [];
}

function asNumber(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function mapCustomerDistributions(row: Record<string, unknown> | undefined) {
  const mapDistribution = (value: unknown): CustomerDistribution[] =>
    asJsonArray(value).map((item) => ({
      id: String(item.id ?? ""),
      name: String(item.name ?? "Sin datos"),
      salesAmount: asNumber(item.sales_amount),
      transactions: asNumber(item.transactions),
    }));

  return {
    stores: mapDistribution(row?.stores),
    departments: mapDistribution(row?.departments),
  };
}

export function mapCustomerTopProducts(rows: Record<string, unknown>[]): CustomerTopProduct[] {
  return rows.map((row) => ({
    productId: row.product_id ? String(row.product_id) : null,
    productName: String(row.product_name ?? "Producto desconocido"),
    sku: String(row.sku ?? "—"),
    quantity: asNumber(row.quantity),
    salesAmount: asNumber(row.sales_amount),
    transactions: asNumber(row.transactions),
  }));
}
