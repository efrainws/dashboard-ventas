"""
Verificar índices en sales_header y medir tiempo real de queries
después del warm-up del pool (sin cold start).
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
    connect_timeout=60,
    options="-c statement_timeout=120000",
)
conn.set_session(readonly=True)
cur = conn.cursor(cursor_factory=RealDictCursor)

print("=== ÍNDICES EN SALES_HEADER ===\n")
cur.execute("""
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'sales_header'
    ORDER BY indexname
""")
for row in cur.fetchall():
    print(f"  {row['indexname']}:")
    print(f"    {row['indexdef'][:120]}")

print("\n=== TAMAÑO DE TABLAS ===\n")
cur.execute("""
    SELECT
      relname AS table_name,
      reltuples::bigint AS est_rows,
      pg_size_pretty(pg_total_relation_size(oid)) AS total_size
    FROM pg_class
    WHERE relname IN ('sales_header', 'sales_detail', 'categories_products', 'methods_payment')
    ORDER BY reltuples DESC
""")
for row in cur.fetchall():
    print(f"  {row['table_name']}: ~{row['est_rows']:,} filas, {row['total_size']}")

print("\n=== WARM-UP: primera query (establece conexión) ===")
t0 = time.time()
cur.execute("SELECT 1")
cur.fetchone()
print(f"  SELECT 1: {time.time()-t0:.3f}s")

print("\n=== QUERIES REALES (post warm-up) ===\n")

fecha_min = "2026-06-14"
fecha_max = "2026-06-14"

# Query 1: COUNT simple
t0 = time.time()
cur.execute(f"""
    SELECT COUNT(*) FROM sales_header sh
    WHERE sh.doc_date >= '{fecha_min}'::date
      AND sh.doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
""")
row = cur.fetchone()
print(f"1. COUNT sales_header (1 día): {row['count']:,} filas — {time.time()-t0:.3f}s")

# Query 2: JOIN completo
t0 = time.time()
cur.execute(f"""
    SELECT COUNT(*) FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    WHERE sh.doc_date >= '{fecha_min}'::date
      AND sh.doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
""")
row = cur.fetchone()
print(f"2. JOIN sales_detail (1 día): {row['count']:,} filas — {time.time()-t0:.3f}s")

# Query 3: getAggregatedSales completa
t0 = time.time()
cur.execute(f"""
    WITH base AS (
      SELECT
        sh.id AS sale_id,
        sh.doc_date,
        sh.branch_id,
        b.sap_id AS branch_sap_id,
        b.name AS branch_name,
        b.address AS branch_address,
        sd.total AS line_total,
        cp.category_id AS leaf_category_id,
        c.parent_category_id,
        p.parent_category_id AS grandparent_category_id,
        CASE
          WHEN sh.source_system_id = 'be387046-08e4-4229-a52c-7ff5c1569c89'::uuid
            THEN 'eCommerce'
          ELSE 'Presencial'
        END AS sales_channel
      FROM sales_header sh
      JOIN sales_detail sd ON sd.header_id = sh.id
      LEFT JOIN branches b ON b.id = sh.branch_id
      LEFT JOIN categories_products cp
        ON cp.product_id = sd.product_id
       AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
      LEFT JOIN categories c ON c.id = cp.category_id
      LEFT JOIN categories p ON p.id = c.parent_category_id
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
print(f"3. getAggregatedSales completa (1 día): {len(rows):,} filas — {time.time()-t0:.3f}s")

# Query 4: 7 días
t0 = time.time()
cur.execute(f"""
    WITH base AS (
      SELECT sh.id AS sale_id, sh.doc_date, sh.branch_id, b.sap_id AS branch_sap_id,
             sd.total AS line_total, cp.category_id AS leaf_category_id,
             c.parent_category_id, p.parent_category_id AS grandparent_category_id
      FROM sales_header sh
      JOIN sales_detail sd ON sd.header_id = sh.id
      LEFT JOIN branches b ON b.id = sh.branch_id
      LEFT JOIN categories_products cp
        ON cp.product_id = sd.product_id
       AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
      LEFT JOIN categories c ON c.id = cp.category_id
      LEFT JOIN categories p ON p.id = c.parent_category_id
      WHERE sh.doc_date >= '2026-06-08'::date
        AND sh.doc_date < ('2026-06-14'::date + INTERVAL '1 day')
    )
    SELECT COUNT(*) FROM base
""")
row = cur.fetchone()
print(f"4. getAggregatedSales (7 días): {row['count']:,} filas — {time.time()-t0:.3f}s")

# Query 5: 30 días
t0 = time.time()
cur.execute(f"""
    WITH base AS (
      SELECT sh.id AS sale_id, sh.doc_date, sh.branch_id, b.sap_id AS branch_sap_id,
             sd.total AS line_total, cp.category_id AS leaf_category_id,
             c.parent_category_id, p.parent_category_id AS grandparent_category_id
      FROM sales_header sh
      JOIN sales_detail sd ON sd.header_id = sh.id
      LEFT JOIN branches b ON b.id = sh.branch_id
      LEFT JOIN categories_products cp
        ON cp.product_id = sd.product_id
       AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
      LEFT JOIN categories c ON c.id = cp.category_id
      LEFT JOIN categories p ON p.id = c.parent_category_id
      WHERE sh.doc_date >= '2026-05-15'::date
        AND sh.doc_date < ('2026-06-14'::date + INTERVAL '1 day')
    )
    SELECT COUNT(*) FROM base
""")
row = cur.fetchone()
print(f"5. getAggregatedSales (30 días): {row['count']:,} filas — {time.time()-t0:.3f}s")

# Query 6: EXPLAIN ANALYZE de la query completa para 1 día
print("\n=== EXPLAIN ANALYZE (1 día) ===\n")
cur.execute(f"""
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT COUNT(*) FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    WHERE sh.doc_date >= '{fecha_min}'::date
      AND sh.doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
""")
rows = cur.fetchall()
for row in rows:
    print(f"  {row['QUERY PLAN']}")

cur.close()
conn.close()
print("\n=== DIAGNÓSTICO COMPLETADO ===")
