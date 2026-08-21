# Inventario de consultas SQL del Dashboard de Ventas

**Autor:** Manus AI  
**Alcance:** consultas SQL de producción detectadas en el backend. Se excluyen archivos de prueba. Las operaciones ORM se sintetizan por separado, porque Drizzle genera su SQL en tiempo de ejecución.

> **Convención de lectura.** Los valores se expresan con parámetros nombrados (por ejemplo, `:fecha_inicio_analisis`) en lugar de marcadores posicionales de PostgreSQL. Los elementos entre doble llave, como `{{predicado_sucursal}}`, representan fragmentos SQL controlados por el servidor —no valores ingresados directamente— que se añaden cuando un filtro está activo.

## Resumen

| Archivo de origen | Consultas SQL explícitas | Función principal |
|---|---:|---|
| `categoryAnalysisRouter.ts` | 5 | categoryAnalysis |
| `db.ts` | 2 | db |
| `dbConnectionsRouter.ts` | 1 | dbConnections |
| `ownBrandRouter.ts` | 25 | ownBrand |
| `postgres.ts` | 6 | postgres |
| `salesRouter.ts` | 25 | sales |
| `shelfLayoutRouter.ts` | 1 | shelfLayout |
| `supplierPortalRouter.ts` | 24 | supplierPortal |
| `targetsRouter.ts` | 3 | targets |
| `userRouter.ts` | 4 | user |
| **Total** | **96** | Consultas SQL explícitas detectadas |

## Catálogo de parámetros normalizados

| Parámetro | Significado | Tipo esperado |
|---|---|---|
| `:fecha_inicio_analisis` | Primer día incluido en el período consultado. | `date` (`YYYY-MM-DD`) |
| `:fecha_fin_analisis` | Último día incluido en el período consultado. | `date` (`YYYY-MM-DD`) |
| `:fecha_inicio_periodo_anterior` / `:fecha_fin_periodo_anterior` | Límites del período anterior, de igual duración y adyacente al actual. | `date` |
| `:codigo_sucursal_sap` / `:id_sucursal` | Identificador SAP o UUID de la sucursal, según la consulta. | `text` / `uuid` |
| `:id_producto` / `:id_gondola` | Identificador interno del producto o de la góndola. | `uuid` |
| `:ids_marcas_autorizadas` / `:id_proveedor_autenticado` | Alcance de seguridad aplicado a Marca Propia o Proveedores. | `uuid[]` / `uuid` |
| `:limite_resultados` / `:desplazamiento_paginacion` | Control de paginación. | `integer` |
| `{{predicado_*}}` | Fragmento SQL generado únicamente a partir de filtros validados del backend. | Fragmento SQL controlado |
| `{{columna_importe_segun_igv}}` | Columna que alterna entre importe con IGV o sin IGV. | Identificador SQL controlado |

## categoryAnalysisRouter.ts

### 1. getCategoryTree — consulta 1

**Origen:** `server/categoryAnalysisRouter.ts:104`  
**Propósito:** Construye la jerarquía Departamento → Sección → Familia disponible en ventas.  
**Tablas o CTEs relevantes:** consulta de utilería sin tabla de negocio.  
**Parámetros / fragmentos variables:** `{{cte_jerarquia_categorias}}`.

```sql
WITH {{cte_jerarquia_categorias}}
        SELECT DISTINCT
          dept_id,
          dept_name,
          seccion_id,
          seccion_name,
          leaf_category_id AS familia_id,
          leaf_name        AS familia_name
        FROM cp_hier
        ORDER BY dept_name, seccion_name, leaf_name
```

### 2. getCategoryLineChart — consulta 2

**Origen:** `server/categoryAnalysisRouter.ts:222`  
**Propósito:** Agrega importe y unidades por período para la categoría filtrada.  
**Tablas o CTEs relevantes:** `branches`, `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `{{expresion_granularidad_temporal}}`, `{{columna_importe_segun_igv}}`, `{{cte_jerarquia_categorias}}`, `{{predicado_sucursal}}`, `{{predicado_categoria}}`, `:id_cabecera_venta`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`.

```sql
WITH {{cte_jerarquia_categorias}}
          SELECT
            {{expresion_granularidad_temporal}}                AS period,
            SUM({{columna_importe_segun_igv}})              AS amount,
            SUM(sd.quantity)            AS quantity
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          JOIN products p      ON p.id = sd.product_id
          JOIN cp_hier         ON cp_hier.product_id = p.id
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date >= :fecha_inicio_analisis::date
            AND sh.doc_date <  (:fecha_fin_analisis::date + INTERVAL '1 day')
            {{predicado_sucursal}}
            {{predicado_categoria}}
          GROUP BY period
          ORDER BY period ASC
```

### 3. getCategoryPieBreakdown — consulta 3

**Origen:** `server/categoryAnalysisRouter.ts:306`  
**Propósito:** Distribuye ventas entre las subcategorías inmediatas de la categoría seleccionada.  
**Tablas o CTEs relevantes:** `branches`, `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `{{columna_importe_segun_igv}}`, `{{cte_jerarquia_categorias}}`, `{{columna_categoria_agrupacion}}`, `{{columna_nombre_categoria_agrupacion}}`, `{{predicado_sucursal}}`, `{{predicado_categoria_padre}}`, `:id_cabecera_venta`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`.

```sql
WITH {{cte_jerarquia_categorias}}
          SELECT
            {{columna_categoria_agrupacion}}        AS category_id,
            {{columna_nombre_categoria_agrupacion}}         AS category_name,
            SUM({{columna_importe_segun_igv}})     AS amount,
            SUM(sd.quantity)   AS quantity
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          JOIN products p      ON p.id = sd.product_id
          JOIN cp_hier         ON cp_hier.product_id = p.id
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date >= :fecha_inicio_analisis::date
            AND sh.doc_date <  (:fecha_fin_analisis::date + INTERVAL '1 day')
            {{predicado_sucursal}}
            {{predicado_categoria_padre}}
          GROUP BY {{columna_categoria_agrupacion}}, {{columna_nombre_categoria_agrupacion}}
          ORDER BY amount DESC
```

### 4. getCategoryEvolution — consulta 4

**Origen:** `server/categoryAnalysisRouter.ts:401`  
**Propósito:** Devuelve la evolución temporal por producto, tienda o ambas dimensiones.  
**Tablas o CTEs relevantes:** `branches`, `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `{{expresion_granularidad_temporal}}`, `{{columna_importe_segun_igv}}`, `{{cte_jerarquia_categorias}}`, `{{dimension_producto_opcional}}`, `{{dimension_tienda_opcional}}`, `{{columnas_agrupacion}}`, `{{predicado_sucursal}}`, `{{predicado_categoria}}`, `:id_cabecera_venta`, `:ordenamiento_por_producto_opcional`, `:ordenamiento_por_tienda_opcional`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`.

```sql
WITH {{cte_jerarquia_categorias}}
          SELECT
            {{expresion_granularidad_temporal}}             AS period,
            {{dimension_producto_opcional}}
            {{dimension_tienda_opcional}}
            SUM({{columna_importe_segun_igv}})           AS amount,
            SUM(sd.quantity)         AS quantity
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          JOIN products p      ON p.id = sd.product_id
          JOIN cp_hier         ON cp_hier.product_id = p.id
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date >= :fecha_inicio_analisis::date
            AND sh.doc_date <  (:fecha_fin_analisis::date + INTERVAL '1 day')
            {{predicado_sucursal}}
            {{predicado_categoria}}
          GROUP BY {{columnas_agrupacion}}
          ORDER BY period ASC, {{ordenamiento_por_producto_opcional}} {{ordenamiento_por_tienda_opcional}}
```

### 5. getBranchCatalog — consulta 5

**Origen:** `server/categoryAnalysisRouter.ts:445`  
**Propósito:** Obtiene el catálogo de sucursales sin depender de ventas existentes.  
**Tablas o CTEs relevantes:** `branches`.  
**Parámetros / fragmentos variables:** ninguno.

```sql
SELECT
           id,
           name,
           sap_id,
           address
         FROM branches
         ORDER BY
           NULLIF(regexp_replace(sap_id, '[^0-9]', '', 'g'), '')::int NULLS LAST,
           name ASC
```

## db.ts

### 1. consulta_auxiliar — consulta 1

**Origen:** `server/db.ts:294`  
**Propósito:** Consulta de soporte ejecutada por el backend para el flujo indicado.  
**Tablas o CTEs relevantes:** `suppliers`.  
**Parámetros / fragmentos variables:** `{{lista_ids_solicitados}}`.

```sql
SELECT id::text, ruc, name FROM public.suppliers WHERE id::text IN ({{lista_ids_solicitados}})
```

### 2. consulta_auxiliar — consulta 2

**Origen:** `server/db.ts:538`  
**Propósito:** Consulta de soporte ejecutada por el backend para el flujo indicado.  
**Tablas o CTEs relevantes:** `suppliers`.  
**Parámetros / fragmentos variables:** `{{lista_ids_solicitados}}`.

```sql
SELECT id::text, ruc, name FROM public.suppliers WHERE id::text IN ({{lista_ids_solicitados}})
```

## dbConnectionsRouter.ts

### 1. testConnection — consulta 1

**Origen:** `server/dbConnectionsRouter.ts:291`  
**Propósito:** Consulta de soporte ejecutada por el backend para el flujo indicado.  
**Tablas o CTEs relevantes:** consulta de utilería sin tabla de negocio.  
**Parámetros / fragmentos variables:** ninguno.

```sql
SELECT version()
```

## ownBrandRouter.ts

### 1. listBrands — consulta 1

**Origen:** `server/ownBrandRouter.ts:191`  
**Propósito:** Lista únicamente las marcas autorizadas para el usuario de marca propia.  
**Tablas o CTEs relevantes:** `brands`.  
**Parámetros / fragmentos variables:** `{{lista_ids_solicitados}}`.

```sql
SELECT id, name FROM public.brands WHERE id IN ({{lista_ids_solicitados}}) ORDER BY name ASC
```

### 2. listAllBrands — consulta 2

**Origen:** `server/ownBrandRouter.ts:209`  
**Propósito:** Lista el catálogo general de marcas disponibles para administración.  
**Tablas o CTEs relevantes:** `brands`.  
**Parámetros / fragmentos variables:** ninguno.

```sql
SELECT id, name FROM public.brands ORDER BY name ASC LIMIT 1000
```

### 3. getSalesSummary — consulta 3

**Origen:** `server/ownBrandRouter.ts:280`  
**Propósito:** Resume ventas, tickets, unidades, productos y tiendas de las marcas autorizadas.  
**Tablas o CTEs relevantes:** `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{columna_importe_segun_igv}}`, `{{predicado_marcas_autorizadas}}`, `:id_cabecera_venta`, `{{predicados_filtros_seleccionados}}`.

```sql
SELECT
             COUNT(DISTINCT sh.id)::int                    AS total_tickets,
             COUNT(DISTINCT p.id)::int                     AS productos_vendidos,
             ROUND(SUM({{columna_importe_segun_igv}})::numeric, 2)              AS total_ventas,
             ROUND(SUM(sd.quantity)::numeric, 2)           AS total_unidades,
             COUNT(DISTINCT sh.branch_id)::int             AS tiendas_activas
           FROM public.sales_detail sd
           JOIN public.products p ON p.id = sd.product_id
           JOIN public.sales_header sh ON sh.id = sd.header_id
           WHERE 1=1 {{predicado_marcas_autorizadas}}
             {{predicados_filtros_seleccionados}}
             AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
```

### 4. getDailySales — consulta 4

**Origen:** `server/ownBrandRouter.ts:334`  
**Propósito:** Agrega ventas de marca propia por día.  
**Tablas o CTEs relevantes:** `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{columna_importe_segun_igv}}`, `{{predicado_marcas_autorizadas}}`, `:id_cabecera_venta`, `{{predicados_filtros_seleccionados}}`.

