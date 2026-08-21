import fs from "node:fs";
import path from "node:path";

const projectPath = "/home/ubuntu/dashboard-ventas";
const inventory = JSON.parse(fs.readFileSync(path.join(projectPath, "sql-inventory-raw.json"), "utf8"));

const manualSqlOverrides = {
  "ownBrandRouter.ts:732": `SELECT COUNT(*)::int AS total
FROM public.branches b
CROSS JOIN (
  SELECT id
  FROM public.products
  WHERE id = :id_producto
    AND brand_id = ANY(:ids_marcas_autorizadas::uuid[])
    {{validacion_categoria_producto}}
) p
WHERE 1 = 1
  {{predicado_sucursal_opcional}}`,
  "supplierPortalRouter.ts:367": `SELECT COUNT(*)::int AS total
FROM public.branches b
CROSS JOIN (
  SELECT id
  FROM public.products
  WHERE id = :id_producto
    AND id IN {{subconsulta_productos_proveedor_autorizado}}
) p
WHERE 1 = 1
  {{predicado_sucursal_opcional}}`,
};

const manualParameterOverrides = {
  "ownBrandRouter.ts:732": ["id_producto", "ids_marcas_autorizadas", "validacion_categoria_producto", "predicado_sucursal_opcional"],
  "supplierPortalRouter.ts:367": ["id_producto", "subconsulta_productos_proveedor_autorizado", "predicado_sucursal_opcional"],
};

const descriptions = {
  getAggregatedSales: "Agrega ventas por fecha, sucursal, canal y categoría para el tablero general.",
  getHourlySales: "Agrega ventas por hora, sucursal y canal para el análisis horario.",
  getAggregatedComparison: "Compara ventas y tickets entre el período vigente y el período equivalente anterior.",
  getHourlyComparison: "Compara las ventas por hora entre el período vigente y el período anterior.",
  getBranchComparison: "Compara resultados por sucursal entre dos períodos consecutivos.",
  getCategoryComparison: "Compara resultados por categoría entre dos períodos consecutivos.",
  getTopProducts: "Obtiene rankings de productos por unidades y por importe, junto con cobertura de stock.",
  getIdentifiedTransactions: "Calcula el porcentaje diario de transacciones con cliente identificado.",
  getHeatmapData: "Construye la matriz de ventas por día de semana y hora.",
  getHeatmapDayComparison: "Obtiene la serie horaria para fechas de comparación seleccionadas.",
  getIdentifiedTransactionsByCashier: "Desglosa las transacciones identificadas por cajero en una sucursal.",
  getCreditNotes: "Resume notas de crédito y las contrasta con las ventas de cada tienda.",
  getCreditNotesByCashier: "Desglosa las notas de crédito por cajero y sucursal.",
  getTopCustomersByBranch: "Devuelve el ranking de clientes por contribución dentro de cada sucursal.",
  getTopCustomersGeneral: "Devuelve el ranking general de clientes, con métricas de frecuencia y ticket promedio.",
  getCustomerTransactions: "Lista las transacciones de un cliente dentro del período y filtros seleccionados.",
  getSalesByShelf: "Obtiene el detalle de ventas por producto y asignación de góndola.",
  getSalesByShelfAggregated: "Agrega resultados de ventas por tienda y góndola.",
  getTransactionDetail: "Obtiene el detalle de líneas de una transacción de venta.",
  getSalesByShelfComparison: "Compara cada góndola contra el período inmediatamente anterior de igual duración.",
  getProductsByShelfAndBranch: "Obtiene productos vendidos para una tienda y góndola específica.",
  getShelfsByBranch: "Obtiene las góndolas asociadas a una sucursal.",
  getShelfCatalog: "Devuelve el catálogo activo de góndolas.",
  bulkAssignProductShelf: "Resuelve nombres de góndola antes de efectuar una reasignación masiva por API externa.",
  getCategoryTree: "Construye la jerarquía Departamento → Sección → Familia disponible en ventas.",
  getCategoryLineChart: "Agrega importe y unidades por período para la categoría filtrada.",
  getCategoryPieBreakdown: "Distribuye ventas entre las subcategorías inmediatas de la categoría seleccionada.",
  getCategoryEvolution: "Devuelve la evolución temporal por producto, tienda o ambas dimensiones.",
  getBranchCatalog: "Obtiene el catálogo de sucursales sin depender de ventas existentes.",
  listBrands: "Lista únicamente las marcas autorizadas para el usuario de marca propia.",
  listAllBrands: "Lista el catálogo general de marcas disponibles para administración.",
  getSalesSummary: "Resume ventas, tickets, unidades, productos y tiendas de las marcas autorizadas.",
  getDailySales: "Agrega ventas de marca propia por día.",
  getSalesByBranch: "Agrega ventas de marca propia por sucursal.",
  getMonthlySales: "Agrega las ventas mensuales recientes de marca propia.",
  getSalesByCategory: "Agrupa ventas de marca propia por categoría configurada.",
  getBranchesForStock: "Lista sucursales con stock para las marcas autorizadas.",
  getBranchesForSales: "Lista sucursales con ventas de las marcas autorizadas.",
  getStockByProduct: "Devuelve el stock por producto y sucursal, con paginación.",
  exportStockByProduct: "Exporta el stock por producto y sucursal sin paginación de interfaz.",
  getReceptions: "Lista recepciones de productos de marca propia con paginación.",
  getProductCatalog: "Obtiene el catálogo de productos de marca propia y su stock consolidado.",
  getSalesByProductBranch: "Agrega ventas por producto y tienda, con totales y paginación en una sola consulta.",
  getSalesDailyDetail: "Obtiene la evolución diaria de un producto en una tienda.",
  exportSalesByProductBranch: "Exporta las ventas por producto y tienda.",
  getProductsForBrand: "Lista productos disponibles para las marcas autorizadas.",
  getSalesEvolution: "Devuelve una serie temporal de ventas para marca propia.",
  listAllSuppliers: "Lista proveedores para usuarios con privilegios de administración.",
  getMySupplier: "Obtiene el proveedor vinculado al usuario autenticado.",
  getSalesLineChart: "Devuelve la evolución temporal de ventas para el portal de proveedor.",
  getSalesVsTarget: "Calcula ventas reales frente a metas por tienda y período.",
  getStoreTargets: "Obtiene metas comerciales configuradas por tienda.",
  getAllStores: "Devuelve el catálogo de tiendas para la administración de metas.",
  listUsers: "Lista los usuarios y sus asignaciones para la administración de accesos.",
  getBranches: "Lista las sucursales disponibles al gestionar usuarios.",
  getSuppliers: "Lista proveedores disponibles al gestionar usuarios.",
  listShelfs: "Lista las góndolas activas disponibles para configurar layouts.",
};

