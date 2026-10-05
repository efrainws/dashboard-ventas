/**
 * P07 — Análisis por categorías.
 *
 * El período y los filtros aplicados se reconstruyen desde la URL. Los
 * controles editan solamente el borrador; las consultas cambian al aplicar.
 * La única visualización comparativa de esta página es P07-E01.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { NavigationMenu } from "@/components/NavigationMenu";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { SalesEvolutionTable, type Granularity, type EvolutionRow } from "@/components/SalesEvolutionTable";
import { ComparisonPeriodControls } from "@/components/ComparisonPeriodControls";
import { AppliedFilterActions } from "@/components/AppliedFilterActions";
import { useTemporalUrlState } from "@/hooks/useTemporalUrlState";
import {
  isRangeValid,
  previousPeriod,
  temporalRangeToMonths,
  validateExactDaysComparison,
  validateMonthComparison,
  type TemporalRange,
  type TemporalState,
} from "@shared/temporalFilterState";
import { inclusiveCalendarDays } from "@shared/analytics";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Filter,
  TrendingUp,
  BarChart2,
  PieChart as PieChartIcon,
  Table2,
  Lock,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PIE_COLORS = [
  "var(--ff-esmeralda)",
  "var(--ff-cobalto)",
  "var(--ff-celeste)",
  "var(--ff-mostaza)",
  "var(--ff-rosado)",
  "var(--ff-granate)",
  "var(--ff-esmeralda-light)",
  "var(--ff-cobalto-light)",
  "var(--ff-celeste-light)",
  "var(--ff-mostaza-light)",
  "var(--ff-rosado-light)",
  "var(--ff-granate-light)",
  "var(--ff-esmeralda-dark)",
  "var(--ff-cobalto-dark)",
  "var(--ff-celeste-dark)",
];

const CATEGORY_QUERY_KEYS = ["branch_id", "dept_id", "seccion_id", "familia_id", "include_igv"] as const;

interface CategoryControls {
  branch: string;
  dept: string;
  seccion: string;
  familia: string;
  includeIgv: boolean;
}

interface AppliedFilters {
  fecha_min: string;
  fecha_max: string;
  branch_id?: string;
  dept_id?: string;
  seccion_id?: string;
  familia_id?: string;
  include_igv: boolean;
}

interface CategoryLinePoint {
  period: string;
  comparisonPeriod?: string;
  label: string;
  amount: number;
  quantity: number;
  amountComparison?: number;
  quantityComparison?: number;
}

const fmtCurrency = (value: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const fmtQty = (value: number) => value.toLocaleString("es-PE", { maximumFractionDigits: 0 });

function dateToIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoToDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function shiftIso(value: string, days: number): string {
  const date = isoToDate(value);
  date.setDate(date.getDate() + days);
  return dateToIso(date);
}

function formatPeriodLabel(key: string, granularity: Granularity): string {
  const isoDate = String(key).slice(0, 10);
  const date = isoToDate(isoDate);
  if (Number.isNaN(date.getTime())) return key;
  if (granularity === "day") return date.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
  if (granularity === "week") {
    const end = new Date(date);
    end.setDate(end.getDate() + 6);
    return `${date.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })} – ${end.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}`;
  }
  return date.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
}

function controlsFromSearch(search: string): CategoryControls {
  const params = new URLSearchParams(search);
  return {
    branch: params.get("branch_id") ?? "all",
    dept: params.get("dept_id") ?? "all",
    seccion: params.get("seccion_id") ?? "all",
    familia: params.get("familia_id") ?? "all",
    includeIgv: params.get("include_igv") !== "false",
  };
}

function controlsToParams(params: URLSearchParams, controls: CategoryControls): void {
  CATEGORY_QUERY_KEYS.forEach(key => params.delete(key));
  if (controls.branch !== "all") params.set("branch_id", controls.branch);
  if (controls.dept !== "all") params.set("dept_id", controls.dept);
  if (controls.seccion !== "all") params.set("seccion_id", controls.seccion);
  if (controls.familia !== "all") params.set("familia_id", controls.familia);
  if (!controls.includeIgv) params.set("include_igv", "false");
}

function controlsToFilters(range: TemporalRange, controls: CategoryControls): AppliedFilters {
  return {
    fecha_min: range.start,
    fecha_max: range.end,
    ...(controls.branch !== "all" ? { branch_id: controls.branch } : {}),
    ...(controls.dept !== "all" ? { dept_id: controls.dept } : {}),
    ...(controls.seccion !== "all" ? { seccion_id: controls.seccion } : {}),
    ...(controls.familia !== "all" ? { familia_id: controls.familia } : {}),
    include_igv: controls.includeIgv,
  };
}

function normalizedTemporal(state: TemporalState): TemporalState {
  return state.comparisonMode === "previous"
    ? { ...state, comparison: previousPeriod(state.primary) }
    : state;
}

function validateTemporalDraft(state: TemporalState): string | undefined {
  if (!isRangeValid(state.primary)) return "Selecciona un período principal válido.";
  if (state.comparisonMode === "previous") return undefined;
  if (!state.comparison) return "Selecciona nuevamente el periodo comparativo.";

  if (state.comparisonMode === "days") {
    const issue = validateExactDaysComparison(state.primary, state.comparison);
    if (issue) return issue;
    if (state.comparison.start >= state.primary.start) {
      return "La fecha inicial comparativa debe ser anterior a la fecha inicial principal.";
    }
    return undefined;
  }

  const primaryMonths = temporalRangeToMonths(state.primary);
  const comparisonMonths = temporalRangeToMonths(state.comparison);
  if (!primaryMonths || !comparisonMonths) return "Selecciona nuevamente el periodo comparativo.";
  return validateMonthComparison(primaryMonths, comparisonMonths) ?? undefined;
}

/** Conserva el último resultado visible mientras TanStack recupera una nueva clave. */
function useRetainedData<T>(data: T | undefined): T | undefined {
  const last = useRef<T | undefined>(undefined);
  if (data !== undefined) last.current = data;
  return data ?? last.current;
}

