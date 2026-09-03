# Estrategia de rendimiento para grandes volúmenes

## Alcance aplicado

Se reforzó la capa de consultas del dashboard sin realizar cambios de escritura en PostgreSQL. El caché en proceso ahora mantiene una capacidad máxima de **500 entradas**, conserva la protección ante solicitudes simultáneas para una misma clave y expone métricas de tamaño, capacidad, aciertos, fallos y evacuaciones. Esto evita que combinaciones de filtros de fecha, sucursal y categoría aumenten indefinidamente el consumo de memoria de la instancia.

El precalentamiento de PostgreSQL también se ajustó para recorrer las páginas necesarias mediante consultas `COUNT(*)` y límites controlados. De este modo mantiene el beneficio de calentar las tablas de ventas y productos sin transferir cientos de miles de filas al proceso de Node.js en cada inicio.

La auditoría de índices se automatizó con `scripts/analyze_postgres_indexes.py`. El script trabaja en modo de transacción de solo lectura, usa las variables `PG_*` del entorno y escribe su salida en `docs/postgres-index-audit.json`.

## Hallazgo de la auditoría

La revisión detectó índices para las uniones principales de `sales_detail`, productos, stocks y catálogos. Sin embargo, `sales_header` no tiene un índice que incluya `doc_date` ni `branch_id`, a pesar de que las consultas analíticas filtran recurrentemente por fecha y, en varios casos, por sucursal.

> No se creó ningún índice automáticamente, ya que el acceso a PostgreSQL para este proyecto es de solo lectura. La creación debe solicitarse al DBA después de validar el plan de ejecución en producción.

## Recomendación para el DBA

Validar con `EXPLAIN (ANALYZE, BUFFERS)` una consulta representativa de ventas por período y sucursal. Si se confirma un escaneo secuencial costoso, evaluar el siguiente índice compuesto:

```sql
CREATE INDEX CONCURRENTLY idx_sales_header_branch_date
  ON public.sales_header (branch_id, doc_date);
```

Para consultas globales que solo filtran por rango de fechas, validar por separado la conveniencia de:

```sql
CREATE INDEX CONCURRENTLY idx_sales_header_doc_date
  ON public.sales_header (doc_date);
```

No se deben aplicar ambos índices sin revisar el plan y la carga de escrituras, pues un índice adicional tiene costo de almacenamiento y mantenimiento durante las importaciones de ventas.

## Operación recomendada

| Frecuencia | Acción | Responsable |
|---|---|---|
| Por despliegue | Ejecutar `python3 scripts/analyze_postgres_indexes.py` | Equipo técnico |
| Ante lentitud de una vista | Capturar `EXPLAIN (ANALYZE, BUFFERS)` con filtros representativos | DBA / datos |
| Tras un cambio de índice | Comparar latencia p50/p95 y plan de ejecución | DBA / equipo técnico |
| Continua | Revisar métricas del caché y evitar claves de alta cardinalidad | Equipo de aplicación |
