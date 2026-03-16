import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { NavigationMenu } from "@/components/NavigationMenu";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogOut, DollarSign, ShoppingCart, TrendingUp, Filter, Calendar, Moon, Sun, Users, Lock } from "lucide-react";
import { useHourlySales, type HourlySalesFilters } from "@/hooks/useHourlySales";
import { HourlyLineChart } from "@/components/HourlyLineChart";
import { KPICard } from "@/components/KPICard";
import { useState, useMemo, useEffect } from "react";
import { useFilters } from "@/contexts/FiltersContext";
import { ReportDiscrepancyButton } from "@/components/ReportDiscrepancyButton";
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
  const { effectiveTheme, toggleTheme } = useTheme();
  const [, setLocation] = useLocation();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      setLocation('/login');
    },
  });

  // Usar filtros del contexto global
  const { dateRange: globalDateRange, setDateRange: setGlobalDateRange, branchId: globalBranchId, setBranchId: setGlobalBranchId } = useFilters();
  
  // Estados de filtros - Por defecto: día de ayer
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (globalDateRange) return globalDateRange;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);
    
    return { from: yesterday, to: yesterdayEnd };
  });
  const userRole = user?.role as string | undefined;
  const isStoreUser = userRole === 'store_user';
  const assignedStoreCode = (user as any)?.assignedStoreCode as string | null | undefined;

  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (globalBranchId) return globalBranchId;
    return "all";
  });

  // Inicializar filtro de tienda para store_user
  useEffect(() => {
    if (isStoreUser && assignedStoreCode) {
      setSelectedBranch(assignedStoreCode);
    }
  }, [isStoreUser, assignedStoreCode]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["Presencial", "eCommerce", "Rappi"]);

  // Sincronizar con contexto global
  useEffect(() => {
    setGlobalDateRange(dateRange);
  }, [dateRange, setGlobalDateRange]);

  useEffect(() => {
    setGlobalBranchId(selectedBranch === "all" ? undefined : selectedBranch);
  }, [selectedBranch, setGlobalBranchId]);

  // Construir filtros para el hook
  const filters = useMemo<HourlySalesFilters>(() => {
    const result: HourlySalesFilters = {};
    
    if (dateRange?.from) {
      // Usar formato YYYY-MM-DD local para evitar desfase UTC/Lima
      const d = dateRange.from;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      result.fecha_min = `${y}-${m}-${day}`;
    }
    
    if (dateRange?.to) {
      // Usar formato YYYY-MM-DD local para evitar desfase UTC/Lima
      const d = dateRange.to;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      result.fecha_max = `${y}-${m}-${day}`;
    }
    
    if (selectedBranch !== "all") {
      result.branch_id = selectedBranch;
    }

    return result;
  }, [dateRange, selectedBranch]);

  // Obtener datos agregados con filtros
  const { data, metadata, metrics, isLoading, error } = useHourlySales(filters);

  // Obtener comparación con período anterior
  const comparisonQuery = trpc.sales.getHourlyComparison.useQuery(
    {
      fecha_min: filters.fecha_min || '',
      fecha_max: filters.fecha_max || '',
      branch_id: filters.branch_id,
      sales_channel: selectedChannels.length === 1 ? selectedChannels[0] : undefined,
    },
    {
      enabled: !!filters.fecha_min && !!filters.fecha_max,
    }
  );

  // Filtrar datos por canal de ventas en el frontend
  const filteredData = useMemo(() => {
    if (!data || selectedChannels.length === 3) {
      return data; // Si todos los canales están seleccionados, no filtrar
    }
    return data.filter(row => selectedChannels.includes(row.sales_channel));
  }, [data, selectedChannels]);

  // Recalcular métricas con datos filtrados
  const filteredMetrics = useMemo(() => {
    if (!filteredData) {
      return metrics;
    }
    const totalSales = filteredData.reduce((sum, row) => sum + parseFloat(row.sales_amount || '0'), 0);
    const totalTickets = filteredData.reduce((sum, row) => sum + parseInt(row.tickets_count || '0'), 0);
    const avgTicket = totalTickets > 0 ? totalSales / totalTickets : 0;
    
    // Calcular cantidad de días únicos en el rango
    // Importante: Extraer fecha local (UTC-5) para evitar contar días adicionales por diferencia horaria
    const uniqueDates = new Set(filteredData.map(row => {
      const date = typeof row.hour_ts === 'string' ? new Date(row.hour_ts) : row.hour_ts;
      // Ajustar a UTC-5 (zona horaria de Colombia/Perú)
      const localDate = new Date(date.getTime() - (5 * 60 * 60 * 1000));
      // Extraer solo la fecha en formato YYYY-MM-DD
      const dateStr = localDate.toISOString().split('T')[0];
      return dateStr;
    }));
    const daysCount = uniqueDates.size;
    const avgSalesPerDay = daysCount > 0 ? totalSales / daysCount : 0;
    
    return {
      ...metrics,
      totalSales,
      totalTickets,
      avgTicket,
      avgSalesPerDay,
      daysCount,
    };
  }, [filteredData, metrics]);

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
  };

  const handleClearFilters = () => {
    setDateRange(undefined);
    setSelectedBranch("all");
    setSelectedChannels(["Presencial", "eCommerce", "Rappi"]);
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
  const logoSrc = effectiveTheme === "dark" ? "/Logoclarochico.svg" : "/Logonegro.svg";

  return (
    <div className="min-h-screen bg-background">
      <NavigationMenu />
      <div className="container py-8 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight uppercase" style={{ fontFamily: 'Italian Plate No 1, serif' }}>ANÁLISIS POR HORAS</h1>
          <p className="text-muted-foreground">
            Ventas y transacciones agregadas por hora del día
          </p>
          {metadata && (
            <p className="text-xs text-muted-foreground">
              Actualizado: {new Date(metadata.generated_at).toLocaleString('es-PE')} | Total registros: {formatNumber(metadata.total_rows)}
            </p>
          )}
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
              <div className="grid gap-4 md:grid-cols-4">
                {/* DateRangePicker unificado */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Rango de Fechas</label>
                  <DatePickerWithRange
                    date={dateRange}
                    onDateChange={setDateRange}
                  />
                </div>

                {/* Selector de Sucursal — bloqueado para store_user */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Sucursal
                    {isStoreUser && <Lock className="inline ml-1 h-3 w-3 text-muted-foreground" />}
                  </label>
                  {isStoreUser ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/50 text-sm text-muted-foreground">
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                      <span>{metrics.branches.find(b => b.sap_id === assignedStoreCode)?.name ?? assignedStoreCode ?? 'Tu tienda'}</span>
                    </div>
                  ) : (
                    <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todas las sucursales" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las sucursales</SelectItem>
                        {metrics.branches
                          .sort((a, b) => {
                            const sapIdA = parseInt(a.sap_id.replace(/\D/g, ''), 10) || 0;
                            const sapIdB = parseInt(b.sap_id.replace(/\D/g, ''), 10) || 0;
                            return sapIdA - sapIdB;
                          })
                          .map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                              {branch.name} ({branch.sap_id})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Selector de Canal de Ventas */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Canal de Ventas</label>
                  <Select 
                    value={selectedChannels.length === 3 ? "all" : selectedChannels[0] || "all"}
                    onValueChange={(value) => {
                      if (value === "all") {
                        setSelectedChannels(["Presencial", "eCommerce", "Rappi"]);
                      } else {
                        setSelectedChannels([value]);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos los canales" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los canales</SelectItem>
                      <SelectItem value="Presencial">Presencial</SelectItem>
                      <SelectItem value="eCommerce">eCommerce</SelectItem>
                      <SelectItem value="Rappi">Rappi</SelectItem>
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <KPICard
                title="Ventas Totales"
                value={filteredMetrics.totalSales}
                previousValue={comparisonQuery.data?.previous.total_sales}
                format="currency"
                icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
                showComparison={!!comparisonQuery.data}
              />

              <KPICard
                title="Total Transacciones"
                value={filteredMetrics.totalTickets}
                previousValue={comparisonQuery.data?.previous.total_tickets}
                format="number"
                icon={<ShoppingCart className="h-4 w-4 text-muted-foreground" />}
                showComparison={!!comparisonQuery.data}
              />

              <KPICard
                title="Ticket Promedio"
                value={filteredMetrics.avgTicket}
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
                value={(filteredMetrics as any).avgSalesPerDay || 0}
                previousValue={
                  comparisonQuery.data && (filteredMetrics as any).daysCount > 0
                    ? comparisonQuery.data.previous.total_sales / (filteredMetrics as any).daysCount
                    : undefined
                }
                format="currency"
                icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
                showComparison={!!comparisonQuery.data}
              />
            </div>

            {/* Gráfico de línea: Ventas y Transacciones por Hora */}
            <HourlyLineChart data={filteredData} />
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

      {/* Floating button to report discrepancies */}
      <ReportDiscrepancyButton
        variant="fab"
        context={{
          module: "hourly-analysis",
          dateFrom: filters.fecha_min,
          dateTo: filters.fecha_max,
          storeId: selectedBranch !== "all" ? selectedBranch : undefined,
          storeName:
            selectedBranch !== "all"
              ? metrics.branches?.find((b: any) => b.id === selectedBranch)?.name
              : undefined,
        }}
      />
    </div>
  );
}
