"""
Verificación final: medir el tiempo de la query completa de getAggregatedSales
con el nuevo patrón de rango de timestamp.
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

print("=== VERIFICACIÓN FINAL: Mejora de rendimiento ===\n")

tests = [
    ("1 día", "2026-06-14", "2026-06-14"),
    ("7 días", "2026-06-08", "2026-06-14"),
    ("30 días", "2026-05-15", "2026-06-14"),
]

for label, fecha_min, fecha_max in tests:
    # Método LENTO (antiguo)
    t0 = time.time()
    cur.execute(f"""
        SELECT COUNT(*) FROM sales_header sh
        WHERE sh.doc_date IS NOT NULL
          AND sh.doc_date::date >= '{fecha_min}'::date
          AND sh.doc_date::date <= '{fecha_max}'::date
    """)
    cur.fetchone()
    slow = time.time() - t0

    # Método RÁPIDO (nuevo)
    t0 = time.time()
    cur.execute(f"""
        SELECT COUNT(*) FROM sales_header sh
        WHERE sh.doc_date >= '{fecha_min}'::date
          AND sh.doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
    """)
    row = cur.fetchone()
    fast = time.time() - t0

    speedup = slow / fast if fast > 0 else float('inf')
    print(f"  {label} ({row['count']:,} filas):")
    print(f"    Antiguo (::date cast): {slow:.3f}s")
    print(f"    Nuevo (rango):         {fast:.3f}s")
    print(f"    Mejora:                {speedup:.0f}x más rápido\n")

# Query completa de getAggregatedSales para 1 día
print("=== Query completa getAggregatedSales (1 día) ===")
t0 = time.time()
cur.execute("""
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
      WHERE sh.doc_date >= '2026-06-14'::date
        AND sh.doc_date < ('2026-06-14'::date + INTERVAL '1 day')
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
print(f"  Filas resultado: {len(rows):,}")
print(f"  Tiempo: {elapsed:.3f}s")
print(f"  (Antes: ~27s, Ahora: {elapsed:.1f}s → {27/elapsed:.0f}x más rápido)")

cur.close()
conn.close()
print("\n=== VERIFICACIÓN COMPLETADA ===")