```sql
SELECT
             sh.doc_date::date                             AS fecha,
             ROUND(SUM({{columna_importe_segun_igv}})::numeric, 2)              AS total_ventas,
             COUNT(DISTINCT sh.id)::int                    AS tickets,
             ROUND(SUM(sd.quantity)::numeric, 2)           AS unidades
           FROM public.sales_detail sd
           JOIN public.products p ON p.id = sd.product_id
           JOIN public.sales_header sh ON sh.id = sd.header_id
           WHERE 1=1 {{predicado_marcas_autorizadas}}
             {{predicados_filtros_seleccionados}}
             AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
           GROUP BY sh.doc_date::date
           ORDER BY fecha ASC
```

### 5. getTopProducts — consulta 5

**Origen:** `server/ownBrandRouter.ts:384`  
**Propósito:** Obtiene rankings de productos por unidades y por importe, junto con cobertura de stock.  
**Tablas o CTEs relevantes:** `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:limite_resultados`, `{{columna_importe_segun_igv}}`, `{{predicado_marcas_autorizadas}}`, `:id_cabecera_venta`, `{{predicados_filtros_seleccionados}}`.

```sql
SELECT
             p.name                                        AS producto,
             p.int_sku,
             ROUND(SUM({{columna_importe_segun_igv}})::numeric, 2)              AS total_ventas,
             ROUND(SUM(sd.quantity)::numeric, 2)           AS unidades_vendidas,
             COUNT(DISTINCT sh.id)::int                    AS tickets
           FROM public.sales_detail sd
           JOIN public.products p ON p.id = sd.product_id
           JOIN public.sales_header sh ON sh.id = sd.header_id
           WHERE 1=1 {{predicado_marcas_autorizadas}}
             {{predicados_filtros_seleccionados}}
             AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
           GROUP BY p.id, p.name, p.int_sku
           ORDER BY total_ventas DESC
           LIMIT :limite_resultados
```

### 6. getSalesByBranch — consulta 6

**Origen:** `server/ownBrandRouter.ts:435`  
**Propósito:** Agrega ventas de marca propia por sucursal.  
**Tablas o CTEs relevantes:** `branches`, `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{columna_importe_segun_igv}}`, `{{predicado_marcas_autorizadas}}`, `:id_cabecera_venta`, `{{predicados_filtros_seleccionados}}`.

```sql
SELECT
             b.name                                        AS tienda,
             b.sap_id,
             ROUND(SUM({{columna_importe_segun_igv}})::numeric, 2)              AS total_ventas,
             ROUND(SUM(sd.quantity)::numeric, 2)           AS unidades,
             COUNT(DISTINCT sh.id)::int                    AS tickets
           FROM public.sales_detail sd
           JOIN public.products p ON p.id = sd.product_id
           JOIN public.sales_header sh ON sh.id = sd.header_id
           JOIN public.branches b ON b.id = sh.branch_id
           WHERE 1=1 {{predicado_marcas_autorizadas}}
             {{predicados_filtros_seleccionados}}
             AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
           GROUP BY b.id, b.name, b.sap_id
           ORDER BY total_ventas DESC
```

### 7. getMonthlySales — consulta 7

**Origen:** `server/ownBrandRouter.ts:468`  
**Propósito:** Agrega las ventas mensuales recientes de marca propia.  
**Tablas o CTEs relevantes:** `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `{{predicado_marcas_autorizadas}}`, `:id_cabecera_venta`.

```sql
SELECT
           TO_CHAR(sh.doc_date, 'YYYY-MM')                AS mes,
           ROUND(SUM(sd.total)::numeric, 2)               AS total_ventas,
           COUNT(DISTINCT sh.id)::int                     AS tickets,
           ROUND(SUM(sd.quantity)::numeric, 2)            AS unidades
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         WHERE 1=1 {{predicado_marcas_autorizadas}}
           AND sh.doc_date >= NOW() - INTERVAL '6 months'
         GROUP BY TO_CHAR(sh.doc_date, 'YYYY-MM')
         ORDER BY mes ASC
```

### 8. getSalesByCategory — consulta 8

**Origen:** `server/ownBrandRouter.ts:565`  
**Propósito:** Agrupa ventas de marca propia por categoría configurada.  
**Tablas o CTEs relevantes:** `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:ids_marcas_autorizadas`, `{{columna_importe_segun_igv}}`, `{{expresion_categoria_marca_propia}}`, `:id_cabecera_venta`.

```sql
SELECT
             {{expresion_categoria_marca_propia}} AS category_id,
             ROUND(SUM({{columna_importe_segun_igv}})::numeric, 2) AS total_ventas,
             ROUND(SUM(sd.quantity)::numeric, 2)  AS total_unidades
           FROM public.sales_detail sd
           JOIN public.products p ON p.id = sd.product_id
           JOIN public.sales_header sh ON sh.id = sd.header_id
           WHERE p.brand_id = ANY(:ids_marcas_autorizadas::uuid[])
             AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
           GROUP BY {{expresion_categoria_marca_propia}}
           HAVING {{expresion_categoria_marca_propia}} IS NOT NULL AND SUM({{columna_importe_segun_igv}}) > 0
```

### 9. getBranchesForStock — consulta 9

**Origen:** `server/ownBrandRouter.ts:616`  
**Propósito:** Lista sucursales con stock para las marcas autorizadas.  
**Tablas o CTEs relevantes:** `branches`, `products`, `stocks`.  
**Parámetros / fragmentos variables:** `{{predicado_marcas_autorizadas}}`.

```sql
SELECT DISTINCT b.id, b.name, b.sap_id
         FROM public.stocks st
         JOIN public.products p ON p.id = st.product_id
         JOIN public.branches b ON b.id = st.branch_id
         WHERE 1=1 {{predicado_marcas_autorizadas}}
           AND st.stock > 0
         ORDER BY b.sap_id ASC
```

### 10. getBranchesForSales — consulta 10

**Origen:** `server/ownBrandRouter.ts:641`  
**Propósito:** Lista sucursales con ventas de las marcas autorizadas.  
**Tablas o CTEs relevantes:** `branches`, `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `{{predicado_marcas_autorizadas}}`, `:id_cabecera_venta`.

```sql
SELECT DISTINCT b.id, b.name, b.sap_id
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         JOIN public.branches b ON b.id = sh.branch_id
         WHERE 1=1 {{predicado_marcas_autorizadas}}
         ORDER BY b.sap_id ASC
         LIMIT 500
```

### 11. getStockByProduct — consulta 11

**Origen:** `server/ownBrandRouter.ts:704`  
**Propósito:** Devuelve el stock por producto y sucursal, con paginación.  
**Tablas o CTEs relevantes:** `branches`, `products`, `stocks`.  
**Parámetros / fragmentos variables:** `:limite_resultados`, `:desplazamiento_paginacion`, `:id_producto`, `{{predicado_sucursal}}`, `{{validacion_categoria_producto}}`, `:ids_marcas_autorizadas`.

```sql
SELECT
             p.name                                        AS producto,
             p.int_sku,
             b.id                                          AS branch_id,
             b.name                                        AS tienda,
             b.sap_id,
             COALESCE(st.stock, 0)                         AS stock_actual,
             st.min_stock
           FROM public.branches b
           CROSS JOIN (
             SELECT id, name, int_sku FROM public.products
             WHERE id = :id_producto AND brand_id = ANY(:ids_marcas_autorizadas::uuid[]) {{validacion_categoria_producto}}
           ) p
           LEFT JOIN public.stocks st ON st.product_id = p.id AND st.branch_id = b.id
           WHERE 1=1 {{predicado_sucursal}}
           ORDER BY b.sap_id ASC
           LIMIT :limite_resultados OFFSET :desplazamiento_paginacion
```

### 12. getStockByProduct — consulta 12

**Origen:** `server/ownBrandRouter.ts:732`  
**Propósito:** Devuelve el stock por producto y sucursal, con paginación.  
**Tablas o CTEs relevantes:** `branches`, `products`.  
**Parámetros / fragmentos variables:** `:id_producto`, `:ids_marcas_autorizadas`, `{{validacion_categoria_producto}}`, `{{predicado_sucursal_opcional}}`.

```sql
SELECT COUNT(*)::int AS total
FROM public.branches b
CROSS JOIN (
  SELECT id
  FROM public.products
  WHERE id = :id_producto
    AND brand_id = ANY(:ids_marcas_autorizadas::uuid[])
    {{validacion_categoria_producto}}
) p
WHERE 1 = 1
  {{predicado_sucursal_opcional}}
```

### 13. getStockByProduct — consulta 13

**Origen:** `server/ownBrandRouter.ts:766`  
**Propósito:** Devuelve el stock por producto y sucursal, con paginación.  
**Tablas o CTEs relevantes:** `branches`, `products`, `stocks`.  
**Parámetros / fragmentos variables:** `:limite_resultados`, `:desplazamiento_paginacion`, `{{predicado_marcas_autorizadas}}`, `{{predicados_stock_adicionales}}`.

```sql
SELECT
           p.name                                        AS producto,
           p.int_sku,
           b.id                                          AS branch_id,
           b.name                                        AS tienda,
           b.sap_id,
           st.stock                                      AS stock_actual,
           st.min_stock
         FROM public.stocks st
         JOIN public.products p ON p.id = st.product_id
         JOIN public.branches b ON b.id = st.branch_id
         WHERE 1=1 {{predicado_marcas_autorizadas}}
           AND st.stock > 0
           {{predicados_stock_adicionales}}
         ORDER BY p.name ASC, b.sap_id ASC
         LIMIT :limite_resultados OFFSET :desplazamiento_paginacion
```

### 14. getStockByProduct — consulta 14

**Origen:** `server/ownBrandRouter.ts:798`  
**Propósito:** Devuelve el stock por producto y sucursal, con paginación.  
**Tablas o CTEs relevantes:** `branches`, `products`, `stocks`.  
**Parámetros / fragmentos variables:** `{{predicado_marcas_autorizadas}}`, `{{predicados_conteo_catalogo}}`.

```sql
SELECT COUNT(*)::int AS total
         FROM public.stocks st
         JOIN public.products p ON p.id = st.product_id
         JOIN public.branches b ON b.id = st.branch_id
         WHERE 1=1 {{predicado_marcas_autorizadas}}
           AND st.stock > 0
           {{predicados_conteo_catalogo}}
```

### 15. exportStockByProduct — consulta 15

**Origen:** `server/ownBrandRouter.ts:848`  
**Propósito:** Exporta el stock por producto y sucursal sin paginación de interfaz.  
**Tablas o CTEs relevantes:** `branches`, `products`, `stocks`.  
**Parámetros / fragmentos variables:** `:id_producto`, `{{predicado_sucursal}}`, `{{validacion_categoria_producto}}`, `:ids_marcas_autorizadas`.

```sql
SELECT
             p.name AS producto, p.int_sku, b.id AS branch_id, b.name AS tienda,
             b.sap_id, COALESCE(st.stock, 0) AS stock_actual, st.min_stock
           FROM public.branches b
           CROSS JOIN (
             SELECT id, name, int_sku FROM public.products
             WHERE id = :id_producto AND brand_id = ANY(:ids_marcas_autorizadas::uuid[]) {{validacion_categoria_producto}}
           ) p
           LEFT JOIN public.stocks st ON st.product_id = p.id AND st.branch_id = b.id
           WHERE 1=1 {{predicado_sucursal}}
           ORDER BY b.sap_id ASC
```

### 16. exportStockByProduct — consulta 16

**Origen:** `server/ownBrandRouter.ts:873`  
**Propósito:** Exporta el stock por producto y sucursal sin paginación de interfaz.  
**Tablas o CTEs relevantes:** `branches`, `products`, `stocks`.  
**Parámetros / fragmentos variables:** `{{predicado_marcas_autorizadas}}`, `{{predicados_stock_adicionales}}`.

