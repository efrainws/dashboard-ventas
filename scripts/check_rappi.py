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

# Columnas de integration_systems
cur.execute("""
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'integration_systems'
    ORDER BY ordinal_position;
""")
print("Columnas integration_systems:", cur.fetchall())

# Datos de integration_systems
cur.execute("SELECT * FROM integration_systems LIMIT 20;")
print("integration_systems data:", cur.fetchall())

# Columnas de sales_header
cur.execute("""
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'sales_header'
    ORDER BY ordinal_position;
""")
print("Columnas sales_header:", cur.fetchall())

# Buscar ventas de Rappi en sales_header (buscar columna con 'system' o 'channel')
cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'sales_header'
    AND (column_name ILIKE '%system%' OR column_name ILIKE '%channel%'
         OR column_name ILIKE '%source%' OR column_name ILIKE '%rappi%'
         OR column_name ILIKE '%vtex%' OR column_name ILIKE '%ecomm%');
""")
print("Columnas relevantes en sales_header:", cur.fetchall())

cur.close()
conn.close()
