#!/usr/bin/env python3
"""
Script de procesamiento por lotes para Dashboard de Ventas Flora & Fauna

Este script implementa:
1. Procesamiento por lotes para grandes volúmenes de datos
2. Agregación pre-calculada de métricas comunes
3. Generación de reportes optimizados
4. Estrategias de caché para consultas frecuentes
"""

import psycopg2
import psycopg2.extras
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Iterator
import sys

# Configuración de conexión a PostgreSQL
DB_CONFIG = {
    'host': 'database-flora-y-fauna.clei6ceoew9j.us-east-2.rds.amazonaws.com',
    'port': 5432,
    'user': 'postgres',
    'password': '1tU1TTGYUmkTe5DGZXjg',
    'database': 'production-middleware-florayfauna',
    'sslmode': 'require'
}

# Tamaño de lote para procesamiento
BATCH_SIZE = 10000


class BatchProcessor:
    """Procesador de datos por lotes para optimizar memoria y rendimiento"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.conn = None
        self.cursor = None
        
    def connect(self):
        """Establecer conexión a la base de datos"""
        self.conn = psycopg2.connect(**self.config)
        self.cursor = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        # Configurar cursor del lado del servidor para grandes volúmenes
        self.cursor.itersize = BATCH_SIZE
        print(f"✓ Conexión establecida (batch size: {BATCH_SIZE:,})")
    
    def close(self):
        """Cerrar conexión"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
            print("✓ Conexión cerrada")
    
    def fetch_in_batches(self, query: str, params: tuple = None) -> Iterator[List[Dict]]:
        """
        Ejecutar consulta y devolver resultados en lotes
        Usa cursor del lado del servidor para no cargar todo en memoria
        """
        # Usar nombre de cursor para habilitar server-side cursor
        cursor_name = f"batch_cursor_{int(time.time())}"
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
            
            while True:
                batch = cursor.fetchmany(BATCH_SIZE)
                if not batch:
                    break
                yield [dict(row) for row in batch]
        finally:
            cursor.close()
    
    def aggregate_sales_by_day(self, start_date: str, end_date: str) -> Dict[str, Any]:
        """
        Agregar ventas por día usando procesamiento por lotes
        Optimizado para grandes volúmenes de datos
        """
        print(f"\n{'=' * 80}")
        print(f"AGREGACIÓN POR DÍA: {start_date} a {end_date}")
        print(f"{'=' * 80}")
        
        query = """
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
        WHERE sh.doc_date >= %s AND sh.doc_date < %s
        GROUP BY DATE(sh.doc_date), sh.branch_id, b.name, b.sap_id, sales_channel
        ORDER BY sale_date, branch_sap_id;
        """
        
        start_time = time.time()
        total_rows = 0
        results = []
        
        for batch in self.fetch_in_batches(query, (start_date, end_date)):
            total_rows += len(batch)
            results.extend(batch)
            print(f"  Procesados: {total_rows:,} registros...", end='\r')
        
        execution_time = time.time() - start_time
        print(f"\n✓ Completado en {execution_time:.2f}s ({total_rows:,} registros)")
        
        return {
            'data': results,
            'metadata': {
                'total_rows': total_rows,
                'execution_time': execution_time,
                'start_date': start_date,
                'end_date': end_date
            }
        }
    
    def aggregate_sales_by_hour(self, start_date: str, end_date: str) -> Dict[str, Any]:
        """
        Agregar ventas por hora usando procesamiento por lotes
        """
        print(f"\n{'=' * 80}")
        print(f"AGREGACIÓN POR HORA: {start_date} a {end_date}")
        print(f"{'=' * 80}")
        
        query = """
        SELECT 
            DATE(sh.doc_date) as sale_date,
            EXTRACT(HOUR FROM sh.doc_date)::integer as sale_hour,
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
            AVG(sh.total) as avg_ticket
        FROM sales_header sh
        LEFT JOIN branches b ON b.id = sh.branch_id
        WHERE sh.doc_date >= %s AND sh.doc_date < %s
        GROUP BY DATE(sh.doc_date), EXTRACT(HOUR FROM sh.doc_date), sh.branch_id, b.name, b.sap_id, sales_channel
        ORDER BY sale_date, sale_hour, branch_sap_id;
        """
        
        start_time = time.time()
        total_rows = 0
        results = []
        
        for batch in self.fetch_in_batches(query, (start_date, end_date)):
            total_rows += len(batch)
            results.extend(batch)
            print(f"  Procesados: {total_rows:,} registros...", end='\r')
        
        execution_time = time.time() - start_time
        print(f"\n✓ Completado en {execution_time:.2f}s ({total_rows:,} registros)")
        
        return {
            'data': results,
            'metadata': {
                'total_rows': total_rows,
                'execution_time': execution_time,
                'start_date': start_date,
                'end_date': end_date
            }
        }
    
    def generate_summary_stats(self, start_date: str, end_date: str) -> Dict[str, Any]:
        """
        Generar estadísticas resumidas para el período
        """
        print(f"\n{'=' * 80}")
        print(f"ESTADÍSTICAS RESUMIDAS: {start_date} a {end_date}")
        print(f"{'=' * 80}")
        
        query = """
        SELECT 
            COUNT(DISTINCT sh.id) as total_transactions,
            COUNT(DISTINCT sh.branch_id) as total_branches,
            COUNT(DISTINCT DATE(sh.doc_date)) as total_days,
            SUM(sh.total) as total_sales,
            AVG(sh.total) as avg_ticket,
            MIN(sh.total) as min_ticket,
            MAX(sh.total) as max_ticket,
            STDDEV(sh.total) as stddev_ticket,
            -- Por canal
            COUNT(DISTINCT CASE WHEN sh.source_system_id = 'be387046-08e4-4229-a52c-7ff5c1569c89' THEN sh.id END) as ecommerce_transactions,
            SUM(CASE WHEN sh.source_system_id = 'be387046-08e4-4229-a52c-7ff5c1569c89' THEN sh.total ELSE 0 END) as ecommerce_sales,
            COUNT(DISTINCT CASE WHEN sh.source_system_id != 'be387046-08e4-4229-a52c-7ff5c1569c89' THEN sh.id END) as presencial_transactions,
            SUM(CASE WHEN sh.source_system_id != 'be387046-08e4-4229-a52c-7ff5c1569c89' THEN sh.total ELSE 0 END) as presencial_sales
        FROM sales_header sh
        WHERE sh.doc_date >= %s AND sh.doc_date < %s;
        """
        
        start_time = time.time()
        self.cursor.execute(query, (start_date, end_date))
        result = dict(self.cursor.fetchone())
        execution_time = time.time() - start_time
        
        print(f"\n📊 Resumen del Período:")
        print(f"  Total Transacciones: {result['total_transactions']:,}")
        print(f"  Total Ventas: S/ {float(result['total_sales']):,.2f}")
        print(f"  Ticket Promedio: S/ {float(result['avg_ticket']):,.2f}")
        print(f"  Ticket Mínimo: S/ {float(result['min_ticket']):,.2f}")
        print(f"  Ticket Máximo: S/ {float(result['max_ticket']):,.2f}")
        print(f"  Desviación Estándar: S/ {float(result['stddev_ticket']):,.2f}")
        print(f"\n  📱 eCommerce:")
        print(f"    Transacciones: {result['ecommerce_transactions']:,}")
        print(f"    Ventas: S/ {float(result['ecommerce_sales']):,.2f}")
        print(f"\n  🏪 Presencial:")
        print(f"    Transacciones: {result['presencial_transactions']:,}")
        print(f"    Ventas: S/ {float(result['presencial_sales']):,.2f}")
        print(f"\n✓ Completado en {execution_time:.2f}s")
        
        return result
    
    def export_to_json(self, data: Dict[str, Any], filename: str):
        """Exportar datos a archivo JSON"""
        output_path = f"/home/ubuntu/dashboard-ventas/data/{filename}"
        
        # Convertir tipos especiales a serializables
        def convert_types(obj):
            if isinstance(obj, (datetime,)):
                return obj.isoformat()
            elif hasattr(obj, '__float__'):
                return float(obj)
            return obj
        
        # Crear directorio si no existe
        import os
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=convert_types)
        
        file_size = os.path.getsize(output_path)
        print(f"✓ Exportado a: {output_path} ({file_size:,} bytes)")
    
    def create_aggregated_table(self):
        """
        Crear tabla de datos pre-agregados para consultas rápidas
        Esta tabla se puede actualizar con un job nocturno
        """
        print(f"\n{'=' * 80}")
        print("CREACIÓN DE TABLA DE AGREGACIÓN")
        print(f"{'=' * 80}")
        
        # Verificar si la tabla ya existe
        check_query = """
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'sales_aggregated_daily'
        );
        """
        
        self.cursor.execute(check_query)
        table_exists = self.cursor.fetchone()['exists']
        
        if table_exists:
            print("⚠️  La tabla sales_aggregated_daily ya existe")
            response = input("¿Desea recrearla? (s/n): ")
            if response.lower() != 's':
                print("✗ Operación cancelada")
                return
            
            drop_query = "DROP TABLE IF EXISTS sales_aggregated_daily CASCADE;"
            self.cursor.execute(drop_query)
            self.conn.commit()
            print("✓ Tabla anterior eliminada")
        
        create_query = """
        CREATE TABLE sales_aggregated_daily (
            id SERIAL PRIMARY KEY,
            sale_date DATE NOT NULL,
            branch_id UUID,
            branch_name VARCHAR(255),
            branch_sap_id VARCHAR(50),
            sales_channel VARCHAR(20),
            transaction_count INTEGER,
            total_sales NUMERIC(15, 2),
            avg_ticket NUMERIC(15, 2),
            min_ticket NUMERIC(15, 2),
            max_ticket NUMERIC(15, 2),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(sale_date, branch_id, sales_channel)
        );
        
        -- Índices para consultas rápidas
        CREATE INDEX idx_sales_agg_daily_date ON sales_aggregated_daily(sale_date);
        CREATE INDEX idx_sales_agg_daily_branch ON sales_aggregated_daily(branch_id);
        CREATE INDEX idx_sales_agg_daily_channel ON sales_aggregated_daily(sales_channel);
        CREATE INDEX idx_sales_agg_daily_date_branch ON sales_aggregated_daily(sale_date, branch_id);
        """
        
        self.cursor.execute(create_query)
        self.conn.commit()
        print("✓ Tabla sales_aggregated_daily creada exitosamente")
        print("✓ Índices creados")
    
    def populate_aggregated_table(self, start_date: str, end_date: str):
        """
        Poblar tabla de agregación con datos históricos
        """
        print(f"\n{'=' * 80}")
        print(f"POBLANDO TABLA DE AGREGACIÓN: {start_date} a {end_date}")
        print(f"{'=' * 80}")
        
        insert_query = """
        INSERT INTO sales_aggregated_daily 
            (sale_date, branch_id, branch_name, branch_sap_id, sales_channel, 
             transaction_count, total_sales, avg_ticket, min_ticket, max_ticket)
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
        WHERE sh.doc_date >= %s AND sh.doc_date < %s
        GROUP BY DATE(sh.doc_date), sh.branch_id, b.name, b.sap_id, sales_channel
        ON CONFLICT (sale_date, branch_id, sales_channel) 
        DO UPDATE SET
            transaction_count = EXCLUDED.transaction_count,
            total_sales = EXCLUDED.total_sales,
            avg_ticket = EXCLUDED.avg_ticket,
            min_ticket = EXCLUDED.min_ticket,
            max_ticket = EXCLUDED.max_ticket,
            updated_at = CURRENT_TIMESTAMP;
        """
        
        start_time = time.time()
        self.cursor.execute(insert_query, (start_date, end_date))
        rows_affected = self.cursor.rowcount
        self.conn.commit()
        execution_time = time.time() - start_time
        
        print(f"✓ Insertados/actualizados {rows_affected:,} registros en {execution_time:.2f}s")