```sql
SELECT
           p.name AS producto, p.int_sku, b.id AS branch_id, b.name AS tienda,
           b.sap_id, st.stock AS stock_actual, st.min_stock
         FROM public.stocks st
         JOIN public.products p ON p.id = st.product_id
         JOIN public.branches b ON b.id = st.branch_id
         WHERE 1=1 {{predicado_marcas_autorizadas}}
           AND st.stock > 0
           {{predicados_stock_adicionales}}
         ORDER BY p.name ASC, b.sap_id ASC
```

### 17. getReceptions — consulta 17

**Origen:** `server/ownBrandRouter.ts:920`  
**Propósito:** Lista recepciones de productos de marca propia con paginación.  
**Tablas o CTEs relevantes:** `branches`, `products`, `receptions`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:limite_resultados`, `:desplazamiento_paginacion`, `{{predicado_marcas_autorizadas}}`.

```sql
SELECT
               r.oc,
               r.date::date                                  AS fecha,
               b.name                                        AS tienda,
               b.sap_id,
               p.name                                        AS producto,
               p.int_sku,
               r.ordered_quantity,
               r.received_quantity,
               r.status
             FROM public.receptions r
             JOIN public.products p ON p.id = r.product_id
             JOIN public.branches b ON b.id = r.branch_id
             WHERE 1=1 {{predicado_marcas_autorizadas}}
               AND r.date >= :fecha_inicio_analisis::date AND r.date < (:fecha_fin_analisis::date + INTERVAL '1 day')
             ORDER BY r.date DESC
             LIMIT :limite_resultados OFFSET :desplazamiento_paginacion
```

### 18. getReceptions — consulta 18

**Origen:** `server/ownBrandRouter.ts:940`  
**Propósito:** Lista recepciones de productos de marca propia con paginación.  
**Tablas o CTEs relevantes:** `products`, `receptions`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{predicado_marcas_autorizadas}}`.

```sql
SELECT COUNT(*)::int AS total
             FROM public.receptions r
             JOIN public.products p ON p.id = r.product_id
             WHERE 1=1 {{predicado_marcas_autorizadas}}
               AND r.date >= :fecha_inicio_analisis::date AND r.date < (:fecha_fin_analisis::date + INTERVAL '1 day')
```

### 19. getProductCatalog — consulta 19

**Origen:** `server/ownBrandRouter.ts:999`  
**Propósito:** Obtiene el catálogo de productos de marca propia y su stock consolidado.  
**Tablas o CTEs relevantes:** `products`, `stocks`.  
**Parámetros / fragmentos variables:** `:limite_resultados`, `:desplazamiento_paginacion`, `{{predicado_marcas_autorizadas}}`, `{{predicados_catalogo_producto}}`.

```sql
SELECT
           p.id,
           p.name,
           p.int_sku,
           p.short_description                           AS description,
           COALESCE(SUM(st.stock), 0)::int              AS stock_total,
           COUNT(DISTINCT st.branch_id)::int             AS tiendas_con_stock
         FROM public.products p
         LEFT JOIN public.stocks st ON st.product_id = p.id AND st.stock > 0
         WHERE 1=1 {{predicado_marcas_autorizadas}}
           {{predicados_catalogo_producto}}
         GROUP BY p.id, p.name, p.int_sku, p.short_description
         ORDER BY p.name ASC
         LIMIT :limite_resultados OFFSET :desplazamiento_paginacion
```

### 20. getProductCatalog — consulta 20

**Origen:** `server/ownBrandRouter.ts:1025`  
**Propósito:** Obtiene el catálogo de productos de marca propia y su stock consolidado.  
**Tablas o CTEs relevantes:** `products`.  
**Parámetros / fragmentos variables:** `{{predicado_marcas_autorizadas}}`, `{{predicados_conteo_catalogo}}`.

```sql
SELECT COUNT(*)::int AS total
         FROM public.products p
         WHERE 1=1 {{predicado_marcas_autorizadas}}
           {{predicados_conteo_catalogo}}
```

### 21. getSalesByProductBranch — consulta 21

**Origen:** `server/ownBrandRouter.ts:1115`  
**Propósito:** Agrega ventas por producto y tienda, con totales y paginación en una sola consulta.  
**Tablas o CTEs relevantes:** `branches`, `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:limite_resultados`, `:desplazamiento_paginacion`, `{{columna_importe_segun_igv}}`, `{{predicado_marcas_autorizadas}}`, `{{dimension_producto_opcional}}`, `{{dimension_tienda_opcional}}`, `{{columnas_agrupacion_dimension}}`, `:id_cabecera_venta`, `{{predicados_filtros_seleccionados}}`.

```sql
WITH base AS (
           SELECT
             {{dimension_producto_opcional}}
             {{dimension_tienda_opcional}}
             SUM(sd.quantity)::numeric                     AS cantidad,
             ROUND(SUM({{columna_importe_segun_igv}})::numeric, 2)              AS monto,
             COUNT(DISTINCT sh.id)::int                    AS tickets
           FROM public.sales_detail sd
           JOIN public.products p ON p.id = sd.product_id
           JOIN public.sales_header sh ON sh.id = sd.header_id
           JOIN public.branches b ON b.id = sh.branch_id
           WHERE 1=1 {{predicado_marcas_autorizadas}}
             AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
             {{predicados_filtros_seleccionados}}
           GROUP BY {{columnas_agrupacion_dimension}}
         ),
         totals AS (
           SELECT
             SUM(cantidad)::numeric                        AS total_cantidad,
             ROUND(SUM(monto)::numeric, 2)                 AS total_monto,
             SUM(tickets)::int                             AS total_tickets,
             COUNT(*)::int                                 AS total_rows
           FROM base
         )
         SELECT
           b.*,
           t.total_cantidad,
           t.total_monto,
           t.total_tickets,
           t.total_rows
         FROM base b
         CROSS JOIN totals t
         ORDER BY monto DESC
         LIMIT :limite_resultados OFFSET :desplazamiento_paginacion
```

### 22. getSalesDailyDetail — consulta 22

**Origen:** `server/ownBrandRouter.ts:1196`  
**Propósito:** Obtiene la evolución diaria de un producto en una tienda.  
**Tablas o CTEs relevantes:** `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:id_producto`, `:id_sucursal`, `{{predicado_marcas_autorizadas}}`, `:id_cabecera_venta`.

```sql
SELECT
             sh.doc_date::date                             AS fecha,
             SUM(sd.quantity)::numeric                     AS cantidad,
             ROUND(SUM(sd.total)::numeric, 2)              AS monto,
             COUNT(DISTINCT sh.id)::int                    AS tickets
           FROM public.sales_detail sd
           JOIN public.sales_header sh ON sh.id = sd.header_id
           JOIN public.products p ON p.id = sd.product_id
           WHERE 1=1 {{predicado_marcas_autorizadas}}
             AND sd.product_id = :id_producto
             AND sh.branch_id = :id_sucursal
             AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
           GROUP BY sh.doc_date::date
           ORDER BY fecha ASC
```

### 23. exportSalesByProductBranch — consulta 23

**Origen:** `server/ownBrandRouter.ts:1277`  
**Propósito:** Exporta las ventas por producto y tienda.  
**Tablas o CTEs relevantes:** `branches`, `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{columna_importe_segun_igv}}`, `{{predicado_marcas_autorizadas}}`, `{{dimension_producto_opcional}}`, `{{dimension_tienda_opcional}}`, `{{columnas_agrupacion_dimension}}`, `:id_cabecera_venta`, `{{predicados_filtros_seleccionados}}`.

```sql
SELECT
           {{dimension_producto_opcional}}
           {{dimension_tienda_opcional}}
           SUM(sd.quantity)::numeric                     AS cantidad,
           ROUND(SUM({{columna_importe_segun_igv}})::numeric, 2)              AS monto,
           COUNT(DISTINCT sh.id)::int                    AS tickets
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         JOIN public.branches b ON b.id = sh.branch_id
         WHERE 1=1 {{predicado_marcas_autorizadas}}
           AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
           {{predicados_filtros_seleccionados}}
         GROUP BY {{columnas_agrupacion_dimension}}
         ORDER BY monto DESC
         LIMIT 10000
```

### 24. getProductsForBrand — consulta 24

**Origen:** `server/ownBrandRouter.ts:1313`  
**Propósito:** Lista productos disponibles para las marcas autorizadas.  
**Tablas o CTEs relevantes:** `products`.  
**Parámetros / fragmentos variables:** `{{predicado_marcas_autorizadas}}`.

```sql
SELECT DISTINCT
           p.id,
           p.name,
           p.int_sku::text AS sku
         FROM public.products p
         WHERE 1=1 {{predicado_marcas_autorizadas}}
         ORDER BY p.name ASC
         LIMIT 2000
```

### 25. getSalesEvolution — consulta 25

**Origen:** `server/ownBrandRouter.ts:1398`  
**Propósito:** Devuelve una serie temporal de ventas para marca propia.  
**Tablas o CTEs relevantes:** `branches`, `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{expresion_granularidad_temporal}}`, `{{columna_importe_segun_igv}}`, `{{predicado_marcas_autorizadas}}`, `{{dimension_producto_opcional}}`, `{{dimension_tienda_opcional}}`, `{{columnas_agrupacion}}`, `:id_cabecera_venta`, `:ordenamiento_por_producto_opcional`, `:ordenamiento_por_tienda_opcional`, `{{predicados_filtros_seleccionados}}`.

```sql
SELECT
          {{expresion_granularidad_temporal}} AS period,
          {{dimension_producto_opcional}}
          {{dimension_tienda_opcional}}
          SUM({{columna_importe_segun_igv}}) AS amount,
          SUM(sd.quantity) AS quantity
        FROM public.sales_header sh
        JOIN public.sales_detail sd ON sd.header_id = sh.id
        JOIN public.products p ON p.id = sd.product_id
        LEFT JOIN public.branches b ON b.id = sh.branch_id
        WHERE sh.doc_date IS NOT NULL
          AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
          {{predicado_marcas_autorizadas}}
          {{predicados_filtros_seleccionados}}
        GROUP BY {{columnas_agrupacion}}
        ORDER BY period ASC, {{ordenamiento_por_producto_opcional}} {{ordenamiento_por_tienda_opcional}}
```

## postgres.ts

### 1. consulta_auxiliar — consulta 1

**Origen:** `server/postgres.ts:107`  
**Propósito:** Consulta de soporte ejecutada por el backend para el flujo indicado.  
**Tablas o CTEs relevantes:** `brands`, `products`.  
**Parámetros / fragmentos variables:** ninguno.

```sql
SELECT p.id, p.name, p.sku, p.brand_id, b.name AS brand_name
        FROM products p
        LEFT JOIN brands b ON b.id = p.brand_id
```

### 2. consulta_auxiliar — consulta 2

**Origen:** `server/postgres.ts:114`  
**Propósito:** Consulta de soporte ejecutada por el backend para el flujo indicado.  
**Tablas o CTEs relevantes:** `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_carga_cache`.

```sql
SELECT id, doc_date, branch_id, total, subtotal
        FROM sales_header
        WHERE doc_date >= :fecha_inicio_carga_cache::date
```

### 3. consulta_auxiliar — consulta 3

**Origen:** `server/postgres.ts:122`  
**Propósito:** Consulta de soporte ejecutada por el backend para el flujo indicado.  
**Tablas o CTEs relevantes:** `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:id_cabecera_venta`, `:fecha_inicio_carga_cache`, `:fecha_fin_carga_cache`.

```sql
SELECT sd.id, sd.header_id, sd.product_id, sd.total, sd.subtotal, sd.quantity,
               p.brand_id
        FROM sales_header sh
        JOIN sales_detail sd ON sd.header_id = sh.id
        JOIN products p ON p.id = sd.product_id
        WHERE sh.doc_date >= :fecha_inicio_carga_cache::date
          AND sh.doc_date < (:fecha_fin_carga_cache::date + INTERVAL '1 day')
        LIMIT 200000
```

### 4. consulta_auxiliar — consulta 4