const variableAliases = {
  fromIdx: "fecha_inicio_analisis",
  toIdx: "fecha_fin_analisis",
  fechaMin: "fecha_inicio_analisis",
  fechaMax: "fecha_fin_analisis",
  fechaMinDate: "fecha_inicio_analisis",
  fechaMaxDate: "fecha_fin_analisis",
  minDate: "fecha_inicio_analisis",
  maxDate: "fecha_fin_analisis",
  prevStartStr: "fecha_inicio_periodo_anterior",
  prevEndStr: "fecha_fin_periodo_anterior",
  limitIdx: "limite_resultados",
  offsetIdx: "desplazamiento_paginacion",
  pidIdx: "id_producto",
  bidIdx: "id_sucursal",
  globalBrandParam: "ids_marcas_autorizadas",
  dateTrunc: "expresion_granularidad_temporal",
  amtCol: "columna_importe_segun_igv",
  amtColCat: "columna_importe_segun_igv",
  amtColExport: "columna_importe_segun_igv",
  CP_HIER_CTE: "cte_jerarquia_categorias",
  brandClause: "predicado_marcas_autorizadas",
  branchClause: "predicado_sucursal",
  stockBranchClause: "predicado_sucursal_para_stock",
  categoryClause: "predicado_categoria",
  categoryFilter: "predicado_categoria",
  additionalFilters: "predicados_filtros_adicionales",
  channelFilter: "predicado_canal_venta",
  categoryJoin: "join_jerarquia_categoria_opcional",
  caseExpr: "expresion_categoria_marca_propia",
  selectProduct: "dimension_producto_opcional",
  selectStore: "dimension_tienda_opcional",
  groupByDims: "columnas_agrupacion_dimension",
  groupByClause: "columnas_agrupacion",
  groupCol: "columna_categoria_agrupacion",
  nameCol: "columna_nombre_categoria_agrupacion",
  branchFilter: "predicado_sucursal",
  parentFilter: "predicado_categoria_padre",
  catFilter: "predicado_categoria",
  daysDiff: "cantidad_dias_periodo",
  datePlaceholders: "lista_fechas_comparadas",
  placeholders: "lista_ids_solicitados",
  metricExpr: "expresion_metrica_seleccionada",
  customer_id: "id_cliente",
  header_id: "id_cabecera_venta",
  branch_sap_id: "codigo_sucursal_sap",
  gp: "ordenamiento_por_producto_opcional",
  gs: "ordenamiento_por_tienda_opcional",
  clauses: "predicados_filtros_seleccionados",
  whereClauses: "predicados_catalogo_producto",
  countClauses: "predicados_conteo_catalogo",
  extraClauses: "predicados_stock_adicionales",
  countClauses: "predicados_conteo_catalogo",
  catCheck: "validacion_categoria_producto",
  catCheckCount: "validacion_categoria_producto",
  SUPPLIER_PRODUCTS_SUBQUERY: "subconsulta_productos_proveedor_autorizado",
};

