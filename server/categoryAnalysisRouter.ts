/**
 * categoryAnalysisRouter.ts
 * Endpoints para la vista "Análisis por Categorías" del portal de ventas.
 *
 * Jerarquía de categorías (tabla `categories`):
 *   nivel=1  → Departamento  (raíz)
 *   nivel=2  → Sección       (hija del departamento)
 *   nivel=NULL → Familia     (hija de la sección, sin nivel asignado)
 *
 * Los productos se vinculan a categorías vía `categories_products`
 * con category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'.
 */
import { publicProcedure, router } from "./_core/trpc";
import { pool, queryWithRetry } from "./postgres";
import { z } from "zod";
import { cached, TTL } from "./queryCache";

const CAT_GROUP = "07a06cd5-d1a8-4ea5-9ca5-98865d9630ca";

// ─── Shared input schemas ────────────────────────────────────────────────────
const dateRangeSchema = z.object({
  fecha_min: z.string(), // YYYY-MM-DD
  fecha_max: z.string(), // YYYY-MM-DD
  branch_id: z.string().optional(), // sap_id de la sucursal o 'all'
  include_igv: z.boolean().default(true),
});

// ─── Helper: build branch filter ────────────────────────────────────────────
function buildBranchFilter(
  branch_id: string | undefined,
  params: unknown[],
  tableAlias = "b"
): string {
  if (!branch_id || branch_id === "all") return "";
  params.push(branch_id);
  return `AND ${tableAlias}.sap_id = $${params.length}`;
}

// ─── Helper: build category WHERE clause ────────────────────────────────────
/**
 * Given a category id (at any level), returns a SQL fragment that filters
 * sales_detail rows to those belonging to that category or any of its descendants.
 *
 * The categories_products CTE (named `cp_hier`) must already be in scope.
 * The CTE joins categories_products → categories (leaf) → parent → grandparent.
 */
function buildCategoryFilter(
  deptId: string | undefined,
  seccionId: string | undefined,
  familiaId: string | undefined,
  params: unknown[]
): string {
  if (familiaId && familiaId !== "all") {
    // Familia: leaf category (nivel=NULL, parent=sección)
    params.push(familiaId);
    return `AND cp_hier.leaf_category_id = $${params.length}`;
  }
  if (seccionId && seccionId !== "all") {
    // Sección: nivel=2, match leaf.parent_id = sección
    params.push(seccionId);
    return `AND cp_hier.seccion_id = $${params.length}`;
  }
  if (deptId && deptId !== "all") {
    // Departamento: nivel=1, match grandparent or parent
    params.push(deptId);
    return `AND cp_hier.dept_id = $${params.length}`;
  }
  return "";
}

/**
 * CTE that resolves the 3-level category hierarchy for each product.
 * Columns: product_id, leaf_category_id, leaf_name, seccion_id, seccion_name, dept_id, dept_name
 */
const CP_HIER_CTE = `
  cp_hier AS (
    SELECT
      cp.product_id,
      cp.category_id                          AS leaf_category_id,
      c_leaf.name                             AS leaf_name,
      COALESCE(c_sec.id, c_leaf.id)           AS seccion_id,
      COALESCE(c_sec.name, c_leaf.name)       AS seccion_name,
      COALESCE(c_dept.id, c_sec.id, c_leaf.id) AS dept_id,
      COALESCE(c_dept.name, c_sec.name, c_leaf.name) AS dept_name
    FROM categories_products cp
    JOIN categories c_leaf ON c_leaf.id = cp.category_id
    LEFT JOIN categories c_sec  ON c_sec.id  = c_leaf.parent_category_id
    LEFT JOIN categories c_dept ON c_dept.id = c_sec.parent_category_id
    WHERE cp.category_group_id = '${CAT_GROUP}'
  )
`;

