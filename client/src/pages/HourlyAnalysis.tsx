import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { NavigationMenu } from "@/components/NavigationMenu";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogOut, DollarSign, ShoppingCart, TrendingUp, Calendar, Moon, Sun, Users, Lock, X } from "lucide-react";
import { useHourlySales, type HourlySalesFilters } from "@/hooks/useHourlySales";
import { HourlyLineChart } from "@/components/HourlyLineChart";
import { KPICard } from "@/components/KPICard";
import { useState, useMemo, useEffect } from "react";
import { useFilters } from "@/contexts/FiltersContext";
import { ReportDiscrepancyButton } from "@/components/ReportDiscrepancyButton";
import { IgvToggle } from "@/components/IgvToggle";
import { useIgv } from "@/contexts/IgvContext";
import { KPIGridSkeleton, SalesLineChartSkeleton } from "@/components/SalesSkeletons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import type { DateRange } from "react-day-picker";
import { HeatmapChart } from "@/components/HeatmapChart";
import { inclusiveCalendarDays } from "@shared/analytics";

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
  const { includeIgv } = useIgv();

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

    result.include_igv = includeIgv;

    return result;
  }, [dateRange, selectedBranch, includeIgv]);

  // Obtener datos agregados con filtros
  const { data, metadata, metrics, isLoading, error } = useHourlySales(filters);

  // Obtener comparación con período anterior
  const comparisonQuery = trpc.sales.getHourlyComparison.useQuery(
    {
      fecha_min: filters.fecha_min || '',
      fecha_max: filters.fecha_max || '',
      branch_id: filters.branch_id,
      sales_channels: selectedChannels.length === 3
        ? undefined
        : selectedChannels as ("Presencial" | "eCommerce" | "Rappi")[],
      include_igv: includeIgv,
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
    
    // El promedio se calcula sobre todos los días solicitados —incluso sin ventas—
    // para que el valor actual y el período de comparación sean equivalentes.
    const daysCount = filters.fecha_min && filters.fecha_max
      ? inclusiveCalendarDays(filters.fecha_min, filters.fecha_max)
      : 1;
    const avgSalesPerDay = daysCount > 0 ? totalSales / daysCount : 0;
    
    return {
      ...metrics,
      totalSales,
      totalTickets,
      avgTicket,
      avgSalesPerDay,
      daysCount,
    };
  }, [filteredData, metrics, filters.fecha_min, filters.fecha_max]);

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
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Italian Plate No 1, serif' }}>Análisis por horas</h1>
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
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-heading uppercase text-base tracking-wide">
                    Filtros
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Selecciona rango de fechas y sucursal para explorar los datos
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <IgvToggle />
                  <Button variant="outline" size="sm" onClick={handleClearFilters}>
                    <X className="mr-2 h-4 w-4" />
                    Limpiar Filtros
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                {/* Fecha Inicio */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fecha Inicio</label>
                  <DatePicker
                    date={dateRange?.from}
                    onDateChange={(from) => setDateRange({ from, to: dateRange?.to })}
                    placeholder="Fecha inicio"
                    maxDate={dateRange?.to ?? new Date()}
                  />
                </div>

                {/* Fecha Fin */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fecha Fin</label>
                  <DatePicker
                    date={dateRange?.to}
                    onDateChange={(to) => setDateRange({ from: dateRange?.from, to })}
                    placeholder="Fecha fin"
                    minDate={dateRange?.from}
                    maxDate={new Date()}
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
                        <SelectItem value="all"><span>Todas las sucursales</span></SelectItem>
                        {metrics.branches
                          .sort((a, b) => {
                            const sapIdA = parseInt(a.sap_id.replace(/\D/g, ''), 10) || 0;
                            const sapIdB = parseInt(b.sap_id.replace(/\D/g, ''), 10) || 0;
                            return sapIdA - sapIdB;
                          })
                          .map((branch) => (
                            <SelectItem key={branch.id} value={branch.sap_id}><span>
                              {branch.name} ({branch.sap_id})
                            </span></SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Selector de Canal de Ventas — multi-selección */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Canal de Ventas</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between font-normal h-9 px-3"
                      >
                        <span className="truncate text-sm">
                          {selectedChannels.length === 0
                            ? "Sin canales"
                            : selectedChannels.length === 3
                            ? "Todos los canales"
                            : selectedChannels.join(", ")}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {selectedChannels.length > 0 && selectedChannels.length < 3 && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                              {selectedChannels.length}
                            </Badge>
                          )}
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </div>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-2" align="start">
                      <div className="space-y-1">
                        {/* Opción: Todos */}
                        <div
                          className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent"
                          onClick={() => setSelectedChannels(["Presencial", "eCommerce", "Rappi"])}
                        >
                          <Checkbox
                            checked={selectedChannels.length === 3}
                            onCheckedChange={() => setSelectedChannels(["Presencial", "eCommerce", "Rappi"])}
                          />
                          <span className="text-sm">Todos los canales</span>
                        </div>
                        <div className="border-t my-1" />
                        {(["Presencial", "eCommerce", "Rappi"] as const).map((channel) => (
                          <div
                            key={channel}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent"
                            onClick={() => {
                              setSelectedChannels(prev =>
                                prev.includes(channel)
                                  ? prev.filter(c => c !== channel)
                                  : [...prev, channel]
                              );
                            }}
                          >
                            <Checkbox
                              checked={selectedChannels.includes(channel)}
                              onCheckedChange={() => {
                                setSelectedChannels(prev =>
                                  prev.includes(channel)
                                    ? prev.filter(c => c !== channel)
                                    : [...prev, channel]
                                );
                              }}
                            />
                            <span className="text-sm">{channel}</span>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
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

            {/* Mapa de calor: Actividad por Día de Semana × Hora */}
            <HeatmapChart
              fechaMin={filters.fecha_min || ''}
              fechaMax={filters.fecha_max || ''}
              branchId={selectedBranch !== 'all' ? selectedBranch : undefined}
              includeIgv={includeIgv}
            />

            {/* Gráfico de línea: Ventas y Transacciones por Hora */}
            <HourlyLineChart data={filteredData} />
          </>
        )}

        {/* Loading state — skeletons que reflejan la forma real de cada sección */}
        {isLoading && (
          <div className="space-y-6">
            <KPIGridSkeleton count={4} />
            <SalesLineChartSkeleton />
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
          moduleLabel: "Análisis por Horas",
          dateFrom: filters.fecha_min,
          dateTo: filters.fecha_max,
          storeId: selectedBranch !== "all" ? selectedBranch : undefined,
          storeName:
            selectedBranch !== "all"
              ? metrics.branches?.find((b: any) => b.sap_id === selectedBranch)?.name
              : "Todas las tiendas",
          dashboardAmount: !isLoading && filteredMetrics.totalSales > 0 ? Math.round(filteredMetrics.totalSales) : undefined,
          relatedSaleAmount: !isLoading && filteredMetrics.totalSales > 0 ? Math.round(filteredMetrics.totalSales) : undefined,
        }}
      />
    </div>
  );
}