const positionalAliases = (entry, sql) => {
  if (entry.sourceFile === "categoryAnalysisRouter.ts") {
    return { 1: "fecha_inicio_analisis", 2: "fecha_fin_analisis", 3: "codigo_sucursal_sap", 4: "id_categoria" };
  }
  if (entry.sourceFile === "postgres.ts") {
    return { 1: "fecha_inicio_carga_cache", 2: "fecha_fin_carga_cache" };
  }
  if (entry.sourceFile === "supplierPortalRouter.ts") {
    return { 1: "id_proveedor_autenticado", 2: "fecha_inicio_analisis", 3: "fecha_fin_analisis", 4: "id_sucursal", 5: "id_producto", 6: "limite_resultados", 7: "desplazamiento_paginacion" };
  }
  if (entry.sourceFile === "targetsRouter.ts") {
    return { 1: "fecha_inicio_analisis", 2: "fecha_fin_analisis", 3: "id_sucursal", 4: "id_meta" };
  }
  if (entry.sourceFile === "salesRouter.ts" && /cashier_id|pos_by_branch/.test(sql)) {
    return { 1: "fecha_inicio_analisis", 2: "fecha_fin_analisis", 3: "codigo_sucursal_sap" };
  }
  if (entry.sourceFile === "salesRouter.ts" && /shelf_id|shelfs/.test(sql)) {
    return { 1: "codigo_sucursal_sap", 2: "id_gondola", 3: "fecha_inicio_analisis", 4: "fecha_fin_analisis" };
  }
  return { 1: "parametro_contextual_uno", 2: "parametro_contextual_dos", 3: "parametro_contextual_tres", 4: "parametro_contextual_cuatro" };
};

function findProcedure(sourceFile, startLine) {
  const source = fs.readFileSync(path.join(projectPath, "server", sourceFile), "utf8");
  const lines = source.split("\n").slice(0, startLine);
  let procedure = "consulta_auxiliar";
  for (const line of lines) {
    const match = line.match(/^\s{2}([A-Za-z][A-Za-z0-9_]+):\s*(?:publicProcedure|protectedProcedure|canManageUsersProcedure)/);
    if (match) procedure = match[1];
  }
  return procedure;
}

function normalizeDynamicFragments(sql, entry) {
  let normalized = sql;
  normalized = normalized.replace(/\$\$\{([A-Za-z0-9_]+)\}/g, (_match, variable) => `:${variableAliases[variable] ?? `parametro_dinamico_${variable}`}`);
  normalized = normalized.replace(/\$\{([A-Za-z0-9_]+)\}/g, (_match, variable) => `{{${variableAliases[variable] ?? `fragmento_dinamico_${variable}`}}}`);
  for (const [token, alias] of Object.entries(variableAliases)) {
    const tokenExpression = new RegExp(`\\$\\{[^}]*${token}[^}]*\\}`, "g");
    normalized = normalized.replace(tokenExpression, `{{${alias}}}`);
  }
  normalized = normalized.replace(/\$\{gp\s*\?[^}]*\}\s*\$\{gs\s*\?[^}]*\}/g, "{{ordenamiento_dimension_activa}}");
  normalized = normalized.replace(/\$\{input\.branchId\s*\?[^}]*\}/g, "{{predicado_sucursal_opcional}}");
  normalized = normalized.replace(/\$\{metricExpr[^}]*\}/g, "{{expresion_metrica_seleccionada}}");
  normalized = normalized.replace(/\$\{customer_id[^}]*\}/g, ":id_cliente");
  normalized = normalized.replace(/\$\{header_id[^}]*\}/g, ":id_cabecera_venta");
  normalized = normalized.replace(/\$\{branch_sap_id[^}]*\}/g, ":codigo_sucursal_sap");
  normalized = normalized.replace(/\$\{[^}]+\}/g, "{{fragmento_sql_dinamico_controlado}}");
  const positionals = positionalAliases(entry, sql);
  normalized = normalized.replace(/\$(\d+)\b/g, (_match, position) => `:${positionals[position] ?? `parametro_contextual_${position}`}`);
  return normalized;
}