**Origen:** `server/postgres.ts:134`  
**Propósito:** Consulta de soporte ejecutada por el backend para el flujo indicado.  
**Tablas o CTEs relevantes:** `branches`.  
**Parámetros / fragmentos variables:** ninguno.

```sql
SELECT id, name, sap_id FROM branches
```

### 5. consulta_auxiliar — consulta 5

**Origen:** `server/postgres.ts:135`  
**Propósito:** Consulta de soporte ejecutada por el backend para el flujo indicado.  
**Tablas o CTEs relevantes:** `categories`.  
**Parámetros / fragmentos variables:** ninguno.

```sql
SELECT id, name, parent_category_id FROM categories LIMIT 5000
```

### 6. consulta_auxiliar — consulta 6

**Origen:** `server/postgres.ts:140`  
**Propósito:** Consulta de soporte ejecutada por el backend para el flujo indicado.  
**Tablas o CTEs relevantes:** `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:id_cabecera_venta`, `:fecha_inicio_carga_cache`, `:fecha_fin_carga_cache`.

```sql
SELECT sh.id, sh.doc_date, sd.product_id, p.brand_id
        FROM sales_header sh
        JOIN sales_detail sd ON sd.header_id = sh.id
        JOIN products p ON p.id = sd.product_id
        WHERE sh.doc_date >= :fecha_inicio_carga_cache::date
          AND sh.doc_date < (:fecha_fin_carga_cache::date + INTERVAL '1 day')
        LIMIT 50000
```

## salesRouter.ts

### 1. getAggregatedSales — consulta 1

**Origen:** `server/salesRouter.ts:52`  
**Propósito:** Agrega ventas por fecha, sucursal, canal y categoría para el tablero general.  
**Tablas o CTEs relevantes:** `branches`, `categories`, `categories_products`, `methods_payment`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{columna_importe_segun_igv}}`, `{{predicados_filtros_adicionales}}`, `:id_cabecera_venta`, `:codigo_sucursal_sap`.

```sql
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
          WHERE sh.doc_date >= '{{fecha_inicio_analisis}}'::date
            AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
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
            {{columna_importe_segun_igv}} AS line_total,
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
          {{predicados_filtros_adicionales}}
        GROUP BY
          doc_date::date, branch_id, branch_sap_id,
          branch_name, branch_address,
          sales_channel,
          category_abuelo_id, category_abuelo_name
        ORDER BY doc_date, CAST(SUBSTRING(branch_sap_id FROM '[0-9]+') AS INTEGER), category_abuelo_name;
```

### 2. getHourlySales — consulta 2

**Origen:** `server/salesRouter.ts:190`  
**Propósito:** Agrega ventas por hora, sucursal y canal para el análisis horario.  
**Tablas o CTEs relevantes:** `branches`, `methods_payment`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{columna_importe_segun_igv}}`, `{{predicados_filtros_adicionales}}`, `:id_cabecera_venta`, `:codigo_sucursal_sap`.

```sql
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
          WHERE sh.doc_date >= '{{fecha_inicio_analisis}}'::date
            AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
            AND sh.doc_date IS NOT NULL
        )
        SELECT
          date_trunc('hour', fh.doc_date) AS hour_ts,
          fh.branch_id,
          fh.branch_sap_id,
          fh.branch_name,
          fh.branch_address,
          fh.sales_channel,
          SUM({{columna_importe_segun_igv}}) AS sales_amount,
          COUNT(DISTINCT fh.id) AS tickets_count
        FROM filtered_headers fh
        JOIN sales_detail sd ON sd.header_id = fh.id
        WHERE 1=1
          {{predicados_filtros_adicionales}}
        GROUP BY
          hour_ts, fh.branch_id, fh.branch_sap_id,
          fh.branch_name, fh.branch_address,
          fh.sales_channel
        ORDER BY hour_ts, CAST(SUBSTRING(fh.branch_sap_id FROM '[0-9]+') AS INTEGER);
```

### 3. getAggregatedComparison — consulta 3

**Origen:** `server/salesRouter.ts:311`  
**Propósito:** Compara ventas y tickets entre el período vigente y el período equivalente anterior.  
**Tablas o CTEs relevantes:** `branches`, `categories`, `categories_products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:fecha_inicio_periodo_anterior`, `:fecha_fin_periodo_anterior`, `{{columna_importe_segun_igv}}`, `{{predicados_filtros_adicionales}}`, `:id_cabecera_venta`, `:codigo_sucursal_sap`.

```sql
WITH filtered_headers AS (
          SELECT
            sh.id,
            sh.doc_date,
            sh.branch_id,
            b.sap_id AS branch_sap_id,
            CASE
              WHEN sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
                THEN 'current'
              WHEN sh.doc_date >= '{{fecha_inicio_periodo_anterior}}'::date AND sh.doc_date < ('{{fecha_fin_periodo_anterior}}'::date + INTERVAL '1 day')
                THEN 'previous'
            END AS period
          FROM sales_header sh
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND (
              (sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day'))
              OR (sh.doc_date >= '{{fecha_inicio_periodo_anterior}}'::date AND sh.doc_date < ('{{fecha_fin_periodo_anterior}}'::date + INTERVAL '1 day'))
            )
            {{predicados_filtros_adicionales}}
        ),
        agg_detail AS (
          SELECT
            sd.header_id,
            SUM({{columna_importe_segun_igv}}) AS line_total,
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
          {{predicados_filtros_adicionales}}
        GROUP BY fh.period;
```

### 4. getHourlyComparison — consulta 4

**Origen:** `server/salesRouter.ts:436`  
**Propósito:** Compara las ventas por hora entre el período vigente y el período anterior.  
**Tablas o CTEs relevantes:** `branches`, `methods_payment`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:fecha_inicio_periodo_anterior`, `:fecha_fin_periodo_anterior`, `{{columna_importe_segun_igv}}`, `{{predicados_filtros_adicionales}}`, `{{predicado_canal_venta}}`, `:id_cabecera_venta`.

```sql
WITH base AS (
          SELECT
            sh.id AS sale_id,
            sh.doc_date,
            sh.branch_id,
            {{columna_importe_segun_igv}} AS line_total,
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
              WHEN sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
                THEN 'current'
              WHEN sh.doc_date >= '{{fecha_inicio_periodo_anterior}}'::date AND sh.doc_date < ('{{fecha_fin_periodo_anterior}}'::date + INTERVAL '1 day')
                THEN 'previous'
              ELSE NULL
            END AS period
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND (
              (sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day'))
              OR (sh.doc_date >= '{{fecha_inicio_periodo_anterior}}'::date AND sh.doc_date < ('{{fecha_fin_periodo_anterior}}'::date + INTERVAL '1 day'))
            )
            {{predicados_filtros_adicionales}}
        )
        SELECT
          period,
          SUM(line_total) AS total_sales,
          COUNT(DISTINCT sale_id) AS total_tickets
        FROM base
        WHERE period IS NOT NULL
          {{predicado_canal_venta}}
        GROUP BY period;
```

### 5. getBranchComparison — consulta 5

**Origen:** `server/salesRouter.ts:560`  
**Propósito:** Compara resultados por sucursal entre dos períodos consecutivos.  
**Tablas o CTEs relevantes:** `branches`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:fecha_inicio_periodo_anterior`, `:fecha_fin_periodo_anterior`, `{{columna_importe_segun_igv}}`, `{{predicado_categoria}}`, `:join_jerarquia_categoria_opcional`, `:id_cabecera_venta`, `:codigo_sucursal_sap`.

```sql
WITH filtered_headers AS (
          SELECT
            sh.id,
            sh.doc_date,
            sh.branch_id,
            INITCAP(LOWER(COALESCE(b.name,''))) AS branch_name,
            b.sap_id AS branch_sap_id,
            CASE
              WHEN sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
                THEN 'current'
              WHEN sh.doc_date >= '{{fecha_inicio_periodo_anterior}}'::date AND sh.doc_date < ('{{fecha_fin_periodo_anterior}}'::date + INTERVAL '1 day')
                THEN 'previous'
            END AS period
          FROM sales_header sh
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND (
              (sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day'))
              OR (sh.doc_date >= '{{fecha_inicio_periodo_anterior}}'::date AND sh.doc_date < ('{{fecha_fin_periodo_anterior}}'::date + INTERVAL '1 day'))
            )
        ),
        agg_detail AS (
          SELECT sd.header_id, SUM({{columna_importe_segun_igv}}) AS line_total
          FROM sales_detail sd
          INNER JOIN filtered_headers fh ON fh.id = sd.header_id
          {{join_jerarquia_categoria_opcional}}
          WHERE 1=1 {{predicado_categoria}}
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
```

### 6. getCategoryComparison — consulta 6

**Origen:** `server/salesRouter.ts:693`  
**Propósito:** Compara resultados por categoría entre dos períodos consecutivos.  
**Tablas o CTEs relevantes:** `branches`, `categories`, `categories_products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:fecha_inicio_periodo_anterior`, `:fecha_fin_periodo_anterior`, `{{columna_importe_segun_igv}}`, `{{predicados_filtros_adicionales}}`, `:id_cabecera_venta`.

```sql
WITH filtered_headers AS (
          SELECT
            sh.id,
            sh.doc_date,
            sh.branch_id,
            CASE
              WHEN sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
                THEN 'current'
              WHEN sh.doc_date >= '{{fecha_inicio_periodo_anterior}}'::date AND sh.doc_date < ('{{fecha_fin_periodo_anterior}}'::date + INTERVAL '1 day')
                THEN 'previous'
            END AS period
          FROM sales_header sh
          WHERE sh.doc_date IS NOT NULL
            AND (
              (sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day'))
              OR (sh.doc_date >= '{{fecha_inicio_periodo_anterior}}'::date AND sh.doc_date < ('{{fecha_fin_periodo_anterior}}'::date + INTERVAL '1 day'))
            )
        ),
        base AS (
          SELECT
            fh.id AS sale_id,
            fh.period,
            {{columna_importe_segun_igv}} AS line_total,
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
            {{predicados_filtros_adicionales}}
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
```

### 7. getTopProducts — consulta 7

**Origen:** `server/salesRouter.ts:835`  
**Propósito:** Obtiene rankings de productos por unidades y por importe, junto con cobertura de stock.  
**Tablas o CTEs relevantes:** `branches`, `categories`, `categories_products`, `products`, `sales_detail`, `sales_header`, `stocks`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{columna_importe_segun_igv}}`, `{{predicado_sucursal}}`, `{{predicado_sucursal_para_stock}}`, `{{predicado_categoria}}`, `:cantidad_dias_periodo`, `:id_cabecera_venta`, `:codigo_sucursal_sap`.

```sql
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
            {{columna_importe_segun_igv}}                                 AS amount
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
            AND sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
            {{predicado_sucursal}}
            {{predicado_categoria}}
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
            {{predicado_sucursal_para_stock}}
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
          ROUND((a.total_qty::numeric / {{cantidad_dias_periodo}}), 2)              AS avg_daily_qty,
          -- Cobertura = stock / venta_diaria (NULL si venta_diaria = 0)
          CASE
            WHEN a.total_qty > 0
            THEN ROUND(
              COALESCE(sa.total_stock, 0)::numeric
              / (a.total_qty::numeric / {{cantidad_dias_periodo}}),
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
```

### 8. getTopProducts — consulta 8

**Origen:** `server/salesRouter.ts:917`  
**Propósito:** Obtiene rankings de productos por unidades y por importe, junto con cobertura de stock.  
**Tablas o CTEs relevantes:** `branches`, `categories`, `categories_products`, `products`, `sales_detail`, `sales_header`, `stocks`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{columna_importe_segun_igv}}`, `{{predicado_sucursal}}`, `{{predicado_sucursal_para_stock}}`, `{{predicado_categoria}}`, `:cantidad_dias_periodo`, `:id_cabecera_venta`, `:codigo_sucursal_sap`.

```sql
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
            {{columna_importe_segun_igv}}                                 AS amount
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
            AND sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
            {{predicado_sucursal}}
            {{predicado_categoria}}
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
            {{predicado_sucursal_para_stock}}
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
          ROUND((a.total_qty::numeric / {{cantidad_dias_periodo}}), 2)              AS avg_daily_qty,
          CASE
            WHEN a.total_qty > 0
            THEN ROUND(
              COALESCE(sa.total_stock, 0)::numeric
              / (a.total_qty::numeric / {{cantidad_dias_periodo}}),
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
```

### 9. getIdentifiedTransactions — consulta 9

**Origen:** `server/salesRouter.ts:1062`  
**Propósito:** Calcula el porcentaje diario de transacciones con cliente identificado.  
**Tablas o CTEs relevantes:** `branches`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{predicados_filtros_adicionales}}`, `:id_cliente`.

```sql
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
          AND sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
          {{predicados_filtros_adicionales}}
        GROUP BY
          DATE(sh.doc_date),
          b.name,
          b.sap_id
        ORDER BY
          sale_day,
          CAST(SUBSTRING(b.sap_id FROM '[0-9]+') AS INTEGER) NULLS LAST;
