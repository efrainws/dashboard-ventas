#!/usr/bin/env python3
"""Identificar los source_systems (canales de venta) disponibles."""
import os
import psycopg2

pg_host = os.environ.get("PG_HOST")
pg_port = os.environ.get("PG_PORT", "5432")
pg_db   = os.environ.get("PG_DATABASE")
pg_user = os.environ.get("PG_USER")
pg_pass = os.environ.get("PG_PASSWORD")

conn = psycopg2.connect(host=pg_host, port=pg_port, dbname=pg_db, user=pg_user, password=pg_pass)
cur = conn.cursor()

# Buscar tabla de source_systems
cur.execute("""
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema='public' 
  AND (table_name ILIKE '%source%' OR table_name ILIKE '%system%' OR table_name ILIKE '%channel%')
  ORDER BY table_name;
""")
print("=== Tablas relacionadas con source/system/channel ===")
tables = cur.fetchall()
for row in tables:
    print(f"  {row[0]}")

# Consultar cada tabla encontrada
for (tname,) in tables:
    try:
        cur.execute(f"SELECT * FROM {tname} LIMIT 10;")
        rows = cur.fetchall()
        cols = [desc[0] for desc in cur.description]
        print(f"\n=== Contenido de '{tname}' ===")
        print("  " + " | ".join(cols))
        for row in rows:
            print("  " + " | ".join(str(v) for v in row))
    except Exception as e:
        print(f"  Error leyendo {tname}: {e}")

# También buscar en la query de análisis general cómo se usa source_system_id
cur.execute("""
  SELECT ss.id, ss.name, COUNT(sh.id) as sales_count
  FROM source_systems ss
  LEFT JOIN sales_header sh ON sh.source_system_id = ss.id
  GROUP BY ss.id, ss.name
  ORDER BY sales_count DESC;
""")
print("\n=== Source systems con conteo de ventas ===")
for row in cur.fetchall():
    print(f"  id={row[0]}  name={row[1]!r}  sales={row[2]}")

conn.close()
