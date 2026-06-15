"""
Diagnóstico de rendimiento de la query getAggregatedSales.
Ejecuta EXPLAIN y mide tiempos reales.
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

fecha = "2026-06-14"

# ── 1. Tamaño de tablas ────────────────────────────────────────────────────
print("=== TAMAÑO DE TABLAS ===")
for table in ["sales_header", "sales_detail", "categories_products", "categories", "branches"]:
    cur.execute("SELECT reltuples::bigint AS est FROM pg_class WHERE relname = %s", (table,))
    row = cur.fetchone()
    print(f"  {table}: ~{row['est']:,} filas (estimado)")

# ── 2. Índices en tablas clave ─────────────────────────────────────────────
print("\n=== ÍNDICES EN TABLAS CLAVE ===")
cur.execute("""
    SELECT
        t.relname AS table_name,
        i.relname AS index_name,
        pg_get_indexdef(ix.indexrelid) AS index_def
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    WHERE t.relname IN ('sales_header', 'sales_detail', 'categories_products')
    ORDER BY t.relname, i.relname
""")
rows = cur.fetchall()
if rows:
    for row in rows:
        print(f"  [{row['table_name']}] {row['index_name']}")
        print(f"    {row['index_def']}")
else:
    print("  ¡NO HAY ÍNDICES en las tablas clave!")

# ── 3. EXPLAIN de la query principal ──────────────────────────────────────
print(f"\n=== EXPLAIN de getAggregatedSales para {fecha} ===")
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
  WHERE sh.doc_date IS NOT NULL
)
SELECT
  doc_date::date AS doc_date,
  branch_id,
  branch_sap_id,
  COALESCE(grandparent_category_id, parent_category_id, leaf_category_id) AS category_id,
  SUM(line_total) AS sales_amount,
  COUNT(DISTINCT sale_id) AS tickets_count
FROM base
WHERE doc_date::date = '{fecha}'::date
GROUP BY doc_date::date, branch_id, branch_sap_id, category_id
ORDER BY doc_date
""")
for row in cur.fetchall():
    print(" ", list(row.values())[0])

# ── 4. Tiempo de COUNT simple en sales_header ─────────────────────────────
print(f"\n=== TIEMPO: COUNT en sales_header para {fecha} ===")
t0 = time.time()
cur.execute(f"SELECT COUNT(*) AS cnt FROM sales_header WHERE doc_date::date = '{fecha}'::date")
row = cur.fetchone()
elapsed = time.time() - t0
print(f"  Filas: {row['cnt']:,} — Tiempo: {elapsed:.3f}s")

# ── 5. Tiempo de JOIN sales_header + sales_detail ─────────────────────────
print(f"\n=== TIEMPO: JOIN sales_header + sales_detail para {fecha} ===")
t0 = time.time()
cur.execute(f"""
    SELECT COUNT(*) AS cnt
    FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    WHERE sh.doc_date::date = '{fecha}'::date
""")
row = cur.fetchone()
elapsed = time.time() - t0
print(f"  Filas: {row['cnt']:,} — Tiempo: {elapsed:.3f}s")

# ── 6. Verificar si doc_date es timestamp o date ──────────────────────────
print(f"\n=== TIPO DE doc_date EN sales_header ===")
cur.execute("""
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name = 'sales_header'
    ORDER BY ordinal_position
""")
for row in cur.fetchall():
    print(f"  {row['column_name']}: {row['data_type']} ({row['udt_name']})")

cur.close()
conn.close()
print("\n=== DIAGNÓSTICO COMPLETADO ===")
