"""
Diagnóstico profundo: identificar el cuello de botella real en la query completa.
El COUNT simple es rápido (0.15s) pero el JOIN completo tarda 29s.
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

print("=== DIAGNÓSTICO PROFUNDO ===\n")

# ── 1. Solo sales_header con rango ────────────────────────────────────────
print("1. Solo sales_header con rango:")
t0 = time.time()
cur.execute(f"""
    SELECT COUNT(*) FROM sales_header sh
    WHERE sh.doc_date >= '{fecha_min}'::date
      AND sh.doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
""")
row = cur.fetchone()
print(f"   {row['count']:,} filas — {time.time()-t0:.3f}s")

# ── 2. JOIN con sales_detail ──────────────────────────────────────────────
print("\n2. JOIN sales_header + sales_detail:")
t0 = time.time()
cur.execute(f"""
    SELECT COUNT(*) FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    WHERE sh.doc_date >= '{fecha_min}'::date
      AND sh.doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
""")
row = cur.fetchone()
print(f"   {row['count']:,} filas — {time.time()-t0:.3f}s")

# ── 3. + JOIN branches ────────────────────────────────────────────────────
print("\n3. + LEFT JOIN branches:")
t0 = time.time()
cur.execute(f"""
    SELECT COUNT(*) FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    LEFT JOIN branches b ON b.id = sh.branch_id
    WHERE sh.doc_date >= '{fecha_min}'::date
      AND sh.doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
""")
row = cur.fetchone()
print(f"   {row['count']:,} filas — {time.time()-t0:.3f}s")

# ── 4. + JOIN categories_products ────────────────────────────────────────
print("\n4. + LEFT JOIN categories_products:")
t0 = time.time()
cur.execute(f"""
    SELECT COUNT(*) FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    LEFT JOIN branches b ON b.id = sh.branch_id
    LEFT JOIN categories_products cp
      ON cp.product_id = sd.product_id
     AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
    WHERE sh.doc_date >= '{fecha_min}'::date
      AND sh.doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
""")
row = cur.fetchone()
print(f"   {row['count']:,} filas — {time.time()-t0:.3f}s")

# ── 5. + JOIN categories (x2) ────────────────────────────────────────────
print("\n5. + LEFT JOIN categories (x2 para parent/grandparent):")
t0 = time.time()
cur.execute(f"""
    SELECT COUNT(*) FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    LEFT JOIN branches b ON b.id = sh.branch_id
    LEFT JOIN categories_products cp
      ON cp.product_id = sd.product_id
     AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
    LEFT JOIN categories c ON c.id = cp.category_id
    LEFT JOIN categories p ON p.id = c.parent_category_id
    WHERE sh.doc_date >= '{fecha_min}'::date
      AND sh.doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
""")
row = cur.fetchone()
print(f"   {row['count']:,} filas — {time.time()-t0:.3f}s")

# ── 6. + CASE EXISTS (methods_payment) ───────────────────────────────────
print("\n6. + CASE EXISTS (methods_payment) — el sospechoso principal:")
t0 = time.time()
cur.execute(f"""
    SELECT COUNT(*) FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    LEFT JOIN branches b ON b.id = sh.branch_id
    LEFT JOIN categories_products cp
      ON cp.product_id = sd.product_id
     AND cp.category_group_id = '07a06cd5-d1a8-4ea5-9ca5-98865d9630ca'
    LEFT JOIN categories c ON c.id = cp.category_id
    LEFT JOIN categories p ON p.id = c.parent_category_id
    WHERE sh.doc_date >= '{fecha_min}'::date
      AND sh.doc_date < ('{fecha_max}'::date + INTERVAL '1 day')
      AND EXISTS (
        SELECT 1 FROM methods_payment mp
        WHERE mp.header_id = sh.id
          AND mp.payment_account_id = '7a8fefe8-ddaa-40d1-ace5-d0aebb1b3204'::uuid
      )
""")
row = cur.fetchone()
print(f"   {row['count']:,} filas — {time.time()-t0:.3f}s")

# ── 7. Query completa SIN el CASE EXISTS ─────────────────────────────────
print("\n7. Query completa SIN CASE EXISTS (sales_channel simplificado):")
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
    SELECT COUNT(*) FROM base
""")
row = cur.fetchone()
print(f"   {row['count']:,} filas — {time.time()-t0:.3f}s")

# ── 8. Query completa CON el CASE EXISTS ─────────────────────────────────
print("\n8. Query completa CON CASE EXISTS (sales_channel completo):")
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
        p.parent_category_id AS grandparent_category_id,
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
    SELECT COUNT(*) FROM base
""")
row = cur.fetchone()
print(f"   {row['count']:,} filas — {time.time()-t0:.3f}s")

# ── 9. Verificar índices en methods_payment ───────────────────────────────
print("\n9. Índices en methods_payment:")
cur.execute("""
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'methods_payment'
    ORDER BY indexname
""")
rows = cur.fetchall()
if rows:
    for row in rows:
        print(f"   {row['indexname']}: {row['indexdef'][:80]}")
else:
    print("   ¡SIN ÍNDICES en methods_payment!")

# ── 10. Tamaño de methods_payment ─────────────────────────────────────────
print("\n10. Tamaño de methods_payment:")
cur.execute("SELECT reltuples::bigint AS est FROM pg_class WHERE relname = 'methods_payment'")
row = cur.fetchone()
print(f"   ~{row['est']:,} filas (estimado)")

cur.close()
conn.close()
print("\n=== DIAGNÓSTICO COMPLETADO ===")
