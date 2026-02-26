import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { NavigationMenu } from "@/components/NavigationMenu";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogOut, TrendingUp, DollarSign, Filter, Moon, Sun, Users, ShoppingCart, Calendar } from "lucide-react";
import { useAggregatedSales, type AggregatedSalesFilters } from "@/hooks/useAggregatedSales";
import { DashboardFilters } from "@/components/DashboardFilters";
import { SalesLineChart } from "@/components/SalesLineChart";
import { CategoryPieChart } from "@/components/CategoryPieChart";
import { BranchBarChart } from "@/components/BranchBarChart";
import { KPICard } from "@/components/KPICard";
import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { useFilters } from "@/contexts/FiltersContext";

export default function SalesByCategory() {
  const { user, loading: authLoading } = useAuth();
  const { effectiveTheme, toggleTheme } = useTheme();
  const [, setLocation] = useLocation();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      setLocation('/login');
    },
  });

  // Usar filtros del contexto global
  const { dateRange: globalDateRange, setDateRange: setGlobalDateRange, branchId: globalBranchId, setBranchId: setGlobalBranchId } = useFilters();
  
  // Estado local para filtros - Por defecto: día de ayer
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (globalDateRange) return globalDateRange;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);
    
    return { from: yesterday, to: yesterdayEnd };
  });
  const [selectedBranch, setSelectedBranch] = useState<string>(() => globalBranchId || "all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Sincronizar con contexto global
  useEffect(() => {
    setGlobalDateRange(dateRange);
  }, [dateRange, setGlobalDateRange]);

  useEffect(() => {
    setGlobalBranchId(selectedBranch === "all" ? undefined : selectedBranch);
  }, [selectedBranch, setGlobalBranchId]);

  // Construir filtros para la consulta
  const filters = useMemo<AggregatedSalesFilters | undefined>(() => {
    const hasFilters = dateRange || selectedBranch !== "all" || selectedCategory !== "all";
    
    if (!hasFilters) {
      return undefined; // Usar valores por defecto del hook
    }

    // Construir objeto de filtros solo con valores definidos
    const result: AggregatedSalesFilters = {};
    
    if (dateRange?.from) {
      const fromDate = new Date(dateRange.from);
      fromDate.setHours(0, 0, 0, 0);
      result.fecha_min = fromDate.toISOString();
    }
    
    if (dateRange?.to) {
      const toDate = new Date(dateRange.to);
      toDate.setHours(23, 59, 59, 999);
      result.fecha_max = toDate.toISOString();
    }
    
    if (selectedBranch !== "all") {
      result.branch_id = selectedBranch;
    }
    
    if (selectedCategory !== "all") {
      result.category_id = selectedCategory;
    }

    return result;
  }, [dateRange, selectedBranch, selectedCategory]);

  // Obtener datos agregados con filtros
  const { data, metadata, metrics, isLoading, error } = useAggregatedSales(filters);

  // Obtener comparación con período anterior
  const comparisonQuery = trpc.sales.getAggregatedComparison.useQuery(
    filters && filters.fecha_min && filters.fecha_max
      ? {
          fecha_min: filters.fecha_min,
          fecha_max: filters.fecha_max,
          branch_id: filters.branch_id,
          category_id: filters.category_id,
        }
      : {
          fecha_min: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(),
          fecha_max: new Date().toISOString(),
        }
  );

  // Calcular número de días en el rango
  const numberOfDays = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return 1;
    
    // Normalizar fechas a medianoche para comparación correcta
    const fromDate = new Date(dateRange.from);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(dateRange.to);
    toDate.setHours(0, 0, 0, 0);
    
    const diffTime = Math.abs(toDate.getTime() - fromDate.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 para incluir el día inicial
    return diffDays;
  }, [dateRange]);

  // Obtener comparación por sucursal
  const branchComparisonQuery = trpc.sales.getBranchComparison.useQuery(
    filters && filters.fecha_min && filters.fecha_max
      ? {
          fecha_min: filters.fecha_min,
          fecha_max: filters.fecha_max,
          category_id: filters.category_id,
        }
      : {
          fecha_min: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(),
          fecha_max: new Date().toISOString(),
        }
  );

  // Obtener comparación por categoría
  const categoryComparisonQuery = trpc.sales.getCategoryComparison.useQuery(
    filters && filters.fecha_min && filters.fecha_max
      ? {
          fecha_min: filters.fecha_min,
          fecha_max: filters.fecha_max,
          branch_id: filters.branch_id,
        }
      : {
          fecha_min: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(),
          fecha_max: new Date().toISOString(),
        }
  );

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
  };

  const handleClearFilters = () => {
    setDateRange(undefined);
    setSelectedBranch("all");
    setSelectedCategory("all");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-lg font-medium">Cargando...</span>
      </div>
    );
  }

  // Formatear moneda
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Formatear número
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-PE').format(num);
  };

  // Determinar el texto del rango de fechas
  const dateRangeText = useMemo(() => {
    if (dateRange?.from && dateRange?.to) {
      return `${dateRange.from.toLocaleDateString('es-PE')} - ${dateRange.to.toLocaleDateString('es-PE')}`;
    } else if (dateRange?.from) {
      return `Desde ${dateRange.from.toLocaleDateString('es-PE')}`;
    } else if (dateRange?.to) {
      return `Hasta ${dateRange.to.toLocaleDateString('es-PE')}`;
    }
    return "Enero 2026 (por defecto)";
  }, [dateRange]);

  // Logo según tema
  const logoSrc = effectiveTheme === "dark" ? "/Logoclarochico.svg" : "/Logonegro.svg";

  return (
    <div className="min-h-screen bg-background">
      <NavigationMenu />
      <div className="container py-8 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight uppercase" style={{ fontFamily: 'Italian Plate No 1, serif' }}>ANÁLISIS POR CATEGORÍAS</h1>
          <p className="text-muted-foreground">
            Ventas agregadas por fecha, tienda y departamento
          </p>
          {metadata && (
            <p className="text-xs text-muted-foreground">
              Actualizado: {new Date(metadata.generated_at).toLocaleString('es-PE')} | 
              Total registros: {formatNumber(metadata.total_rows)}
            </p>
          )}
        </div>

        {/* Filtros */}
        <DashboardFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          selectedBranch={selectedBranch}
          branches={metrics.branches}
          onBranchChange={setSelectedBranch}
          selectedCategory={selectedCategory}
          categories={metrics.categories}
          onCategoryChange={setSelectedCategory}
          onClearFilters={handleClearFilters}
        />

        {/* Estado de carga */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-lg font-medium">Cargando datos...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Error al cargar datos</CardTitle>
              <CardDescription>{error.message}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* KPIs principales */}
        {!isLoading && !error && (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <KPICard
                title="Ventas Totales"
                value={metrics.totalSales}
                previousValue={comparisonQuery.data?.previous.total_sales}
                format="currency"
                icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
                showComparison={!!comparisonQuery.data}
              />

              <KPICard
                title="Total Transacciones"
                value={metrics.totalTickets || 0}
                previousValue={comparisonQuery.data?.previous.total_tickets}
                format="number"
                icon={<ShoppingCart className="h-4 w-4 text-muted-foreground" />}
                showComparison={!!comparisonQuery.data}
              />

              <KPICard
                title="Ticket Promedio"
                value={(metrics.totalTickets || 0) > 0 ? metrics.totalSales / (metrics.totalTickets || 1) : 0}
                previousValue={
                  comparisonQuery.data && comparisonQuery.data.previous.total_tickets > 0
                    ? comparisonQuery.data.previous.total_sales / comparisonQuery.data.previous.total_tickets
                    : undefined
                }
                format="currency"
                icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
                showComparison={!!comparisonQuery.data}
              />

              <KPICard
                title="Promedio por Día"
                value={numberOfDays > 0 ? metrics.totalSales / numberOfDays : 0}
                previousValue={
                  comparisonQuery.data && numberOfDays > 0
                    ? comparisonQuery.data.previous.total_sales / numberOfDays
                    : undefined
                }
                format="currency"
                icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
                showComparison={!!comparisonQuery.data}
              />
            </div>

            {/* Gráficos de visualización */}
            <div className="space-y-6">
              {/* Gráfico de línea: Progresión de ventas */}
              <SalesLineChart data={data} />

              {/* Gráfico de barras: Comparación por sucursal (ancho completo) */}
              <BranchBarChart 
                data={data} 
                comparisonData={branchComparisonQuery.data?.data}
              />

              {/* Gráfico de tarta: Distribución por categoría */}
              <CategoryPieChart 
                data={data}
                comparisonData={categoryComparisonQuery.data?.data}
              />
            </div>

            {/* Información de datos */}
            <Card>
              <CardHeader>
                <CardTitle>Información de Datos</CardTitle>
                <CardDescription>Detalles de la consulta agregada</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <p><span className="font-medium">Total de registros agregados:</span> {formatNumber(data.length)}</p>
                  <p><span className="font-medium">Rango de fechas:</span> {dateRangeText}</p>
                  <p><span className="font-medium">Sucursal:</span> {
                    selectedBranch === "all" 
                      ? "Todas las sucursales" 
                      : metrics.branches.find(b => b.id === selectedBranch)?.name || "Desconocida"
                  }</p>
                  <p><span className="font-medium">Categoría:</span> {
                    selectedCategory === "all" 
                      ? "Todas las categorías" 
                      : metrics.categories.find(c => c.id === selectedCategory)?.name || "Desconocida"
                  }</p>
                  <p><span className="font-medium">Agrupación:</span> Por hora, sucursal y departamento</p>
                  <p className="text-xs text-muted-foreground mt-4">
                    Los datos se agregan desde la base de datos PostgreSQL usando una consulta optimizada
                    que agrupa ventas por hora, fecha, tienda y departamento. No se muestran detalles
                    de transacciones individuales ni información de formas de pago.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
