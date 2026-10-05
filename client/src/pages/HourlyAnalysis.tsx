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
import { ReportDiscrepancyButton } from "@/components/ReportDiscrepancyButton";
import { IgvToggle } from "@/components/IgvToggle";
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
import { useTemporalUrlState } from "@/hooks/useTemporalUrlState";
import { ComparisonPeriodControls } from "@/components/ComparisonPeriodControls";
import { AppliedFilterActions } from "@/components/AppliedFilterActions";

const HOURLY_CHANNELS = ["Presencial", "eCommerce", "Rappi"];

interface HourlyControls {
  branch: string;
  channels: string[];
  includeIgv: boolean;
}

function hourlyControlsFromSearch(search: string): HourlyControls {
  const params = new URLSearchParams(search);
  const channels = (params.get("channels") ?? "").split(",").filter(channel => HOURLY_CHANNELS.includes(channel));
  return {
    branch: params.get("branch_id") ?? "all",
    channels: channels.length ? channels : HOURLY_CHANNELS,
    includeIgv: params.get("include_igv") !== "false",
  };
}

function hourlyIsoToDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function hourlyDateToIso(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export default function HourlyAnalysis() {
  const { user, loading: authLoading } = useAuth();
  const { effectiveTheme, toggleTheme } = useTheme();
  const [, setLocation] = useLocation();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      setLocation('/login');
    },
  });

  const temporal = useTemporalUrlState("P02");
  const [draftControls, setDraftControls] = useState<HourlyControls>(() => hourlyControlsFromSearch(window.location.search));
  const [appliedControls, setAppliedControls] = useState<HourlyControls>(() => hourlyControlsFromSearch(window.location.search));
  const dateRange = useMemo<DateRange>(() => ({
    from: hourlyIsoToDate(temporal.draft.primary.start),
    to: hourlyIsoToDate(temporal.draft.primary.end),
  }), [temporal.draft.primary]);
  const userRole = user?.role as string | undefined;
  const isStoreUser = userRole === 'store_user';
  const assignedStoreCode = (user as any)?.assignedStoreCode as string | null | undefined;

  // Inicializar filtro de tienda para store_user
  useEffect(() => {
    if (isStoreUser && assignedStoreCode) {
      setDraftControls(current => ({ ...current, branch: assignedStoreCode }));
      setAppliedControls(current => ({ ...current, branch: assignedStoreCode }));
    }
  }, [isStoreUser, assignedStoreCode]);

  useEffect(() => {
    const next = hourlyControlsFromSearch(window.location.search);
    if (isStoreUser && assignedStoreCode) next.branch = assignedStoreCode;
    setDraftControls(next);
    setAppliedControls(next);
  }, [temporal.applied.primary.start, temporal.applied.primary.end, isStoreUser, assignedStoreCode]);

  const filters = useMemo<HourlySalesFilters>(() => {
    const result: HourlySalesFilters = {
      fecha_min: temporal.applied.primary.start,
      fecha_max: temporal.applied.primary.end,
      include_igv: appliedControls.includeIgv,
    };
    if (appliedControls.branch !== "all") result.branch_id = appliedControls.branch;

    return result;
  }, [temporal.applied.primary, appliedControls]);

  // Obtener datos agregados con filtros
  const { data, metadata, metrics, isLoading, error } = useHourlySales(filters);

  // Obtener comparación con período anterior
  const comparisonQuery = trpc.sales.getHourlyComparison.useQuery(
    {
      fecha_min: filters.fecha_min || '',
      fecha_max: filters.fecha_max || '',
      comparison_fecha_min: temporal.applied.comparison?.start,
      comparison_fecha_max: temporal.applied.comparison?.end,
      branch_id: filters.branch_id,
      sales_channels: appliedControls.channels.length === 3
        ? undefined
        : appliedControls.channels as ("Presencial" | "eCommerce" | "Rappi")[],
      include_igv: appliedControls.includeIgv,
    },
    {
      enabled: !!filters.fecha_min && !!filters.fecha_max,
    }
  );

  // Filtrar datos por canal de ventas en el frontend
  const filteredData = useMemo(() => {
    if (!data || appliedControls.channels.length === 3) {
      return data; // Si todos los canales están seleccionados, no filtrar
    }
    return data.filter(row => appliedControls.channels.includes(row.sales_channel));
  }, [data, appliedControls.channels]);

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

  const applyFilters = () => {
    const params = new URLSearchParams(window.location.search);
    ["branch_id", "channels", "include_igv"].forEach(key => params.delete(key));
    if (draftControls.branch !== "all") params.set("branch_id", draftControls.branch);
    if (draftControls.channels.length !== HOURLY_CHANNELS.length) params.set("channels", draftControls.channels.join(","));
    if (!draftControls.includeIgv) params.set("include_igv", "false");
    temporal.apply(params);
    setAppliedControls(draftControls);
  };

  const handleClearFilters = () => {
    const nextTemporal = temporal.reset();
    const nextControls: HourlyControls = {
      branch: isStoreUser && assignedStoreCode ? assignedStoreCode : "all",
      channels: HOURLY_CHANNELS,
      includeIgv: true,
    };
    const params = new URLSearchParams(window.location.search);
    ["branch_id", "channels", "include_igv"].forEach(key => params.delete(key));
    if (nextControls.branch !== "all") params.set("branch_id", nextControls.branch);
    temporal.applyState(nextTemporal, params);
    setDraftControls(nextControls);
    setAppliedControls(nextControls);
  };

  const setDraftDateRange = (range: DateRange | undefined) => {
    if (!range?.from || !range.to) return;
    temporal.setDraft(current => ({
      ...current,
      primary: { start: hourlyDateToIso(range.from!), end: hourlyDateToIso(range.to!) },
    }));
  };

  const hasPendingChanges = temporal.hasPendingChanges ||
    JSON.stringify(draftControls) !== JSON.stringify(appliedControls);

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
                  <IgvToggle
                    includeIgv={draftControls.includeIgv}
                    onIncludeIgvChange={includeIgv => setDraftControls(current => ({ ...current, includeIgv }))}
                  />
                  <Button variant="outline" size="sm" onClick={handleClearFilters}>
                    <X className="mr-2 h-4 w-4" />
                    Restablecer filtros
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
                    onDateChange={(from) => setDraftDateRange({ from, to: dateRange?.to })}
                    placeholder="Fecha inicio"
                    maxDate={dateRange?.to ?? new Date()}
                  />
                </div>

                {/* Fecha Fin */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fecha Fin</label>
                  <DatePicker
                    date={dateRange?.to}
                    onDateChange={(to) => setDraftDateRange({ from: dateRange?.from, to })}
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
                    <Select value={draftControls.branch} onValueChange={branch => setDraftControls(current => ({ ...current, branch }))}>
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
                          {draftControls.channels.length === 0
                            ? "Sin canales"
                            : draftControls.channels.length === 3
                            ? "Todos los canales"
                            : draftControls.channels.join(", ")}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {draftControls.channels.length > 0 && draftControls.channels.length < 3 && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                              {draftControls.channels.length}
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
                          onClick={() => setDraftControls(current => ({ ...current, channels: HOURLY_CHANNELS }))}
                        >
                          <Checkbox
                            checked={draftControls.channels.length === 3}
                            onCheckedChange={() => setDraftControls(current => ({ ...current, channels: HOURLY_CHANNELS }))}
                          />
                          <span className="text-sm">Todos los canales</span>
                        </div>
                        <div className="border-t my-1" />
                        {(["Presencial", "eCommerce", "Rappi"] as const).map((channel) => (
                          <div
                            key={channel}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent"
                            onClick={() => {
                              setDraftControls(current => ({
                                ...current,
                                channels: current.channels.includes(channel)
                                  ? current.channels.filter(value => value !== channel)
                                  : [...current.channels, channel],
                              }));
                            }}
                          >
                            <Checkbox
                              checked={draftControls.channels.includes(channel)}
                              onCheckedChange={() => {
                                setDraftControls(current => ({
                                  ...current,
                                  channels: current.channels.includes(channel)
                                    ? current.channels.filter(value => value !== channel)
                                    : [...current.channels, channel],
                                }));
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
              <ComparisonPeriodControls
                value={temporal.draft}
                onChange={temporal.setDraft}
                error={temporal.issue}
              />
              <AppliedFilterActions
                onApply={applyFilters}
                onReset={handleClearFilters}
                isPending={hasPendingChanges}
              />
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
              branchId={appliedControls.branch !== 'all' ? appliedControls.branch : undefined}
              includeIgv={appliedControls.includeIgv}
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
          storeId: appliedControls.branch !== "all" ? appliedControls.branch : undefined,
          storeName:
            appliedControls.branch !== "all"
              ? metrics.branches?.find((b: any) => b.sap_id === appliedControls.branch)?.name
              : "Todas las tiendas",
          dashboardAmount: !isLoading && filteredMetrics.totalSales > 0 ? Math.round(filteredMetrics.totalSales) : undefined,
          relatedSaleAmount: !isLoading && filteredMetrics.totalSales > 0 ? Math.round(filteredMetrics.totalSales) : undefined,
        }}
      />
    </div>
  );
}