```

### 10. getHeatmapData — consulta 10

**Origen:** `server/salesRouter.ts:1169`  
**Propósito:** Construye la matriz de ventas por día de semana y hora.  
**Tablas o CTEs relevantes:** `branches`, `doc_date`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{columna_importe_segun_igv}}`, `{{predicados_filtros_adicionales}}`, `{{expresion_metrica_seleccionada}}`, `:id_cabecera_venta`.

```sql
WITH base AS (
          SELECT
            sh.id AS sale_id,
            sh.doc_date,
            {{columna_importe_segun_igv}} AS line_total
          FROM sales_header sh
          JOIN sales_detail sd ON sd.header_id = sh.id
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
            {{predicados_filtros_adicionales}}
        )
        SELECT
          EXTRACT(DOW FROM doc_date)::int   AS day_of_week,
          CASE
            WHEN doc_date::time = TIME '00:00:00' THEN -1
            ELSE EXTRACT(HOUR FROM doc_date)::int
          END                               AS hour_of_day,
          {{expresion_metrica_seleccionada}} AS value
        FROM base
        GROUP BY day_of_week, hour_of_day
        ORDER BY day_of_week, hour_of_day;
```

### 11. getHeatmapDayComparison — consulta 11

**Origen:** `server/salesRouter.ts:1275`  
**Propósito:** Obtiene la serie horaria para fechas de comparación seleccionadas.  
**Tablas o CTEs relevantes:** `branches`, `doc_date`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{columna_importe_segun_igv}}`, `{{predicados_filtros_adicionales}}`, `{{lista_fechas_comparadas}}`, `{{expresion_metrica_seleccionada}}`, `:id_cabecera_venta`, `:codigo_sucursal_sap`.

```sql
WITH filtered_headers AS (
          SELECT
            sh.id,
            sh.doc_date,
            sh.branch_id,
            b.sap_id AS branch_sap_id
          FROM sales_header sh
          LEFT JOIN branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date >= '{{fecha_inicio_analisis}}'::date
            AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
            AND sh.doc_date::date IN ({{lista_fechas_comparadas}})
            {{predicados_filtros_adicionales}}
        ),
        base AS (
          SELECT
            fh.id AS sale_id,
            fh.doc_date,
            {{columna_importe_segun_igv}} AS line_total
          FROM filtered_headers fh
          JOIN sales_detail sd ON sd.header_id = fh.id
        )
        SELECT
          doc_date::date::text                   AS date_label,
          EXTRACT(HOUR FROM doc_date)::int       AS hour_of_day,
          {{expresion_metrica_seleccionada}}                          AS value
        FROM base
        GROUP BY date_label, hour_of_day
        ORDER BY date_label, hour_of_day;
```

### 12. getIdentifiedTransactionsByCashier — consulta 12

**Origen:** `server/salesRouter.ts:1339`  
**Propósito:** Desglosa las transacciones identificadas por cajero en una sucursal.  
**Tablas o CTEs relevantes:** `branches`, `cashier`, `sales_header`.  
**Parámetros / fragmentos variables:** `:id_cliente`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:codigo_sucursal_sap`.

```sql
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
          AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
          AND b.sap_id = :codigo_sucursal_sap
        GROUP BY sh.cashier_id, c.name, c.num_doc
        ORDER BY total_transactions DESC;
```

### 13. getCreditNotes — consulta 13

**Origen:** `server/salesRouter.ts:1414`  
**Propósito:** Resume notas de crédito y las contrasta con las ventas de cada tienda.  
**Tablas o CTEs relevantes:** `branches`, `pos_by_branch`, `sales_header`.  
**Parámetros / fragmentos variables:** `{{predicados_filtros_adicionales}}`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`.

```sql
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
            AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
            {{predicados_filtros_adicionales}}
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
            AND DATE(sh2.doc_date) >= :fecha_inicio_analisis::date
            AND DATE(sh2.doc_date) <= :fecha_fin_analisis::date
            {{predicados_filtros_adicionales}}
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
```

### 14. getCreditNotesByCashier — consulta 14

**Origen:** `server/salesRouter.ts:1515`  
**Propósito:** Desglosa las notas de crédito por cajero y sucursal.  
**Tablas o CTEs relevantes:** `branches`, `cashier`, `pos_by_branch`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:codigo_sucursal_sap`.

```sql
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
          AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
          AND b.sap_id = :codigo_sucursal_sap
        GROUP BY sh.cashier_id, c.name, c.num_doc
        ORDER BY total_nc DESC;
```

### 15. getTopCustomersByBranch — consulta 15

**Origen:** `server/salesRouter.ts:1600`  
**Propósito:** Devuelve el ranking de clientes por contribución dentro de cada sucursal.  
**Tablas o CTEs relevantes:** `branches`, `customers`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{columna_importe_segun_igv}}`, `{{predicado_canal_venta}}`, `{{predicado_sucursal}}`, `:id_cliente`, `:id_cliente_generico_excluido`, `:limite_clientes_top`.

```sql
WITH branch_totals AS (
          SELECT
            b.sap_id            AS codigo_tienda,
            b.name              AS nombre_tienda,
            SUM({{columna_importe_segun_igv}})      AS total_tienda,
            COUNT(*)            AS txn_tienda
          FROM public.sales_header sh
          LEFT JOIN public.branches b ON b.id = sh.branch_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
            {{predicado_sucursal}}
            {{predicado_canal_venta}}
          GROUP BY b.sap_id, b.name
        ),
        customer_branch AS (
          SELECT
            b.sap_id            AS codigo_tienda,
            b.name              AS nombre_tienda,
            sh.customer_id,
            c.commercial_name   AS customer_name,
            SUM({{columna_importe_segun_igv}})      AS monto,
            COUNT(*)            AS transacciones
          FROM public.sales_header sh
          LEFT JOIN public.branches  b ON b.id = sh.branch_id
          LEFT JOIN public.customers c ON c.id = sh.customer_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
            AND sh.customer_id IS NOT NULL
            AND sh.customer_id <> '{{id_cliente_generico_excluido}}'
            {{predicado_sucursal}}
            {{predicado_canal_venta}}
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
        WHERE rn <= {{limite_clientes_top}}
        ORDER BY
          CAST(SUBSTRING(codigo_tienda FROM '[0-9]+') AS INTEGER) NULLS LAST,
          rn;
```

### 16. getTopCustomersGeneral — consulta 16

**Origen:** `server/salesRouter.ts:1722`  
**Propósito:** Devuelve el ranking general de clientes, con métricas de frecuencia y ticket promedio.  
**Tablas o CTEs relevantes:** `branches`, `customer_data`, `customers`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{columna_importe_segun_igv}}`, `{{predicado_canal_venta}}`, `{{predicado_sucursal}}`, `:id_cliente`, `:id_cliente_generico_excluido`, `:limite_clientes_top`.

```sql
WITH date_range AS (
          SELECT
            DATE_PART('year', AGE('{{fecha_fin_analisis}}'::date, '{{fecha_inicio_analisis}}'::date)) * 12
            + DATE_PART('month', AGE('{{fecha_fin_analisis}}'::date, '{{fecha_inicio_analisis}}'::date)) + 1 AS num_months
        ),
        customer_data AS (
          SELECT
            sh.customer_id,
            c.commercial_name                     AS customer_name,
            SUM({{columna_importe_segun_igv}})                        AS monto_total,
            COUNT(*)                              AS total_transacciones,
            ARRAY_AGG(DISTINCT b.name ORDER BY b.name) AS tiendas
          FROM public.sales_header sh
          LEFT JOIN public.branches  b ON b.id = sh.branch_id
          LEFT JOIN public.customers c ON c.id = sh.customer_id
          WHERE sh.doc_date IS NOT NULL
            AND sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
            AND sh.customer_id IS NOT NULL
            AND sh.customer_id <> '{{id_cliente_generico_excluido}}'
            {{predicado_sucursal}}
            {{predicado_canal_venta}}
          GROUP BY sh.customer_id, c.commercial_name
        )
        SELECT
          cd.*,
          ROUND((cd.monto_total::numeric)        / dr.num_months::numeric, 2) AS monto_promedio_mes,
          ROUND((cd.total_transacciones::numeric) / dr.num_months::numeric, 2) AS txn_promedio_mes
        FROM customer_data cd
        CROSS JOIN date_range dr
        ORDER BY cd.monto_total DESC
        LIMIT {{limite_clientes_top}};
```

### 17. getCustomerTransactions — consulta 17

**Origen:** `server/salesRouter.ts:1818`  
**Propósito:** Lista las transacciones de un cliente dentro del período y filtros seleccionados.  
**Tablas o CTEs relevantes:** `branches`, `sales_header`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{columna_importe_segun_igv}}`, `{{predicado_canal_venta}}`, `{{predicado_sucursal}}`, `:id_cliente`, `:id_cabecera_venta`.

```sql
SELECT
          sh.id                              AS header_id,
          sh.order_serial                    AS comprobante,
          sh.doc_date                        AS fecha,
          b.name                             AS tienda_nombre,
          b.sap_id                           AS tienda_sap_id,
          {{columna_importe_segun_igv}}                          AS monto_total
        FROM public.sales_header sh
        JOIN public.branches b ON b.id = sh.branch_id
        WHERE sh.customer_id = '{{id_cliente}}'
          AND sh.doc_date IS NOT NULL
          AND sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
          {{predicado_sucursal}}
          {{predicado_canal_venta}}
        ORDER BY sh.doc_date DESC
        LIMIT 500;
```

### 18. getSalesByShelf — consulta 18

**Origen:** `server/salesRouter.ts:1903`  
**Propósito:** Obtiene el detalle de ventas por producto y asignación de góndola.  
**Tablas o CTEs relevantes:** `branches`, `categories`, `categories_products`, `products`, `sales_detail`, `sales_header`, `shelfs`, `stocks`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{columna_importe_segun_igv}}`, `{{predicado_sucursal}}`, `{{predicado_categoria}}`, `:id_cabecera_venta`, `:codigo_sucursal_sap`, `{{predicado_estado_gondola}}`.

```sql
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
          ROUND(SUM({{columna_importe_segun_igv}})::numeric, 2)                           AS monto_total
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
        WHERE sh.doc_date >= '{{fecha_inicio_analisis}}'::date
          AND sh.doc_date <  ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
          AND sh.doc_date IS NOT NULL
          {{predicado_sucursal}}
          {{predicado_categoria}}
          {{predicado_estado_gondola}}
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
```

### 19. getSalesByShelfAggregated — consulta 19

