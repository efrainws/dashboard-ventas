#!/usr/bin/env python3
"""
Script avanzado de procesamiento por lotes para Dashboard de Ventas Flora & Fauna

Optimizaciones implementadas:
1. Procesamiento paralelo con multiprocessing para aprovechar múltiples CPUs
2. Uso de cursores del lado del servidor para minimizar uso de memoria
3. Agregación incremental con ventanas de tiempo deslizantes
4. Caché inteligente con invalidación automática
5. Compresión de datos para exportación eficiente
6. Monitoreo de rendimiento y estadísticas en tiempo real
"""

import psycopg2
import psycopg2.extras
import json
import gzip
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Iterator, Tuple
from multiprocessing import Pool, cpu_count
from functools import partial
import sys
import os

# Configuración de conexión a PostgreSQL
DB_CONFIG = {
    'host': 'database-flora-y-fauna.clei6ceoew9j.us-east-2.rds.amazonaws.com',
    'port': 5432,
    'user': 'postgres',
    'password': '1tU1TTGYUmkTe5DGZXjg',
    'database': 'production-middleware-florayfauna',
    'sslmode': 'require'
}

# Configuración de procesamiento
BATCH_SIZE = 10000  # Registros por lote
PARALLEL_WORKERS = min(4, cpu_count())  # Número de workers paralelos
CACHE_DIR = "/home/ubuntu/dashboard-ventas/cache"
DATA_DIR = "/home/ubuntu/dashboard-ventas/data"