function periodMonthDayKey(period: string, periodStart: string): string {
  const date = isoToDate(String(period).slice(0, 10));
  const start = isoToDate(periodStart);
  const monthOffset = (date.getFullYear() - start.getFullYear()) * 12 + date.getMonth() - start.getMonth();
  return `${monthOffset}:${date.getDate()}`;
}

function ComparativeLineTooltip({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; payload?: CategoryLinePoint }>;
  metric: "amount" | "quantity";
}) {
  if (!active || !payload?.length) return null;
  const primaryEntry = payload.find(entry => entry.dataKey === metric);
  const point = primaryEntry?.payload;
  if (!point || primaryEntry?.value === undefined) return null;

  const primary = Number(primaryEntry.value);
  const comparison = point[`${metric}Comparison` as const];
  const formatter = metric === "amount" ? fmtCurrency : fmtQty;
  const difference = comparison === undefined ? undefined : primary - comparison;
  const percentage = comparison === undefined || comparison === 0 ? undefined : (difference! / comparison) * 100;

  return (
    <div className="min-w-52 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-semibold">{point.label}</p>
      <p><span className="text-muted-foreground">Principal: </span>{formatter(primary)}</p>
      {comparison !== undefined ? (
        <>
          <p><span className="text-muted-foreground">Comparativo: </span>{formatter(comparison)}</p>
          <p><span className="text-muted-foreground">Diferencia: </span>{difference! >= 0 ? "+" : ""}{formatter(difference!)}</p>
          <p><span className="text-muted-foreground">Variación: </span>{percentage === undefined ? "No calculable" : `${percentage >= 0 ? "+" : ""}${percentage.toFixed(1)}%`}</p>
        </>
      ) : (
        <p className="text-muted-foreground">Sin dato comparativo para este punto</p>
      )}
    </div>
  );
}

