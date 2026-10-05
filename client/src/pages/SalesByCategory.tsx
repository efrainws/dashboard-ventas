import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { NavigationMenu } from "@/components/NavigationMenu";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, DollarSign, ShoppingCart, Calendar, BarChart2 } from "lucide-react";
import { useAggregatedSales, type AggregatedSalesFilters } from "@/hooks/useAggregatedSales";
import { DashboardFilters } from "@/components/DashboardFilters";
import { SalesLineChart } from "@/components/SalesLineChart";
import { CategoryPieChart } from "@/components/CategoryPieChart";
import { BranchBarChart } from "@/components/BranchBarChart";
import { KPICard } from "@/components/KPICard";
import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { ReportDiscrepancyButton } from "@/components/ReportDiscrepancyButton";
import { ChannelBreakdown } from "@/components/ChannelBreakdown";
import { useTemporalUrlState } from "@/hooks/useTemporalUrlState";
import { ComparisonPeriodControls } from "@/components/ComparisonPeriodControls";
import { inclusiveCalendarDays } from "@shared/analytics";
import {
  KPIGridSkeleton,
  SalesLineChartSkeleton,
  BranchBarChartSkeleton,
  CategoryPieChartSkeleton,
} from "@/components/SalesSkeletons";

const ALL_CHANNELS = ["Presencial", "eCommerce", "Rappi"];

interface AppliedSalesControls {
  branch: string;
  category: string;
  channels: string[];
  includeIgv: boolean;
}

function dateToIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoToDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function controlsFromSearch(search: string): AppliedSalesControls {
  const params = new URLSearchParams(search);
  const channels = (params.get("channels") ?? "").split(",").filter(channel => ALL_CHANNELS.includes(channel));
  return {
    branch: params.get("branch_id") ?? "all",
    category: params.get("category_id") ?? "all",
    channels: channels.length ? channels : ALL_CHANNELS,
    includeIgv: params.get("include_igv") !== "false",
  };
}

