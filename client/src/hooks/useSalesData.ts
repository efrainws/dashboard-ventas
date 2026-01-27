import { useMemo } from 'react';
import { subDays, startOfDay, parseISO } from 'date-fns';
import { trpc } from '@/lib/trpc';

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
  year: string | 'all';
  monthYear: string | 'all';
  dateRange: {
    from: Date | undefined;
    to: Date | undefined;
  };
}

export function useSalesData() {
  const { data, isLoading, error } = trpc.sales.getSalesData.useQuery();

  return { 
    data: data || null, 
    loading: isLoading, 
    error: error ? 'Error al cargar los datos de ventas' : null 
  };
}

export function useFilteredSales(data: DashboardData | null, filters: Filters) {
  return useMemo(() => {
    if (!data) return [];

    // Si no hay filtros activos, mostrar solo la última semana por defecto
    const isDefaultView = 
      filters.branch === 'all' && 
      filters.paymentMethod === 'all' && 
      filters.year === 'all' && 
      filters.monthYear === 'all' && 
      !filters.dateRange.from && 
      !filters.dateRange.to;

    let filteredSales = data.sales;

    if (isDefaultView) {
      // Obtener la fecha más reciente de manera eficiente
      let maxTimestamp = 0;
      for (const sale of data.sales) {
        const ts = parseISO(sale.date_str).getTime();
        if (ts > maxTimestamp) {
          maxTimestamp = ts;
        }
      }
      
      const maxDate = new Date(maxTimestamp);
      const oneWeekAgo = subDays(maxDate, 7);
      
      return data.sales.filter(sale => {
        const saleDate = parseISO(sale.date_str);
        return saleDate >= oneWeekAgo;
      });
    }

    return filteredSales.filter(sale => {
      const saleDate = parseISO(sale.date_str);

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

      // Filtro por Año
      if (filters.year !== 'all') {
        if (saleDate.getFullYear().toString() !== filters.year) {
          return false;
        }
      }

      // Filtro por Año-Mes
      if (filters.monthYear !== 'all') {
        if (sale.month_str !== filters.monthYear) {
          return false;
        }
      }

      // Filtro por rango de fechas personalizado
      if (filters.dateRange.from || filters.dateRange.to) {
        if (filters.dateRange.from && saleDate < startOfDay(filters.dateRange.from)) {
          return false;
        }
        
        if (filters.dateRange.to) {
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
