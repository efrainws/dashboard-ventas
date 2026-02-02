import { trpc } from "@/lib/trpc";
import { useMemo } from "react";

export interface HourlySalesFilters {
  fecha_min?: string;
  fecha_max?: string;
  branch_id?: string;
}

/**
 * Hook para obtener ventas agregadas por hora y tienda
 * Por defecto trae datos de enero 2026
 */
export function useHourlySales(filters?: HourlySalesFilters) {
  // Calcular rango de fechas por defecto: enero 2026
  const defaultFilters = useMemo(() => {
    // Enero 2026: del 1 al 31
    const fecha_min = new Date('2026-01-01T00:00:00Z');
    const fecha_max = new Date('2026-02-01T00:00:00Z'); // Hasta el inicio de febrero
    
    return {
      fecha_min: fecha_min.toISOString(),
      fecha_max: fecha_max.toISOString(),
    };
  }, []);

  // Combinar filtros por defecto con filtros proporcionados
  const queryFilters = useMemo(() => {
    const combined = {
      ...defaultFilters,
      ...filters,
    };

    // Eliminar propiedades undefined
    const cleaned: any = {};
    Object.entries(combined).forEach(([key, value]) => {
      if (value !== undefined) {
        cleaned[key] = value;
      }
    });

    return cleaned;
  }, [defaultFilters, filters]);

  const { data, isLoading, error } = trpc.sales.getHourlySales.useQuery(queryFilters);

  // Calcular métricas agregadas
  const metrics = useMemo(() => {
    if (!data?.data) {
      return {
        totalSales: 0,
        totalTickets: 0,
        avgTicket: 0,
        branches: [],
      };
    }

    const sales = data.data;
    const totalSales = sales.reduce((sum, row) => sum + parseFloat(row.sales_amount || '0'), 0);
    const totalTickets = sales.reduce((sum, row) => sum + parseInt(row.tickets_count || '0'), 0);
    const avgTicket = totalTickets > 0 ? totalSales / totalTickets : 0;

    // Extraer sucursales únicas
    const branchesMap = new Map();
    sales.forEach(row => {
      if (row.branch_id && !branchesMap.has(row.branch_id)) {
        branchesMap.set(row.branch_id, {
          id: row.branch_id,
          name: row.branch_name,
          address: row.branch_address,
          sap_id: row.branch_sap_id,
        });
      }
    });
    const branches = Array.from(branchesMap.values());

    return {
      totalSales,
      totalTickets,
      avgTicket,
      branches,
    };
  }, [data]);

  return {
    data: data?.data || [],
    metadata: data?.metadata,
    metrics,
    isLoading,
    error,
  };
}
