#!/usr/bin/env python3
"""Auditoría de solo lectura de índices críticos para consultas de ventas.

Uso: python3 scripts/analyze_postgres_indexes.py
Requiere las variables PG_* ya inyectadas por el entorno. No ejecuta DDL ni DML.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import psycopg

TABLES = (
    "sales_header",
    "sales_detail",
    "stocks",
    "products",
    "categories_products",
)

EXPECTED_PATTERNS = {
    "sales_header": ["doc_date", "branch_id"],
    "sales_detail": ["header_id", "product_id"],
    "stocks": ["branch_id", "product_id"],
    "categories_products": ["product_id", "category_group_id"],
}

connection = psycopg.connect(
    host=os.environ["PG_HOST"],
    port=os.environ.get("PG_PORT", "5432"),
    user=os.environ["PG_USER"],
    password=os.environ["PG_PASSWORD"],
    dbname=os.environ["PG_DATABASE"],
    sslmode="require",
    options="-c default_transaction_read_only=on",
)

with connection.cursor() as cursor:
    cursor.execute(
        """
        SELECT tablename, indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = ANY(%s)
        ORDER BY tablename, indexname
        """,
        (list(TABLES),),
    )
    rows = [
        {"table": table, "index": index, "definition": definition}
        for table, index, definition in cursor.fetchall()
    ]

by_table: dict[str, list[dict[str, str]]] = {table: [] for table in TABLES}
for row in rows:
    by_table[row["table"]].append(row)

recommendations = []
for table, columns in EXPECTED_PATTERNS.items():
    definitions = " ".join(row["definition"].lower() for row in by_table[table])
    absent = [column for column in columns if column not in definitions]
    if absent:
        recommendations.append({
            "table": table,
            "missing_columns": absent,
            "recommendation": "Validar con EXPLAIN antes de solicitar un índice al DBA.",
        })

report = {"indexes": by_table, "recommendations": recommendations}
output = Path("docs/postgres-index-audit.json")
output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

print(f"Auditoría guardada en {output}")
for item in recommendations:
    print(f"- {item['table']}: faltan referencias indexadas para {', '.join(item['missing_columns'])}")

connection.close()