export default function SalesByCategoryAnalysis() {
  const { user } = useAuth();
  const temporal = useTemporalUrlState("P07");
  const userRole = user?.role as string | undefined;
  const isStoreUser = userRole === "store_user";
  const assignedStoreCode = (user as { assignedStoreCode?: string | null } | undefined)?.assignedStoreCode;

  const [draftControls, setDraftControls] = useState<CategoryControls>(() => controlsFromSearch(window.location.search));
  const [appliedControls, setAppliedControls] = useState<CategoryControls>(() => controlsFromSearch(window.location.search));
  const [draftIssue, setDraftIssue] = useState<string | undefined>();
  const [comparisonUnavailable, setComparisonUnavailable] = useState(() => Boolean(temporal.issue));

  // Reconstruye los filtros no temporales cuando el navegador navega atrás/adelante.
  useEffect(() => {
    const next = controlsFromSearch(window.location.search);
    if (isStoreUser && assignedStoreCode) next.branch = assignedStoreCode;
    setDraftControls(next);
    setAppliedControls(next);
    setComparisonUnavailable(Boolean(temporal.issue));
  }, [temporal.applied, isStoreUser, assignedStoreCode]);

  // La restricción por rol prevalece sobre URL y sobre el borrador del usuario.
  useEffect(() => {
    if (!isStoreUser || !assignedStoreCode) return;
    setDraftControls(current => ({ ...current, branch: assignedStoreCode }));
    setAppliedControls(current => ({ ...current, branch: assignedStoreCode }));
  }, [isStoreUser, assignedStoreCode]);

  const updateTemporalDraft = useCallback((next: TemporalState) => {
    let nextState = next;
    let nextIssue: string | undefined;
    if (next.primary.start !== temporal.draft.primary.start || next.primary.end !== temporal.draft.primary.end) {
      if (next.comparisonMode === "days" && next.comparison &&
        inclusiveCalendarDays(next.primary.start, next.primary.end) !== inclusiveCalendarDays(next.comparison.start, next.comparison.end)) {
        nextState = { ...next, comparison: undefined };
        nextIssue = "Selecciona nuevamente el periodo comparativo.";
      }
      if (next.comparisonMode === "months" && next.comparison) {
        const primaryMonths = temporalRangeToMonths(next.primary);
        const comparisonMonths = temporalRangeToMonths(next.comparison);
        if (!primaryMonths || !comparisonMonths || validateMonthComparison(primaryMonths, comparisonMonths)) {
          nextState = { ...next, comparison: undefined };
          nextIssue = "Selecciona nuevamente el periodo comparativo.";
        }
      }
    }
    setDraftIssue(nextIssue);
    temporal.setIssue(undefined);
    temporal.setDraft(nextState);
  }, [temporal]);

  const updatePrimaryDate = useCallback((key: "start" | "end", value: Date | undefined) => {
    if (!value) return;
    const nextPrimary = { ...temporal.draft.primary, [key]: dateToIso(value) };
    if (nextPrimary.start > nextPrimary.end) return;

    let comparison = temporal.draft.comparison;
    if (temporal.draft.comparisonMode === "previous") {
      comparison = previousPeriod(nextPrimary);
    } else if (temporal.draft.comparisonMode === "days" && comparison) {
      const previousDuration = inclusiveCalendarDays(temporal.draft.primary.start, temporal.draft.primary.end);
      const nextDuration = inclusiveCalendarDays(nextPrimary.start, nextPrimary.end);
      if (previousDuration === nextDuration) {
        const offset = Math.round((isoToDate(comparison.start).getTime() - isoToDate(temporal.draft.primary.start).getTime()) / 86_400_000);
        comparison = {
          start: shiftIso(nextPrimary.start, offset),
          end: shiftIso(nextPrimary.end, offset),
        };
      } else {
        comparison = undefined;
      }
    }
    updateTemporalDraft({ ...temporal.draft, primary: nextPrimary, comparison });
  }, [temporal.draft, updateTemporalDraft]);

  const handleApply = useCallback(() => {
    const nextTemporal = normalizedTemporal(temporal.draft);
    const issue = validateTemporalDraft(nextTemporal);
    if (issue) {
      setDraftIssue(issue);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    controlsToParams(params, draftControls);
    temporal.applyState(nextTemporal, params);
    setAppliedControls(draftControls);
    setDraftIssue(undefined);
    setComparisonUnavailable(false);
  }, [draftControls, temporal]);

  const handleReset = useCallback(() => {
    const nextTemporal = temporal.reset();
    const nextControls: CategoryControls = {
      branch: isStoreUser && assignedStoreCode ? assignedStoreCode : "all",
      dept: "all",
      seccion: "all",
      familia: "all",
      includeIgv: true,
    };
    const params = new URLSearchParams(window.location.search);
    controlsToParams(params, nextControls);
    temporal.applyState(nextTemporal, params);
    setDraftControls(nextControls);
    setAppliedControls(nextControls);
    setDraftIssue(undefined);
    setComparisonUnavailable(false);
  }, [assignedStoreCode, isStoreUser, temporal]);

  const appliedFilters = useMemo(
    () => controlsToFilters(temporal.applied.primary, appliedControls),
    [temporal.applied.primary, appliedControls],
  );
  const comparisonRange = comparisonUnavailable ? undefined : temporal.applied.comparison;
  const comparisonFilters = useMemo(
    () => comparisonRange ? controlsToFilters(comparisonRange, appliedControls) : undefined,
    [comparisonRange, appliedControls],
  );
  const hasPendingChanges = temporal.hasPendingChanges || JSON.stringify(draftControls) !== JSON.stringify(appliedControls);

  const { data: categoryTree, isLoading: treeLoading } = trpc.categoryAnalysis.getCategoryTree.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const departments = useMemo(() => categoryTree ?? [], [categoryTree]);
  const secciones = useMemo(() => {
    if (draftControls.dept === "all") return [];
    return departments.find(department => department.id === draftControls.dept)?.secciones ?? [];
  }, [departments, draftControls.dept]);
  const familias = useMemo(() => {
    if (draftControls.seccion === "all") return [];
    return secciones.find(seccion => seccion.id === draftControls.seccion)?.familias ?? [];
  }, [draftControls.seccion, secciones]);

  const { data: branchCatalog, isLoading: branchesLoading } = trpc.categoryAnalysis.getBranchCatalog.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const branches = useMemo(() => branchCatalog ?? [], [branchCatalog]);
  const lockedBranchName = useMemo(() => {
    if (!isStoreUser || !assignedStoreCode) return null;
    return branches.find(branch => branch.sap_id === assignedStoreCode)?.name ?? assignedStoreCode;
  }, [assignedStoreCode, branches, isStoreUser]);

  const [granularity, setGranularity] = useState<Granularity>("day");
  const [showProduct, setShowProduct] = useState(true);
  const [showStore, setShowStore] = useState(true);
  const [lineMetric, setLineMetric] = useState<"amount" | "quantity">("amount");

  // P07-E01 uses two frontend requests because getCategoryLineChart accepts a range.
  // E02–E04 deliberately continue using only the current-period queries below.
  const lineQuery = trpc.categoryAnalysis.getCategoryLineChart.useQuery({
    ...appliedFilters,
    granularity,
  });
  const comparisonLineQuery = trpc.categoryAnalysis.getCategoryLineChart.useQuery(
    comparisonFilters ? { ...comparisonFilters, granularity } : { ...appliedFilters, granularity },
    { enabled: Boolean(comparisonFilters) },
  );
  const pieQuery = trpc.categoryAnalysis.getCategoryPieBreakdown.useQuery(appliedFilters);
  const evoQuery = trpc.categoryAnalysis.getCategoryEvolution.useQuery({
    ...appliedFilters,
    granularity,
    group_by_product: showProduct,
    group_by_store: showStore,
  });

  const lineRows = useRetainedData(lineQuery.data);
  const comparisonLineRows = useRetainedData(comparisonLineQuery.data);
  const pieRows = useRetainedData(pieQuery.data);
  const evoRows = useRetainedData(evoQuery.data);

  const lineChartData = useMemo<CategoryLinePoint[]>(() => {
    if (!lineRows) return [];
    const comparisonRows = comparisonLineRows ?? [];
    const comparisonByMonthDay = new Map<string, typeof comparisonRows[number]>();
    if (temporal.applied.comparisonMode === "months" && comparisonRange && granularity === "day") {
      comparisonRows.forEach(row => comparisonByMonthDay.set(periodMonthDayKey(String(row.period), comparisonRange.start), row));
    }
    return lineRows.map((row, index) => {
      const comparison = temporal.applied.comparisonMode === "months" && comparisonRange && granularity === "day"
        ? comparisonByMonthDay.get(periodMonthDayKey(String(row.period), temporal.applied.primary.start))
        : comparisonRows[index];
      const period = String(row.period).slice(0, 10);
      return {
        period,
        comparisonPeriod: comparison ? String(comparison.period).slice(0, 10) : undefined,
        label: formatPeriodLabel(period, granularity),
        amount: Number.parseFloat(row.amount ?? "0"),
        quantity: Number.parseFloat(row.quantity ?? "0"),
        ...(comparison ? {
          amountComparison: Number.parseFloat(comparison.amount ?? "0"),
          quantityComparison: Number.parseFloat(comparison.quantity ?? "0"),
        } : {}),
      };
    });
  }, [comparisonLineRows, comparisonRange, granularity, lineRows, temporal.applied.comparisonMode, temporal.applied.primary.start]);
  const hasComparisonSeries = lineChartData.some(point => point.amountComparison !== undefined || point.quantityComparison !== undefined);

  const pieChartData = useMemo(() => {
    if (!pieRows) return [];
    const total = pieRows.reduce((sum, row) => sum + Number.parseFloat(row.amount ?? "0"), 0);
    return pieRows.map(row => ({
      id: row.category_id,
      name: row.category_name,
      amount: Number.parseFloat(row.amount ?? "0"),
      quantity: Number.parseFloat(row.quantity ?? "0"),
      pct: total > 0 ? (Number.parseFloat(row.amount ?? "0") / total) * 100 : 0,
    }));
  }, [pieRows]);

  const evoData = useMemo<EvolutionRow[] | undefined>(() => {
    if (!evoRows) return undefined;
    return evoRows.map(row => ({
      period: row.period,
      product_id: row.product_id,
      producto: row.producto,
      sku: row.sku,
      branch_id: row.branch_id,
      tienda: row.tienda,
      sap_id: row.sap_id,
      amount: row.amount,
      quantity: row.quantity,
    }));
  }, [evoRows]);

  const selectedCategoryLabel = useMemo(() => {
    if (appliedControls.familia !== "all") {
      return departments.flatMap(department => department.secciones).flatMap(seccion => seccion.familias)
        .find(familia => familia.id === appliedControls.familia)?.name ?? "Familia";
    }
    if (appliedControls.seccion !== "all") {
      return departments.flatMap(department => department.secciones)
        .find(seccion => seccion.id === appliedControls.seccion)?.name ?? "Sección";
    }
    if (appliedControls.dept !== "all") {
      return departments.find(department => department.id === appliedControls.dept)?.name ?? "Departamento";
    }
    return "Todas las categorías";
  }, [appliedControls.dept, appliedControls.familia, appliedControls.seccion, departments]);

  const pieChildLabel = appliedControls.familia !== "all"
    ? "Familia"
    : appliedControls.seccion !== "all"
      ? "Familias"
      : appliedControls.dept !== "all"
        ? "Secciones"
        : "Departamentos";
  const visibleIssue = draftIssue ?? temporal.issue;
  const isUpdating = lineQuery.isFetching || pieQuery.isFetching || evoQuery.isFetching || comparisonLineQuery.isFetching;

  const handleDeptChange = (dept: string) => setDraftControls(current => ({ ...current, dept, seccion: "all", familia: "all" }));
  const handleSeccionChange = (seccion: string) => setDraftControls(current => ({ ...current, seccion, familia: "all" }));

  return (
    <div className="min-h-screen bg-background">
      <NavigationMenu />
      <div className="container space-y-6 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Análisis por categorías</h1>
            <p className="mt-1 text-sm text-muted-foreground">Ventas desagregadas por departamento, sección y familia de producto.</p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {appliedFilters.fecha_min} → {appliedFilters.fecha_max}
            {appliedFilters.branch_id ? ` · ${appliedFilters.branch_id}` : ""}
          </Badge>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold"><Filter className="h-4 w-4" />Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fecha inicio</Label>
                <DatePicker date={isoToDate(temporal.draft.primary.start)} onDateChange={date => updatePrimaryDate("start", date)} maxDate={isoToDate(temporal.draft.primary.end)} placeholder="Desde" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fecha fin</Label>
                <DatePicker date={isoToDate(temporal.draft.primary.end)} onDateChange={date => updatePrimaryDate("end", date)} minDate={isoToDate(temporal.draft.primary.start)} maxDate={new Date()} placeholder="Hasta" />
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs text-muted-foreground">Tienda{isStoreUser && <Lock className="h-3 w-3" />}</Label>
                {isStoreUser ? (
                  <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground">{lockedBranchName ?? assignedStoreCode}</div>
                ) : (
                  <Select value={draftControls.branch} onValueChange={branch => setDraftControls(current => ({ ...current, branch }))} disabled={branchesLoading}>
                    <SelectTrigger className="h-9"><SelectValue placeholder={branchesLoading ? "Cargando…" : "Todas las tiendas"} /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todas las tiendas</SelectItem>{branches.map(branch => <SelectItem key={branch.sap_id} value={branch.sap_id}>{branch.name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Departamento</Label>
                <Select value={draftControls.dept} onValueChange={handleDeptChange} disabled={treeLoading}>
                  <SelectTrigger className="h-9"><SelectValue placeholder={treeLoading ? "Cargando…" : "Todos"} /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Todos los departamentos</SelectItem>{departments.map(department => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Sección</Label>
                <Select value={draftControls.seccion} onValueChange={handleSeccionChange} disabled={draftControls.dept === "all" || secciones.length === 0}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todas las secciones" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Todas las secciones</SelectItem>{secciones.map(seccion => <SelectItem key={seccion.id} value={seccion.id}>{seccion.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Familia</Label>
                <Select value={draftControls.familia} onValueChange={familia => setDraftControls(current => ({ ...current, familia }))} disabled={draftControls.seccion === "all" || familias.length === 0}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todas las familias" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Todas las familias</SelectItem>{familias.map(familia => <SelectItem key={familia.id} value={familia.id}>{familia.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Impuesto</Label>
                <div className="flex h-9 items-center gap-2"><Switch id="igv-toggle" checked={draftControls.includeIgv} onCheckedChange={includeIgv => setDraftControls(current => ({ ...current, includeIgv }))} /><Label htmlFor="igv-toggle" className="cursor-pointer text-sm">{draftControls.includeIgv ? "Con IGV" : "Sin IGV"}</Label></div>
              </div>
            </div>

            <ComparisonPeriodControls value={temporal.draft} onChange={updateTemporalDraft} error={visibleIssue} />
            <AppliedFilterActions onApply={handleApply} onReset={handleReset} isPending={hasPendingChanges} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4" />Evolución de Ventas — {selectedCategoryLabel}</CardTitle>
                {isUpdating && <p className="mt-1 text-xs text-muted-foreground">Actualizando resultados…</p>}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex overflow-hidden rounded-md border text-xs">
                  <button className={`px-3 py-1.5 transition-colors ${lineMetric === "amount" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} onClick={() => setLineMetric("amount")}>Monto</button>
                  <button className={`px-3 py-1.5 transition-colors ${lineMetric === "quantity" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} onClick={() => setLineMetric("quantity")}>Unidades</button>
                </div>
                <div className="flex overflow-hidden rounded-md border text-xs">
                  {(["day", "week", "month"] as Granularity[]).map(value => <button key={value} className={`px-3 py-1.5 transition-colors ${granularity === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} onClick={() => setGranularity(value)}>{value === "day" ? "Día" : value === "week" ? "Semana" : "Mes"}</button>)}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {lineQuery.isLoading && !lineRows ? <Skeleton className="h-64 w-full" /> : lineChartData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Sin datos para el período seleccionado</div>
            ) : (
              <>
                {comparisonLineQuery.error && comparisonRange && <p className="mb-3 text-sm text-muted-foreground">El período comparativo no está disponible. Se muestran los datos del período principal.</p>}
                {comparisonUnavailable && <p className="mb-3 text-sm text-muted-foreground">Selecciona nuevamente el periodo comparativo.</p>}
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={lineChartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={value => lineMetric === "amount" ? `S/ ${(value / 1000).toFixed(0)}k` : fmtQty(value)} width={60} />
                    <Tooltip content={<ComparativeLineTooltip metric={lineMetric} />} />
                    <Legend />
                    <Line type="monotone" dataKey={lineMetric} stroke="var(--ff-esmeralda)" strokeWidth={2} dot={lineChartData.length <= 31} activeDot={{ r: 5 }} name="Periodo principal" />
                    {hasComparisonSeries && <Line type="monotone" dataKey={`${lineMetric}Comparison`} stroke="var(--ff-cobalto)" strokeWidth={2} strokeDasharray="6 4" dot={lineChartData.length <= 31} activeDot={{ r: 5 }} name="Periodo comparativo" connectNulls={false} />}
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}
          </CardContent>
        </Card>

        {/* P07-E02 — sin serie ni cálculo comparativo. */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-semibold"><PieChartIcon className="h-4 w-4" />Distribución por {pieChildLabel}</CardTitle></CardHeader>
          <CardContent>
            {pieQuery.isLoading && !pieRows ? <Skeleton className="h-64 w-full" /> : pieChartData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Sin datos para el período seleccionado</div>
            ) : (
              <div className="flex flex-col items-start gap-6 lg:flex-row">
                <div className="shrink-0"><ResponsiveContainer width={280} height={280}><PieChart><Pie data={pieChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={2} dataKey="amount" nameKey="name">{pieChartData.map((_, index) => <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}</Pie><Tooltip formatter={(value: number) => [fmtCurrency(value), "Monto"]} /></PieChart></ResponsiveContainer></div>
                <div className="flex-1 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="pb-2 text-left font-medium">Categoría</th><th className="pb-2 text-right font-medium">Monto</th><th className="pb-2 text-right font-medium">Unidades</th><th className="pb-2 text-right font-medium">%</th></tr></thead><tbody>{pieChartData.map((row, index) => <tr key={row.id} className="border-b last:border-0"><td className="flex items-center gap-2 py-1.5"><span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} /><span className="max-w-[180px] truncate">{row.name}</span></td><td className="py-1.5 text-right tabular-nums">{fmtCurrency(row.amount)}</td><td className="py-1.5 text-right tabular-nums">{fmtQty(row.quantity)}</td><td className="py-1.5 text-right tabular-nums text-muted-foreground">{row.pct.toFixed(1)}%</td></tr>)}</tbody></table></div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* P07-E03/E04 — se conserva su consulta y presentación de período principal. */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold"><Table2 className="h-4 w-4" />Artículos — {selectedCategoryLabel}</CardTitle>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex cursor-pointer items-center gap-1.5"><Switch checked={showProduct} onCheckedChange={setShowProduct} id="show-product" /><span>Producto</span></label>
                <label className="flex cursor-pointer items-center gap-1.5"><Switch checked={showStore} onCheckedChange={setShowStore} id="show-store" /><span>Tienda</span></label>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0"><SalesEvolutionTable data={evoData} isLoading={evoQuery.isLoading && !evoRows} granularity={granularity} setGranularity={setGranularity} showProduct={showProduct} showStore={showStore} includeIgv={appliedControls.includeIgv} /></CardContent>
        </Card>
      </div>
    </div>
  );
}
