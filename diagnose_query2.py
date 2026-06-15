"""
Diagnóstico 2: verificar si el filtro de rango de timestamp es más rápido.
La BD es de solo lectura — no podemos crear índices.
"""
import os, time
import psycopg2
from psycopg2.extras import RealDictCursor

conn = psycopg2.connect(
    host=os.environ["PG_HOST"],
    port=int(os.environ.get("PG_PORT", 5432)),
    user=os.environ["PG_USER"],
    password=os.environ["PG_PASSWORD"],
    dbname=os.environ["PG_DATABASE"],
    sslmode="require",
    connect_timeout=30,
    options="-c statement_timeout=120000",
)
conn.set_session(readonly=True)
cur = conn.cursor(cursor_factory=RealDictCursor)

fecha_min = "2026-06-14"
fecha_max = "2026-06-14"

# ── 1. Verificar todos los índices en sales_header ────────────────────────
print("=== TODOS LOS ÍNDICES EN sales_header ===")
cur.execute("""
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'sales_header'
    ORDER BY indexname
""")
for row in cur.fetchall():
    print(f"  {row['indexname']}")
    print(f"    {row['indexdef']}")

# ── 2. Método actual: cast a date (LENTO - full scan) ─────────────────────
print(f"\n=== MÉTODO ACTUAL: doc_date::date (full scan) ===")
t0 = time.time()
cur.execute(f"""
    SELECT COUNT(*) AS cnt
    FROM sales_header sh
    WHERE sh.doc_date IS NOT NULL
      AND sh.doc_date::date >= '{fecha_min}'::date
      AND sh.doc_date::date <= '{fecha_max}'::date
""")
row = cur.fetchone()
elapsed = time.time() - t0
print(f"  Filas: {row['cnt']:,} — Tiempo: {elapsed:.3f}s")

# ── 3. Método optimizado: rango de timestamp ──────────────────────────────
print(f"\n=== MÉTODO OPTIMIZADO: rango de timestamp ===")
t0 = time.time()
cur.execute(f"""
    SELECT COUNT(*) AS cnt
    FROM sales_header sh
    WHERE sh.doc_date >= '{fecha_min}'::date
      AND sh.doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
""")
row = cur.fetchone()
elapsed = time.time() - t0
print(f"  Filas: {row['cnt']:,} — Tiempo: {elapsed:.3f}s")

# ── 4. EXPLAIN del método optimizado ─────────────────────────────────────
print(f"\n=== EXPLAIN del método optimizado ===")
cur.execute(f"""
EXPLAIN (FORMAT TEXT, COSTS true)
SELECT COUNT(*) AS cnt
FROM sales_header sh
WHERE sh.doc_date >= '{fecha_min}'::date
  AND sh.doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
""")
for row in cur.fetchall():
    print(" ", list(row.values())[0])

# ── 5. EXPLAIN del JOIN completo con método optimizado ────────────────────
print(f"\n=== EXPLAIN de la query completa con rango de timestamp ===")
cur.execute(f"""
EXPLAIN (FORMAT TEXT, COSTS true)
WITH base AS (
  SELECT
    sh.id AS sale_id,
    sh.doc_date,
    sh.branch_id,
    b.sap_id AS branch_sap_id,
    sd.total AS line_total,
    cp.category_id AS leaf_category_id,
    c.parent_category_id,
    p.parent_category_id AS grandparent_category_id
  FROM sales_header sh
  JOIN sales_detail sd ON sd.header_id = sh.id
  LEFT JOIN branches b ON b.id = sh.branch_id
  LEFT JOIN categories_products cp
    ON cp.product_id = sd.product_id
   AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
  LEFT JOIN categories c ON c.id = cp.category_id
  LEFT JOIN categories p ON p.id = c.parent_category_id
  LEFT JOIN categories g ON g.id = p.parent_category_id
  WHERE sh.doc_date >= '{fecha_min}'::date
    AND sh.doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
)
SELECT
  doc_date::date AS doc_date,
  branch_id,
  branch_sap_id,
  COALESCE(grandparent_category_id, parent_category_id, leaf_category_id) AS category_id,
  SUM(line_total) AS sales_amount,
  COUNT(DISTINCT sale_id) AS tickets_count
FROM base
GROUP BY doc_date::date, branch_id, branch_sap_id, category_id
ORDER BY doc_date
""")
for row in cur.fetchall():
    print(" ", list(row.values())[0])

# ── 6. Medir tiempo real del JOIN completo optimizado ─────────────────────
print(f"\n=== TIEMPO REAL: JOIN completo con rango de timestamp ===")
t0 = time.time()
cur.execute(f"""
WITH base AS (
  SELECT
    sh.id AS sale_id,
    sh.doc_date,
    sh.branch_id,
    b.sap_id AS branch_sap_id,
    sd.total AS line_total,
    cp.category_id AS leaf_category_id,
    c.parent_category_id,
    p.parent_category_id AS grandparent_category_id
  FROM sales_header sh
  JOIN sales_detail sd ON sd.header_id = sh.id
  LEFT JOIN branches b ON b.id = sh.branch_id
  LEFT JOIN categories_products cp
    ON cp.product_id = sd.product_id
   AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
  LEFT JOIN categories c ON c.id = cp.category_id
  LEFT JOIN categories p ON p.id = c.parent_category_id
  LEFT JOIN categories g ON g.id = p.parent_category_id
  WHERE sh.doc_date >= '{fecha_min}'::date
    AND sh.doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
)
SELECT
  doc_date::date AS doc_date,
  branch_id,
  branch_sap_id,
  COALESCE(grandparent_category_id, parent_category_id, leaf_category_id) AS category_id,
  SUM(line_total) AS sales_amount,
  COUNT(DISTINCT sale_id) AS tickets_count
FROM base
GROUP BY doc_date::date, branch_id, branch_sap_id, category_id
ORDER BY doc_date
""")
rows = cur.fetchall()
elapsed = time.time() - t0
print(f"  Filas resultado: {len(rows):,} — Tiempo: {elapsed:.3f}s")

# ── 7. Medir tiempo para un rango de 30 días ─────────────────────────────
print(f"\n=== TIEMPO: 30 días con rango de timestamp ===")
t0 = time.time()
cur.execute("""
    SELECT COUNT(*) AS cnt
    FROM sales_header sh
    WHERE sh.doc_date >= '2026-05-15'::date
      AND sh.doc_date < '2026-06-15'::date
""")
row = cur.fetchone()
elapsed = time.time() - t0
print(f"  Filas: {row['cnt']:,} — Tiempo: {elapsed:.3f}s")

cur.close()
conn.close()
print("\n=== DIAGNÓSTICO 2 COMPLETADO ===")
