#!/usr/bin/env python3
"""
Diagnóstico: medir el impacto de mover el filtro de fecha al CTE base
y pre-agregar sales_detail antes del JOIN con categories_products
"""
import os, time
import psycopg2

conn = psycopg2.connect(
    host=os.environ['PG_HOST'],
    port=int(os.environ.get('PG_PORT', 5432)),
    dbname=os.environ['PG_DATABASE'],
    user=os.environ['PG_USER'],
    password=os.environ['PG_PASSWORD'],
    sslmode='require',
    connect_timeout=30,
    options='-c statement_timeout=120000'
)
cur = conn.cursor()

fecha_min = '2026-06-14'
fecha_max = '2026-06-14'

print("=" * 70)
print("DIAGNÓSTICO: Optimización de getAggregatedSales")
print("=" * 70)

# Test 1: Query actual (filtro de fecha en SELECT externo, no en CTE base)
print("\n[Test 1] Query ACTUAL — filtro de fecha en SELECT externo (full scan del CTE)")
q1 = f"""
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
WITH base AS (
  SELECT
    sh.id AS sale_id,
    sh.doc_date,
    sh.branch_id,
    sd.total AS line_total,
    cp.category_id AS leaf_category_id,
    c.parent_category_id,
    p.parent_category_id AS grandparent_category_id
  FROM sales_header sh
  JOIN sales_detail sd ON sd.header_id = sh.id
  LEFT JOIN categories_products cp
    ON cp.product_id = sd.product_id
   AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
  LEFT JOIN categories c ON c.id = cp.category_id
  LEFT JOIN categories p ON p.id = c.parent_category_id
  WHERE sh.doc_date IS NOT NULL
)
SELECT
  doc_date::date AS doc_date,
  SUM(line_total) AS sales_amount,
  COUNT(DISTINCT sale_id) AS tickets_count
FROM base
WHERE doc_date >= '{fecha_min}'::date AND doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
GROUP BY doc_date::date
ORDER BY doc_date;
"""
t0 = time.time()
cur.execute(q1)
rows = cur.fetchall()
t1 = time.time()
print(f"  Tiempo: {t1-t0:.2f}s")
# Buscar líneas clave del plan
plan_text = "\n".join(r[0] for r in rows)
for line in plan_text.split('\n'):
    if any(k in line for k in ['Seq Scan', 'Index Scan', 'Execution Time', 'Planning Time', 'Buffers', 'rows=', 'actual rows']):
        if 'Buffers' not in line or 'read=' in line:
            print(f"  {line.strip()}")

# Test 2: Query OPTIMIZADA — filtro de fecha en el CTE base
print("\n[Test 2] Query OPTIMIZADA — filtro de fecha en CTE base")
q2 = f"""
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
WITH filtered_headers AS (
  SELECT id, doc_date, branch_id
  FROM sales_header
  WHERE doc_date >= '{fecha_min}'::date
    AND doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
    AND doc_date IS NOT NULL
),
agg_detail AS (
  SELECT sd.header_id, SUM(sd.total) AS line_total
  FROM sales_detail sd
  WHERE sd.header_id IN (SELECT id FROM filtered_headers)
  GROUP BY sd.header_id
),
base AS (
  SELECT
    fh.id AS sale_id,
    fh.doc_date,
    fh.branch_id,
    ad.line_total,
    cp.category_id AS leaf_category_id,
    c.parent_category_id,
    p.parent_category_id AS grandparent_category_id
  FROM filtered_headers fh
  JOIN agg_detail ad ON ad.header_id = fh.id
  LEFT JOIN sales_detail sd2 ON sd2.header_id = fh.id
  LEFT JOIN categories_products cp
    ON cp.product_id = sd2.product_id
   AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
  LEFT JOIN categories c ON c.id = cp.category_id
  LEFT JOIN categories p ON p.id = c.parent_category_id
)
SELECT
  doc_date::date AS doc_date,
  SUM(line_total) AS sales_amount,
  COUNT(DISTINCT sale_id) AS tickets_count
FROM base
GROUP BY doc_date::date
ORDER BY doc_date;
"""
t0 = time.time()
cur.execute(q2)
rows = cur.fetchall()
t1 = time.time()
print(f"  Tiempo: {t1-t0:.2f}s")
plan_text = "\n".join(r[0] for r in rows)
for line in plan_text.split('\n'):
    if any(k in line for k in ['Seq Scan', 'Index Scan', 'Execution Time', 'Planning Time', 'Buffers', 'rows=', 'actual rows']):
        if 'Buffers' not in line or 'read=' in line:
            print(f"  {line.strip()}")

