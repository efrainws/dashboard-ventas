"""
Diagnóstico del portal de marca propia.
Mide el tiempo de cada query y obtiene EXPLAIN ANALYZE para las más lentas.
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

# Warm-up de conexión
cur.execute("SELECT 1")
cur.fetchone()
print("Conexión establecida. Iniciando diagnóstico...\n")

# Parámetros típicos de uso
FECHA_MIN = "2026-06-01"
FECHA_MAX = "2026-06-14"
CATEGORY_GROUP_ID = "07a06cd5-d1a8-4ea5-9ca5-98865d9630ca"

# Obtener los IDs de marcas propias desde PostgreSQL
cur.execute("""
    SELECT DISTINCT b.id, b.name 
    FROM brands b
    WHERE b.name ILIKE '%flora%' OR b.name ILIKE '%huerto%' OR b.name ILIKE '%merch%'
    LIMIT 5
""")
brands = cur.fetchall()
print(f"Marcas encontradas: {[(b['name'], str(b['id'])[:8]) for b in brands]}\n")

# Usar todos los brand IDs disponibles para simular el caso real
cur.execute("SELECT id FROM brands LIMIT 20")
all_brands = [str(r['id']) for r in cur.fetchall()]
brand_ids_sql = "'" + "','".join(all_brands[:5]) + "'"

results = []

def measure(label, query, params=None):
    t0 = time.time()
    try:
        cur.execute(query, params or [])
        rows = cur.fetchall()
        elapsed = time.time() - t0
        results.append((elapsed, label, len(rows), None))
        print(f"  {'✓' if elapsed < 2 else '⚠' if elapsed < 10 else '✗'} {label}: {elapsed:.3f}s ({len(rows):,} filas)")
        return rows, elapsed
    except Exception as e:
        elapsed = time.time() - t0
        results.append((elapsed, label, 0, str(e)[:80]))
        print(f"  ✗ {label}: ERROR en {elapsed:.3f}s — {str(e)[:80]}")
        return [], elapsed

print("=== 1. QUERIES ESTÁTICAS (deben ser rápidas con caché) ===\n")

measure("getMonthlySales", """
    SELECT 
        TO_CHAR(sh.doc_date, 'YYYY-MM') AS month,
        SUM(sd.total) AS total_sales,
        COUNT(DISTINCT sh.id) AS ticket_count
    FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    JOIN products_supplier ps ON ps.product_id = sd.product_id
    WHERE ps.supplier_id IS NOT NULL
    GROUP BY TO_CHAR(sh.doc_date, 'YYYY-MM')
    ORDER BY month DESC
    LIMIT 24
""")

measure("getBranchesForSales", """
    SELECT DISTINCT b.id, b.name, b.sap_id
    FROM branches b
    JOIN sales_header sh ON sh.branch_id = b.id
    JOIN sales_detail sd ON sd.header_id = sh.id
    JOIN products_supplier ps ON ps.product_id = sd.product_id
    ORDER BY b.name
""")

measure("getBranchesForStock", """
    SELECT DISTINCT b.id, b.name, b.sap_id
    FROM branches b
    ORDER BY b.name
""")

measure("getProductsForBrand (sin filtro)", """
    SELECT DISTINCT p.id, p.name, p.sku
    FROM products p
    JOIN products_supplier ps ON ps.product_id = p.id
    ORDER BY p.name
    LIMIT 200
""")

print("\n=== 2. QUERIES DE VENTAS (con filtro de fecha) ===\n")

measure("getSalesSummary (14 días)", f"""
    SELECT 
        SUM(sd.total) AS total_sales,
        COUNT(DISTINCT sh.id) AS ticket_count,
        COUNT(DISTINCT sd.product_id) AS product_count
    FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    JOIN products_supplier ps ON ps.product_id = sd.product_id
    WHERE sh.doc_date >= '{FECHA_MIN}'::date
      AND sh.doc_date < ('{FECHA_MAX}'::date + INTERVAL '1 day')
""")

measure("getDailySales (14 días)", f"""
    SELECT 
        sh.doc_date::date AS sale_date,
        SUM(sd.total) AS total_sales,
        COUNT(DISTINCT sh.id) AS ticket_count
    FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    JOIN products_supplier ps ON ps.product_id = sd.product_id
    WHERE sh.doc_date >= '{FECHA_MIN}'::date
      AND sh.doc_date < ('{FECHA_MAX}'::date + INTERVAL '1 day')
    GROUP BY sh.doc_date::date
    ORDER BY sale_date
""")

measure("getTopProducts (14 días)", f"""
    SELECT 
        p.id, p.name, p.sku,
        SUM(sd.total) AS total_sales,
        SUM(sd.quantity) AS total_qty
    FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    JOIN products p ON p.id = sd.product_id
    JOIN products_supplier ps ON ps.product_id = sd.product_id
    WHERE sh.doc_date >= '{FECHA_MIN}'::date
      AND sh.doc_date < ('{FECHA_MAX}'::date + INTERVAL '1 day')
    GROUP BY p.id, p.name, p.sku
    ORDER BY total_sales DESC
    LIMIT 20
""")

measure("getSalesByBranch (14 días)", f"""
    SELECT 
        b.id, b.name, b.sap_id,
        SUM(sd.total) AS total_sales,
        COUNT(DISTINCT sh.id) AS ticket_count
    FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    JOIN branches b ON b.id = sh.branch_id
    JOIN products_supplier ps ON ps.product_id = sd.product_id
    WHERE sh.doc_date >= '{FECHA_MIN}'::date
      AND sh.doc_date < ('{FECHA_MAX}'::date + INTERVAL '1 day')
    GROUP BY b.id, b.name, b.sap_id
    ORDER BY total_sales DESC
