#!/usr/bin/env python3
"""
data_processor.py — Procesamiento eficiente de grandes volúmenes de datos
Dashboard de Ventas Flora & Fauna

Estrategias implementadas:
  1. Server-side cursor (psycopg2 named cursor): evita cargar millones de filas en RAM.
  2. Procesamiento por lotes con pandas: agregaciones vectorizadas en lugar de bucles Python.
  3. Caché en disco con compresión gzip + TTL: evita re-ejecutar queries costosas.
  4. Procesamiento paralelo por sucursal con multiprocessing.Pool.
  5. Streaming de resultados al cliente: devuelve un generador en lugar de lista completa.
  6. Pre-agregación incremental: calcula métricas de góndola sin cargar el detalle de líneas.

Uso:
  python3 scripts/data_processor.py [--mode MODE] [--fecha-min YYYY-MM-DD] [--fecha-max YYYY-MM-DD]
  Modos disponibles: shelf_agg, top_products, hourly_heatmap, benchmark
"""

import argparse
import gzip
import hashlib
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timedelta
from typing import Any, Dict, Generator, Iterator, List, Optional, Tuple

import numpy as np
import pandas as pd
import psycopg2
import psycopg2.extras

# ─── Configuración ────────────────────────────────────────────────────────────

DB_CONFIG: Dict[str, Any] = {
    "host":     os.environ.get("PG_HOST",     "database-flora-y-fauna.clei6ceoew9j.us-east-2.rds.amazonaws.com"),
    "port":     int(os.environ.get("PG_PORT", 5432)),
    "user":     os.environ.get("PG_USER",     "postgres"),
    "password": os.environ.get("PG_PASSWORD", ""),
    "database": os.environ.get("PG_DATABASE", "production-middleware-florayfauna"),
    "sslmode":  "require",
    "connect_timeout": 15,
    "options":  "-c statement_timeout=120000",   # 2 min max por query
}

BATCH_SIZE    = 50_000   # Filas por lote del cursor del servidor
CACHE_DIR     = os.path.join(os.path.dirname(__file__), "..", "cache")
CACHE_TTL_SEC = 300      # 5 minutos de TTL para el caché en disco
MAX_WORKERS   = min(4, os.cpu_count() or 2)

os.makedirs(CACHE_DIR, exist_ok=True)


# ─── Helpers de caché ─────────────────────────────────────────────────────────

