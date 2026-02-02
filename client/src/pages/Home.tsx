import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogOut, TrendingUp, DollarSign, Filter } from "lucide-react";
import { useAggregatedSales, type AggregatedSalesFilters } from "@/hooks/useAggregatedSales";
import { DashboardFilters } from "@/components/DashboardFilters";
import { SalesLineChart } from "@/components/SalesLineChart";
import { CategoryPieChart } from "@/components/CategoryPieChart";
import { BranchBarChart } from "@/components/BranchBarChart";
import { useState, useMemo } from "react";

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const { effectiveTheme } = useTheme();
  const [, setLocation] = useLocation();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      setLocation('/login');
    },
  });

  // Estado para filtros
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Construir filtros para la consulta
  const filters = useMemo<AggregatedSalesFilters | undefined>(() => {
    const hasFilters = dateFrom || dateTo || selectedBranch !== "all" || selectedCategory !== "all";
    
    if (!hasFilters) {
      return undefined; // Usar valores por defecto del hook
    }

    // Construir objeto de filtros solo con valores definidos
    const result: AggregatedSalesFilters = {};
    
    if (dateFrom) {
      result.fecha_min = dateFrom.toISOString();
    }
    
    if (dateTo) {
      result.fecha_max = dateTo.toISOString();
    }
    
    if (selectedBranch !== "all") {
      result.branch_id = selectedBranch;
    }
    
    if (selectedCategory !== "all") {
      result.category_id = selectedCategory;
    }

    return result;
  }, [dateFrom, dateTo, selectedBranch, selectedCategory]);

  // Obtener datos agregados con filtros
  const { data, metadata, metrics, isLoading, error } = useAggregatedSales(filters);

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleClearFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
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
    if (dateFrom && dateTo) {
      return `${dateFrom.toLocaleDateString('es-PE')} - ${dateTo.toLocaleDateString('es-PE')}`;
    } else if (dateFrom) {
      return `Desde ${dateFrom.toLocaleDateString('es-PE')}`;
    } else if (dateTo) {
      return `Hasta ${dateTo.toLocaleDateString('es-PE')}`;
    }
    return "Enero 2026 (por defecto)";
  }, [dateFrom, dateTo]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 space-y-8">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col space-y-4 w-full">
            <img 
              src={effectiveTheme === "dark" ? "/Logoblanco.svg" : "/Logonegro.svg"} 
              alt="Flora & Fauna" 
              className="h-4 w-auto self-start" 
            />
            <div className="flex flex-col space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Dashboard de Ventas</h1>
            <p className="text-muted-foreground">
              Ventas agregadas por hora, fecha, tienda y categoría abuelo
            </p>
            {metadata && (
              <p className="text-xs text-muted-foreground">
                Actualizado: {new Date(metadata.generated_at).toLocaleString('es-PE')} | 
                Total registros: {formatNumber(metadata.total_rows)}
              </p>
            )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md">
              <span className="font-medium">{user?.username}</span>
              <span className="text-xs opacity-70 capitalize">({user?.role})</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar Sesión
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <DashboardFilters
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
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
            <div className="grid gap-4 md:grid-cols-1">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Ventas Totales</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(metrics.totalSales)}</div>
                  <p className="text-xs text-muted-foreground">{dateRangeText}</p>
                </CardContent>
              </Card>
            </div>

            {/* Gráficos de visualización */}
            <div className="space-y-6">
              {/* Gráfico de línea: Progresión de ventas */}
              <SalesLineChart data={data} />

              {/* Gráficos de distribución */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Gráfico de tarta: Distribución por categoría */}
                <CategoryPieChart data={data} />

                {/* Gráfico de barras: Comparación por sucursal */}
                <BranchBarChart data={data} />
              </div>
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
                  <p><span className="font-medium">Agrupación:</span> Por hora, sucursal y categoría abuelo</p>
                  <p className="text-xs text-muted-foreground mt-4">
                    Los datos se agregan desde la base de datos PostgreSQL usando una consulta optimizada
                    que agrupa ventas por hora, fecha, tienda y categoría abuelo. No se muestran detalles
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