**Origen:** `server/salesRouter.ts:2028`  
**Propósito:** Agrega resultados de ventas por tienda y góndola.  
**Tablas o CTEs relevantes:** `branches`, `categories`, `categories_products`, `products`, `sales_detail`, `sales_header`, `shelfs`, `stocks`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `{{columna_importe_segun_igv}}`, `{{predicado_sucursal}}`, `{{predicado_categoria}}`, `:id_cabecera_venta`, `:codigo_sucursal_sap`, `{{predicado_estado_gondola}}`.

```sql
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
          ROUND(SUM({{columna_importe_segun_igv}})::numeric, 2)                           AS monto_total
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
        WHERE sh.doc_date >= '{{fecha_inicio_analisis}}'::date
          AND sh.doc_date <  ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
          AND sh.doc_date IS NOT NULL
          {{predicado_sucursal}}
          {{predicado_categoria}}
          {{predicado_estado_gondola}}
        GROUP BY
          b.sap_id,
          b.name,
          sh2.id,
          sh2.name
        ORDER BY
          b.sap_id,
          monto_total DESC NULLS LAST;
```

### 20. getTransactionDetail — consulta 20

**Origen:** `server/salesRouter.ts:2109`  
**Propósito:** Obtiene el detalle de líneas de una transacción de venta.  
**Tablas o CTEs relevantes:** `products`, `sales_detail`.  
**Parámetros / fragmentos variables:** `{{columna_importe_segun_igv}}`, `:id_cabecera_venta`, `{{columna_precio_unitario}}`.

```sql
SELECT
          COALESCE(p.name, sd.descripcion, 'Producto desconocido') AS producto_nombre,
          p.int_sku                 AS sku,
          sd.quantity               AS cantidad,
          {{columna_precio_unitario}}               AS precio_unitario,
          {{columna_importe_segun_igv}}                 AS monto_linea
        FROM public.sales_detail sd
        LEFT JOIN public.products p ON p.id = sd.product_id
        WHERE sd.header_id = '{{id_cabecera_venta}}'
        ORDER BY {{columna_importe_segun_igv}} DESC NULLS LAST;
```

### 21. getSalesByShelfComparison — consulta 21

**Origen:** `server/salesRouter.ts:2186`  
**Propósito:** Compara cada góndola contra el período inmediatamente anterior de igual duración.  
**Tablas o CTEs relevantes:** `branches`, `categories`, `categories_products`, `products`, `sales_detail`, `sales_header`, `shelfs`, `stocks`.  
**Parámetros / fragmentos variables:** `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:fecha_inicio_periodo_anterior`, `:fecha_fin_periodo_anterior`, `{{columna_importe_segun_igv}}`, `{{predicado_sucursal}}`, `{{predicado_categoria}}`, `:id_cabecera_venta`, `:codigo_sucursal_sap`, `{{predicado_estado_gondola}}`.

```sql
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
            {{columna_importe_segun_igv}}                                                    AS line_total,
            sd.quantity,
            CASE
              WHEN sh.doc_date >= '{{fecha_inicio_analisis}}'::date
               AND sh.doc_date <  ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day')
              THEN 'current'
              WHEN sh.doc_date >= '{{fecha_inicio_periodo_anterior}}'::date
               AND sh.doc_date <  ('{{fecha_fin_periodo_anterior}}'::date + INTERVAL '1 day')
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
              (sh.doc_date >= '{{fecha_inicio_analisis}}'::date AND sh.doc_date < ('{{fecha_fin_analisis}}'::date + INTERVAL '1 day'))
              OR
              (sh.doc_date >= '{{fecha_inicio_periodo_anterior}}'::date AND sh.doc_date < ('{{fecha_fin_periodo_anterior}}'::date + INTERVAL '1 day'))
            )
            {{predicado_sucursal}}
            {{predicado_categoria}}
            {{predicado_estado_gondola}}
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
```

### 22. getProductsByShelfAndBranch — consulta 22

**Origen:** `server/salesRouter.ts:2328`  
**Propósito:** Obtiene productos vendidos para una tienda y góndola específica.  
**Tablas o CTEs relevantes:** `branches`, `products`, `sales_detail`, `sales_header`, `shelfs`, `stocks`.  
**Parámetros / fragmentos variables:** `:id_cabecera_venta`, `:codigo_sucursal_sap`, `{{predicado_fecha_venta}}`, `{{predicado_stock_gondola}}`.

```sql
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
        WHERE b.sap_id = '{{codigo_sucursal_sap}}'
          AND sh.doc_date IS NOT NULL
          {{predicado_fecha_venta}}
          {{predicado_stock_gondola}}
        ORDER BY p.id, INITCAP(LOWER(p.name))
        LIMIT 500;
```

### 23. getShelfsByBranch — consulta 23

**Origen:** `server/salesRouter.ts:2388`  
**Propósito:** Obtiene las góndolas asociadas a una sucursal.  
**Tablas o CTEs relevantes:** `shelfs`.  
**Parámetros / fragmentos variables:** ninguno.

```sql
SELECT
          sh.id   AS shelf_id,
          sh.name AS shelf_name
        FROM public.shelfs sh
        WHERE sh.status = true
        ORDER BY sh.name;
```

### 24. getShelfCatalog — consulta 24

**Origen:** `server/salesRouter.ts:2487`  
**Propósito:** Devuelve el catálogo activo de góndolas.  
**Tablas o CTEs relevantes:** `shelfs`.  
**Parámetros / fragmentos variables:** ninguno.

```sql
SELECT id AS shelf_id, name AS shelf_name
        FROM public.shelfs
        WHERE status = true
        ORDER BY name;
```

### 25. bulkAssignProductShelf — consulta 25

**Origen:** `server/salesRouter.ts:2525`  
**Propósito:** Resuelve nombres de góndola antes de efectuar una reasignación masiva por API externa.  
**Tablas o CTEs relevantes:** `shelfs`.  
**Parámetros / fragmentos variables:** ninguno.

```sql
SELECT id AS shelf_id, LOWER(TRIM(name)) AS shelf_name_lower FROM public.shelfs WHERE status = true
```

## shelfLayoutRouter.ts

### 1. listShelfs — consulta 1

**Origen:** `server/shelfLayoutRouter.ts:271`  
**Propósito:** Lista las góndolas activas disponibles para configurar layouts.  
**Tablas o CTEs relevantes:** `shelfs`.  
**Parámetros / fragmentos variables:** ninguno.

```sql
SELECT id, name FROM shelfs WHERE status = true ORDER BY name
```

## supplierPortalRouter.ts

### 1. listAllSuppliers — consulta 1

**Origen:** `server/supplierPortalRouter.ts:77`  
**Propósito:** Lista proveedores para usuarios con privilegios de administración.  
**Tablas o CTEs relevantes:** `suppliers`.  
**Parámetros / fragmentos variables:** ninguno.

```sql
SELECT id, ruc, name
         FROM public.suppliers
         ORDER BY name ASC
         LIMIT 500
```

### 2. getMySupplier — consulta 2

**Origen:** `server/supplierPortalRouter.ts:96`  
**Propósito:** Obtiene el proveedor vinculado al usuario autenticado.  
**Tablas o CTEs relevantes:** `suppliers`.  
**Parámetros / fragmentos variables:** `:id_proveedor_autenticado`.

```sql
SELECT id, ruc, name, description, sap_id, status
         FROM public.suppliers
         WHERE id = :id_proveedor_autenticado
```

### 3. getSalesSummary — consulta 3

**Origen:** `server/supplierPortalRouter.ts:129`  
**Propósito:** Resume ventas, tickets, unidades, productos y tiendas de las marcas autorizadas.  
**Tablas o CTEs relevantes:** `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `{{columna_importe_segun_igv}}`, `:id_cabecera_venta`, `:subconsulta_productos_proveedor_autorizado`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`.

```sql
SELECT
             COUNT(DISTINCT sh.id)::int                    AS total_tickets,
             COUNT(DISTINCT p.id)::int                     AS productos_vendidos,
             ROUND(SUM({{columna_importe_segun_igv}})::numeric, 2)              AS total_ventas,
             ROUND(SUM(sd.quantity)::numeric, 2)           AS total_unidades,
             COUNT(DISTINCT sh.branch_id)::int             AS tiendas_activas
           FROM public.sales_detail sd
           JOIN public.products p ON p.id = sd.product_id
           JOIN public.sales_header sh ON sh.id = sd.header_id
           WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
             AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
```

### 4. getDailySales — consulta 4

**Origen:** `server/supplierPortalRouter.ts:166`  
**Propósito:** Agrega ventas de marca propia por día.  
**Tablas o CTEs relevantes:** `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `{{columna_importe_segun_igv}}`, `:id_cabecera_venta`, `:subconsulta_productos_proveedor_autorizado`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`.

```sql
SELECT
             sh.doc_date::date                             AS fecha,
             ROUND(SUM({{columna_importe_segun_igv}})::numeric, 2)              AS total_ventas,
             COUNT(DISTINCT sh.id)::int                    AS tickets,
             ROUND(SUM(sd.quantity)::numeric, 2)           AS unidades
           FROM public.sales_detail sd
           JOIN public.products p ON p.id = sd.product_id
           JOIN public.sales_header sh ON sh.id = sd.header_id
           WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
             AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
           GROUP BY sh.doc_date::date
           ORDER BY fecha ASC
```

### 5. getTopProducts — consulta 5

**Origen:** `server/supplierPortalRouter.ts:208`  
**Propósito:** Obtiene rankings de productos por unidades y por importe, junto con cobertura de stock.  
**Tablas o CTEs relevantes:** `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `{{columna_importe_segun_igv}}`, `:id_cabecera_venta`, `:subconsulta_productos_proveedor_autorizado`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:id_sucursal`.

```sql
SELECT
             p.name                                        AS producto,
             p.int_sku,
             ROUND(SUM({{columna_importe_segun_igv}})::numeric, 2)              AS total_ventas,
             ROUND(SUM(sd.quantity)::numeric, 2)           AS unidades_vendidas,
             COUNT(DISTINCT sh.id)::int                    AS tickets
           FROM public.sales_detail sd
           JOIN public.products p ON p.id = sd.product_id
           JOIN public.sales_header sh ON sh.id = sd.header_id
           WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
             AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
           GROUP BY p.id, p.name, p.int_sku
           ORDER BY total_ventas DESC
           LIMIT :id_sucursal
```

### 6. getSalesByBranch — consulta 6

**Origen:** `server/supplierPortalRouter.ts:248`  
**Propósito:** Agrega ventas de marca propia por sucursal.  
**Tablas o CTEs relevantes:** `branches`, `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `{{columna_importe_segun_igv}}`, `:id_cabecera_venta`, `:subconsulta_productos_proveedor_autorizado`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`.

```sql
SELECT
             b.name                                        AS tienda,
             b.sap_id,
             ROUND(SUM({{columna_importe_segun_igv}})::numeric, 2)              AS total_ventas,
             ROUND(SUM(sd.quantity)::numeric, 2)           AS unidades,
             COUNT(DISTINCT sh.id)::int                    AS tickets
           FROM public.sales_detail sd
           JOIN public.products p ON p.id = sd.product_id
           JOIN public.sales_header sh ON sh.id = sd.header_id
           JOIN public.branches b ON b.id = sh.branch_id
           WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
             AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
           GROUP BY b.id, b.name, b.sap_id
           ORDER BY total_ventas DESC
```

### 7. getBranchesForStock — consulta 7

**Origen:** `server/supplierPortalRouter.ts:284`  
**Propósito:** Lista sucursales con stock para las marcas autorizadas.  
**Tablas o CTEs relevantes:** `branches`, `products`, `stocks`.  
**Parámetros / fragmentos variables:** `:subconsulta_productos_proveedor_autorizado`.

```sql
SELECT DISTINCT b.id, b.name, b.sap_id
         FROM public.stocks st
         JOIN public.products p ON p.id = st.product_id
         JOIN public.branches b ON b.id = st.branch_id
         WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
           AND st.stock > 0
         ORDER BY b.sap_id ASC
```

### 8. getBranchesForSales — consulta 8

