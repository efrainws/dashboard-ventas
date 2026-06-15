"""
Diagnosticar el problema de orden de JOINs en las queries del portal de marca propia.
Comparar el patrón actual (sd → p → sh) vs el patrón optimizado (sh → sd → p).
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

# Warm-up
cur.execute("SELECT 1"); cur.fetchone()
print("Conexión OK. Iniciando diagnóstico de orden de JOINs...\n")

# Obtener brand IDs reales de marca propia
cur.execute("""
    SELECT id FROM brands 
    WHERE name IN ('FLORA & FAUNA', 'EL HUERTO', 'FLORA Y FAUNA', 'MERCH F&F')
    LIMIT 10
""")
brand_rows = cur.fetchall()
brand_ids = [str(r['id']) for r in brand_rows]
print(f"Brand IDs encontrados: {len(brand_ids)}")

# Si no hay brand IDs específicos, usar los primeros 3 de la tabla
if not brand_ids:
    cur.execute("SELECT id FROM brands LIMIT 3")
    brand_ids = [str(r['id']) for r in cur.fetchall()]
    print(f"Usando primeros {len(brand_ids)} brand IDs como fallback")

placeholders = ','.join([f"'{bid}'" for bid in brand_ids])
print(f"Brand IDs: {[bid[:8] for bid in brand_ids]}\n")

def measure_explain(label, query):
    t0 = time.time()
    try:
        cur.execute(query)
        rows = cur.fetchall()
        elapsed = time.time() - t0
        print(f"  {'✓' if elapsed < 2 else '⚠' if elapsed < 10 else '✗'} {label}: {elapsed:.3f}s ({len(rows):,} filas)")
        return rows, elapsed
    except Exception as e:
        elapsed = time.time() - t0
        conn.rollback()
        print(f"  ✗ {label}: ERROR {elapsed:.3f}s — {str(e)[:100]}")
        return [], elapsed

print("=== TEST 1: getMonthlySales — patrón ACTUAL (sd → p → sh) ===\n")

_, t1 = measure_explain("getMonthlySales ACTUAL (sd→p→sh, 6 meses)", f"""
    SELECT
        TO_CHAR(sh.doc_date, 'YYYY-MM') AS mes,
        ROUND(SUM(sd.total)::numeric, 2) AS total_ventas,
        COUNT(DISTINCT sh.id)::int AS tickets
    FROM public.sales_detail sd
    JOIN public.products p ON p.id = sd.product_id
    JOIN public.sales_header sh ON sh.id = sd.header_id
    WHERE p.id IN (SELECT id FROM public.products WHERE brand_id IN ({placeholders}))
      AND sh.doc_date >= NOW() - INTERVAL '6 months'
    GROUP BY TO_CHAR(sh.doc_date, 'YYYY-MM')
    ORDER BY mes ASC
""")

print("\n=== TEST 2: getMonthlySales — patrón OPTIMIZADO (sh → sd → p) ===\n")

_, t2 = measure_explain("getMonthlySales OPTIMIZADO (sh→sd→p, 6 meses)", f"""
    SELECT
        TO_CHAR(sh.doc_date, 'YYYY-MM') AS mes,
        ROUND(SUM(sd.total)::numeric, 2) AS total_ventas,
        COUNT(DISTINCT sh.id)::int AS tickets
    FROM public.sales_header sh
    JOIN public.sales_detail sd ON sd.header_id = sh.id
    JOIN public.products p ON p.id = sd.product_id
    WHERE p.brand_id IN ({placeholders})
      AND sh.doc_date >= NOW() - INTERVAL '6 months'
    GROUP BY TO_CHAR(sh.doc_date, 'YYYY-MM')
    ORDER BY mes ASC
""")

print("\n=== TEST 3: getSalesSummary — patrón ACTUAL vs OPTIMIZADO ===\n")

_, t3a = measure_explain("getSalesSummary ACTUAL (sd→p→sh, 14 días)", f"""
    SELECT ROUND(SUM(sd.total)::numeric, 2) AS total_ventas, COUNT(DISTINCT sh.id)::int AS tickets
    FROM public.sales_detail sd
    JOIN public.products p ON p.id = sd.product_id
    JOIN public.sales_header sh ON sh.id = sd.header_id
    WHERE p.id IN (SELECT id FROM public.products WHERE brand_id IN ({placeholders}))
      AND sh.doc_date >= '2026-06-01'::date
      AND sh.doc_date < ('2026-06-14'::date + INTERVAL '1 day')