""")

print("\n=== 3. QUERIES COMPLEJAS ===\n")

rows_spb, t_spb = measure("getSalesByProductBranch CTE (14 días)", f"""
    WITH brand_products AS (
        SELECT DISTINCT sd.product_id
        FROM sales_detail sd
        JOIN products_supplier ps ON ps.product_id = sd.product_id
    ),
    filtered_sales AS (
        SELECT
            sh.id AS header_id,
            sh.doc_date::date AS sale_date,
            sh.branch_id,
            b.name AS branch_name,
            b.sap_id AS branch_sap_id,
            sd.product_id,
            p.name AS product_name,
            p.sku,
            sd.total,
            sd.subtotal,
            sd.quantity
        FROM sales_header sh
        JOIN sales_detail sd ON sd.header_id = sh.id
        JOIN brand_products bp ON bp.product_id = sd.product_id
        JOIN products p ON p.id = sd.product_id
        LEFT JOIN branches b ON b.id = sh.branch_id
        WHERE sh.doc_date >= '{FECHA_MIN}'::date
          AND sh.doc_date < ('{FECHA_MAX}'::date + INTERVAL '1 day')
    )
    SELECT COUNT(*) AS total FROM filtered_sales
""")

rows_se, t_se = measure("getSalesEvolution (14 días)", f"""
    SELECT
        sh.doc_date::date AS sale_date,
        SUM(sd.total) AS total_sales,
        COUNT(DISTINCT sh.id) AS ticket_count
    FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    JOIN products_supplier ps ON ps.product_id = sd.product_id
    WHERE sh.doc_date >= '{FECHA_MIN}'::date
      AND sh.doc_date < ('{FECHA_MAX}'::date + INTERVAL '1 day')
    GROUP BY sh.doc_date::date
    ORDER BY sale_date
""")

rows_sc, t_sc = measure("getSalesByCategory (14 días)", f"""
    SELECT
        COALESCE(p2.parent_category_id, c.parent_category_id, cp.category_id) AS category_id,
        SUM(sd.total) AS total_sales,
        COUNT(DISTINCT sh.id) AS ticket_count
    FROM sales_header sh
    JOIN sales_detail sd ON sd.header_id = sh.id
    JOIN products_supplier ps ON ps.product_id = sd.product_id
    LEFT JOIN categories_products cp 
        ON cp.product_id = sd.product_id 
       AND cp.category_group_id = '{CATEGORY_GROUP_ID}'
    LEFT JOIN categories c ON c.id = cp.category_id
    LEFT JOIN categories p2 ON p2.id = c.parent_category_id
    WHERE sh.doc_date >= '{FECHA_MIN}'::date
      AND sh.doc_date < ('{FECHA_MAX}'::date + INTERVAL '1 day')
    GROUP BY 1
    ORDER BY total_sales DESC
""")

rows_rec, t_rec = measure("getReceptions (sin filtro fecha)", """
    SELECT COUNT(*) FROM receptions r
    JOIN reception_details rd ON rd.reception_id = r.id
    JOIN products_supplier ps ON ps.product_id = rd.product_id
    LIMIT 1
""")

rows_stock, t_stock = measure("getStockByProduct (sin filtro)", """
    SELECT 
        p.id, p.name, p.sku,
        SUM(s.quantity) AS total_stock
    FROM stock s
    JOIN products p ON p.id = s.product_id
    JOIN products_supplier ps ON ps.product_id = s.product_id
    GROUP BY p.id, p.name, p.sku
    ORDER BY total_stock DESC
    LIMIT 50
""")

rows_cat, t_cat = measure("getProductCatalog (sin filtro)", """
    SELECT 
        p.id, p.name, p.sku,
        ps.supplier_id
    FROM products p
    JOIN products_supplier ps ON ps.product_id = p.id
    ORDER BY p.name
    LIMIT 100
""")

print("\n=== RESUMEN (ordenado por tiempo) ===\n")
results.sort(reverse=True)
for elapsed, label, rows, err in results:
    status = "✗ ERROR" if err else ("⚠ LENTO" if elapsed > 5 else ("⚡ OK" if elapsed < 1 else "~ ACEPTABLE"))
    print(f"  {status:12} {elapsed:7.3f}s  {label}")
    if err:
        print(f"             └─ {err}")

# EXPLAIN ANALYZE de las 2 más lentas
slow = [(e, l) for e, l, r, err in results if e > 3 and not err]
if slow:
    print(f"\n=== EXPLAIN ANALYZE para queries > 3s ===\n")
    
    # getSalesByProductBranch CTE
    if t_spb > 3:
        print(f"--- getSalesByProductBranch CTE ---")
        cur.execute(f"""
            EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
            WITH brand_products AS (
                SELECT DISTINCT sd.product_id
                FROM sales_detail sd
                JOIN products_supplier ps ON ps.product_id = sd.product_id
            ),
            filtered_sales AS (
                SELECT sh.id, sh.doc_date, sd.product_id, sd.total
                FROM sales_header sh
                JOIN sales_detail sd ON sd.header_id = sh.id
                JOIN brand_products bp ON bp.product_id = sd.product_id
                WHERE sh.doc_date >= '{FECHA_MIN}'::date
                  AND sh.doc_date < ('{FECHA_MAX}'::date + INTERVAL '1 day')
            )
            SELECT COUNT(*) FROM filtered_sales
        """)
        for row in cur.fetchall():
            print(f"  {row['QUERY PLAN']}")

cur.close()
conn.close()
print("\n=== DIAGNÓSTICO COMPLETADO ===")