**Origen:** `server/supplierPortalRouter.ts:307`  
**Propósito:** Lista sucursales con ventas de las marcas autorizadas.  
**Tablas o CTEs relevantes:** `branches`, `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:id_cabecera_venta`, `:subconsulta_productos_proveedor_autorizado`.

```sql
SELECT DISTINCT b.id, b.name, b.sap_id
           FROM public.sales_detail sd
           JOIN public.products p ON p.id = sd.product_id
           JOIN public.sales_header sh ON sh.id = sd.header_id
           JOIN public.branches b ON b.id = sh.branch_id
           WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
           ORDER BY b.sap_id ASC
           LIMIT 500
```

### 9. getStockByProduct — consulta 9

**Origen:** `server/supplierPortalRouter.ts:345`  
**Propósito:** Devuelve el stock por producto y sucursal, con paginación.  
**Tablas o CTEs relevantes:** `branches`, `products`, `stocks`.  
**Parámetros / fragmentos variables:** `{{predicado_sucursal}}`, `:subconsulta_productos_proveedor_autorizado`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:id_sucursal`.

```sql
SELECT
             p.name                                        AS producto,
             p.int_sku,
             b.id                                          AS branch_id,
             b.name                                        AS tienda,
             b.sap_id,
             COALESCE(st.stock, 0)                         AS stock_actual,
             st.min_stock
           FROM public.branches b
           CROSS JOIN (
             SELECT id, name, int_sku FROM public.products
             WHERE id = :fecha_inicio_analisis AND id IN {{subconsulta_productos_proveedor_autorizado}}
           ) p
           LEFT JOIN public.stocks st ON st.product_id = p.id AND st.branch_id = b.id
           WHERE 1=1 {{predicado_sucursal}}
           ORDER BY b.sap_id ASC
           LIMIT :fecha_fin_analisis OFFSET :id_sucursal
```

### 10. getStockByProduct — consulta 10

**Origen:** `server/supplierPortalRouter.ts:367`  
**Propósito:** Devuelve el stock por producto y sucursal, con paginación.  
**Tablas o CTEs relevantes:** `branches`, `products`.  
**Parámetros / fragmentos variables:** `:id_producto`, `:subconsulta_productos_proveedor_autorizado`, `{{predicado_sucursal_opcional}}`.

```sql
SELECT COUNT(*)::int AS total
FROM public.branches b
CROSS JOIN (
  SELECT id
  FROM public.products
  WHERE id = :id_producto
    AND id IN {{subconsulta_productos_proveedor_autorizado}}
) p
WHERE 1 = 1
  {{predicado_sucursal_opcional}}
```

### 11. getStockByProduct — consulta 11

**Origen:** `server/supplierPortalRouter.ts:402`  
**Propósito:** Devuelve el stock por producto y sucursal, con paginación.  
**Tablas o CTEs relevantes:** `branches`, `products`, `stocks`.  
**Parámetros / fragmentos variables:** `:subconsulta_productos_proveedor_autorizado`, `{{predicados_stock_adicionales}}`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`.

```sql
SELECT
           p.name                                        AS producto,
           p.int_sku,
           b.id                                          AS branch_id,
           b.name                                        AS tienda,
           b.sap_id,
           st.stock                                      AS stock_actual,
           st.min_stock
         FROM public.stocks st
         JOIN public.products p ON p.id = st.product_id
         JOIN public.branches b ON b.id = st.branch_id
         WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
           AND st.stock > 0
           {{predicados_stock_adicionales}}
         ORDER BY p.name ASC, b.sap_id ASC
         LIMIT :fecha_inicio_analisis OFFSET :fecha_fin_analisis
```

### 12. getStockByProduct — consulta 12

**Origen:** `server/supplierPortalRouter.ts:432`  
**Propósito:** Devuelve el stock por producto y sucursal, con paginación.  
**Tablas o CTEs relevantes:** `branches`, `products`, `stocks`.  
**Parámetros / fragmentos variables:** `{{predicados_conteo_catalogo}}`, `:subconsulta_productos_proveedor_autorizado`.

```sql
SELECT COUNT(*)::int AS total
         FROM public.stocks st
         JOIN public.products p ON p.id = st.product_id
         JOIN public.branches b ON b.id = st.branch_id
         WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
           AND st.stock > 0
           {{predicados_conteo_catalogo}}
```

### 13. getReceptions — consulta 13

**Origen:** `server/supplierPortalRouter.ts:474`  
**Propósito:** Lista recepciones de productos de marca propia con paginación.  
**Tablas o CTEs relevantes:** `branches`, `products`, `receptions`.  
**Parámetros / fragmentos variables:** `:subconsulta_productos_proveedor_autorizado`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:id_sucursal`, `:id_producto`.

```sql
SELECT
           r.oc,
           r.date::date                                  AS fecha,
           b.name                                        AS tienda,
           b.sap_id,
           p.name                                        AS producto,
           p.int_sku,
           r.ordered_quantity,
           r.received_quantity,
           r.status
         FROM public.receptions r
         JOIN public.products p ON p.id = r.product_id
         JOIN public.branches b ON b.id = r.branch_id
         WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
           AND r.date::date BETWEEN :fecha_inicio_analisis AND :fecha_fin_analisis
         ORDER BY r.date DESC
         LIMIT :id_sucursal OFFSET :id_producto
```

### 14. getReceptions — consulta 14

**Origen:** `server/supplierPortalRouter.ts:494`  
**Propósito:** Lista recepciones de productos de marca propia con paginación.  
**Tablas o CTEs relevantes:** `products`, `receptions`.  
**Parámetros / fragmentos variables:** `:subconsulta_productos_proveedor_autorizado`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`.

```sql
SELECT COUNT(*)::int AS total
         FROM public.receptions r
         JOIN public.products p ON p.id = r.product_id
         WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
           AND r.date::date BETWEEN :fecha_inicio_analisis AND :fecha_fin_analisis
```

### 15. getMonthlySales — consulta 15

**Origen:** `server/supplierPortalRouter.ts:527`  
**Propósito:** Agrega las ventas mensuales recientes de marca propia.  
**Tablas o CTEs relevantes:** `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:id_cabecera_venta`, `:subconsulta_productos_proveedor_autorizado`.

```sql
SELECT
           TO_CHAR(sh.doc_date, 'YYYY-MM')                AS mes,
           ROUND(SUM(sd.total)::numeric, 2)               AS total_ventas,
           COUNT(DISTINCT sh.id)::int                     AS tickets,
           ROUND(SUM(sd.quantity)::numeric, 2)            AS unidades
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
           AND sh.doc_date >= NOW() - INTERVAL '6 months'
         GROUP BY TO_CHAR(sh.doc_date, 'YYYY-MM')
         ORDER BY mes ASC
```

### 16. getProductCatalog — consulta 16

**Origen:** `server/supplierPortalRouter.ts:576`  
**Propósito:** Obtiene el catálogo de productos de marca propia y su stock consolidado.  
**Tablas o CTEs relevantes:** `filtered`, `products`, `stocks`.  
**Parámetros / fragmentos variables:** `:subconsulta_productos_proveedor_autorizado`, `{{predicado_busqueda_texto}}`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`.

```sql
WITH filtered AS (
             SELECT
               p.id,
               p.name,
               p.int_sku,
               p.short_description AS description
             FROM public.products p
             WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
               {{predicado_busqueda_texto}}
           )
           SELECT
             f.id,
             f.name,
             f.int_sku,
             f.description,
             COALESCE(SUM(st.stock), 0)::int              AS stock_total,
             COUNT(DISTINCT st.branch_id)::int             AS tiendas_con_stock,
             COUNT(*) OVER()::int                          AS _total
           FROM filtered f
           LEFT JOIN public.stocks st ON st.product_id = f.id AND st.stock > 0
           GROUP BY f.id, f.name, f.int_sku, f.description
           ORDER BY f.name ASC
           LIMIT :fecha_inicio_analisis OFFSET :fecha_fin_analisis
```

### 17. getSalesByProductBranch — consulta 17

**Origen:** `server/supplierPortalRouter.ts:683`  
**Propósito:** Agrega ventas por producto y tienda, con totales y paginación en una sola consulta.  
**Tablas o CTEs relevantes:** `branches`, `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `{{columna_importe_segun_igv}}`, `{{dimension_producto_opcional}}`, `{{dimension_tienda_opcional}}`, `{{columnas_agrupacion_dimension}}`, `:id_cabecera_venta`, `:subconsulta_productos_proveedor_autorizado`, `{{predicados_stock_adicionales}}`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:id_sucursal`, `:id_producto`.

```sql
WITH base AS (
           SELECT
             {{dimension_producto_opcional}}
             {{dimension_tienda_opcional}}
             SUM(sd.quantity)::numeric                     AS cantidad,
             ROUND(SUM({{columna_importe_segun_igv}})::numeric, 2)              AS monto,
             COUNT(DISTINCT sh.id)::int                    AS tickets
           FROM public.sales_detail sd
           JOIN public.products p ON p.id = sd.product_id
           JOIN public.sales_header sh ON sh.id = sd.header_id
           JOIN public.branches b ON b.id = sh.branch_id
           WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
             AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
             {{predicados_stock_adicionales}}
           GROUP BY {{columnas_agrupacion_dimension}}
         ),
         totals AS (
           SELECT
             COUNT(*)::int                                 AS total_rows,
             SUM(cantidad)::numeric                        AS total_cantidad,
             ROUND(SUM(monto)::numeric, 2)                 AS total_monto,
             SUM(tickets)::int                             AS total_tickets
           FROM base
         )
         SELECT
           b.*,
           t.total_rows,
           t.total_cantidad,
           t.total_monto,
           t.total_tickets
         FROM (SELECT * FROM base ORDER BY monto DESC LIMIT :id_sucursal OFFSET :id_producto) b
         CROSS JOIN totals t
```

### 18. getSalesDailyDetail — consulta 18

**Origen:** `server/supplierPortalRouter.ts:762`  
**Propósito:** Obtiene la evolución diaria de un producto en una tienda.  
**Tablas o CTEs relevantes:** `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `:id_cabecera_venta`, `:subconsulta_productos_proveedor_autorizado`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`, `:id_sucursal`, `:id_producto`.

```sql
SELECT
           sh.doc_date::date                             AS fecha,
           SUM(sd.quantity)::numeric                     AS cantidad,
           ROUND(SUM(sd.total)::numeric, 2)              AS monto,
           COUNT(DISTINCT sh.id)::int                    AS tickets
         FROM public.sales_detail sd
         JOIN public.sales_header sh ON sh.id = sd.header_id
         JOIN public.products p ON p.id = sd.product_id
         WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
           AND sd.product_id = :fecha_inicio_analisis
           AND sh.branch_id = :fecha_fin_analisis
           AND sh.doc_date >= :id_sucursal::date AND sh.doc_date < (:id_producto::date + INTERVAL '1 day')
         GROUP BY sh.doc_date::date
         ORDER BY fecha ASC
```

### 19. exportSalesByProductBranch — consulta 19

**Origen:** `server/supplierPortalRouter.ts:836`  
**Propósito:** Exporta las ventas por producto y tienda.  
**Tablas o CTEs relevantes:** `branches`, `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `{{dimension_producto_opcional}}`, `{{dimension_tienda_opcional}}`, `{{columnas_agrupacion_dimension}}`, `:id_cabecera_venta`, `{{predicados_filtros_seleccionados}}`, `:subconsulta_productos_proveedor_autorizado`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`.

```sql
SELECT
           {{dimension_producto_opcional}}
           {{dimension_tienda_opcional}}
           SUM(sd.quantity)::numeric                     AS cantidad,
           ROUND(SUM(sd.total)::numeric, 2)              AS monto,
           COUNT(DISTINCT sh.id)::int                    AS tickets
         FROM public.sales_detail sd
         JOIN public.products p ON p.id = sd.product_id
         JOIN public.sales_header sh ON sh.id = sd.header_id
         JOIN public.branches b ON b.id = sh.branch_id
         WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
           AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
           {{predicados_filtros_seleccionados}}
         GROUP BY {{columnas_agrupacion_dimension}}
         ORDER BY monto DESC
         LIMIT 10000