export default function SalesByCategory() {
  const { user, loading: authLoading } = useAuth();
  const { effectiveTheme, toggleTheme } = useTheme();
  const [, setLocation] = useLocation();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      setLocation('/login');
    },
  });

  const temporal = useTemporalUrlState("P01");
  const [draftControls, setDraftControls] = useState<AppliedSalesControls>(() => controlsFromSearch(window.location.search));
  const [appliedControls, setAppliedControls] = useState<AppliedSalesControls>(() => controlsFromSearch(window.location.search));
  const dateRange = useMemo<DateRange>(() => ({
    from: isoToDate(temporal.draft.primary.start),
    to: isoToDate(temporal.draft.primary.end),
  }), [temporal.draft.primary]);
  const appliedDateRange = useMemo(() => temporal.applied.primary, [temporal.applied.primary]);
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
    const next = controlsFromSearch(window.location.search);
    if (isStoreUser && assignedStoreCode) next.branch = assignedStoreCode;
    setDraftControls(next);
    setAppliedControls(next);
  }, [temporal.applied.primary.start, temporal.applied.primary.end, isStoreUser, assignedStoreCode]);

  // Calcular días del mes para la proyección mensual
  const daysInMonth = useMemo(() => {
    const refDate = isoToDate(appliedDateRange.end);
    return new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
  }, [appliedDateRange.end]);

  // Construir filtros para la consulta
  const filters = useMemo<AggregatedSalesFilters>(() => {
    const result: AggregatedSalesFilters = {
      fecha_min: appliedDateRange.start,
      fecha_max: appliedDateRange.end,
      include_igv: appliedControls.includeIgv,
    };
    if (appliedControls.branch !== "all") result.branch_id = appliedControls.branch;
    if (appliedControls.category !== "all") result.category_id = appliedControls.category;
    return result;
  }, [appliedDateRange, appliedControls]);

  const comparisonFilters = useMemo<AggregatedSalesFilters>(() => ({
    fecha_min: temporal.applied.comparison?.start ?? appliedDateRange.start,
    fecha_max: temporal.applied.comparison?.end ?? appliedDateRange.end,
    ...(appliedControls.branch !== "all" ? { branch_id: appliedControls.branch } : {}),
    ...(appliedControls.category !== "all" ? { category_id: appliedControls.category } : {}),
    include_igv: appliedControls.includeIgv,
  }), [temporal.applied.comparison, appliedDateRange, appliedControls]);

  // Obtener datos agregados con filtros
  const { data: rawData, metadata, metrics, isLoading, error } = useAggregatedSales(filters);
  const { data: comparisonRawData, isLoading: comparisonDataLoading } = useAggregatedSales(comparisonFilters);

  // Filtrar por canal en el frontend (igual que HourlyAnalysis)
  const data = useMemo(() => {
    if (!rawData || appliedControls.channels.length === 3) return rawData;
    return rawData.filter((row: any) => appliedControls.channels.includes(row.sales_channel));
  }, [rawData, appliedControls.channels]);

  const comparisonData = useMemo(() => {
    if (appliedControls.channels.length === 3) return comparisonRawData;
    return comparisonRawData.filter((row: any) => appliedControls.channels.includes(row.sales_channel));
  }, [comparisonRawData, appliedControls.channels]);

  // Recalcular métricas con datos filtrados por canal
  const filteredMetrics = useMemo(() => {
    if (!data || appliedControls.channels.length === 3) return metrics;
    const totalSales = data.reduce((sum: number, row: any) => sum + parseFloat(row.sales_amount || '0'), 0);
    const uniqueSaleIds = new Set<string>();
    data.forEach((row: any) => {
      if (row.sale_ids && Array.isArray(row.sale_ids)) {
        row.sale_ids.forEach((id: string) => uniqueSaleIds.add(id));
      }
    });
    const totalTickets = uniqueSaleIds.size;
    return { ...metrics, totalSales, totalTickets };
  }, [data, metrics, appliedControls.channels]);

  const comparisonQuery = trpc.sales.getAggregatedComparison.useQuery({
    fecha_min: appliedDateRange.start,
    fecha_max: appliedDateRange.end,
    comparison_fecha_min: temporal.applied.comparison?.start,
    comparison_fecha_max: temporal.applied.comparison?.end,
    branch_id: filters.branch_id,
    category_id: filters.category_id,
    sales_channels: appliedControls.channels.length === ALL_CHANNELS.length
      ? undefined
      : appliedControls.channels as ("Presencial" | "eCommerce" | "Rappi")[],
    include_igv: appliedControls.includeIgv,
  });

  // Calcular número de días en el rango
  const numberOfDays = useMemo(() => {
    return inclusiveCalendarDays(appliedDateRange.start, appliedDateRange.end);
  }, [appliedDateRange]);

  // Obtener comparación por sucursal
  const branchComparisonQuery = trpc.sales.getBranchComparison.useQuery({
    fecha_min: appliedDateRange.start,
    fecha_max: appliedDateRange.end,
    comparison_fecha_min: temporal.applied.comparison?.start,
    comparison_fecha_max: temporal.applied.comparison?.end,
    branch_id: filters.branch_id,
    category_id: filters.category_id,
    include_igv: appliedControls.includeIgv,
  });

  // Obtener comparación por categoría
  const categoryComparisonQuery = trpc.sales.getCategoryComparison.useQuery({
    fecha_min: appliedDateRange.start,
    fecha_max: appliedDateRange.end,
    comparison_fecha_min: temporal.applied.comparison?.start,
    comparison_fecha_max: temporal.applied.comparison?.end,
    branch_id: filters.branch_id,
    include_igv: appliedControls.includeIgv,
  });

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
  };

  const applyFilters = () => {
    const params = new URLSearchParams(window.location.search);
    ["branch_id", "category_id", "channels", "include_igv"].forEach(key => params.delete(key));
    if (draftControls.branch !== "all") params.set("branch_id", draftControls.branch);
    if (draftControls.category !== "all") params.set("category_id", draftControls.category);
    if (draftControls.channels.length !== ALL_CHANNELS.length) params.set("channels", draftControls.channels.join(","));
    if (!draftControls.includeIgv) params.set("include_igv", "false");
    temporal.apply(params);
    setAppliedControls(draftControls);
  };

  const handleClearFilters = () => {
    const nextTemporal = temporal.reset();
    const nextControls: AppliedSalesControls = {
      branch: isStoreUser && assignedStoreCode ? assignedStoreCode : "all",
      category: "all",
      channels: ALL_CHANNELS,
      includeIgv: true,
    };
    const params = new URLSearchParams(window.location.search);
    ["branch_id", "category_id", "channels", "include_igv"].forEach(key => params.delete(key));
    if (nextControls.branch !== "all") params.set("branch_id", nextControls.branch);
    temporal.applyState(nextTemporal, params);
    setDraftControls(nextControls);
    setAppliedControls(nextControls);
  };

  const setDraftDateRange = (range: DateRange | undefined) => {
    if (!range?.from || !range.to) return;
    temporal.setDraft(current => ({
      ...current,
      primary: { start: dateToIso(range.from!), end: dateToIso(range.to!) },
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
    const from = isoToDate(appliedDateRange.start);
    const to = isoToDate(appliedDateRange.end);
    return `${from.toLocaleDateString('es-PE')} - ${to.toLocaleDateString('es-PE')}`;
  }, [appliedDateRange]);

  // Logo según tema
  const logoSrc = effectiveTheme === "dark" ? "/Logoclarochico.svg" : "/Logonegro.svg";

  return (
    <div className="min-h-screen bg-background">
      <NavigationMenu />
      <div className="container py-8 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Italian Plate No 1, serif' }}>Análisis general</h1>
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
          onDateRangeChange={setDraftDateRange}
          selectedBranch={draftControls.branch}
          branches={metrics.branches}
          onBranchChange={isStoreUser ? () => {} : branch => setDraftControls(current => ({ ...current, branch }))}
          branchLocked={isStoreUser}
          selectedCategory={draftControls.category}
          categories={metrics.categories}
          onCategoryChange={category => setDraftControls(current => ({ ...current, category }))}
          selectedChannels={draftControls.channels}
          onChannelsChange={channels => setDraftControls(current => ({ ...current, channels }))}
          onClearFilters={handleClearFilters}
          showIgvToggle
          includeIgv={draftControls.includeIgv}
          onIncludeIgvChange={includeIgv => setDraftControls(current => ({ ...current, includeIgv }))}
          comparisonControls={
            <ComparisonPeriodControls
              value={temporal.draft}
              onChange={temporal.setDraft}
              error={temporal.issue}
            />
          }
          onApplyFilters={applyFilters}
          hasPendingChanges={hasPendingChanges}
        />

        {/* Estado de carga — skeletons que reflejan la forma real de cada sección */}
        {isLoading && (
          <div className="space-y-6">
            <KPIGridSkeleton count={5} />
            <SalesLineChartSkeleton />
            <BranchBarChartSkeleton />
            <CategoryPieChartSkeleton />
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
                value={filteredMetrics.totalTickets || 0}
                previousValue={comparisonQuery.data?.previous.total_tickets}
                format="number"
                icon={<ShoppingCart className="h-4 w-4 text-muted-foreground" />}
                showComparison={!!comparisonQuery.data}
              />

              <KPICard
                title="Ticket Promedio"
                value={(filteredMetrics.totalTickets || 0) > 0 ? filteredMetrics.totalSales / (filteredMetrics.totalTickets || 1) : 0}
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
                value={numberOfDays > 0 ? filteredMetrics.totalSales / numberOfDays : 0}
                previousValue={
                  comparisonQuery.data && numberOfDays > 0
                    ? comparisonQuery.data.previous.total_sales / numberOfDays
                    : undefined
                }
                format="currency"
                icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
                showComparison={!!comparisonQuery.data}
              />

              <KPICard
                title="Proyección Mensual"
                value={numberOfDays > 0 ? (filteredMetrics.totalSales / numberOfDays) * daysInMonth : 0}
                format="currency"
                icon={<BarChart2 className="h-4 w-4 text-muted-foreground" />}
                showComparison={false}
              />
            </div>

            {/* Gráficos de visualización */}
            <div className="space-y-6">
              {/* Gráfico de línea: Progresión de ventas */}
              <SalesLineChart
                data={data}
                comparisonData={comparisonData}
                description={`Ventas principales frente al período comparativo · ${temporal.applied.comparison?.start} a ${temporal.applied.comparison?.end}`}
              />

              {/* Gráfico de barras: Comparación por sucursal (ancho completo) */}
              {branchComparisonQuery.isLoading ? (
                <BranchBarChartSkeleton />
              ) : (
                <BranchBarChart 
                  data={data} 
                  comparisonData={branchComparisonQuery.data?.data}
                  analysisDays={numberOfDays}
                  daysInMonth={daysInMonth}
                />
              )}

              {/* Gráfico de tarta: Distribución por categoría */}
              {categoryComparisonQuery.isLoading ? (
                <CategoryPieChartSkeleton />
              ) : (
                <CategoryPieChart 
                  data={data}
                  comparisonData={categoryComparisonQuery.data?.data}
                />
              )}
            </div>

            {/* Análisis por Canal */}
            <ChannelBreakdown
              data={data}
              comparisonData={comparisonData}
              numberOfDays={numberOfDays}
              daysInMonth={daysInMonth}
              isLoading={isLoading || comparisonDataLoading}
            />

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
                    appliedControls.branch === "all"
                      ? "Todas las sucursales" 
                      : metrics.branches.find(b => b.sap_id === appliedControls.branch)?.name || "Desconocida"
                  }</p>
                  <p><span className="font-medium">Categoría:</span> {
                    appliedControls.category === "all"
                      ? "Todas las categorías" 
                      : metrics.categories.find(c => c.id === appliedControls.category)?.name || "Desconocida"
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

      {/* Floating button to report discrepancies */}
      <ReportDiscrepancyButton
        variant="fab"
        context={{
          module: "sales-by-category",
          moduleLabel: "Análisis General",
          dateFrom: filters?.fecha_min,
          dateTo: filters?.fecha_max,
          storeId: appliedControls.branch !== "all" ? appliedControls.branch : undefined,
          storeName:
            appliedControls.branch !== "all"
              ? (metrics.branches.find((b: any) => b.sap_id === appliedControls.branch)?.name ?? appliedControls.branch)
              : "Todas las tiendas",
          dashboardAmount: !isLoading && filteredMetrics.totalSales > 0 ? Math.round(filteredMetrics.totalSales) : undefined,
          relatedSaleAmount: !isLoading && filteredMetrics.totalSales > 0 ? Math.round(filteredMetrics.totalSales) : undefined,
        }}
      />
    </div>
  );
}
