#!/usr/bin/env python3
"""
Script para generar datos JSON para el dashboard web
Carga datos de PostgreSQL y los exporta en formato JSON optimizado para el frontend
"""

import json
import os
import sys
from datetime import datetime

# Agregar directorio raíz al path para importar módulos
sys.path.append('/home/ubuntu')

from qliksense_loader import load_qliksense_data
import pandas as pd

def generate_dashboard_data():
    print("Cargando datos desde PostgreSQL...")
    
    # Cargar datos (últimos 90 días para el dashboard)
    tables = load_qliksense_data(incremental=True, days_back=90)
    
    df_sales = tables['sales_header']
    df_branches = tables['branches']
    df_methods = tables['methods_payment']
    
    print(f"Datos cargados: {len(df_sales)} ventas, {len(df_methods)} pagos")
    
    # Preparar datos para el dashboard
    
    # 1. Datos de Sucursales (Diccionario para lookup rápido)
    branches_dict = df_branches.set_index('branch id')[['branch name', 'location']].to_dict('index')
    
    # 2. Datos de Ventas (Simplificados para el frontend)
    # Convertir fechas y manejar nulos
    df_sales['date'] = pd.to_datetime(df_sales['doc_date_txt'], errors='coerce')
    # Eliminar filas con fechas inválidas
    df_sales = df_sales.dropna(subset=['date'])
    
    df_sales['date_str'] = df_sales['date'].dt.strftime('%Y-%m-%d')
    df_sales['month_str'] = df_sales['date'].dt.strftime('%Y-%m')
    
    # Agregar nombre de sucursal
    df_sales['branch_name'] = df_sales['branch_id'].map(lambda x: branches_dict.get(x, {}).get('branch name', 'Desconocido'))
    
    # 3. Datos de Métodos de Pago
    # Agrupar por transacción para tener lista de métodos por venta
    methods_by_tx = df_methods.groupby('transaction id')['Medio de Pago'].apply(list).to_dict()
    
    # Agregar métodos a ventas
    df_sales['payment_methods'] = df_sales['id'].map(lambda x: methods_by_tx.get(x, []))
    
    # 4. Generar JSON final
    # Seleccionar columnas relevantes para minimizar tamaño
    cols_to_keep = [
        'id', 'order_number', 'date_str', 'month_str', 'total', 
        'branch_name', 'payment_methods', 'currency', 'country'
    ]
    
    # Filtrar solo registros válidos
    dashboard_data = df_sales[cols_to_keep].to_dict('records')
    
    # Estructura final
    final_data = {
        'metadata': {
            'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'total_records': len(dashboard_data),
            'date_range': {
                'start': df_sales['date_str'].min(),
                'end': df_sales['date_str'].max()
            }
        },
        'branches': sorted(list(set(df_sales['branch_name']))),
        'payment_methods': sorted(list(set(df_methods['Medio de Pago']))),
        'sales': dashboard_data
    }
    
    # Guardar JSON en public folder del proyecto web
    output_path = '/home/ubuntu/dashboard-ventas/client/public/data.json'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(final_data, f, ensure_ascii=False)
        
    print(f"Datos exportados a {output_path}")
    print(f"Tamaño del archivo: {os.path.getsize(output_path) / 1024 / 1024:.2f} MB")

if __name__ == "__main__":
    generate_dashboard_data()