# Test 3: Query más simple — solo filtrar headers por fecha, sumar detail por header_id
print("\n[Test 3] Query SIMPLIFICADA — pre-agregar sales_detail por header_id")
q3 = f"""
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
WITH filtered_headers AS (
  SELECT id, doc_date, branch_id
  FROM sales_header
  WHERE doc_date >= '{fecha_min}'::date
    AND doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
    AND doc_date IS NOT NULL
),
agg_detail AS (
  SELECT sd.header_id, SUM(sd.total) AS line_total, COUNT(*) AS line_count
  FROM sales_detail sd
  INNER JOIN filtered_headers fh ON fh.id = sd.header_id
  GROUP BY sd.header_id
)
SELECT
  fh.doc_date::date AS doc_date,
  SUM(ad.line_total) AS sales_amount,
  COUNT(DISTINCT fh.id) AS tickets_count
FROM filtered_headers fh
JOIN agg_detail ad ON ad.header_id = fh.id
GROUP BY fh.doc_date::date
ORDER BY fh.doc_date::date;
"""
t0 = time.time()
cur.execute(q3)
rows = cur.fetchall()
t1 = time.time()
print(f"  Tiempo: {t1-t0:.2f}s")
plan_text = "\n".join(r[0] for r in rows)
for line in plan_text.split('\n'):
    if any(k in line for k in ['Seq Scan', 'Index Scan', 'Execution Time', 'Planning Time', 'Buffers', 'rows=', 'actual rows']):
        if 'Buffers' not in line or 'read=' in line:
            print(f"  {line.strip()}")

# Test 4: Comparación de períodos optimizada
print("\n[Test 4] getAggregatedComparison OPTIMIZADA")
prev_start = '2026-06-13'
prev_end = '2026-06-13'
q4 = f"""
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
WITH filtered_headers AS (
  SELECT id, doc_date, branch_id,
    CASE
      WHEN doc_date >= '{fecha_min}'::date AND doc_date < ('{fecha_max}'::date + INTERVAL '1 day') THEN 'current'
      WHEN doc_date >= '{prev_start}'::date AND doc_date < ('{prev_end}'::date + INTERVAL '1 day') THEN 'previous'
    END AS period
  FROM sales_header
  WHERE doc_date IS NOT NULL
    AND (
      (doc_date >= '{fecha_min}'::date AND doc_date < ('{fecha_max}'::date + INTERVAL '1 day'))
      OR (doc_date >= '{prev_start}'::date AND doc_date < ('{prev_end}'::date + INTERVAL '1 day'))
    )
),
agg_detail AS (
  SELECT sd.header_id, SUM(sd.total) AS line_total
  FROM sales_detail sd
  INNER JOIN filtered_headers fh ON fh.id = sd.header_id
  GROUP BY sd.header_id
)
SELECT
  fh.period,
  SUM(ad.line_total) AS total_sales,
  COUNT(DISTINCT fh.id) AS total_tickets
FROM filtered_headers fh
JOIN agg_detail ad ON ad.header_id = fh.id
WHERE fh.period IS NOT NULL
GROUP BY fh.period;
"""
t0 = time.time()
cur.execute(q4)
rows = cur.fetchall()
t1 = time.time()
print(f"  Tiempo: {t1-t0:.2f}s")
plan_text = "\n".join(r[0] for r in rows)
for line in plan_text.split('\n'):
    if any(k in line for k in ['Seq Scan', 'Index Scan', 'Execution Time', 'Planning Time', 'Buffers', 'rows=', 'actual rows']):
        if 'Buffers' not in line or 'read=' in line:
            print(f"  {line.strip()}")

cur.close()
conn.close()
print("\n✅ Diagnóstico completado")