""")

_, t3b = measure_explain("getSalesSummary OPTIMIZADO (sh→sd→p, 14 días)", f"""
    SELECT ROUND(SUM(sd.total)::numeric, 2) AS total_ventas, COUNT(DISTINCT sh.id)::int AS tickets
    FROM public.sales_header sh
    JOIN public.sales_detail sd ON sd.header_id = sh.id
    JOIN public.products p ON p.id = sd.product_id
    WHERE p.brand_id IN ({placeholders})
      AND sh.doc_date >= '2026-06-01'::date
      AND sh.doc_date < ('2026-06-14'::date + INTERVAL '1 day')
""")

print("\n=== TEST 4: getTopProducts — patrón ACTUAL vs OPTIMIZADO ===\n")

_, t4a = measure_explain("getTopProducts ACTUAL (sd→p→sh, 14 días)", f"""
    SELECT p.id, p.name, p.sku, ROUND(SUM(sd.total)::numeric, 2) AS total_ventas
    FROM public.sales_detail sd
    JOIN public.products p ON p.id = sd.product_id
    JOIN public.sales_header sh ON sh.id = sd.header_id
    WHERE p.id IN (SELECT id FROM public.products WHERE brand_id IN ({placeholders}))
      AND sh.doc_date >= '2026-06-01'::date
      AND sh.doc_date < ('2026-06-14'::date + INTERVAL '1 day')
    GROUP BY p.id, p.name, p.sku
    ORDER BY total_ventas DESC LIMIT 20
""")

_, t4b = measure_explain("getTopProducts OPTIMIZADO (sh→sd→p, 14 días)", f"""
    SELECT p.id, p.name, p.sku, ROUND(SUM(sd.total)::numeric, 2) AS total_ventas
    FROM public.sales_header sh
    JOIN public.sales_detail sd ON sd.header_id = sh.id
    JOIN public.products p ON p.id = sd.product_id
    WHERE p.brand_id IN ({placeholders})
      AND sh.doc_date >= '2026-06-01'::date
      AND sh.doc_date < ('2026-06-14'::date + INTERVAL '1 day')
    GROUP BY p.id, p.name, p.sku
    ORDER BY total_ventas DESC LIMIT 20
""")

print("\n=== TEST 5: EXPLAIN ANALYZE del patrón optimizado ===\n")

cur.execute(f"""
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT ROUND(SUM(sd.total)::numeric, 2) AS total_ventas
    FROM public.sales_header sh
    JOIN public.sales_detail sd ON sd.header_id = sh.id
    JOIN public.products p ON p.id = sd.product_id
    WHERE p.brand_id IN ({placeholders})
      AND sh.doc_date >= '2026-06-01'::date
      AND sh.doc_date < ('2026-06-14'::date + INTERVAL '1 day')
""")
for row in cur.fetchall():
    line = row['QUERY PLAN']
    if any(k in line for k in ['Seq Scan', 'Index', 'Nested Loop', 'Hash', 'cost=', 'actual time', 'Buffers', 'I/O']):
        print(f"  {line}")

print("\n=== RESUMEN DE MEJORAS ===\n")
if t1 > 0 and t2 > 0:
    print(f"  getMonthlySales: {t1:.1f}s → {t2:.3f}s ({t1/t2:.0f}x más rápido)")
if t3a > 0 and t3b > 0:
    print(f"  getSalesSummary: {t3a:.3f}s → {t3b:.3f}s ({t3a/t3b:.0f}x más rápido)")
if t4a > 0 and t4b > 0:
    print(f"  getTopProducts:  {t4a:.3f}s → {t4b:.3f}s ({t4a/t4b:.0f}x más rápido)")

cur.close()
conn.close()
print("\n=== DIAGNÓSTICO COMPLETADO ===")