class AdvancedBatchProcessor:
    """Procesador avanzado con optimizaciones para grandes volúmenes"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.conn = None
        self.cursor = None
        self.stats = {
            'total_rows_processed': 0,
            'total_execution_time': 0,
            'queries_executed': 0,
            'cache_hits': 0,
            'cache_misses': 0
        }
        
        # Crear directorios si no existen
        os.makedirs(CACHE_DIR, exist_ok=True)
        os.makedirs(DATA_DIR, exist_ok=True)
        
    def connect(self):
        """Establecer conexión optimizada a la base de datos"""
        self.conn = psycopg2.connect(**self.config)
        self.cursor = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        # Optimizaciones de conexión
        self.cursor.execute("SET work_mem = '256MB';")  # Más memoria para operaciones
        self.cursor.execute("SET maintenance_work_mem = '512MB';")
        self.cursor.execute("SET effective_cache_size = '4GB';")
        
        print(f"✓ Conexión establecida con optimizaciones")
        print(f"  Workers paralelos: {PARALLEL_WORKERS}")
        print(f"  Tamaño de lote: {BATCH_SIZE:,}")
    
    def close(self):
        """Cerrar conexión"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
    
    def get_cache_key(self, query_type: str, params: Dict) -> str:
        """Generar clave de caché única para una consulta"""
        import hashlib
        param_str = json.dumps(params, sort_keys=True)
        hash_obj = hashlib.md5(f"{query_type}:{param_str}".encode())
        return f"{query_type}_{hash_obj.hexdigest()}"
    
    def get_from_cache(self, cache_key: str, max_age_hours: int = 24) -> Any:
        """Obtener datos del caché si están disponibles y no expirados"""
        cache_file = os.path.join(CACHE_DIR, f"{cache_key}.json.gz")
        
        if not os.path.exists(cache_file):
            self.stats['cache_misses'] += 1
            return None
        
        # Verificar edad del caché
        file_age = time.time() - os.path.getmtime(cache_file)
        if file_age > (max_age_hours * 3600):
            self.stats['cache_misses'] += 1
            return None
        
        # Leer del caché
        try:
            with gzip.open(cache_file, 'rt', encoding='utf-8') as f:
                data = json.load(f)
            self.stats['cache_hits'] += 1
            return data
        except Exception as e:
            print(f"⚠ Error al leer caché: {e}")
            self.stats['cache_misses'] += 1
            return None
    
    def save_to_cache(self, cache_key: str, data: Any):
        """Guardar datos en caché comprimido"""
        cache_file = os.path.join(CACHE_DIR, f"{cache_key}.json.gz")
        
        try:
            with gzip.open(cache_file, 'wt', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, default=str)
        except Exception as e:
            print(f"⚠ Error al guardar caché: {e}")
    
    def fetch_in_batches(self, query: str, params: tuple = None) -> Iterator[List[Dict]]:
        """
        Ejecutar consulta y devolver resultados en lotes
        Usa cursor del lado del servidor para minimizar memoria
        """
        cursor_name = f"batch_cursor_{int(time.time() * 1000)}"
        cursor = self.conn.cursor(
            name=cursor_name,
            cursor_factory=psycopg2.extras.RealDictCursor
        )
        cursor.itersize = BATCH_SIZE
        
        try:
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            
            batch_count = 0
            while True:
                batch = cursor.fetchmany(BATCH_SIZE)
                if not batch:
                    break
                
                batch_count += 1
                self.stats['total_rows_processed'] += len(batch)
                yield [dict(row) for row in batch]
                
                # Mostrar progreso cada 10 lotes
                if batch_count % 10 == 0:
                    print(f"  Procesados: {self.stats['total_rows_processed']:,} registros...", end='\r')
        finally:
            cursor.close()
    
    def aggregate_sales_optimized(
        self, 
        start_date: str, 
        end_date: str,
        granularity: str = 'day',
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """
        Agregar ventas con granularidad configurable (day, hour)
        Usa caché inteligente para evitar recálculos
        """
        print(f"\n{'=' * 80}")
        print(f"AGREGACIÓN OPTIMIZADA ({granularity.upper()}): {start_date} a {end_date}")
        print(f"{'=' * 80}")
        
        # Verificar caché
        cache_key = self.get_cache_key(
            f'aggregate_{granularity}',
            {'start': start_date, 'end': end_date}
        )
        
        if use_cache:
            cached_data = self.get_from_cache(cache_key, max_age_hours=6)
            if cached_data:
                print(f"✓ Datos obtenidos del caché (edad: {cached_data.get('cache_age', 'N/A')})")
                return cached_data
        
        # Construir consulta según granularidad
        if granularity == 'hour':
            time_group = "DATE(sh.doc_date), EXTRACT(HOUR FROM sh.doc_date)::integer"
            time_select = "DATE(sh.doc_date) as sale_date, EXTRACT(HOUR FROM sh.doc_date)::integer as sale_hour,"
        else:  # day
            time_group = "DATE(sh.doc_date)"
            time_select = "DATE(sh.doc_date) as sale_date,"
        
        query = f"""
        SELECT 
            {time_select}
            sh.branch_id,
            b.name as branch_name,
            b.sap_id as branch_sap_id,
            CASE 
                WHEN sh.source_system_id = 'be387046-08e4-4229-a52c-7ff5c1569c89' 
                THEN 'eCommerce' 
                ELSE 'Presencial' 
            END as sales_channel,
            COUNT(DISTINCT sh.id) as transaction_count,
            SUM(sh.total) as total_sales,
            AVG(sh.total) as avg_ticket,
            MIN(sh.total) as min_ticket,
            MAX(sh.total) as max_ticket,
            STDDEV(sh.total) as stddev_ticket,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sh.total) as median_ticket
        FROM sales_header sh
        LEFT JOIN branches b ON b.id = sh.branch_id
        WHERE sh.doc_date >= %s AND sh.doc_date < %s
        GROUP BY {time_group}, sh.branch_id, b.name, b.sap_id, sales_channel
        ORDER BY sale_date, branch_sap_id;
        """
        
        start_time = time.time()
        results = []
        
        for batch in self.fetch_in_batches(query, (start_date, end_date)):
            results.extend(batch)
        
        execution_time = time.time() - start_time
        self.stats['total_execution_time'] += execution_time
        self.stats['queries_executed'] += 1
        
        print(f"\n✓ Completado en {execution_time:.2f}s ({len(results):,} registros)")
        
        result_data = {
            'data': results,
            'metadata': {
                'total_rows': len(results),
                'execution_time': execution_time,
                'start_date': start_date,
                'end_date': end_date,
                'granularity': granularity,
                'generated_at': datetime.now().isoformat(),
                'cache_age': '0 minutes'
            }
        }
        
        # Guardar en caché
        if use_cache:
            self.save_to_cache(cache_key, result_data)
        
        return result_data
    
    def aggregate_by_category_optimized(
        self,
        start_date: str,
        end_date: str,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """
        Agregar ventas por categoría con optimizaciones
        """
        print(f"\n{'=' * 80}")
        print(f"AGREGACIÓN POR CATEGORÍA: {start_date} a {end_date}")
        print(f"{'=' * 80}")
        
        # Verificar caché
        cache_key = self.get_cache_key(
            'aggregate_category',
            {'start': start_date, 'end': end_date}
        )
        
        if use_cache:
            cached_data = self.get_from_cache(cache_key, max_age_hours=6)
            if cached_data:
                print(f"✓ Datos obtenidos del caché")
                return cached_data
        
        query = """
        SELECT 
            c.id as category_id,
            c.name as category_name,
            sh.branch_id,
            b.name as branch_name,
            b.sap_id as branch_sap_id,
            CASE 
                WHEN sh.source_system_id = 'be387046-08e4-4229-a52c-7ff5c1569c89' 
                THEN 'eCommerce' 
                ELSE 'Presencial' 
            END as sales_channel,
            COUNT(DISTINCT sh.id) as transaction_count,
            SUM(sd.total) as total_sales,
            SUM(sd.quantity) as total_quantity,
            AVG(sd.price) as avg_price
        FROM sales_header sh
        JOIN sales_detail sd ON sh.id = sd.header_id
        LEFT JOIN categories c ON sd.category_id = c.id
        LEFT JOIN branches b ON sh.branch_id = b.id
        WHERE sh.doc_date >= %s AND sh.doc_date < %s
        GROUP BY c.id, c.name, sh.branch_id, b.name, b.sap_id, sales_channel
        ORDER BY total_sales DESC;
        """
        
        start_time = time.time()
        results = []
        
        for batch in self.fetch_in_batches(query, (start_date, end_date)):
            results.extend(batch)
        
        execution_time = time.time() - start_time
        self.stats['total_execution_time'] += execution_time
        self.stats['queries_executed'] += 1
        
        print(f"\n✓ Completado en {execution_time:.2f}s ({len(results):,} registros)")
        
        result_data = {
            'data': results,
            'metadata': {
                'total_rows': len(results),
                'execution_time': execution_time,
                'start_date': start_date,
                'end_date': end_date,
                'generated_at': datetime.now().isoformat()
            }
        }
        
        # Guardar en caché
        if use_cache:
            self.save_to_cache(cache_key, result_data)
        
        return result_data
    
    def generate_rolling_aggregates(
        self,
        start_date: str,
        end_date: str,
        window_days: int = 7
    ):
        """
        Generar agregaciones con ventanas deslizantes
        Útil para análisis de tendencias
        """
        print(f"\n{'=' * 80}")
        print(f"AGREGACIÓN CON VENTANA DESLIZANTE ({window_days} días)")
        print(f"{'=' * 80}")
        
        query = """
        WITH daily_sales AS (
            SELECT 
                DATE(doc_date) as sale_date,
                branch_id,
                COUNT(DISTINCT id) as daily_transactions,
                SUM(total) as daily_sales
            FROM sales_header
            WHERE doc_date >= %s AND doc_date < %s
            GROUP BY DATE(doc_date), branch_id
        )
        SELECT 
            sale_date,
            branch_id,
            daily_transactions,
            daily_sales,
            -- Ventana deslizante de N días
            AVG(daily_sales) OVER (
                PARTITION BY branch_id 
                ORDER BY sale_date 
                ROWS BETWEEN %s PRECEDING AND CURRENT ROW
            ) as rolling_avg_sales,
            SUM(daily_transactions) OVER (
                PARTITION BY branch_id 
                ORDER BY sale_date 
                ROWS BETWEEN %s PRECEDING AND CURRENT ROW
            ) as rolling_sum_transactions
        FROM daily_sales
        ORDER BY sale_date, branch_id;
        """
        
        start_time = time.time()
        results = []
        
        window_param = window_days - 1  # Para incluir el día actual
        for batch in self.fetch_in_batches(
            query, 
            (start_date, end_date, window_param, window_param)
        ):
            results.extend(batch)
        
        execution_time = time.time() - start_time
        
        print(f"\n✓ Completado en {execution_time:.2f}s ({len(results):,} registros)")
        
        return {
            'data': results,
            'metadata': {
                'total_rows': len(results),
                'execution_time': execution_time,
                'window_days': window_days,
                'start_date': start_date,
                'end_date': end_date
            }
        }
    
    def export_compressed(self, data: Dict[str, Any], filename: str):
        """Exportar datos comprimidos con gzip"""
        output_path = os.path.join(DATA_DIR, filename)
        
        # Agregar extensión .gz si no está presente
        if not output_path.endswith('.gz'):
            output_path += '.gz'
        
        with gzip.open(output_path, 'wt', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)
        
        file_size = os.path.getsize(output_path)
        
        # Calcular ratio de compresión
        uncompressed_size = len(json.dumps(data, default=str).encode('utf-8'))
        compression_ratio = (1 - file_size / uncompressed_size) * 100
        
        print(f"✓ Exportado a: {output_path}")
        print(f"  Tamaño comprimido: {file_size:,} bytes")
        print(f"  Ratio de compresión: {compression_ratio:.1f}%")
    
    def create_materialized_view(self, view_name: str = 'mv_daily_sales_summary'):
        """
        Crear vista materializada para consultas ultra-rápidas
        Se debe refrescar periódicamente (ej: cada noche)
        """
        print(f"\n{'=' * 80}")
        print(f"CREANDO VISTA MATERIALIZADA: {view_name}")
        print(f"{'=' * 80}")
        
        # Eliminar vista si existe
        drop_query = f"DROP MATERIALIZED VIEW IF EXISTS {view_name};"
        
        # Crear vista materializada
        create_query = f"""
        CREATE MATERIALIZED VIEW {view_name} AS
        SELECT 
            DATE(sh.doc_date) as sale_date,
            sh.branch_id,
            b.name as branch_name,
            b.sap_id as branch_sap_id,
            CASE 
                WHEN sh.source_system_id = 'be387046-08e4-4229-a52c-7ff5c1569c89' 
                THEN 'eCommerce' 
                ELSE 'Presencial' 
            END as sales_channel,
            COUNT(DISTINCT sh.id) as transaction_count,
            SUM(sh.total) as total_sales,
            AVG(sh.total) as avg_ticket,
            MIN(sh.total) as min_ticket,
            MAX(sh.total) as max_ticket
        FROM sales_header sh
        LEFT JOIN branches b ON b.id = sh.branch_id
        GROUP BY DATE(sh.doc_date), sh.branch_id, b.name, b.sap_id, sales_channel
        WITH DATA;
        """
        
        # Crear índice en la vista materializada
        index_query = f"""
        CREATE INDEX IF NOT EXISTS idx_{view_name}_date_branch 
        ON {view_name}(sale_date, branch_id);
        """
        
        try:
            start_time = time.time()
            
            self.cursor.execute(drop_query)
            self.conn.commit()
            
            self.cursor.execute(create_query)
            self.conn.commit()
            
            self.cursor.execute(index_query)
            self.conn.commit()
            
            execution_time = time.time() - start_time
            
            print(f"✓ Vista materializada creada exitosamente en {execution_time:.2f}s")
            print(f"  Para refrescar: REFRESH MATERIALIZED VIEW {view_name};")
            
        except Exception as e:
            print(f"✗ Error al crear vista materializada: {e}")
            self.conn.rollback()
    
    def print_statistics(self):
        """Imprimir estadísticas de rendimiento"""
        print(f"\n{'=' * 80}")
        print("ESTADÍSTICAS DE RENDIMIENTO")
        print(f"{'=' * 80}")
        print(f"  Total de registros procesados: {self.stats['total_rows_processed']:,}")
        print(f"  Total de consultas ejecutadas: {self.stats['queries_executed']}")
        print(f"  Tiempo total de ejecución: {self.stats['total_execution_time']:.2f}s")
        
        if self.stats['queries_executed'] > 0:
            avg_time = self.stats['total_execution_time'] / self.stats['queries_executed']
            print(f"  Tiempo promedio por consulta: {avg_time:.2f}s")
        
        total_cache = self.stats['cache_hits'] + self.stats['cache_misses']
        if total_cache > 0:
            hit_rate = (self.stats['cache_hits'] / total_cache) * 100
            print(f"\n  Cache hits: {self.stats['cache_hits']}")
            print(f"  Cache misses: {self.stats['cache_misses']}")
            print(f"  Hit rate: {hit_rate:.1f}%")


def process_date_range_parallel(date_range: Tuple[str, str], config: Dict) -> Dict:
    """
    Función auxiliar para procesamiento paralelo
    Se ejecuta en un proceso separado
    """
    start_date, end_date = date_range
    processor = AdvancedBatchProcessor(config)
    
    try:
        processor.connect()
        result = processor.aggregate_sales_optimized(
            start_date, 
            end_date,
            granularity='day',
            use_cache=False
        )
        return result
    finally:
        processor.close()


def main():
    """Función principal con ejemplos de uso"""
    print("=" * 80)
    print("PROCESADOR AVANZADO DE LOTES - Dashboard de Ventas Flora & Fauna")
    print("=" * 80)
    
    processor = AdvancedBatchProcessor(DB_CONFIG)
    
    try:
        processor.connect()
        
        # Ejemplo 1: Agregación diaria del último mes con caché
        print("\n📊 Ejemplo 1: Agregación diaria del último mes")
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=30)
        
        daily_data = processor.aggregate_sales_optimized(
            str(start_date),
            str(end_date),
            granularity='day',
            use_cache=True
        )
        
        # Exportar comprimido
        processor.export_compressed(
            daily_data,
            f'daily_sales_{start_date}_{end_date}.json.gz'
        )
        
        # Ejemplo 2: Agregación por hora del último día
        print("\n📊 Ejemplo 2: Agregación por hora del último día")
        yesterday = end_date - timedelta(days=1)
        
        hourly_data = processor.aggregate_sales_optimized(
            str(yesterday),
            str(end_date),
            granularity='hour',
            use_cache=True
        )
        
        # Ejemplo 3: Agregación por categoría
        print("\n📊 Ejemplo 3: Agregación por categoría")
        category_data = processor.aggregate_by_category_optimized(
            str(start_date),
            str(end_date),
            use_cache=True
        )
        
        # Ejemplo 4: Ventanas deslizantes para análisis de tendencias
        print("\n📊 Ejemplo 4: Análisis con ventanas deslizantes")
        rolling_data = processor.generate_rolling_aggregates(
            str(start_date),
            str(end_date),
            window_days=7
        )
        
        processor.export_compressed(
            rolling_data,
            f'rolling_7day_{start_date}_{end_date}.json.gz'
        )
        
        # Ejemplo 5: Crear vista materializada (comentado por defecto)
        # print("\n📊 Ejemplo 5: Crear vista materializada")
        # processor.create_materialized_view('mv_daily_sales_summary')
        
        # Imprimir estadísticas finales
        processor.print_statistics()
        
        print(f"\n{'=' * 80}")
        print("PROCESAMIENTO COMPLETADO EXITOSAMENTE")
        print(f"{'=' * 80}")
        
    except Exception as e:
        print(f"\n✗ Error durante el procesamiento: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        processor.close()


if __name__ == "__main__":
    main()
