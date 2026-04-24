#!/usr/bin/env python3
"""Verificar los canales de venta disponibles en PostgreSQL."""
import os, sys
import psycopg2

pg_host = os.environ.get("PG_HOST")
pg_port = os.environ.get("PG_PORT", "5432")
pg_db   = os.environ.get("PG_DATABASE")
pg_user = os.environ.get("PG_USER")
pg_pass = os.environ.get("PG_PASSWORD")

conn = psycopg2.connect(host=pg_host, port=pg_port, dbname=pg_db, user=pg_user, password=pg_pass)
cur = conn.cursor()

# Buscar columnas relacionadas con canal
cur.execute("""
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name='sales_header' 
  AND (column_name ILIKE '%channel%' OR column_name ILIKE '%canal%' OR column_name ILIKE '%source%' OR column_name ILIKE '%type%')
  ORDER BY ordinal_position;
""")
print("=== Columnas de canal en sales_header ===")
cols = cur.fetchall()
for row in cols:
    print(f"  {row[0]}: {row[1]}")

# Si hay columnas de canal, mostrar valores distintos
for col in cols:
    col_name = col[0]
    cur.execute(f"SELECT DISTINCT {col_name}, COUNT(*) as cnt FROM sales_header WHERE {col_name} IS NOT NULL GROUP BY {col_name} ORDER BY cnt DESC LIMIT 15;")
    print(f"\n=== Valores distintos de '{col_name}' ===")
    for row in cur.fetchall():
        print(f"  {col_name}={row[0]!r}  count={row[1]}")

# Columnas de sales_header
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='sales_header' ORDER BY ordinal_position;")
print("\n=== Columnas de sales_header ===")
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]}")

conn.close()
