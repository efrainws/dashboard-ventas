import { useState, useEffect, useMemo } from 'react';

export interface Sale {
  id: string;
  order_number: string;
  date_str: string;
  month_str: string;
  total: number;
  branch_name: string;
  payment_methods: string[];
  currency: string;
  country: string;
}

export interface DashboardData {
  metadata: {
    generated_at: string;
    total_records: number;
    date_range: {
      start: string;
      end: string;
    };
  };
  branches: string[];
  payment_methods: string[];
  sales: Sale[];
}

export interface Filters {
  branch: string | 'all';
  paymentMethod: string | 'all';
  dateRange: {
    from: Date | undefined;
    to: Date | undefined;
  };
}

export function useSalesData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data.json')
      .then(res => res.json())
      .then(data => {
        setData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading data:', err);
        setError('Error al cargar los datos de ventas');
        setLoading(false);
      });
  }, []);

  return { data, loading, error };
}

export function useFilteredSales(data: DashboardData | null, filters: Filters) {
  return useMemo(() => {
    if (!data) return [];

    return data.sales.filter(sale => {
      // Filtro por sucursal
      if (filters.branch !== 'all' && sale.branch_name !== filters.branch) {
        return false;
      }

      // Filtro por método de pago
      if (filters.paymentMethod !== 'all') {
        if (!sale.payment_methods.includes(filters.paymentMethod)) {
          return false;
        }
      }

      // Filtro por fecha
      if (filters.dateRange.from || filters.dateRange.to) {
        const saleDate = new Date(sale.date_str);
        
        if (filters.dateRange.from && saleDate < filters.dateRange.from) {
          return false;
        }
        
        if (filters.dateRange.to) {
          // Ajustar al final del día para incluir ventas del mismo día
          const endDate = new Date(filters.dateRange.to);
          endDate.setHours(23, 59, 59, 999);
          
          if (saleDate > endDate) {
            return false;
          }
        }
      }

      return true;
    });
  }, [data, filters]);
}
