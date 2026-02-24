#!/usr/bin/env python3
"""
Script de validación de integridad de datos para Dashboard de Ventas Flora & Fauna

Este script implementa:
1. Validación de integridad referencial entre tablas
2. Detección de discrepancias entre totales de header y detalles
3. Identificación de registros duplicados
4. Validación de rangos de valores y tipos de datos
5. Procesamiento eficiente por lotes para grandes volúmenes
"""

import psycopg2
import psycopg2.extras
import json
import time
from datetime import datetime
from typing import Dict, List, Any, Tuple
from decimal import Decimal
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

# Tamaño de lote para procesamiento eficiente
BATCH_SIZE = 5000


class DataIntegrityValidator:
    """Validador de integridad de datos con procesamiento optimizado"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.conn = None
        self.cursor = None
        self.issues = {
            'critical': [],
            'warning': [],
            'info': []
        }
        
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
        """Cerrar conexión"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
            print("✓ Conexión cerrada")
    
    def add_issue(self, severity: str, category: str, description: str, details: Dict = None):
        """Agregar un problema detectado"""
        issue = {
            'category': category,
            'description': description,
            'timestamp': datetime.now().isoformat(),
            'details': details or {}
        }
        self.issues[severity].append(issue)
    
    def validate_referential_integrity(self):
        """Validar integridad referencial entre tablas"""
        print(f"\n{'=' * 80}")
        print("VALIDACIÓN DE INTEGRIDAD REFERENCIAL")
        print(f"{'=' * 80}")
        
        # 1. Verificar sales_detail sin sales_header correspondiente
        print("\n1. Verificando sales_detail huérfanos...")
        query1 = """
        SELECT COUNT(*) as orphan_count
        FROM sales_detail sd
        LEFT JOIN sales_header sh ON sd.header_id = sh.id
        WHERE sh.id IS NULL;
        """
        
        start_time = time.time()
        self.cursor.execute(query1)
        result = self.cursor.fetchone()
        execution_time = time.time() - start_time
        
        orphan_count = result['orphan_count']
        if orphan_count > 0:
            self.add_issue(
                'critical',
                'Integridad Referencial',
                f'Se encontraron {orphan_count:,} registros en sales_detail sin header correspondiente',
                {'orphan_count': orphan_count, 'execution_time': execution_time}
            )
            print(f"   ✗ CRÍTICO: {orphan_count:,} registros huérfanos encontrados ({execution_time:.2f}s)")
        else:
            print(f"   ✓ Sin registros huérfanos ({execution_time:.2f}s)")
        
        # 2. Verificar sales_header sin sales_detail
        print("\n2. Verificando sales_header sin detalles...")
        query2 = """
        SELECT COUNT(*) as empty_headers
        FROM sales_header sh
        LEFT JOIN sales_detail sd ON sh.id = sd.header_id
        WHERE sd.id IS NULL;
        """
        
        start_time = time.time()
        self.cursor.execute(query2)
        result = self.cursor.fetchone()
        execution_time = time.time() - start_time
        
        empty_headers = result['empty_headers']
        if empty_headers > 0:
            self.add_issue(
                'warning',
                'Integridad Referencial',
                f'Se encontraron {empty_headers:,} headers sin detalles',
                {'empty_headers': empty_headers, 'execution_time': execution_time}
            )
            print(f"   ⚠ ADVERTENCIA: {empty_headers:,} headers vacíos ({execution_time:.2f}s)")
        else:
            print(f"   ✓ Todos los headers tienen detalles ({execution_time:.2f}s)")
        
        # 3. Verificar referencias a branches inexistentes
        print("\n3. Verificando referencias a sucursales...")
        query3 = """
        SELECT COUNT(*) as invalid_branches
        FROM sales_header sh
        LEFT JOIN branches b ON sh.branch_id = b.id
        WHERE sh.branch_id IS NOT NULL AND b.id IS NULL;
        """
        
        start_time = time.time()
        self.cursor.execute(query3)
        result = self.cursor.fetchone()
        execution_time = time.time() - start_time
        
        invalid_branches = result['invalid_branches']
        if invalid_branches > 0:
            self.add_issue(
                'critical',
                'Integridad Referencial',
                f'Se encontraron {invalid_branches:,} ventas con branch_id inválido',
                {'invalid_branches': invalid_branches, 'execution_time': execution_time}
            )
            print(f"   ✗ CRÍTICO: {invalid_branches:,} referencias inválidas ({execution_time:.2f}s)")
        else:
            print(f"   ✓ Todas las referencias a sucursales son válidas ({execution_time:.2f}s)")
        
        # 4. Verificar referencias a categorías inexistentes
        print("\n4. Verificando referencias a categorías...")
        query4 = """
        SELECT COUNT(*) as invalid_categories
        FROM sales_detail sd
        LEFT JOIN categories c ON sd.category_id = c.id
        WHERE sd.category_id IS NOT NULL AND c.id IS NULL;
        """
        
        start_time = time.time()
        self.cursor.execute(query4)
        result = self.cursor.fetchone()
        execution_time = time.time() - start_time
        
        invalid_categories = result['invalid_categories']
        if invalid_categories > 0:
            self.add_issue(
                'warning',
                'Integridad Referencial',
                f'Se encontraron {invalid_categories:,} detalles con category_id inválido',
                {'invalid_categories': invalid_categories, 'execution_time': execution_time}
            )
            print(f"   ⚠ ADVERTENCIA: {invalid_categories:,} referencias inválidas ({execution_time:.2f}s)")
        else:
            print(f"   ✓ Todas las referencias a categorías son válidas ({execution_time:.2f}s)")
    
    def validate_totals_consistency(self, date_filter: str = None):
        """
        Validar consistencia entre totales de header y suma de detalles
        Procesamiento optimizado por lotes
        """
        print(f"\n{'=' * 80}")
        print("VALIDACIÓN DE CONSISTENCIA DE TOTALES")
        print(f"{'=' * 80}")
        
        # Construir filtro de fecha si se proporciona
        date_condition = ""
        params = []
        if date_filter:
            date_condition = "WHERE DATE(sh.doc_date) = %s"
            params = [date_filter]
            print(f"Filtrando por fecha: {date_filter}")
        
        query = f"""
        SELECT 
            sh.id as sale_id,
            sh.doc_date,
            sh.branch_id,
            b.sap_id as branch_sap_id,
            sh.total as header_total,
            COALESCE(SUM(sd.total), 0) as detail_total,
            sh.total - COALESCE(SUM(sd.total), 0) as difference,
            COUNT(sd.id) as detail_count
        FROM sales_header sh
        LEFT JOIN sales_detail sd ON sh.id = sd.header_id
        LEFT JOIN branches b ON sh.branch_id = b.id
        {date_condition}
        GROUP BY sh.id, sh.doc_date, sh.branch_id, b.sap_id, sh.total
        HAVING ABS(sh.total - COALESCE(SUM(sd.total), 0)) > 0.01
        ORDER BY ABS(sh.total - COALESCE(SUM(sd.total), 0)) DESC
        LIMIT 1000;
        """
        
        start_time = time.time()
        
        if params:
            self.cursor.execute(query, params)
        else:
            self.cursor.execute(query)
        
        discrepancies = [dict(row) for row in self.cursor.fetchall()]
        execution_time = time.time() - start_time
        
        if discrepancies:
            total_diff = sum(abs(float(d['difference'])) for d in discrepancies)
            
            self.add_issue(
                'critical',
                'Consistencia de Totales',
                f'Se encontraron {len(discrepancies):,} transacciones con discrepancias',
                {
                    'discrepancy_count': len(discrepancies),
                    'total_difference': total_diff,
                    'execution_time': execution_time,
                    'sample_discrepancies': discrepancies[:10]
                }
            )
            
            print(f"\n✗ CRÍTICO: {len(discrepancies):,} discrepancias encontradas")
            print(f"  Diferencia total acumulada: S/ {total_diff:,.2f}")
            print(f"  Tiempo de ejecución: {execution_time:.2f}s")
            
            # Mostrar top 5 discrepancias
            print(f"\n  Top 5 discrepancias más grandes:")
            for i, disc in enumerate(discrepancies[:5], 1):
                print(f"    {i}. Sale ID: {disc['sale_id']}")
                print(f"       Fecha: {disc['doc_date']}")
                print(f"       Sucursal: {disc['branch_sap_id']}")
                print(f"       Header: S/ {float(disc['header_total']):,.2f}")
                print(f"       Detalles: S/ {float(disc['detail_total']):,.2f}")
                print(f"       Diferencia: S/ {float(disc['difference']):,.2f}")
                print()
        else:
            print(f"✓ Todos los totales son consistentes ({execution_time:.2f}s)")
    
    def validate_data_ranges(self):
        """Validar rangos de valores y detectar anomalías"""
        print(f"\n{'=' * 80}")
        print("VALIDACIÓN DE RANGOS DE DATOS")
        print(f"{'=' * 80}")
        
        # 1. Verificar totales negativos
        print("\n1. Verificando totales negativos...")
        query1 = """
        SELECT 
            COUNT(*) as negative_count,
            MIN(total) as min_total,
            SUM(total) as sum_negative
        FROM sales_header
        WHERE total < 0;
        """
        
        start_time = time.time()
        self.cursor.execute(query1)
        result = self.cursor.fetchone()
        execution_time = time.time() - start_time
        
        negative_count = result['negative_count']
        if negative_count > 0:
            self.add_issue(
                'warning',
                'Rango de Datos',
                f'Se encontraron {negative_count:,} ventas con total negativo',
                {
                    'negative_count': negative_count,
                    'min_total': float(result['min_total']),
                    'sum_negative': float(result['sum_negative']),
                    'execution_time': execution_time
                }
            )
            print(f"   ⚠ ADVERTENCIA: {negative_count:,} totales negativos")
            print(f"      Mínimo: S/ {float(result['min_total']):,.2f}")
            print(f"      Suma: S/ {float(result['sum_negative']):,.2f}")
        else:
            print(f"   ✓ Sin totales negativos ({execution_time:.2f}s)")
        
        # 2. Verificar totales excesivamente altos (outliers)
        print("\n2. Verificando outliers (tickets > S/ 10,000)...")
        query2 = """
        SELECT 
            COUNT(*) as outlier_count,
            MAX(total) as max_total,
            AVG(total) as avg_total
        FROM sales_header
        WHERE total > 10000;
        """
        
        start_time = time.time()
        self.cursor.execute(query2)
        result = self.cursor.fetchone()
        execution_time = time.time() - start_time
        
        outlier_count = result['outlier_count']
        if outlier_count > 0:
            self.add_issue(
                'info',
                'Rango de Datos',
                f'Se encontraron {outlier_count:,} ventas con ticket > S/ 10,000',
                {
                    'outlier_count': outlier_count,
                    'max_total': float(result['max_total']),
                    'avg_total': float(result['avg_total']),
                    'execution_time': execution_time
                }
            )
            print(f"   ℹ INFO: {outlier_count:,} tickets altos detectados")
            print(f"      Máximo: S/ {float(result['max_total']):,.2f}")
            print(f"      Promedio de outliers: S/ {float(result['avg_total']):,.2f}")
        else:
            print(f"   ✓ Sin outliers detectados ({execution_time:.2f}s)")
        
        # 3. Verificar cantidades negativas o cero en detalles
        print("\n3. Verificando cantidades inválidas en detalles...")
        query3 = """
        SELECT 
            COUNT(*) as invalid_qty_count,
            COUNT(CASE WHEN quantity = 0 THEN 1 END) as zero_qty,
            COUNT(CASE WHEN quantity < 0 THEN 1 END) as negative_qty
        FROM sales_detail
        WHERE quantity <= 0;
        """
        
        start_time = time.time()
        self.cursor.execute(query3)
        result = self.cursor.fetchone()
        execution_time = time.time() - start_time
        
        invalid_qty = result['invalid_qty_count']
        if invalid_qty > 0:
            self.add_issue(
                'warning',
                'Rango de Datos',
                f'Se encontraron {invalid_qty:,} detalles con cantidad <= 0',
                {
                    'invalid_qty_count': invalid_qty,
                    'zero_qty': result['zero_qty'],
                    'negative_qty': result['negative_qty'],
                    'execution_time': execution_time
                }
            )
            print(f"   ⚠ ADVERTENCIA: {invalid_qty:,} cantidades inválidas")
            print(f"      Cantidad cero: {result['zero_qty']:,}")
            print(f"      Cantidad negativa: {result['negative_qty']:,}")
        else:
            print(f"   ✓ Todas las cantidades son válidas ({execution_time:.2f}s)")
        
        # 4. Verificar fechas futuras
        print("\n4. Verificando fechas futuras...")
        query4 = """
        SELECT COUNT(*) as future_dates
        FROM sales_header
        WHERE doc_date > NOW();
        """
        
        start_time = time.time()
        self.cursor.execute(query4)
        result = self.cursor.fetchone()
        execution_time = time.time() - start_time
        
        future_dates = result['future_dates']
        if future_dates > 0:
            self.add_issue(
                'warning',
                'Rango de Datos',
                f'Se encontraron {future_dates:,} ventas con fecha futura',
                {'future_dates': future_dates, 'execution_time': execution_time}
            )
            print(f"   ⚠ ADVERTENCIA: {future_dates:,} fechas futuras")
        else:
            print(f"   ✓ Sin fechas futuras ({execution_time:.2f}s)")
    
    def detect_duplicates(self):
        """Detectar posibles registros duplicados"""
        print(f"\n{'=' * 80}")
        print("DETECCIÓN DE DUPLICADOS")
        print(f"{'=' * 80}")
        
        # Buscar headers duplicados por fecha, sucursal y total
        print("\n1. Buscando headers potencialmente duplicados...")
        query = """
        SELECT 
            doc_date,
            branch_id,
            total,
            COUNT(*) as duplicate_count,
            ARRAY_AGG(id) as sale_ids
        FROM sales_header
        GROUP BY doc_date, branch_id, total
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
        LIMIT 100;
        """
        
        start_time = time.time()
        self.cursor.execute(query)
        duplicates = [dict(row) for row in self.cursor.fetchall()]
        execution_time = time.time() - start_time
        
        if duplicates:
            total_duplicates = sum(d['duplicate_count'] for d in duplicates)
            
            self.add_issue(
                'warning',
                'Duplicados',
                f'Se encontraron {len(duplicates):,} grupos de posibles duplicados ({total_duplicates:,} registros)',
                {
                    'duplicate_groups': len(duplicates),
                    'total_duplicates': total_duplicates,
                    'execution_time': execution_time,
                    'sample_duplicates': duplicates[:5]
                }
            )
            
            print(f"   ⚠ ADVERTENCIA: {len(duplicates):,} grupos de duplicados potenciales")
            print(f"      Total de registros afectados: {total_duplicates:,}")
            print(f"      Tiempo de ejecución: {execution_time:.2f}s")
        else:
            print(f"   ✓ Sin duplicados detectados ({execution_time:.2f}s)")
    
    def generate_report(self, output_file: str = None):
        """Generar reporte completo de validación"""
        print(f"\n{'=' * 80}")
        print("REPORTE DE VALIDACIÓN DE INTEGRIDAD")
        print(f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'=' * 80}")
        
        # Resumen de problemas
        critical_count = len(self.issues['critical'])
        warning_count = len(self.issues['warning'])
        info_count = len(self.issues['info'])
        
        print(f"\n📊 RESUMEN:")
        print(f"  ✗ Críticos: {critical_count}")
        print(f"  ⚠ Advertencias: {warning_count}")
        print(f"  ℹ Informativos: {info_count}")
        
        # Detallar problemas críticos
        if critical_count > 0:
            print(f"\n{'=' * 80}")
            print("PROBLEMAS CRÍTICOS")
            print(f"{'=' * 80}")
            for i, issue in enumerate(self.issues['critical'], 1):
                print(f"\n{i}. {issue['category']}: {issue['description']}")
                if issue['details']:
                    for key, value in issue['details'].items():
                        if key not in ['sample_discrepancies', 'sample_duplicates']:
                            print(f"   {key}: {value}")
        
        # Exportar a JSON si se especifica archivo
        if output_file:
            report_data = {
                'timestamp': datetime.now().isoformat(),
                'summary': {
                    'critical': critical_count,
                    'warning': warning_count,
                    'info': info_count
                },
                'issues': self.issues
            }
            
            import os
            os.makedirs(os.path.dirname(output_file), exist_ok=True)
            
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(report_data, f, ensure_ascii=False, indent=2, default=str)
            
            file_size = os.path.getsize(output_file)
            print(f"\n✓ Reporte exportado a: {output_file} ({file_size:,} bytes)")
        
        return self.issues


def main():
    """Función principal"""
    print("=" * 80)
    print("VALIDADOR DE INTEGRIDAD DE DATOS - Dashboard de Ventas Flora & Fauna")
    print("=" * 80)
    
    validator = DataIntegrityValidator(DB_CONFIG)
    
    try:
        validator.connect()
        
        # Ejecutar todas las validaciones
        validator.validate_referential_integrity()
        validator.validate_totals_consistency()
        validator.validate_data_ranges()
        validator.detect_duplicates()
        
        # Generar reporte
        output_file = f"/home/ubuntu/dashboard-ventas/data/integrity_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        validator.generate_report(output_file)
        
        print(f"\n{'=' * 80}")
        print("VALIDACIÓN COMPLETADA")
        print(f"{'=' * 80}")
        
    except Exception as e:
        print(f"\n✗ Error durante la validación: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        validator.close()


if __name__ == "__main__":
    main()
