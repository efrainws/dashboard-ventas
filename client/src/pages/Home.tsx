import { DashboardCharts } from "@/components/DashboardCharts";
import { DashboardFilters } from "@/components/DashboardFilters";
import { DashboardStats } from "@/components/DashboardStats";
import { SalesTable } from "@/components/SalesTable";
import { Filters, useFilteredSales, useSalesData } from "@/hooks/useSalesData";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut } from "lucide-react";
import { useMemo, useState } from "react";

export default function Home() {
  const { logout } = useAuth();
  const { data, loading, error } = useSalesData();
  const [filters, setFilters] = useState<Filters>({
    branch: 'all',
    paymentMethod: 'all',
    year: 'all',
    monthYear: 'all',
    dateRange: { from: undefined, to: undefined }
  });

  const filteredSales = useFilteredSales(data, filters);

  // Calcular meses disponibles a partir de los datos
  const availableMonths = useMemo(() => {
    if (!data) return [];
    const months = new Set(data.sales.map(s => s.month_str));
    return Array.from(months).sort().reverse();
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-lg font-medium">Cargando datos...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-destructive">
        <span className="text-lg font-medium">{error}</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 space-y-8">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Dashboard de Ventas</h1>
            <p className="text-muted-foreground">
              Visualización interactiva de ventas y transacciones.
              {data?.metadata && (
                <span className="ml-2 text-xs bg-muted px-2 py-1 rounded-full">
                  Actualizado: {data.metadata.generated_at}
                </span>
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar Sesión
          </Button>
        </div>

        {/* Filtros */}
        <DashboardFilters
          filters={filters}
          setFilters={setFilters}
          branches={data?.branches || []}
          paymentMethods={data?.payment_methods || []}
          availableMonths={availableMonths}
        />

        {/* KPIs */}
        <DashboardStats sales={filteredSales} />

        {/* Gráficos */}
        <DashboardCharts sales={filteredSales} />

        {/* Tabla de Datos */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Detalle de Transacciones</h2>
          <SalesTable sales={filteredSales} />
        </div>
      </div>
    </div>
  );
}
