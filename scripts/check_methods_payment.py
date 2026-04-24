import psycopg2
import os

conn = psycopg2.connect(
    host=os.environ.get("PG_HOST"),
    port=os.environ.get("PG_PORT", 5432),
    database=os.environ.get("PG_DATABASE"),
    user=os.environ.get("PG_USER"),
    password=os.environ.get("PG_PASSWORD"),
    sslmode="require"
)
cur = conn.cursor()

# 1. Columnas de methods_payment
cur.execute("""
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'methods_payment'
    ORDER BY ordinal_position;
""")
print("Columnas methods_payment:", cur.fetchall())

# 2. Muestra de datos
cur.execute("SELECT * FROM methods_payment LIMIT 5;")
print("\nEjemplos methods_payment:", cur.fetchall())

# 3. Valores distintos que podrían indicar canal (buscar rappi, ecommerce, vtex, etc.)
cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'methods_payment'
    AND (column_name ILIKE '%name%' OR column_name ILIKE '%code%'
         OR column_name ILIKE '%type%' OR column_name ILIKE '%channel%'
         OR column_name ILIKE '%system%' OR column_name ILIKE '%method%');
""")
relevant_cols = [r[0] for r in cur.fetchall()]
print("\nColumnas relevantes en methods_payment:", relevant_cols)

for col in relevant_cols:
    cur.execute(f"""
        SELECT DISTINCT {col}, COUNT(*) as cnt
        FROM methods_payment
        GROUP BY {col}
        ORDER BY cnt DESC
        LIMIT 15;
    """)
    print(f"\nDistinct {col}:", cur.fetchall())

# 4. Buscar si hay valores con 'rappi' en alguna columna de methods_payment
cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'methods_payment';
""")
all_cols = [r[0] for r in cur.fetchall()]

for col in all_cols:
    try:
        cur.execute(f"""
            SELECT DISTINCT {col} FROM methods_payment
            WHERE CAST({col} AS TEXT) ILIKE '%rappi%'
            LIMIT 5;
        """)
        rows = cur.fetchall()
        if rows:
            print(f"\n*** Columna '{col}' tiene valores con 'rappi':", rows)
    except Exception:
        pass

# 5. Ver cómo se relaciona methods_payment con sales_header
cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'methods_payment'
    AND (column_name ILIKE '%header%' OR column_name ILIKE '%sale%'
         OR column_name ILIKE '%order%' OR column_name ILIKE '%transaction%'
         OR column_name ILIKE '%id%');
""")
id_cols = [r[0] for r in cur.fetchall()]
print("\nColumnas ID en methods_payment:", id_cols)

cur.close()
conn.close()