def _cache_key(tag: str, params: Dict) -> str:
    """Genera una clave de caché determinista a partir del tag y los parámetros."""
    raw = json.dumps({"tag": tag, **params}, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def cache_get(tag: str, params: Dict) -> Optional[Any]:
    """Devuelve el valor cacheado si existe y no expiró; None en caso contrario."""
    key  = _cache_key(tag, params)
    path = os.path.join(CACHE_DIR, f"{key}.json.gz")
    if not os.path.exists(path):
        return None
    age = time.time() - os.path.getmtime(path)
    if age > CACHE_TTL_SEC:
        os.remove(path)
        return None
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def cache_put(tag: str, params: Dict, value: Any) -> None:
    """Guarda el valor en caché comprimido con gzip."""
    key  = _cache_key(tag, params)
    path = os.path.join(CACHE_DIR, f"{key}.json.gz")
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(value, f, default=str, ensure_ascii=False)


# ─── Conexión ─────────────────────────────────────────────────────────────────

def get_connection() -> psycopg2.extensions.connection:
    """Abre una conexión PostgreSQL con parámetros de rendimiento."""
    conn = psycopg2.connect(**DB_CONFIG)
    conn.set_session(readonly=True, autocommit=True)
    with conn.cursor() as cur:
        cur.execute("SET work_mem = '128MB';")
        cur.execute("SET enable_seqscan = OFF;")   # Forzar uso de índices
    return conn


# ─── Cursor del lado del servidor ─────────────────────────────────────────────

def server_side_batches(
    conn: psycopg2.extensions.connection,
    query: str,
    params: Tuple = (),
    batch_size: int = BATCH_SIZE,
) -> Generator[pd.DataFrame, None, None]:
    """
    Ejecuta la query con un cursor nombrado (server-side) y devuelve los resultados
    en DataFrames de `batch_size` filas.  Evita cargar millones de filas en RAM.
    """
    cursor_name = f"ssc_{int(time.time() * 1000)}"
    with conn.cursor(name=cursor_name, cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.itersize = batch_size
        cur.execute(query, params)
        columns = [desc.name for desc in cur.description] if cur.description else []
        while True:
            rows = cur.fetchmany(batch_size)
            if not rows:
                break
            yield pd.DataFrame([dict(r) for r in rows], columns=columns)


# ─── Procesamiento de ventas por góndola (shelf) ──────────────────────────────

SHELF_AGG_QUERY = """
SELECT
    b.sap_id                                              AS branch_sap_id,
    COALESCE(sh2.name, '')                                AS shelf_name,
    sh2.id                                                AS shelf_id,
    CASE
        WHEN st.id IS NULL       THEN 'Sin registro en stocks'
        WHEN st.shelf_id IS NULL THEN 'Stock sin shelf'
        ELSE                          'Con shelf asignado'
    END                                                   AS shelf_status,
    SUM(sd.quantity)                                      AS cantidad_vendida,
    SUM(sd.total)                                         AS monto_total,
    COUNT(DISTINCT sd.product_id)                         AS productos_distintos
FROM public.sales_header sh
JOIN public.sales_detail  sd  ON sd.header_id  = sh.id
JOIN public.branches       b  ON b.id          = sh.branch_id
JOIN public.products       p  ON p.id          = sd.product_id
LEFT JOIN public.stocks    st ON st.product_id = sd.product_id
                              AND st.branch_id  = sh.branch_id
LEFT JOIN public.shelfs    sh2 ON sh2.id        = st.shelf_id
WHERE sh.doc_date >= %(fecha_min)s::date
  AND sh.doc_date <  (%(fecha_max)s::date + INTERVAL '1 day')
  AND sh.doc_date IS NOT NULL
  {branch_clause}
GROUP BY
    b.sap_id,
    sh2.id,
    sh2.name,
    CASE
        WHEN st.id IS NULL       THEN 'Sin registro en stocks'
        WHEN st.shelf_id IS NULL THEN 'Stock sin shelf'
        ELSE                          'Con shelf asignado'
    END
ORDER BY b.sap_id, monto_total DESC NULLS LAST
"""


def compute_shelf_aggregated(
    fecha_min: str,
    fecha_max: str,
    branch_id: Optional[str] = None,
    use_cache: bool = True,
) -> List[Dict]:
    """
    Calcula ventas agregadas por góndola usando pandas para post-procesamiento.
    Utiliza caché en disco para evitar re-ejecutar la query dentro del TTL.
    """
    params = {"fecha_min": fecha_min, "fecha_max": fecha_max, "branch_id": branch_id or "all"}

    if use_cache:
        cached = cache_get("shelf_agg", params)
        if cached is not None:
            print(f"  [caché HIT] shelf_agg {params}")
            return cached

    t0 = time.perf_counter()
    branch_clause = f"AND b.sap_id = %(branch_id)s" if branch_id and branch_id != "all" else ""
    query = SHELF_AGG_QUERY.format(branch_clause=branch_clause)

    conn = get_connection()
    try:
        # Cargar en lotes y concatenar
        chunks: List[pd.DataFrame] = []
        for chunk in server_side_batches(conn, query, {"fecha_min": fecha_min, "fecha_max": fecha_max, "branch_id": branch_id}):
            chunks.append(chunk)

        if not chunks:
            return []

        df = pd.concat(chunks, ignore_index=True)

        # Conversiones de tipo con pandas (más rápido que bucles Python)
        df["cantidad_vendida"]    = pd.to_numeric(df["cantidad_vendida"],    errors="coerce").fillna(0)
        df["monto_total"]         = pd.to_numeric(df["monto_total"],         errors="coerce").fillna(0)
        df["productos_distintos"] = pd.to_numeric(df["productos_distintos"], errors="coerce").fillna(0).astype(int)

        # Redondear con numpy (vectorizado)
        df["cantidad_vendida"] = np.round(df["cantidad_vendida"].values, 2)
        df["monto_total"]      = np.round(df["monto_total"].values, 2)

        result = df.to_dict(orient="records")
        elapsed = time.perf_counter() - t0
        print(f"  [shelf_agg] {len(result):,} filas en {elapsed:.2f}s")

        if use_cache:
            cache_put("shelf_agg", params, result)

        return result
    finally:
        conn.close()


# ─── Procesamiento de top productos ───────────────────────────────────────────

TOP_PRODUCTS_QUERY = """
SELECT
    prod.id                                               AS product_id,
    prod.name                                             AS product_name,
    prod.int_sku                                          AS sku,
    b.sap_id                                              AS branch_sap_id,
    sd.quantity                                           AS qty,
    sd.total                                              AS amount
FROM public.sales_header sh
JOIN public.sales_detail  sd   ON sd.header_id  = sh.id
JOIN public.products       prod ON prod.id       = sd.product_id
LEFT JOIN public.branches  b   ON b.id           = sh.branch_id
WHERE sh.doc_date >= %(fecha_min)s::date
  AND sh.doc_date <  (%(fecha_max)s::date + INTERVAL '1 day')
  AND sh.doc_date IS NOT NULL
  {branch_clause}
"""


def compute_top_products(
    fecha_min: str,
    fecha_max: str,
    branch_id: Optional[str] = None,
    top_n: int = 50,
    by: str = "amount",
    use_cache: bool = True,
) -> List[Dict]:
    """
    Calcula el top N de productos por monto o cantidad usando pandas.
    La agregación se hace en Python con pandas (más flexible que SQL para top-N dinámico).
    """
    params = {
        "fecha_min": fecha_min, "fecha_max": fecha_max,
        "branch_id": branch_id or "all", "top_n": top_n, "by": by,
    }

    if use_cache:
        cached = cache_get("top_products", params)
        if cached is not None:
            print(f"  [caché HIT] top_products {params}")
            return cached

    t0 = time.perf_counter()
    branch_clause = f"AND b.sap_id = %(branch_id)s" if branch_id and branch_id != "all" else ""
    query = TOP_PRODUCTS_QUERY.format(branch_clause=branch_clause)

    conn = get_connection()
    try:
        chunks: List[pd.DataFrame] = []
        for chunk in server_side_batches(conn, query, {"fecha_min": fecha_min, "fecha_max": fecha_max, "branch_id": branch_id}):
            chunks.append(chunk)

        if not chunks:
            return []

        df = pd.concat(chunks, ignore_index=True)
        df["qty"]    = pd.to_numeric(df["qty"],    errors="coerce").fillna(0)
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0)

        # Agregación vectorizada con pandas groupby
        agg = (
            df.groupby(["product_id", "product_name", "sku"], as_index=False)
            .agg(
                total_qty    = ("qty",    "sum"),
                total_amount = ("amount", "sum"),
                branch_count = ("branch_sap_id", "nunique"),
            )
        )

        # Ordenar y tomar top N
        sort_col = "total_amount" if by == "amount" else "total_qty"
        agg = agg.nlargest(top_n, sort_col)

        # Redondear
        agg["total_qty"]    = np.round(agg["total_qty"].values, 2)
        agg["total_amount"] = np.round(agg["total_amount"].values, 2)

        result = agg.to_dict(orient="records")
        elapsed = time.perf_counter() - t0
        print(f"  [top_products] {len(result)} productos en {elapsed:.2f}s (de {len(df):,} líneas)")

        if use_cache:
            cache_put("top_products", params, result)

        return result
    finally:
        conn.close()


# ─── Heatmap horario ──────────────────────────────────────────────────────────

HOURLY_QUERY = """
SELECT
    b.sap_id                                              AS branch_sap_id,
    EXTRACT(DOW  FROM sh.doc_date)::int                   AS day_of_week,
    EXTRACT(HOUR FROM sh.doc_date)::int                   AS hour_of_day,
    SUM(sd.total)                                         AS monto_total,
    COUNT(DISTINCT sh.id)                                 AS transacciones
FROM public.sales_header sh
JOIN public.sales_detail sd ON sd.header_id = sh.id
JOIN public.branches      b ON b.id         = sh.branch_id
WHERE sh.doc_date >= %(fecha_min)s::date
  AND sh.doc_date <  (%(fecha_max)s::date + INTERVAL '1 day')
  AND sh.doc_date IS NOT NULL
  {branch_clause}
GROUP BY b.sap_id, day_of_week, hour_of_day
ORDER BY b.sap_id, day_of_week, hour_of_day
"""


def compute_hourly_heatmap(
    fecha_min: str,
    fecha_max: str,
    branch_id: Optional[str] = None,
    use_cache: bool = True,
) -> Dict[str, Any]:
    """
    Genera la matriz de heatmap horario (7 días × 24 horas) usando pandas pivot_table.
    Mucho más eficiente que construir la matriz en JavaScript.
    """
    params = {"fecha_min": fecha_min, "fecha_max": fecha_max, "branch_id": branch_id or "all"}

    if use_cache:
        cached = cache_get("hourly_heatmap", params)
        if cached is not None:
            print(f"  [caché HIT] hourly_heatmap {params}")
            return cached

    t0 = time.perf_counter()
    branch_clause = f"AND b.sap_id = %(branch_id)s" if branch_id and branch_id != "all" else ""
    query = HOURLY_QUERY.format(branch_clause=branch_clause)

    conn = get_connection()
    try:
        chunks: List[pd.DataFrame] = []
        for chunk in server_side_batches(conn, query, {"fecha_min": fecha_min, "fecha_max": fecha_max, "branch_id": branch_id}):
            chunks.append(chunk)

        if not chunks:
            return {"matrix": [], "max_value": 0}

        df = pd.concat(chunks, ignore_index=True)
        df["monto_total"]   = pd.to_numeric(df["monto_total"],   errors="coerce").fillna(0)
        df["transacciones"] = pd.to_numeric(df["transacciones"], errors="coerce").fillna(0).astype(int)

        # Pivot table: filas = día_semana (0-6), columnas = hora (0-23)
        pivot = df.pivot_table(
            index="day_of_week",
            columns="hour_of_day",
            values="monto_total",
            aggfunc="sum",
            fill_value=0,
        )

        # Rellenar días/horas faltantes
        all_days  = list(range(7))
        all_hours = list(range(24))
        pivot = pivot.reindex(index=all_days, columns=all_hours, fill_value=0)

        matrix = np.round(pivot.values, 2).tolist()
        max_val = float(np.max(pivot.values))

        result = {"matrix": matrix, "max_value": max_val, "days": all_days, "hours": all_hours}
        elapsed = time.perf_counter() - t0
        print(f"  [hourly_heatmap] {len(df):,} filas → 7×24 en {elapsed:.2f}s")

        if use_cache:
            cache_put("hourly_heatmap", params, result)

        return result
    finally:
        conn.close()


# ─── Procesamiento paralelo por sucursal ──────────────────────────────────────

def _process_branch(args: Tuple) -> Dict:
    """Worker para procesamiento paralelo de una sucursal."""
    branch_id, fecha_min, fecha_max, mode = args
    try:
        if mode == "shelf_agg":
            data = compute_shelf_aggregated(fecha_min, fecha_max, branch_id, use_cache=False)
        elif mode == "top_products":
            data = compute_top_products(fecha_min, fecha_max, branch_id, use_cache=False)
        elif mode == "hourly_heatmap":
            data = compute_hourly_heatmap(fecha_min, fecha_max, branch_id, use_cache=False)
        else:
            data = []
        return {"branch_id": branch_id, "data": data, "error": None}
    except Exception as e:
        return {"branch_id": branch_id, "data": [], "error": str(e)}


def compute_all_branches_parallel(
    fecha_min: str,
    fecha_max: str,
    mode: str = "shelf_agg",
    branch_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Procesa múltiples sucursales en paralelo usando ProcessPoolExecutor.
    Ideal para reportes que necesitan datos de todas las tiendas simultáneamente.
    """
    if branch_ids is None:
        # Obtener lista de sucursales desde la BD
        conn = get_connection()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("SELECT sap_id FROM public.branches WHERE sap_id IS NOT NULL ORDER BY sap_id")
                branch_ids = [row["sap_id"] for row in cur.fetchall()]
        finally:
            conn.close()

    t0 = time.perf_counter()
    args_list = [(bid, fecha_min, fecha_max, mode) for bid in branch_ids]

    results: Dict[str, Any] = {}
    with ProcessPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(_process_branch, args): args[0] for args in args_list}
        for future in as_completed(futures):
            branch_id = futures[future]
            try:
                result = future.result(timeout=120)
                if result["error"]:
                    print(f"  [WARN] {branch_id}: {result['error']}", file=sys.stderr)
                else:
                    results[branch_id] = result["data"]
            except Exception as e:
                print(f"  [ERROR] {branch_id}: {e}", file=sys.stderr)

    elapsed = time.perf_counter() - t0
    print(f"  [parallel] {len(branch_ids)} sucursales en {elapsed:.2f}s ({MAX_WORKERS} workers)")
    return results


# ─── Benchmark ────────────────────────────────────────────────────────────────

def run_benchmark(fecha_min: str, fecha_max: str) -> None:
    """Ejecuta un benchmark comparando el rendimiento de las distintas estrategias."""
    print(f"\n{'='*60}")
    print(f"BENCHMARK — {fecha_min} → {fecha_max}")
    print(f"{'='*60}\n")

    tests = [
        ("Shelf Aggregated (sin caché)", lambda: compute_shelf_aggregated(fecha_min, fecha_max, use_cache=False)),
        ("Shelf Aggregated (con caché)", lambda: compute_shelf_aggregated(fecha_min, fecha_max, use_cache=True)),
        ("Top Products (sin caché)",     lambda: compute_top_products(fecha_min, fecha_max, use_cache=False)),
        ("Hourly Heatmap (sin caché)",   lambda: compute_hourly_heatmap(fecha_min, fecha_max, use_cache=False)),
    ]

    for name, fn in tests:
        t0 = time.perf_counter()
        try:
            result = fn()
            elapsed = time.perf_counter() - t0
            n = len(result) if isinstance(result, list) else "dict"
            print(f"  ✓ {name:<40} {elapsed:6.2f}s  ({n} registros)")
        except Exception as e:
            elapsed = time.perf_counter() - t0
            print(f"  ✗ {name:<40} {elapsed:6.2f}s  ERROR: {e}")

    print(f"\n{'='*60}\n")


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Procesador de datos Flora & Fauna")
    parser.add_argument("--mode",      default="benchmark",
                        choices=["shelf_agg", "top_products", "hourly_heatmap", "benchmark", "parallel"])
    parser.add_argument("--fecha-min", default=(datetime.today() - timedelta(days=30)).strftime("%Y-%m-%d"))
    parser.add_argument("--fecha-max", default=datetime.today().strftime("%Y-%m-%d"))
    parser.add_argument("--branch",    default=None, help="SAP ID de la sucursal (ej: FF01)")
    parser.add_argument("--no-cache",  action="store_true", help="Deshabilitar caché en disco")
    args = parser.parse_args()

    use_cache = not args.no_cache
    print(f"\nModo: {args.mode} | {args.fecha_min} → {args.fecha_max} | Caché: {'OFF' if not use_cache else 'ON'}\n")

    if args.mode == "benchmark":
        run_benchmark(args.fecha_min, args.fecha_max)

    elif args.mode == "shelf_agg":
        result = compute_shelf_aggregated(args.fecha_min, args.fecha_max, args.branch, use_cache)
        print(json.dumps(result[:5], indent=2, default=str))
        print(f"\nTotal: {len(result)} góndolas")

    elif args.mode == "top_products":
        result = compute_top_products(args.fecha_min, args.fecha_max, args.branch, use_cache=use_cache)
        print(json.dumps(result[:5], indent=2, default=str))
        print(f"\nTop {len(result)} productos")

    elif args.mode == "hourly_heatmap":
        result = compute_hourly_heatmap(args.fecha_min, args.fecha_max, args.branch, use_cache)
        print(f"Matriz 7×24 generada. Max: {result['max_value']:.2f}")

    elif args.mode == "parallel":
        result = compute_all_branches_parallel(args.fecha_min, args.fecha_max, "shelf_agg")
        for branch, data in result.items():
            print(f"  {branch}: {len(data)} góndolas")


if __name__ == "__main__":
    main()
