# Project TODO

## Problema Reportado - Inconsistencia en Cálculo de Ventas Totales
- [x] Investigar diferencia entre sumatoria de sales_header.total y sales_detail.total
- [x] Revisar consulta actual en getSalesData (usa sales_header.total)
- [x] Revisar consulta actual en getSalesByGrandparentCategory (usa sales_detail.total)
- [x] Verificar con consultas SQL directas cuál es el valor correcto
- [x] Corregir ambas consultas para usar la misma columna consistentemente
- [x] Probar que ambas consultas den el mismo resultado total
- [x] Actualizar frontend si es necesario (no requerido)

### Resultados de Verificación:
- Dashboard principal: SOL 230,864.19 (3,781 transacciones, TODAS las ventas)
- Vista de categorías: SOL 113,891.76 (1,892 transacciones, solo category_group_id específico)
- Diferencia: SOL 116,972.43 (ventas de productos fuera del grupo de categorías)
- ✓ Ambas consultas usan SUM(sales_detail.total) consistentemente
- ✓ La diferencia es correcta debido al filtro de category_group_id

### Hallazgos:
- Diferencia encontrada: SOL 44.74 (0.02%) entre sales_header y sales_detail
- sales_header.total: SOL 230,823.55
- sales_detail.total (suma): SOL 230,868.29
- Ambas consultas ahora usan SUM(sales_detail.total) para consistencia


## Problema Reportado - Discrepancia entre Montos del Dashboard
- [x] Investigar por qué el monto de ventas por categoría (SOL 113,070.88) es mayor que el monto por transacción ($62,827.54)
- [x] Verificar si hay diferencia en monedas (SOL vs USD/PEN)
- [x] Revisar si los filtros de fecha están aplicándose correctamente en ambas vistas
- [x] Verificar si hay duplicación de datos en alguna de las consultas
- [x] Corregir el problema identificado (cambiar $ a SOL en DashboardStats.tsx)
- [x] Verificar que ambos montos sean consistentes en el navegador

### Solución Aplicada:
- Cambiado símbolo $ a SOL en DashboardStats.tsx (líneas 40 y 68)
- Dashboard principal ahora muestra: SOL 62,858.44
- Vista de categorías muestra: SOL 113,378.68
- La diferencia es correcta:
  * Dashboard: 1,000 transacciones más recientes (con límite)
  * Categorías: 3,112 transacciones de la última semana (sin límite, filtradas por category_group_id)
- Ambas vistas ahora usan consistentemente el símbolo SOL

### Causa Identificada:
- Dashboard principal mostraba símbolo $ en lugar de SOL
- Vista de categorías mostraba correctamente SOL
- Los montos son diferentes porque:
  * Dashboard principal: 1,000 transacciones (con límite)
  * Vista de categorías: 3,112 transacciones (filtradas por category_group_id)
- Esto es correcto, no hay error en los datos
