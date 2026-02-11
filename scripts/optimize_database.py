#!/usr/bin/env python3
"""
Script de optimización de base de datos para Dashboard de Ventas Flora & Fauna

Este script analiza y optimiza el rendimiento de las consultas SQL:
1. Analiza planes de ejecución de consultas
2. Sugiere y crea índices óptimos
3. Genera estadísticas de rendimiento
4. Implementa estrategias de caché para datos agregados
"""

import psycopg2
import psycopg2.extras
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Tuple

# Configuración de conexión a PostgreSQL
DB_CONFIG = {
    'host': 'database-flora-y-fauna.clei6ceoew9j.us-east-2.rds.amazonaws.com',
    'port': 5432,
    'user': 'postgres',
    'password': '1tU1TTGYUmkTe5DGZXjg',
    'database': 'production-middleware-florayfauna',
    'sslmode': 'require'
}


class DatabaseOptimizer:
    """Clase para analizar y optimizar consultas de base de datos"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.conn = None
        self.cursor = None
        
    def connect(self):
        """Establecer conexión a la base de datos"""
        try:
            self.conn = psycopg2.connect(**self.config)
            self.cursor = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            print("✓ Conexión exitosa a PostgreSQL")
        except Exception as e:
            print(f"✗ Error al conectar: {e}")
            raise
    
    def close(self):
        """Cerrar conexión a la base de datos"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
            print("✓ Conexión cerrada")
    
    def analyze_query_plan(self, query: str, params: Tuple = None) -> Dict[str, Any]:
        """Analizar plan de ejecución de una consulta"""
        explain_query = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {query}"
        
        start_time = time.time()
        if params:
            self.cursor.execute(explain_query, params)
        else:
            self.cursor.execute(explain_query)
        execution_time = time.time() - start_time
        
        plan = self.cursor.fetchone()
        return {
            'execution_time': execution_time,
            'plan': plan['QUERY PLAN'][0] if plan else None
        }
    
    def get_table_statistics(self, table_name: str) -> Dict[str, Any]:
        """Obtener estadísticas de una tabla"""
        query = """
        SELECT 
            schemaname,
            relname as tablename,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) AS total_size,
            pg_size_pretty(pg_relation_size(schemaname||'.'||relname)) AS table_size,
            pg_size_pretty(pg_indexes_size(schemaname||'.'||relname)) AS indexes_size,
            n_live_tup AS row_count,
            n_dead_tup AS dead_rows,
            last_vacuum,
            last_autovacuum,
            last_analyze,
            last_autoanalyze
        FROM pg_stat_user_tables
        WHERE relname = %s;
        """
        
        self.cursor.execute(query, (table_name,))
        return dict(self.cursor.fetchone()) if self.cursor.rowcount > 0 else {}
    
    def get_existing_indexes(self, table_name: str) -> List[Dict[str, Any]]:
        """Obtener índices existentes en una tabla"""
        query = """
        SELECT
            i.indexname,
            i.indexdef,
            pg_size_pretty(pg_relation_size(c.oid)) AS index_size
        FROM pg_indexes i
        JOIN pg_class c ON c.relname = i.indexname
        WHERE i.tablename = %s
        ORDER BY i.indexname;
        """
        
        self.cursor.execute(query, (table_name,))
        return [dict(row) for row in self.cursor.fetchall()]
    
    def check_index_usage(self, table_name: str) -> List[Dict[str, Any]]:
        """Verificar uso de índices en una tabla"""
        query = """
        SELECT
            schemaname,
            relname as tablename,
            indexrelname as indexname,
            idx_scan AS index_scans,
            idx_tup_read AS tuples_read,
            idx_tup_fetch AS tuples_fetched
        FROM pg_stat_user_indexes
        WHERE relname = %s
        ORDER BY idx_scan DESC;
        """
        
        self.cursor.execute(query, (table_name,))
        return [dict(row) for row in self.cursor.fetchall()]
    
    def suggest_indexes(self) -> List[str]:
        """Sugerir índices basados en las consultas del dashboard"""
        suggestions = []
        
        # Índices para la consulta de análisis por categorías
        suggestions.append({
            'table': 'sales_header',
            'columns': ['doc_date', 'branch_id'],
            'reason': 'Filtrado frecuente por fecha y sucursal en análisis por categorías',
            'sql': 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_header_date_branch ON sales_header(doc_date, branch_id);'
        })
        
        suggestions.append({
            'table': 'sales_header',
            'columns': ['source_system_id'],
            'reason': 'Filtrado por canal de ventas (eCommerce vs Presencial)',
            'sql': 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_header_source_system ON sales_header(source_system_id);'
        })
        
        suggestions.append({
            'table': 'sales_detail',
            'columns': ['header_id', 'category_id'],
            'reason': 'JOIN frecuente con sales_header y filtrado por categoría',
            'sql': 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_detail_header_category ON sales_detail(header_id, category_id);'
        })
        
        suggestions.append({
            'table': 'sales_detail',
            'columns': ['category_id'],
            'reason': 'Filtrado y agrupación por categoría en análisis',
            'sql': 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_detail_category ON sales_detail(category_id);'
        })
        
        # Índices para análisis por horas
        suggestions.append({
            'table': 'sales_header',
            'columns': ['doc_date', 'source_system_id', 'branch_id'],
            'reason': 'Consulta de análisis por horas con filtros de fecha, canal y sucursal',
            'sql': 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_header_hourly_analysis ON sales_header(doc_date, source_system_id, branch_id);'
        })
        
        return suggestions
    
    def create_indexes(self, suggestions: List[Dict[str, str]], dry_run: bool = True):
        """Crear índices sugeridos"""
        print(f"\n{'=' * 80}")
        print("CREACIÓN DE ÍNDICES")
        print(f"{'=' * 80}")
        
        for idx, suggestion in enumerate(suggestions, 1):
            print(f"\n{idx}. Tabla: {suggestion['table']}")
            print(f"   Columnas: {', '.join(suggestion['columns'])}")
            print(f"   Razón: {suggestion['reason']}")
            print(f"   SQL: {suggestion['sql']}")
            
            if not dry_run:
                try:
                    start_time = time.time()
                    self.cursor.execute(suggestion['sql'])
                    self.conn.commit()
                    execution_time = time.time() - start_time
                    print(f"   ✓ Índice creado exitosamente en {execution_time:.2f}s")
                except Exception as e:
                    print(f"   ✗ Error al crear índice: {e}")
                    self.conn.rollback()
            else:
                print(f"   → Modo dry-run: no se ejecutó")
    
    def benchmark_queries(self) -> Dict[str, Any]:
        """Ejecutar benchmark de consultas principales"""
        print(f"\n{'=' * 80}")
        print("BENCHMARK DE CONSULTAS")
        print(f"{'=' * 80}")
        
        results = {}
        
        # Query 1: Análisis por categorías (última semana)
        query1 = """
        SELECT 
            DATE(sh.doc_date) as sale_date,
            sh.branch_id,
            CASE 
                WHEN sh.source_system_id = 'be387046-08e4-4229-a52c-7ff5c1569c89' 
                THEN 'eCommerce' 
                ELSE 'Presencial' 
            END as sales_channel,
            COUNT(DISTINCT sh.id) as transaction_count,
            SUM(sd.total) as total_sales,
            SUM(sd.quantity) as total_quantity
        FROM sales_header sh
        JOIN sales_detail sd ON sh.id = sd.header_id
        WHERE sh.doc_date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY DATE(sh.doc_date), sh.branch_id, sales_channel
        ORDER BY sale_date DESC, total_sales DESC;
        """
        
        print("\n1. Análisis por categorías (última semana)")
        start_time = time.time()
        self.cursor.execute(query1)
        rows = self.cursor.fetchall()
        execution_time = time.time() - start_time
        results['category_analysis'] = {
            'execution_time': execution_time,
            'row_count': len(rows),
            'query': 'Análisis por categorías'
        }
        print(f"   Tiempo: {execution_time:.2f}s")
        print(f"   Registros: {len(rows):,}")
        
        # Query 2: Análisis por horas (ayer)
        query2 = """
        SELECT 
            DATE(sh.doc_date) as sale_date,
            EXTRACT(HOUR FROM sh.doc_date) as sale_hour,
            sh.branch_id,
            CASE 
                WHEN sh.source_system_id = 'be387046-08e4-4229-a52c-7ff5c1569c89' 
                THEN 'eCommerce' 
                ELSE 'Presencial' 
            END as sales_channel,
            COUNT(DISTINCT sh.id) as transaction_count,
            SUM(sh.total) as total_sales
        FROM sales_header sh
        WHERE sh.doc_date >= CURRENT_DATE - INTERVAL '1 day'
        GROUP BY DATE(sh.doc_date), EXTRACT(HOUR FROM sh.doc_date), sh.branch_id, sales_channel
        ORDER BY sale_date DESC, sale_hour;
        """
        
        print("\n2. Análisis por horas (ayer)")
        start_time = time.time()
        self.cursor.execute(query2)
        rows = self.cursor.fetchall()
        execution_time = time.time() - start_time
        results['hourly_analysis'] = {
            'execution_time': execution_time,
            'row_count': len(rows),
            'query': 'Análisis por horas'
        }
        print(f"   Tiempo: {execution_time:.2f}s")
        print(f"   Registros: {len(rows):,}")
        
        return results
    
    def generate_report(self):
        """Generar reporte completo de optimización"""
        print(f"\n{'=' * 80}")
        print("REPORTE DE OPTIMIZACIÓN DE BASE DE DATOS")
        print(f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'=' * 80}")
        
        # Estadísticas de tablas
        print("\n" + "=" * 80)
        print("ESTADÍSTICAS DE TABLAS")
        print("=" * 80)
        
        for table in ['sales_header', 'sales_detail', 'categories', 'branches']:
            print(f"\n{table.upper()}:")
            stats = self.get_table_statistics(table)
            if stats:
                print(f"  Tamaño total: {stats.get('total_size', 'N/A')}")
                print(f"  Tamaño tabla: {stats.get('table_size', 'N/A')}")
                print(f"  Tamaño índices: {stats.get('indexes_size', 'N/A')}")
                print(f"  Filas: {stats.get('row_count', 0):,}")
                print(f"  Filas muertas: {stats.get('dead_rows', 0):,}")
                print(f"  Último VACUUM: {stats.get('last_vacuum', 'Nunca')}")
                print(f"  Último ANALYZE: {stats.get('last_analyze', 'Nunca')}")
        
        # Índices existentes
        print("\n" + "=" * 80)
        print("ÍNDICES EXISTENTES")
        print("=" * 80)
        
        for table in ['sales_header', 'sales_detail']:
            print(f"\n{table.upper()}:")
            indexes = self.get_existing_indexes(table)
            if indexes:
                for idx in indexes:
                    print(f"  • {idx['indexname']}")
                    print(f"    Tamaño: {idx['index_size']}")
                    print(f"    Definición: {idx['indexdef']}")
            else:
                print("  (sin índices personalizados)")
            
            # Uso de índices
            usage = self.check_index_usage(table)
            if usage:
                print(f"\n  Uso de índices:")
                for u in usage:
                    print(f"    • {u['indexname']}: {u['index_scans']:,} scans")
        
        # Sugerencias de índices
        print("\n" + "=" * 80)
        print("SUGERENCIAS DE OPTIMIZACIÓN")
        print("=" * 80)
        
        suggestions = self.suggest_indexes()
        self.create_indexes(suggestions, dry_run=True)
        
        # Benchmark
        self.benchmark_queries()
        
        print(f"\n{'=' * 80}")
        print("RECOMENDACIONES")
        print(f"{'=' * 80}")
        print("""
1. ÍNDICES: Ejecutar este script con --apply para crear los índices sugeridos
   - Los índices se crean con CONCURRENTLY para no bloquear la tabla
   - Mejorará significativamente el rendimiento de consultas filtradas
   
2. VACUUM: Ejecutar VACUUM ANALYZE periódicamente para mantener estadísticas
   - Comando: VACUUM ANALYZE sales_header, sales_detail;
   - Frecuencia recomendada: semanal o cuando haya muchas filas muertas
   
3. CACHÉ: Implementar caché de datos agregados en Redis o similar
   - Cachear resultados de análisis por categorías (última semana)
   - Cachear resultados de análisis por horas (último día)
   - TTL recomendado: 5-15 minutos
   
4. PARTICIONAMIENTO: Considerar particionar sales_header por fecha
   - Útil cuando la tabla supere 10M de registros
   - Mejorar rendimiento de consultas por rango de fechas
   
5. AGREGACIÓN PREVIA: Crear tabla de datos pre-agregados
   - Tabla con ventas agregadas por día/hora/sucursal/categoría
   - Actualizar con trigger o job nocturno
   - Reducir tiempo de consulta de segundos a milisegundos
        """)


def main():
    """Función principal"""
    import sys
    
    apply_changes = '--apply' in sys.argv
    
    if apply_changes:
        print("⚠️  MODO APLICACIÓN: Los índices serán creados en la base de datos")
        print("Presiona Ctrl+C en los próximos 5 segundos para cancelar...")
        try:
            time.sleep(5)
        except KeyboardInterrupt:
            print("\n✗ Cancelado por el usuario")
            return
    else:
        print("ℹ️  MODO DRY-RUN: Solo se mostrarán sugerencias (usa --apply para aplicar cambios)")
    
    optimizer = DatabaseOptimizer(DB_CONFIG)
    
    try:
        optimizer.connect()
        optimizer.generate_report()
        
        if apply_changes:
            print(f"\n{'=' * 80}")
            print("APLICANDO CAMBIOS")
            print(f"{'=' * 80}")
            suggestions = optimizer.suggest_indexes()
            optimizer.create_indexes(suggestions, dry_run=False)
            print("\n✓ Optimizaciones aplicadas exitosamente")
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        optimizer.close()


if __name__ == '__main__':
    main()