function listDynamicParameters(sql, entry) {
  const names = new Set();
  for (const [token, alias] of Object.entries(variableAliases)) {
    if (sql.includes(token)) names.add(alias);
  }
  const positional = positionalAliases(entry, sql);
  for (const match of sql.matchAll(/\$(\d+)\b/g)) names.add(positional[match[1]] ?? `parametro_contextual_${match[1]}`);
  return [...names];
}

function detectTables(sql) {
  const tableNames = new Set();
  for (const match of sql.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?([a-zA-Z_][\w]*)/gi)) {
    const candidate = match[1];
    if (!["base", "totals", "filtered_headers", "line_items", "aggregated", "stock_agg", "cp_hier", "nc_data", "total_ventas", "ranked", "customer_branch", "date_range", "branch_totals", "agg_detail"].includes(candidate)) tableNames.add(candidate);
  }
  return [...tableNames].sort();
}

const lines = [];
lines.push("# Inventario de consultas SQL del Dashboard de Ventas");
lines.push("");
lines.push("**Autor:** Manus AI  ");
lines.push("**Alcance:** consultas SQL de producción detectadas en el backend. Se excluyen archivos de prueba. Las operaciones ORM se sintetizan por separado, porque Drizzle genera su SQL en tiempo de ejecución.");
lines.push("");
lines.push("> **Convención de lectura.** Los valores se expresan con parámetros nombrados (por ejemplo, `:fecha_inicio_analisis`) en lugar de marcadores posicionales de PostgreSQL. Los elementos entre doble llave, como `{{predicado_sucursal}}`, representan fragmentos SQL controlados por el servidor —no valores ingresados directamente— que se añaden cuando un filtro está activo.");
lines.push("");
lines.push("## Resumen");
lines.push("");
const bySource = Object.groupBy(inventory, ({ sourceFile }) => sourceFile);
lines.push("| Archivo de origen | Consultas SQL explícitas | Función principal |");
lines.push("|---|---:|---|");
for (const [sourceFile, entries] of Object.entries(bySource)) {
  lines.push("| `" + sourceFile + "` | " + entries.length + " | " + sourceFile.replace("Router.ts", "").replace(".ts", "") + " |");
}
lines.push(`| **Total** | **${inventory.length}** | Consultas SQL explícitas detectadas |`);
lines.push("");
lines.push("## Catálogo de parámetros normalizados");
lines.push("");
lines.push("| Parámetro | Significado | Tipo esperado |");
lines.push("|---|---|---|");
lines.push("| `:fecha_inicio_analisis` | Primer día incluido en el período consultado. | `date` (`YYYY-MM-DD`) |");
lines.push("| `:fecha_fin_analisis` | Último día incluido en el período consultado. | `date` (`YYYY-MM-DD`) |");
lines.push("| `:fecha_inicio_periodo_anterior` / `:fecha_fin_periodo_anterior` | Límites del período anterior, de igual duración y adyacente al actual. | `date` |");
lines.push("| `:codigo_sucursal_sap` / `:id_sucursal` | Identificador SAP o UUID de la sucursal, según la consulta. | `text` / `uuid` |");
lines.push("| `:id_producto` / `:id_gondola` | Identificador interno del producto o de la góndola. | `uuid` |");
lines.push("| `:ids_marcas_autorizadas` / `:id_proveedor_autenticado` | Alcance de seguridad aplicado a Marca Propia o Proveedores. | `uuid[]` / `uuid` |");
lines.push("| `:limite_resultados` / `:desplazamiento_paginacion` | Control de paginación. | `integer` |");
lines.push("| `{{predicado_*}}` | Fragmento SQL generado únicamente a partir de filtros validados del backend. | Fragmento SQL controlado |");
lines.push("| `{{columna_importe_segun_igv}}` | Columna que alterna entre importe con IGV o sin IGV. | Identificador SQL controlado |");
lines.push("");

