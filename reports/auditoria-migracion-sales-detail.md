# Auditoría previa: migración de consultas de venta a `sales_detail`

**Estado:** análisis de solo lectura; **no se modificó código funcional ni la base de datos**.

**Fecha de auditoría:** 9 de octubre de 2026  
**Alcance propuesto:** usar `public.sales_detail` como fuente transaccional, `sales_detail.doc_date` para el período, `sales_detail.costing_code` para resolver tienda contra `branches.sap_id`, y `sales_detail.costing_code3` para canal.

> Esta auditoría identifica qué consultas pueden migrarse sin perder semántica y qué dimensiones hoy solo existen en `sales_header`. La implementación queda bloqueada hasta una confirmación explícita de las decisiones abiertas.

## 1. Reglas propuestas y resultado de la verificación

| Dimensión | Regla propuesta | Evidencia de auditoría | Estado |
|---|---|---|---|
| Fecha | `sales_detail.doc_date` | Está disponible como `timestamp` por línea. En una muestra de 1,104 líneas no hubo diferencias de **fecha calendario** frente a `sales_header.doc_date`; se detectó una diferencia de hora en 1 línea. | **Apta** para filtro/calendario; se toma `sales_detail.doc_date` como fuente canónica si se confirma. |
| Hora | `EXTRACT(HOUR FROM sales_detail.doc_date)` | La muestra presentó actividad entre 07:00 y 22:00. | **Apta** para Análisis por Horas. |
| Tienda | `sales_detail.costing_code = branches.sap_id` | En una muestra de 3,422 líneas, las 3,422 encontraron equivalencia; se observaron 14 códigos y no existen `sap_id` duplicados en `branches`. | **Apta**. La relación debe normalizar espacios con `BTRIM` y preservar las líneas sin coincidencia como “Tienda sin equivalencia”. |
| Canal | `costing_code3`: `CF → Presencial`, `ECM → eCommerce`, `UMI → Rappi` | La muestra encontró los tres valores, pero también filas con `costing_code3` vacío (247 transacciones en una muestra de 1,312). | **Requiere decisión** para valores vacíos/no mapeados. |
| Importe con/sin IGV | `SUM(sales_detail.total)` / `SUM(sales_detail.subtotal)` | Son campos nativos del detalle. En una muestra de 562 transacciones, 132 no coincidieron con `sales_header.total` y 126 con `sales_header.subtotal`. | **Requiere decisión** sobre la fuente canónica del importe si se exige paridad con totales de cabecera. |
| Transacciones | `COUNT(DISTINCT sales_detail.header_id)` | `header_id` está en cada línea. En una muestra de 941 transacciones, ninguna tuvo tienda, canal o fecha calendario mezclados entre líneas. | **Apta**, con validación de completitud durante la implementación. |

## 2. Dimensiones que permanecen disponibles en `sales_detail`

Estas dimensiones permiten migrar análisis de venta y productos sin depender de `sales_header`:

| Grupo | Campos disponibles |
|---|---|
| Identidad y fecha de la transacción | `header_id`, `doc_date` |
| Tienda y canal propuestos | `costing_code`, `costing_code3` |
| Producto | `product_id`, `ref_id`, `descripcion` |
| Unidades e importes | `quantity`, `price_tax`, `price_no_tax`, `subtotal`, `total` |
| Impuestos y descuentos | `tax`, `tax_code`, `tax_amount`, `discount_amount`, `discount_percent` |
| Operación y costo | `warehouse_code`, `costing_code2`, `is_consignment`, `cost`, `cost_no_tax` |
| Categoría y atributos de producto | Se conservan mediante `product_id → categories_products → categories` y `products` |

`costing_code2` aparece como `000` en la muestra revisada; actualmente no participa en los análisis de ventas y no constituye una dimensión de reemplazo conocida.

## 3. Dimensiones que se perderían si se elimina toda consulta a `sales_header`

| Dimensión de cabecera | Módulos afectados | Consecuencia | Equivalencia necesaria |
|---|---|---|---|
| `customer_id` | **Top Clientes**, búsqueda por DNI, detalle de cliente, Transacciones identificadas, Notas de crédito | No se puede atribuir una venta al cliente ni abrir su detalle. | ID de cliente en `sales_detail` o tabla plana con `header_id → customer_id`. |
| `cashier_id` | Detalle de Notas de crédito por cajero | Se pierde el desglose y drill-down por cajero. | ID de cajero en `sales_detail` o tabla plana con `header_id → cashier_id`. |
| `order_serial` + `order_number` | Detalle de Top Clientes, Notas de crédito, Transacciones identificadas y exportaciones | Se pierde el identificador visible de transacción `serie-número`. | Serie y número en `sales_detail`, o un número documental ya materializado. |
| `is_nc` y `nc_reference` | Notas de crédito | No se pueden identificar notas de crédito ni referenciarlas al documento origen. | Indicador y referencia equivalentes en `sales_detail`. |
| `source_system_id` y pagos en `methods_payment` | Canal histórico, Ventas vs Meta, comparativos | La nueva regla por `costing_code3` sustituye el criterio solo cuando el código está poblado. No conserva métodos de pago. | Política para valores vacíos/no mapeados; si se requieren métodos, una dimensión equivalente. |
| `currency`, `payment_group_code`, `country`, `department`, `comments`, `doc_entry`, `is_factura`, `sap_status`, `has_consignment`, `mto_discount` | Consultas técnicas, auditorías y algunos detalles futuros | No se usan como filtro principal del Análisis General, pero se perderían de cualquier nuevo reporte basado exclusivamente en detalle. | Confirmar que se omiten o exponer equivalencia. |
| Totales de cabecera | KPIs o listados que usan `sales_header.total/subtotal` | Se observaron discrepancias frente a la suma de líneas en la muestra. | Confirmar que la suma de líneas es el nuevo valor oficial. |

