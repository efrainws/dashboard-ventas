import { useMemo } from 'react';
import { parseISO, startOfDay, subDays } from 'date-fns';
import { trpc } from '@/lib/trpc';
import { Filters } from './useSalesData';

export function useCategorySales(filters: Filters) {
  // Determinar si el usuario ha especificado un rango de fechas explícito
  const hasExplicitDateRange = filters.dateRange.from || filters.dateRange.to;
  
  // Obtener datos de ventas para calcular la fecha más reciente (solo si no hay rango explícito)
  const allDataQuery = trpc.sales.getSalesData.useQuery(undefined, {
    enabled: !hasExplicitDateRange
  });
  
  // Calcular el rango de última semana si no hay rango explícito
  const defaultDateRange = useMemo(() => {
    if (hasExplicitDateRange || !allDataQuery.data) return null;
    
    // Encontrar la fecha más reciente
    let maxTimestamp = 0;
    for (const sale of allDataQuery.data.sales) {
      const ts = parseISO(sale.date_str).getTime();
      if (ts > maxTimestamp) {
        maxTimestamp = ts;
      }
    }
    
    const maxDate = new Date(maxTimestamp);
    const oneWeekAgo = subDays(maxDate, 7);
    
    return {
      start: oneWeekAgo.toISOString(),
      end: maxDate.toISOString()
    };
  }, [hasExplicitDateRange, allDataQuery.data]);

  // Convertir filtros a formato del backend
  let startDate: string | undefined;
  let endDate: string | undefined;
  
  if (!hasExplicitDateRange && defaultDateRange) {
    // Aplicar filtro de última semana por defecto (incluso si hay otros filtros activos)
    startDate = defaultDateRange.start;
    endDate = defaultDateRange.end;
  } else {
    // Usar filtros explícitos del usuario
    startDate = filters.dateRange.from ? startOfDay(filters.dateRange.from).toISOString() : undefined;
    endDate = filters.dateRange.to ? startOfDay(filters.dateRange.to).toISOString() : undefined;
  }

  const { data, isLoading, error } = trpc.sales.getSalesByGrandparentCategory.useQuery({
    branch: filters.branch !== 'all' ? filters.branch : undefined,
    paymentMethod: filters.paymentMethod !== 'all' ? filters.paymentMethod : undefined,
    startDate,
    endDate,
  });

  return {
    data,
    loading: isLoading,
    error: error ? 'Error al cargar los datos de categorías' : null
  };
}