```

### 20. exportStockByProduct — consulta 20

**Origen:** `server/supplierPortalRouter.ts:887`  
**Propósito:** Exporta el stock por producto y sucursal sin paginación de interfaz.  
**Tablas o CTEs relevantes:** `branches`, `products`, `stocks`.  
**Parámetros / fragmentos variables:** `{{predicado_sucursal}}`, `:subconsulta_productos_proveedor_autorizado`, `:fecha_inicio_analisis`.

```sql
SELECT
             p.name                                        AS producto,
             p.int_sku,
             b.id                                          AS branch_id,
             b.name                                        AS tienda,
             b.sap_id,
             COALESCE(st.stock, 0)                         AS stock_actual,
             st.min_stock
           FROM public.branches b
           CROSS JOIN (
             SELECT id, name, int_sku FROM public.products
             WHERE id = :fecha_inicio_analisis AND id IN {{subconsulta_productos_proveedor_autorizado}}
           ) p
           LEFT JOIN public.stocks st ON st.product_id = p.id AND st.branch_id = b.id
           WHERE 1=1 {{predicado_sucursal}}
           ORDER BY b.sap_id ASC
```

### 21. exportStockByProduct — consulta 21

**Origen:** `server/supplierPortalRouter.ts:920`  
**Propósito:** Exporta el stock por producto y sucursal sin paginación de interfaz.  
**Tablas o CTEs relevantes:** `branches`, `products`, `stocks`.  
**Parámetros / fragmentos variables:** `{{predicados_stock_adicionales}}`, `:subconsulta_productos_proveedor_autorizado`.

```sql
SELECT
           p.name                                        AS producto,
           p.int_sku,
           b.id                                          AS branch_id,
           b.name                                        AS tienda,
           b.sap_id,
           st.stock                                      AS stock_actual,
           st.min_stock
         FROM public.stocks st
         JOIN public.products p ON p.id = st.product_id
         JOIN public.branches b ON b.id = st.branch_id
         WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
           AND st.stock > 0
           {{predicados_stock_adicionales}}
         ORDER BY p.name ASC, b.sap_id ASC
```

### 22. getProductsForSupplier — consulta 22

**Origen:** `server/supplierPortalRouter.ts:953`  
**Propósito:** Consulta de soporte ejecutada por el backend para el flujo indicado.  
**Tablas o CTEs relevantes:** `products`.  
**Parámetros / fragmentos variables:** `:subconsulta_productos_proveedor_autorizado`.

```sql
SELECT DISTINCT
             p.id,
             p.name,
             p.int_sku::text AS sku
           FROM public.products p
           WHERE p.id IN {{subconsulta_productos_proveedor_autorizado}}
           ORDER BY p.name ASC
           LIMIT 2000
```

### 23. getSalesEvolution — consulta 23

**Origen:** `server/supplierPortalRouter.ts:1031`  
**Propósito:** Devuelve una serie temporal de ventas para marca propia.  
**Tablas o CTEs relevantes:** `branches`, `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `{{expresion_granularidad_temporal}}`, `{{columna_importe_segun_igv}}`, `{{dimension_producto_opcional}}`, `{{dimension_tienda_opcional}}`, `{{columnas_agrupacion}}`, `{{predicado_sucursal}}`, `:id_cabecera_venta`, `:ordenamiento_por_producto_opcional`, `:ordenamiento_por_tienda_opcional`, `:subconsulta_productos_proveedor_autorizado`, `{{predicado_producto}}`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`.

```sql
SELECT
          {{expresion_granularidad_temporal}} AS period,
          {{dimension_producto_opcional}}
          {{dimension_tienda_opcional}}
          SUM({{columna_importe_segun_igv}}) AS amount,
          SUM(sd.quantity) AS quantity
        FROM public.sales_header sh
        JOIN public.sales_detail sd ON sd.header_id = sh.id
        JOIN public.products p ON p.id = sd.product_id
        LEFT JOIN public.branches b ON b.id = sh.branch_id
        WHERE sh.doc_date IS NOT NULL
          AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
          AND p.id IN {{subconsulta_productos_proveedor_autorizado}}
          {{predicado_producto}}
          {{predicado_sucursal}}
        GROUP BY {{columnas_agrupacion}}
        ORDER BY period ASC, {{ordenamiento_por_producto_opcional}} {{ordenamiento_por_tienda_opcional}}
```

### 24. getSalesLineChart — consulta 24

**Origen:** `server/supplierPortalRouter.ts:1098`  
**Propósito:** Devuelve la evolución temporal de ventas para el portal de proveedor.  
**Tablas o CTEs relevantes:** `branches`, `products`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `{{expresion_granularidad_temporal}}`, `{{columna_importe_segun_igv}}`, `{{predicado_sucursal}}`, `:id_cabecera_venta`, `:subconsulta_productos_proveedor_autorizado`, `{{predicado_producto}}`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`.

```sql
SELECT
          {{expresion_granularidad_temporal}} AS period,
          SUM({{columna_importe_segun_igv}}) AS amount,
          SUM(sd.quantity) AS quantity
        FROM public.sales_header sh
        JOIN public.sales_detail sd ON sd.header_id = sh.id
        JOIN public.products p ON p.id = sd.product_id
        LEFT JOIN public.branches b ON b.id = sh.branch_id
        WHERE sh.doc_date IS NOT NULL
          AND sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
          AND p.id IN {{subconsulta_productos_proveedor_autorizado}}
          {{predicado_producto}}
          {{predicado_sucursal}}
        GROUP BY period
        ORDER BY period ASC
```

## targetsRouter.ts

### 1. getSalesVsTarget — consulta 1

**Origen:** `server/targetsRouter.ts:92`  
**Propósito:** Calcula ventas reales frente a metas por tienda y período.  
**Tablas o CTEs relevantes:** `branches`, `sales_detail`, `sales_header`.  
**Parámetros / fragmentos variables:** `{{predicado_canal_venta}}`, `:id_cabecera_venta`, `{{predicado_sucursal}}`, `:fecha_inicio_analisis`, `:fecha_fin_analisis`.

```sql
SELECT
          sh.branch_id AS store_id,
          INITCAP(LOWER(COALESCE(b.name, ''))) AS store_name,
          COALESCE(b.sap_id, '') AS store_sap_id,
          SUM(sd.total) AS total_sales
        FROM sales_header sh
        JOIN sales_detail sd ON sd.header_id = sh.id
        LEFT JOIN branches b ON b.id = sh.branch_id
        WHERE sh.doc_date >= :fecha_inicio_analisis::date AND sh.doc_date < (:fecha_fin_analisis::date + INTERVAL '1 day')
          {{predicado_sucursal}}
          {{predicado_canal_venta}}
        GROUP BY sh.branch_id, b.name, b.sap_id
        ORDER BY b.sap_id;
```

### 2. bulkUpsertFromCSV — consulta 2

**Origen:** `server/targetsRouter.ts:415`  
**Propósito:** Consulta de soporte ejecutada por el backend para el flujo indicado.  
**Tablas o CTEs relevantes:** `branches`.  
**Parámetros / fragmentos variables:** ninguno.

```sql
SELECT id AS store_id, sap_id AS store_sap_id FROM branches WHERE sap_id IS NOT NULL
```

### 3. getAllStores — consulta 3

**Origen:** `server/targetsRouter.ts:514`  
**Propósito:** Devuelve el catálogo de tiendas para la administración de metas.  
**Tablas o CTEs relevantes:** `branches`.  
**Parámetros / fragmentos variables:** ninguno.

```sql
SELECT
          id AS store_id,
          INITCAP(LOWER(COALESCE(name, ''))) AS store_name,
          COALESCE(sap_id, '') AS store_sap_id
        FROM branches
        ORDER BY sap_id;
```

## userRouter.ts

### 1. listUsers — consulta 1

**Origen:** `server/userRouter.ts:125`  
**Propósito:** Lista los usuarios y sus asignaciones para la administración de accesos.  
**Tablas o CTEs relevantes:** `suppliers`.  
**Parámetros / fragmentos variables:** `{{lista_ids_solicitados}}`.

```sql
SELECT id::text, ruc, name FROM public.suppliers WHERE id::text IN ({{lista_ids_solicitados}})
```

### 2. getBranches — consulta 2

**Origen:** `server/userRouter.ts:156`  
**Propósito:** Lista las sucursales disponibles al gestionar usuarios.  
**Tablas o CTEs relevantes:** `branches`.  
**Parámetros / fragmentos variables:** ninguno.

```sql
SELECT sap_id, INITCAP(LOWER(COALESCE(name, ''))) AS name
        FROM branches
        WHERE sap_id IS NOT NULL AND sap_id <> ''
        ORDER BY CAST(SUBSTRING(sap_id FROM '[0-9]+') AS INTEGER) ASC
```

### 3. getSuppliers — consulta 3

**Origen:** `server/userRouter.ts:188`  
**Propósito:** Lista proveedores disponibles al gestionar usuarios.  
**Tablas o CTEs relevantes:** `suppliers`.  
**Parámetros / fragmentos variables:** `:termino_busqueda_proveedor`.

```sql
SELECT id, ruc, name
            FROM public.suppliers
            WHERE ruc ILIKE :termino_busqueda_proveedor
            ORDER BY ruc ASC
            LIMIT 50
```

### 4. getSuppliers — consulta 4

**Origen:** `server/userRouter.ts:197`  
**Propósito:** Lista proveedores disponibles al gestionar usuarios.  
**Tablas o CTEs relevantes:** `suppliers`.  
**Parámetros / fragmentos variables:** ninguno.

```sql
SELECT id, ruc, name
            FROM public.suppliers
            ORDER BY ruc ASC
            LIMIT 100
```

## Operaciones ORM que también generan SQL

Las siguientes operaciones no contienen un literal SQL mantenido por la aplicación; Drizzle genera los `SELECT`, `INSERT`, `UPDATE` o `DELETE` al ejecutarlas. Se enumeran para completar el alcance de persistencia del sitio.

| Módulo | Tablas | Operaciones ORM detectadas |
|---|---|---|
| `db.ts` | `users`, `discrepancy_tickets`, `terms_acceptance`, `terms_versions` | Lectura, inserción, actualización, borrado y upsert de usuarios, tickets y términos. |
| `activationRouter.ts` | `activation_tokens` | Inserción y renovación de tokens de activación. |
| `dbConnectionsRouter.ts` | `db_connections` | Inserción, actualización, listado y eliminación de conexiones registradas. |
| `ownBrandCategoriesRouter.ts` | `own_brand_categories`, `own_brand_category_brands` | CRUD de categorías y asociaciones de marca propia. |
| `ownBrandRouter.ts` | `own_brand_brands`, `own_brand_categories`, `own_brand_category_brands` | Lectura y mantenimiento de la configuración de marcas autorizadas. |
| `shelfLayoutRouter.ts` | `shelf_layouts`, `shelf_zones` | CRUD de layouts y zonas visuales de góndola. |
| `supplierTrialRouter.ts` | `users`, `terms_acceptance`, `supplier_trials` | Lectura y actualización del estado de prueba y aceptación de términos. |
| `targetsRouter.ts` | `store_targets` | Inserción, actualización, borrado y lectura de metas por tienda. |
| `userRouter.ts` | `users`, `activation_tokens` | Administración de usuarios, contraseñas y activaciones. |

## Notas de seguridad y mantenimiento

Las consultas normalizadas emplean nombres expresivos solo en esta documentación. En el código productivo, muchas consultas todavía se construyen con parámetros posicionales (`$1`, `$2`, etc.) y algunos fragmentos SQL controlados. Para una migración posterior, se recomienda conservar los valores como parámetros enlazados y limitar los fragmentos dinámicos a listas blancas de columnas, granularidades y filtros admitidos.