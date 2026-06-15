"""
Verificar índices en sales_detail y probar estrategia de pre-materialización.
El problema: sales_detail no tiene índice en product_id → full scan de 4M filas.
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
cur.execute("SELECT 1"); cur.fetchone()
print("Conexión OK\n")

# Verificar índices en sales_detail
print("=== ÍNDICES EN SALES_DETAIL ===\n")
cur.execute("""
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'sales_detail'
    ORDER BY indexname
""")
for row in cur.fetchall():
    print(f"  {row['indexname']}:")
    print(f"    {row['indexdef'][:120]}")

# Verificar índices en products
print("\n=== ÍNDICES EN PRODUCTS ===\n")
cur.execute("""
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'products'
    ORDER BY indexname
""")
for row in cur.fetchall():
    print(f"  {row['indexname']}:")
    print(f"    {row['indexdef'][:120]}")

# Verificar índices en products_supplier
print("\n=== ÍNDICES EN PRODUCTS_SUPPLIER ===\n")
cur.execute("""
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'products_supplier'
    ORDER BY indexname
""")
for row in cur.fetchall():
    print(f"  {row['indexname']}:")
    print(f"    {row['indexdef'][:120]}")

# Obtener brand IDs reales
cur.execute("""
    SELECT id FROM brands 
    WHERE name IN ('FLORA & FAUNA', 'EL HUERTO', 'FLORA Y FAUNA', 'MERCH F&F')
""")
brand_ids = [str(r['id']) for r in cur.fetchall()]
placeholders = ','.join([f"'{bid}'" for bid in brand_ids])
print(f"\nBrand IDs: {len(brand_ids)} marcas propias")

# Contar cuántos products tienen esas marcas
cur.execute(f"SELECT COUNT(*) FROM products WHERE brand_id IN ({placeholders})")
n_products = cur.fetchone()['count']
print(f"Productos de marca propia: {n_products:,}")

# Contar cuántos sales_detail tienen esos productos
cur.execute(f"""
    SELECT COUNT(*) FROM sales_detail sd
    WHERE sd.product_id IN (SELECT id FROM products WHERE brand_id IN ({placeholders}))
""")
n_sd = cur.fetchone()['count']
print(f"Líneas de sales_detail de marca propia: {n_sd:,}")

print("\n=== ESTRATEGIA 1: Filtrar por header_id usando EXISTS ===\n")

def measure(label, query, params=None):
    t0 = time.time()
    try:
        cur.execute(query, params)
        rows = cur.fetchall()
        elapsed = time.time() - t0
        status = '✓' if elapsed < 2 else '⚠' if elapsed < 10 else '✗'
        print(f"  {status} {label}: {elapsed:.3f}s ({len(rows):,} filas)")
        return rows, elapsed
    except Exception as e:
        elapsed = time.time() - t0
        conn.rollback()
        print(f"  ✗ {label}: ERROR {elapsed:.3f}s — {str(e)[:100]}")
        return [], elapsed

# Estrategia 1: Filtrar sales_header por EXISTS en sales_detail con product_id
measure("EXISTS subquery (sh→EXISTS sd→p, 14 días)", f"""
    SELECT ROUND(SUM(sd.total)::numeric, 2) AS total_ventas
    FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    WHERE sh.doc_date >= '2026-06-01'::date
      AND sh.doc_date < ('2026-06-14'::date + INTERVAL '1 day')
      AND EXISTS (
          SELECT 1 FROM products p2
          WHERE p2.id = sd.product_id
            AND p2.brand_id IN ({placeholders})
      )
""")

# Estrategia 2: Pre-materializar product IDs en CTE
measure("CTE product_ids (pre-materializar, 14 días)", f"""
    WITH brand_product_ids AS (
        SELECT id FROM products WHERE brand_id IN ({placeholders})
    )
    SELECT ROUND(SUM(sd.total)::numeric, 2) AS total_ventas
    FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    WHERE sh.doc_date >= '2026-06-01'::date
      AND sh.doc_date < ('2026-06-14'::date + INTERVAL '1 day')
      AND sd.product_id IN (SELECT id FROM brand_product_ids)
""")

# Estrategia 3: JOIN directo products con brand_id filter
measure("JOIN directo brand_id (14 días)", f"""
    SELECT ROUND(SUM(sd.total)::numeric, 2) AS total_ventas
    FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    JOIN products p ON p.id = sd.product_id AND p.brand_id IN ({placeholders})
    WHERE sh.doc_date >= '2026-06-01'::date
      AND sh.doc_date < ('2026-06-14'::date + INTERVAL '1 day')
""")

# Estrategia 4: Usar idx_sales_detail_header_id + filtrar por product_id después
measure("Filtrar header_id primero, luego product_id (14 días)", f"""
    WITH headers AS (
        SELECT id FROM sales_header
        WHERE doc_date >= '2026-06-01'::date
          AND doc_date < ('2026-06-14'::date + INTERVAL '1 day')
    ),
    brand_products AS (
        SELECT id FROM products WHERE brand_id IN ({placeholders})
    )
    SELECT ROUND(SUM(sd.total)::numeric, 2) AS total_ventas
    FROM sales_detail sd
    WHERE sd.header_id IN (SELECT id FROM headers)
      AND sd.product_id IN (SELECT id FROM brand_products)
""")

# Estrategia 5: Mismo pero con 6 meses (como getMonthlySales)
measure("getMonthlySales optimizado (6 meses)", f"""
    WITH headers AS (
        SELECT id, doc_date FROM sales_header
        WHERE doc_date >= NOW() - INTERVAL '6 months'
    ),
    brand_products AS (
        SELECT id FROM products WHERE brand_id IN ({placeholders})
    )
    SELECT
        TO_CHAR(h.doc_date, 'YYYY-MM') AS mes,
        ROUND(SUM(sd.total)::numeric, 2) AS total_ventas,
        COUNT(DISTINCT sd.header_id)::int AS tickets
    FROM sales_detail sd
    JOIN headers h ON h.id = sd.header_id
    WHERE sd.product_id IN (SELECT id FROM brand_products)
    GROUP BY TO_CHAR(h.doc_date, 'YYYY-MM')
    ORDER BY mes ASC
""")

# EXPLAIN ANALYZE de la estrategia más prometedora
print("\n=== EXPLAIN ANALYZE estrategia 5 (6 meses) ===\n")
cur.execute(f"""
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    WITH headers AS (
        SELECT id, doc_date FROM sales_header
        WHERE doc_date >= NOW() - INTERVAL '6 months'
    ),
    brand_products AS (
        SELECT id FROM products WHERE brand_id IN ({placeholders})
    )
    SELECT COUNT(*) FROM sales_detail sd
    JOIN headers h ON h.id = sd.header_id
    WHERE sd.product_id IN (SELECT id FROM brand_products)
""")
for row in cur.fetchall():
    line = row['QUERY PLAN']
    if any(k in line for k in ['Seq Scan', 'Index', 'Nested Loop', 'Hash', 'cost=', 'actual time', 'Buffers', 'I/O', 'rows=']):
        print(f"  {line}")

cur.close()
conn.close()
print("\n=== DIAGNÓSTICO COMPLETADO ===")
