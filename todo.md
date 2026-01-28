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