## 4. Impacto por página del menú **Ventas**

| Ruta / página | Viabilidad con `sales_detail` | Dimensiones críticas | Decisión pendiente |
|---|---|---|---|
| `/sales` — Análisis General | **Alta** | Fecha, tienda, canal, categoría, monto, transacciones | Canal vacío/no mapeado y fuente canónica del monto. |
| `/hourly` — Análisis por Horas | **Alta** | Hora, fecha, tienda, monto, transacciones | Canal vacío/no mapeado. |
| `/sales-vs-target` — Ventas vs Meta | **Media-alta** | Fecha, tienda, monto, canal | Confirmar que el nuevo canal reemplaza la semántica histórica usada para metas. |
| `/top-products` — Top Productos | **Alta** | Producto, categoría, tienda, unidades, monto | Fuente canónica de monto. Stock sigue viniendo de `stocks`. |
| `/sales-by-shelf` — Análisis por Góndola | **Alta** | Producto, categoría, tienda, monto, unidades | Fuente canónica de monto. Góndolas siguen viniendo de sus tablas de asignación. |
| `/sales-by-category` — Análisis por Categorías | **Alta** | Producto, categoría, fecha, tienda, monto | Fuente canónica de monto. |
| `/top-customers` — Top Clientes | **No apta** solo con detalle | Cliente, DNI, documento, detalle de transacción | Equivalencia de cliente y número documental. |
| `/identified-transactions` — Transacciones Identificadas | **No apta** solo con detalle | Cliente y número de documento | Equivalencia de cliente y número documental. |
| `/credit-notes` — Notas de Crédito | **No apta** solo con detalle | Nota de crédito, referencia, cajero, cliente, documento | Equivalencias de NC, cajero, cliente y número documental. |

## 5. Otros consumidores de `sales_header`

La dependencia no se limita al router principal de ventas. La auditoría localizó referencias en:

- `server/supplierPortalRouter.ts` y `server/ownBrandRouter.ts`: 12 consultas cada uno; los indicadores por producto/tienda pueden migrar, pero deberán revisarse sus exportaciones y drill-downs.
- `server/categoryAnalysisRouter.ts`, `server/shelfComparisonRouter.ts`, `server/shelfProductRanking.ts` y `server/topProductsByStore.ts`: en principio migrables con `sales_detail` + productos/categorías + sucursales.
- `server/targetsRouter.ts`: requiere confirmar que `costing_code3` debe sustituir la lógica de canal usada frente a las metas.
- `server/customerDetailAnalytics.ts`, `server/customerDniSearch.ts`, `server/creditNoteQueries.ts` y `server/transactionIdentifiers.ts`: bloqueados por dimensiones exclusivas de cabecera.
- Portales de Proveedores y Marca Propia: cada uno mantiene 12 referencias de cabecera; se deben migrar en una fase posterior, una vez cerrado el contrato de canal e importe.

## 6. Decisiones necesarias antes de implementar

1. **Canal vacío/no mapeado:** ¿debe clasificarse como `Presencial`, mostrarse como `Sin clasificar`, o excluirse? La opción `Sin clasificar` requiere ampliar el filtro/leyenda que hoy solo admite tres canales.
2. **Monto oficial:** ¿debe prevalecer `SUM(sales_detail.total/subtotal)` aunque difiera de los totales de cabecera, o se requiere una regla adicional para conservar la conciliación histórica?
3. **Top Clientes, Transacciones Identificadas y Notas de Crédito:** ¿existe una tabla/columna plana que contenga `customer_id`, cajero, serie-número, `is_nc` y `nc_reference` por línea o por `header_id`? Sin esa equivalencia, esos módulos deben continuar consultando la cabecera.
4. **Alcance:** ¿autorizar la primera fase solo para los seis módulos aptos del menú Ventas (`/sales`, `/hourly`, `/sales-vs-target`, `/top-products`, `/sales-by-shelf`, `/sales-by-category`) y aplazar los tres módulos bloqueados?
5. **Canal en metas:** confirmar que la nueva codificación `CF/ECM/UMI` reemplaza también la lógica anterior de canal dentro de Ventas vs Meta.

## 7. Rendimiento y orden de implementación propuesto

La tabla `sales_detail` dispone hoy de índices por `header_id` y `product_id`, pero no por `doc_date`, `costing_code` ni `costing_code3`. Para millones de líneas, la migración debería ser parametrizada y acompañarse de un índice de lectura creado por el DBA:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_detail_date_store_channel
  ON public.sales_detail (doc_date, costing_code, costing_code3)
  INCLUDE (header_id, product_id, total, subtotal, quantity);
```

> No se ejecutó este SQL: la sesión de aplicación es de solo lectura y no se debe ampliar su permiso operativo.

Una vez confirmadas las decisiones, la implementación propuesta es:

1. Crear una función SQL canónica para fecha, tienda y canal de detalle, con valores parametrizados.
2. Migrar y probar primero Análisis General y Análisis por Horas contra un período acotado.
3. Migrar productos, categorías, góndolas y Ventas vs Meta, validando importes y `COUNT(DISTINCT header_id)`.
4. Mantener temporalmente las consultas de cabecera para clientes, transacciones identificadas y notas de crédito hasta obtener equivalencias.
5. Migrar portales y exportaciones en una fase separada, con pruebas de permisos y filas de detalle.
