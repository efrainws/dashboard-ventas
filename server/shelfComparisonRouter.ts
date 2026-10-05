import { z } from "zod";
import { router, salesDataProcedure } from "./_core/trpc";
import { queryWithRetry } from "./postgres";

const inputSchema = z.object({
  branch_sap_id: z.string().min(1).max(64),
  shelf_id: z.string().uuid().nullable(),
  shelf_status: z.enum(["Sin registro en stocks", "Stock sin góndola", "Con góndola asignada"]).optional(),
  fecha_min: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fecha_max: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category_id: z.string().uuid().optional(),
  include_igv: z.boolean(),
  product_ids: z.array(z.string().uuid()).max(200),
});

/** Exact period totals for visible ranking entities, even if absent from the other period's Top 200. */
export function buildShelfComparisonProductQuery(input: z.infer<typeof inputSchema>) {
  const params: unknown[] = [input.branch_sap_id, input.fecha_min, input.fecha_max, input.product_ids];
  const shelfClause = input.shelf_id !== null
    ? `AND st.shelf_id = $${params.push(input.shelf_id)}::uuid`
    : input.shelf_status === "Sin registro en stocks"
      ? "AND st.id IS NULL"
      : input.shelf_status === "Stock sin góndola"
        ? "AND st.id IS NOT NULL AND st.shelf_id IS NULL"
        : "AND st.shelf_id IS NULL";
  const categoryClause = input.category_id ? `AND COALESCE(g.id, p2.id, c2.id) = $${params.push(input.category_id)}::uuid` : "";
  const amountColumn = input.include_igv ? "sd.total" : "sd.subtotal";
  return {
    params,
    query: `SELECT sd.product_id, ROUND(SUM(${amountColumn})::numeric, 2) AS monto_total,
      ROUND(SUM(sd.quantity)::numeric, 2) AS cantidad_vendida, COUNT(DISTINCT sh.id) AS transacciones
      FROM public.sales_header sh
      JOIN public.sales_detail sd ON sd.header_id = sh.id
      JOIN public.branches b ON b.id = sh.branch_id
      JOIN public.products p ON p.id = sd.product_id
      LEFT JOIN public.stocks st ON st.product_id = sd.product_id AND st.branch_id = sh.branch_id
      LEFT JOIN public.categories_products cp ON cp.product_id = p.id
        AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
      LEFT JOIN public.categories c2 ON c2.id = cp.category_id
      LEFT JOIN public.categories p2 ON p2.id = c2.parent_category_id
      LEFT JOIN public.categories g ON g.id = p2.parent_category_id
      WHERE b.sap_id = $1 AND sh.doc_date >= $2::date AND sh.doc_date < ($3::date + INTERVAL '1 day')
        AND sd.product_id = ANY($4::uuid[]) ${shelfClause} ${categoryClause}
      GROUP BY sd.product_id`,
  };
}

export const shelfComparisonRouter = router({
  products: salesDataProcedure.input(inputSchema).query(async ({ input }) => {
    if (input.product_ids.length === 0) return [];
    const { query, params } = buildShelfComparisonProductQuery(input);
    const result = await queryWithRetry(query, params);
    return result.rows.map(row => ({
      product_id: String(row.product_id),
      monto_total: Number(row.monto_total ?? 0),
      cantidad_vendida: Number(row.cantidad_vendida ?? 0),
      transacciones: Number(row.transacciones ?? 0),
    }));
  }),
});
