import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogOut, DollarSign, ShoppingCart, TrendingUp, Filter, Calendar } from "lucide-react";
import { useHourlySales, type HourlySalesFilters } from "@/hooks/useHourlySales";
import { HourlyLineChart } from "@/components/HourlyLineChart";
import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import type { DateRange } from "react-day-picker";

export default function HourlyAnalysis() {
  const { user, loading: authLoading } = useAuth();
  const { effectiveTheme } = useTheme();
  const logoutMutation = trpc.auth.logout.useMutation();
  const [, setLocation] = useLocation();

  // Estados de filtros
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedBranch, setSelectedBranch] = useState<string>("all");

  // Construir filtros para el hook
  const filters = useMemo<HourlySalesFilters>(() => {
    const result: HourlySalesFilters = {};
    
    if (dateRange?.from) {
      result.fecha_min = new Date(dateRange.from.setHours(0, 0, 0, 0)).toISOString();
    }
    
    if (dateRange?.to) {
      result.fecha_max = new Date(dateRange.to.setHours(23, 59, 59, 999)).toISOString();
    }
    
    if (selectedBranch !== "all") {
      result.branch_id = selectedBranch;
    }

    return result;
  }, [dateRange, selectedBranch]);

  // Obtener datos agregados con filtros
  const { data, metadata, metrics, isLoading, error } = useHourlySales(filters);

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleClearFilters = () => {
    setDateRange(undefined);
    setSelectedBranch("all");
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
      const from = dateRange.from.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
      const to = dateRange.to.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
      return `${from} - ${to}`;
    }
    return "Enero 2026 (por defecto)";
  }, [dateRange]);

  // Logo según tema
  const logoSrc = effectiveTheme === "dark" ? "/Logoblanco.svg" : "/Logonegro.svg";

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <img src={logoSrc} alt="Flora & Fauna" className="h-4 self-start" />
            <div className="flex items-center gap-4">
              <Button variant="default" size="sm" onClick={() => setLocation('/')}>
                Ver Análisis por Categorías
              </Button>
              <span className="text-sm text-muted-foreground">
                {user?.name} ({user?.role})
              </span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar Sesión
              </Button>
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">ANÁLISIS POR HORAS</h1>
            <p className="text-muted-foreground">
              Ventas y transacciones agregadas por hora del día
            </p>
            {metadata && (
              <p className="text-xs text-muted-foreground mt-1">
                Actualizado: {new Date(metadata.generated_at).toLocaleString('es-PE')} | Total registros: {formatNumber(metadata.total_rows)}
              </p>
            )}
          </div>
        </div>

        {/* Filtros */}
        {!isLoading && !error && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filtros
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Selecciona rango de fechas y sucursal para explorar los datos
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {/* DateRangePicker unificado */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Rango de Fechas</label>
                  <DatePickerWithRange
                    date={dateRange}
                    onDateChange={setDateRange}
                  />
                </div>

                {/* Selector de Sucursal */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Sucursal</label>
                  <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todas las sucursales" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las sucursales</SelectItem>
                      {metrics.branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name} ({branch.sap_id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Botón Limpiar Filtros */}
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={handleClearFilters}
                    className="w-full"
                  >
                    Limpiar Filtros
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPIs principales */}
        {!isLoading && !error && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
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

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Transacciones</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(metrics.totalTickets)}</div>
                  <p className="text-xs text-muted-foreground">Tickets únicos</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Ticket Promedio</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(metrics.avgTicket)}</div>
                  <p className="text-xs text-muted-foreground">Por transacción</p>
                </CardContent>
              </Card>
            </div>

            {/* Gráfico de línea: Ventas y Transacciones por Hora */}
            <HourlyLineChart data={data} />
          </>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-lg font-medium">Cargando datos...</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex items-center justify-center h-64 text-destructive">
            <span className="text-lg font-medium">Error al cargar los datos</span>
          </div>
        )}
      </div>
    </div>
  );
}