export const categoryAnalysisRouter = router({
  // ─── 1. Category tree ──────────────────────────────────────────────────────
  /**
   * Returns the full 3-level category tree:
   * departments → sections → families
   * Used to populate the cascading filter dropdowns.
   */
  getCategoryTree: publicProcedure.query(async () => {
    return cached("cat:tree:v1", TTL.STATIC, async () => {
      // Fetch all categories that have at least one product assigned
      const res = await queryWithRetry(
        `
        WITH ${CP_HIER_CTE}
        SELECT DISTINCT
          dept_id,
          dept_name,
          seccion_id,
          seccion_name,
          leaf_category_id AS familia_id,
          leaf_name        AS familia_name
        FROM cp_hier
        ORDER BY dept_name, seccion_name, leaf_name
        `,
        []
      );

      type Row = {
        dept_id: string;
        dept_name: string;
        seccion_id: string;
        seccion_name: string;
        familia_id: string;
        familia_name: string;
      };

      // Build nested structure
      const deptMap = new Map<
        string,
        {
          id: string;
          name: string;
          secciones: Map<
            string,
            { id: string; name: string; familias: { id: string; name: string }[] }
          >;
        }
      >();

      for (const row of res.rows as Row[]) {
        if (!deptMap.has(row.dept_id)) {
          deptMap.set(row.dept_id, {
            id: row.dept_id,
            name: row.dept_name,
            secciones: new Map(),
          });
        }
        const dept = deptMap.get(row.dept_id)!;
        if (!dept.secciones.has(row.seccion_id)) {
          dept.secciones.set(row.seccion_id, {
            id: row.seccion_id,
            name: row.seccion_name,
            familias: [],
          });
        }
        const sec = dept.secciones.get(row.seccion_id)!;
        // Only add familia if it's different from sección (i.e., a real leaf)
        if (row.familia_id !== row.seccion_id) {
          if (!sec.familias.find((f) => f.id === row.familia_id)) {
            sec.familias.push({ id: row.familia_id, name: row.familia_name });
          }
        }
      }

      return Array.from(deptMap.values()).map((d) => ({
        id: d.id,
        name: d.name,
        secciones: Array.from(d.secciones.values()).map((s) => ({
          id: s.id,
          name: s.name,
          familias: s.familias,
        })),
      }));
    });
  }),

  // ─── 2. Line chart: sales over time ────────────────────────────────────────
  /**
   * Returns daily/weekly/monthly sales (amount + quantity) for the selected
   * category (at any level). Used for the line chart.
   */
  getCategoryLineChart: publicProcedure
    .input(
      dateRangeSchema.extend({
        dept_id: z.string().optional(),
        seccion_id: z.string().optional(),
        familia_id: z.string().optional(),
        granularity: z.enum(["day", "week", "month"]).default("day"),
      })
    )
    .query(async ({ input }) => {
      const {
        fecha_min,
        fecha_max,
        branch_id,
        include_igv,
        dept_id,
        seccion_id,
        familia_id,
        granularity,
      } = input;
      const amtCol = include_igv ? "sd.total" : "sd.subtotal";
      const dateTrunc =
        granularity === "day"
          ? "sh.doc_date::date"
          : granularity === "week"
            ? "date_trunc('week', sh.doc_date)::date"
            : "date_trunc('month', sh.doc_date)::date";

      const params: unknown[] = [fecha_min, fecha_max];
      const branchFilter = buildBranchFilter(branch_id, params);
      const catFilter = buildCategoryFilter(dept_id, seccion_id, familia_id, params);

      const cacheKey = `cat:line:${fecha_min}:${fecha_max}:${branch_id ?? "all"}:${include_igv}:${dept_id ?? ""}:${seccion_id ?? ""}:${familia_id ?? ""}:${granularity}`;

      return cached(cacheKey, TTL.DYNAMIC, async () => {
        const res = await queryWithRetry(
          `
          WITH ${CP_HIER_CTE}
          SELECT
            ${dateTrunc}                AS period,
            SUM(${amtCol})              AS amount,
            SUM(sd.quantity)            AS quantity
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          JOIN products p      ON p.id = sd.product_id
          JOIN cp_hier         ON cp_hier.product_id = p.id
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date >= $1::date
            AND sh.doc_date <  ($2::date + INTERVAL '1 day')
            ${branchFilter}
            ${catFilter}
          GROUP BY period
          ORDER BY period ASC
          `,
          params
        );
        return res.rows as { period: string; amount: string; quantity: string }[];
      });
    }),

  // ─── 3. Pie chart: distribution by child category ─────────────────────────
  /**
   * Returns the sales distribution broken down by the immediate child category
   * of the currently selected level.
   *
   * - If no category selected → group by Departamento
   * - If Departamento selected → group by Sección
   * - If Sección selected → group by Familia
   * - If Familia selected → group by Familia (same level, no deeper)
   */
  getCategoryPieBreakdown: publicProcedure
    .input(
      dateRangeSchema.extend({
        dept_id: z.string().optional(),
        seccion_id: z.string().optional(),
        familia_id: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, branch_id, include_igv, dept_id, seccion_id, familia_id } =
        input;
      const amtCol = include_igv ? "sd.total" : "sd.subtotal";

      const params: unknown[] = [fecha_min, fecha_max];
      const branchFilter = buildBranchFilter(branch_id, params);

      // Determine grouping level
      let groupCol: string;
      let nameCol: string;
      let parentFilter = "";

      if (familia_id && familia_id !== "all") {
        // Familia selected → show same level (no children)
        groupCol = "cp_hier.leaf_category_id";
        nameCol = "cp_hier.leaf_name";
        params.push(familia_id);
        parentFilter = `AND cp_hier.leaf_category_id = $${params.length}`;
      } else if (seccion_id && seccion_id !== "all") {
        // Sección selected → show familias
        groupCol = "cp_hier.leaf_category_id";
        nameCol = "cp_hier.leaf_name";
        params.push(seccion_id);
        parentFilter = `AND cp_hier.seccion_id = $${params.length}`;
      } else if (dept_id && dept_id !== "all") {
        // Departamento selected → show secciones
        groupCol = "cp_hier.seccion_id";
        nameCol = "cp_hier.seccion_name";
        params.push(dept_id);
        parentFilter = `AND cp_hier.dept_id = $${params.length}`;
      } else {
        // Nothing selected → show departamentos
        groupCol = "cp_hier.dept_id";
        nameCol = "cp_hier.dept_name";
      }

      const cacheKey = `cat:pie:${fecha_min}:${fecha_max}:${branch_id ?? "all"}:${include_igv}:${dept_id ?? ""}:${seccion_id ?? ""}:${familia_id ?? ""}`;

      return cached(cacheKey, TTL.DYNAMIC, async () => {
        const res = await queryWithRetry(
          `
          WITH ${CP_HIER_CTE}
          SELECT
            ${groupCol}        AS category_id,
            ${nameCol}         AS category_name,
            SUM(${amtCol})     AS amount,
            SUM(sd.quantity)   AS quantity
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          JOIN products p      ON p.id = sd.product_id
          JOIN cp_hier         ON cp_hier.product_id = p.id
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date >= $1::date
            AND sh.doc_date <  ($2::date + INTERVAL '1 day')
            ${branchFilter}
            ${parentFilter}
          GROUP BY ${groupCol}, ${nameCol}
          ORDER BY amount DESC
          `,
          params
        );
        return res.rows as {
          category_id: string;
          category_name: string;
          amount: string;
          quantity: string;
        }[];
      });
    }),

  // ─── 4. Evolution table: pivotable by product × store × period ────────────
  /**
   * Returns rows compatible with SalesEvolutionTable:
   * { period, product_id, producto, sku, branch_id, tienda, sap_id, amount, quantity }
   */
  getCategoryEvolution: publicProcedure
    .input(
      dateRangeSchema.extend({
        dept_id: z.string().optional(),
        seccion_id: z.string().optional(),
        familia_id: z.string().optional(),
        granularity: z.enum(["day", "week", "month"]).default("day"),
        group_by_product: z.boolean().default(true),
        group_by_store: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const {
        fecha_min,
        fecha_max,
        branch_id,
        include_igv,
        dept_id,
        seccion_id,
        familia_id,
        granularity,
        group_by_product,
        group_by_store,
      } = input;
      const amtCol = include_igv ? "sd.total" : "sd.subtotal";
      const dateTrunc =
        granularity === "day"
          ? "sh.doc_date::date"
          : granularity === "week"
            ? "date_trunc('week', sh.doc_date)::date"
            : "date_trunc('month', sh.doc_date)::date";

      const params: unknown[] = [fecha_min, fecha_max];
      const branchFilter = buildBranchFilter(branch_id, params);
      const catFilter = buildCategoryFilter(dept_id, seccion_id, familia_id, params);

      const gp = group_by_product;
      const gs = group_by_store;

      const selectProduct = gp
        ? `p.id AS product_id, p.name AS producto, p.int_sku::text AS sku,`
        : `NULL::uuid AS product_id, '(Todos)' AS producto, '—' AS sku,`;
      const selectStore = gs
        ? `b.id AS branch_id, b.name AS tienda, b.sap_id,`
        : `NULL::uuid AS branch_id, '(Todas)' AS tienda, NULL AS sap_id,`;

      const groupByDims = [
        ...(gp ? ["p.id", "p.name", "p.int_sku"] : []),
        ...(gs ? ["b.id", "b.name", "b.sap_id"] : []),
      ];
      const groupByClause = ["period", ...groupByDims].join(", ");

      const cacheKey = `cat:evo:${fecha_min}:${fecha_max}:${branch_id ?? "all"}:${include_igv}:${dept_id ?? ""}:${seccion_id ?? ""}:${familia_id ?? ""}:${granularity}:${gp}:${gs}`;

      return cached(cacheKey, TTL.DYNAMIC, async () => {
        const res = await queryWithRetry(
          `
          WITH ${CP_HIER_CTE}
          SELECT
            ${dateTrunc}             AS period,
            ${selectProduct}
            ${selectStore}
            SUM(${amtCol})           AS amount,
            SUM(sd.quantity)         AS quantity
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          JOIN products p      ON p.id = sd.product_id
          JOIN cp_hier         ON cp_hier.product_id = p.id
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date >= $1::date
            AND sh.doc_date <  ($2::date + INTERVAL '1 day')
            ${branchFilter}
            ${catFilter}
          GROUP BY ${groupByClause}
          ORDER BY period ASC, ${gp ? "p.name ASC," : ""} ${gs ? "b.sap_id ASC" : "1"}
          `,
          params
        );
        return res.rows as Array<{
          period: string;
          product_id: string | null;
          producto: string;
          sku: string;
          branch_id: string | null;
          tienda: string;
          sap_id: string | null;
          amount: string;
          quantity: string;
        }>;
      });
    }),
});