def main():
    """Función principal"""
    print("=" * 80)
    print("PROCESADOR POR LOTES - Dashboard de Ventas Flora & Fauna")
    print("=" * 80)
    
    processor = BatchProcessor(DB_CONFIG)
    
    try:
        processor.connect()
        
        # Definir rango de fechas (último mes)
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=30)
        
        print(f"\nRango de fechas: {start_date} a {end_date}")
        
        # Menú de opciones
        print("\nOpciones disponibles:")
        print("1. Generar estadísticas resumidas")
        print("2. Agregar ventas por día (exportar JSON)")
        print("3. Agregar ventas por hora (exportar JSON)")
        print("4. Crear tabla de agregación diaria")
        print("5. Poblar tabla de agregación con datos históricos")
        print("6. Ejecutar todo")
        
        if len(sys.argv) > 1:
            option = sys.argv[1]
        else:
            option = input("\nSeleccione una opción (1-6): ")
        
        if option in ['1', '6']:
            stats = processor.generate_summary_stats(
                start_date.isoformat(), 
                end_date.isoformat()
            )
            processor.export_to_json(stats, f'summary_stats_{start_date}_{end_date}.json')
        
        if option in ['2', '6']:
            daily_data = processor.aggregate_sales_by_day(
                start_date.isoformat(), 
                end_date.isoformat()
            )
            processor.export_to_json(daily_data, f'sales_by_day_{start_date}_{end_date}.json')
        
        if option in ['3', '6']:
            hourly_data = processor.aggregate_sales_by_hour(
                start_date.isoformat(), 
                end_date.isoformat()
            )
            processor.export_to_json(hourly_data, f'sales_by_hour_{start_date}_{end_date}.json')
        
        if option in ['4', '6']:
            processor.create_aggregated_table()
        
        if option in ['5', '6']:
            # Para datos históricos, usar rango más amplio
            hist_start = datetime(2024, 1, 1).date()
            processor.populate_aggregated_table(
                hist_start.isoformat(),
                end_date.isoformat()
            )
        
        print(f"\n{'=' * 80}")
        print("✓ PROCESAMIENTO COMPLETADO")
        print(f"{'=' * 80}")
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        processor.close()


if __name__ == '__main__':
    main()