for (const [sourceFile, entries] of Object.entries(bySource)) {
  lines.push(`## ${sourceFile}`);
  lines.push("");
  entries.forEach((entry, index) => {
    const inventoryKey = `${entry.sourceFile}:${entry.startLine}`;
    const procedure = findProcedure(entry.sourceFile, entry.startLine);
    const description = descriptions[procedure] ?? "Consulta de soporte ejecutada por el backend para el flujo indicado.";
    const normalizedSql = manualSqlOverrides[inventoryKey] ?? normalizeDynamicFragments(entry.sql, entry);
    const parameters = manualParameterOverrides[inventoryKey] ?? listDynamicParameters(entry.sql, entry);
    const tables = detectTables(manualSqlOverrides[inventoryKey] ?? entry.sql);
    lines.push(`### ${index + 1}. ${procedure} — consulta ${index + 1}`);
    lines.push("");
    lines.push("**Origen:** `server/" + entry.sourceFile + ":" + entry.startLine + "`  ");
    lines.push(`**Propósito:** ${description}  `);
    lines.push("**Tablas o CTEs relevantes:** " + (tables.length ? tables.map((table) => "`" + table + "`").join(", ") : "consulta de utilería sin tabla de negocio") + ".  ");
    lines.push("**Parámetros / fragmentos variables:** " + (parameters.length ? parameters.map((parameter) => "`" + (parameter.startsWith("predicado") || parameter.startsWith("columna") || parameter.startsWith("cte_") || parameter.startsWith("expresion") || parameter.startsWith("dimension") || parameter.startsWith("columnas") || parameter.startsWith("validacion") || parameter.startsWith("lista_") ? "{{" + parameter + "}}" : ":" + parameter) + "`").join(", ") : "ninguno") + ".");
    lines.push("");
    lines.push("```sql");
    lines.push(normalizedSql);
    lines.push("```");
    lines.push("");
  });
}

lines.push("## Operaciones ORM que también generan SQL");
lines.push("");
lines.push("Las siguientes operaciones no contienen un literal SQL mantenido por la aplicación; Drizzle genera los `SELECT`, `INSERT`, `UPDATE` o `DELETE` al ejecutarlas. Se enumeran para completar el alcance de persistencia del sitio.");
lines.push("");
lines.push("| Módulo | Tablas | Operaciones ORM detectadas |");
lines.push("|---|---|---|");
lines.push("| `db.ts` | `users`, `discrepancy_tickets`, `terms_acceptance`, `terms_versions` | Lectura, inserción, actualización, borrado y upsert de usuarios, tickets y términos. |");
lines.push("| `activationRouter.ts` | `activation_tokens` | Inserción y renovación de tokens de activación. |");
lines.push("| `dbConnectionsRouter.ts` | `db_connections` | Inserción, actualización, listado y eliminación de conexiones registradas. |");
lines.push("| `ownBrandCategoriesRouter.ts` | `own_brand_categories`, `own_brand_category_brands` | CRUD de categorías y asociaciones de marca propia. |");
lines.push("| `ownBrandRouter.ts` | `own_brand_brands`, `own_brand_categories`, `own_brand_category_brands` | Lectura y mantenimiento de la configuración de marcas autorizadas. |");
lines.push("| `shelfLayoutRouter.ts` | `shelf_layouts`, `shelf_zones` | CRUD de layouts y zonas visuales de góndola. |");
lines.push("| `supplierTrialRouter.ts` | `users`, `terms_acceptance`, `supplier_trials` | Lectura y actualización del estado de prueba y aceptación de términos. |");
lines.push("| `targetsRouter.ts` | `store_targets` | Inserción, actualización, borrado y lectura de metas por tienda. |");
lines.push("| `userRouter.ts` | `users`, `activation_tokens` | Administración de usuarios, contraseñas y activaciones. |");
lines.push("");
lines.push("## Notas de seguridad y mantenimiento");
lines.push("");
lines.push("Las consultas normalizadas emplean nombres expresivos solo en esta documentación. En el código productivo, muchas consultas todavía se construyen con parámetros posicionales (`$1`, `$2`, etc.) y algunos fragmentos SQL controlados. Para una migración posterior, se recomienda conservar los valores como parámetros enlazados y limitar los fragmentos dinámicos a listas blancas de columnas, granularidades y filtros admitidos.");

const outputDirectory = path.join(projectPath, "docs");
fs.mkdirSync(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, "inventario-consultas-sql.md");
fs.writeFileSync(outputPath, lines.join("\n"));
console.log(outputPath);
