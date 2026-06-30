/**
 * SalesByCategoryAnalysis.tsx
 * Vista "Análisis por Categorías" del portal de ventas.
 *
 * Elementos:
 * 1. Filtros: fecha inicio/fin, tienda, departamento, sección, familia, IGV
 *    → Solo se ejecutan queries al hacer clic en "Aplicar Filtros"
 * 2. Gráfico de líneas: ventas en monto (con toggle a unidades) por período
 * 3. Gráfico de pie: distribución por categoría hija de la seleccionada
 * 4. Tabla de artículos: SalesEvolutionTable (idéntica a la del portal de marca propia)
 *
 * Reglas de acceso:
 * - store_user: tienda bloqueada a su assignedStoreCode
 * - Todos los demás: pueden seleccionar cualquier tienda
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
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
import { useFilters } from "@/contexts/FiltersContext";
import { useIgv } from "@/contexts/IgvContext";
import { useAggregatedSales } from "@/hooks/useAggregatedSales";
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
  ChevronDown,
} from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";
import type { DateRange } from "react-day-picker";

// ─── Color palette ────────────────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

const fmtQty = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 0 });

function toDate(s: string | Date): Date {
  if (s instanceof Date) return s;
  return new Date(s + "T00:00:00");
}

function formatPeriodLabel(key: string, granularity: Granularity): string {
  const d = toDate(key);
  if (isNaN(d.getTime())) return key;
  if (granularity === "day") return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
  if (granularity === "week") {
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    return `${d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}–${end.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}`;
  }
  return d.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Applied filter state ─────────────────────────────────────────────────────
interface AppliedFilters {
  fecha_min: string;
  fecha_max: string;
  branch_id?: string;
  dept_id?: string;
  seccion_id?: string;
  familia_id?: string;
  include_igv: boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SalesByCategoryAnalysis() {
  const { user } = useAuth();
  const { effectiveTheme } = useTheme();

  // Global filter context
  const {
    dateRange: globalDateRange,
    setDateRange: setGlobalDateRange,
    branchId: globalBranchId,
    setBranchId: setGlobalBranchId,
  } = useFilters();
  const { includeIgv, setIncludeIgv } = useIgv();

  // ─── User role / store lock ────────────────────────────────────────────────
  const userRole = user?.role as string | undefined;
  const isStoreUser = userRole === "store_user";
  const assignedStoreCode = (user as any)?.assignedStoreCode as string | null | undefined;

  // ─── Local filter state (pending, not yet applied) ─────────────────────────
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [pendingDateRange, setPendingDateRange] = useState<DateRange | undefined>(() => {
    if (globalDateRange) return globalDateRange;
    return { from: yesterday, to: new Date(yesterday.getTime() + 86399999) };
  });
  const [pendingBranch, setPendingBranch] = useState<string>(() => {
    if (isStoreUser && assignedStoreCode) return assignedStoreCode;
    return globalBranchId || "all";
  });
  const [pendingDept, setPendingDept] = useState<string>("all");
  const [pendingSeccion, setPendingSeccion] = useState<string>("all");
  const [pendingFamilia, setPendingFamilia] = useState<string>("all");

  // Lock branch for store users
  useEffect(() => {
    if (isStoreUser && assignedStoreCode) setPendingBranch(assignedStoreCode);
  }, [isStoreUser, assignedStoreCode]);

  // ─── Applied filters (only updated on "Aplicar Filtros") ──────────────────
  const [applied, setApplied] = useState<AppliedFilters | null>(null);
  const [hasApplied, setHasApplied] = useState(false);

  const handleApply = useCallback(() => {
    const from = pendingDateRange?.from ?? yesterday;
    const to = pendingDateRange?.to ?? yesterday;
    const filters: AppliedFilters = {
      fecha_min: fmt(from),
      fecha_max: fmt(to),
      branch_id: pendingBranch === "all" ? undefined : pendingBranch,
      dept_id: pendingDept === "all" ? undefined : pendingDept,
      seccion_id: pendingSeccion === "all" ? undefined : pendingSeccion,
      familia_id: pendingFamilia === "all" ? undefined : pendingFamilia,
      include_igv: includeIgv,
    };
    setApplied(filters);
    setHasApplied(true);
    // Sync global context
    setGlobalDateRange(pendingDateRange);
    setGlobalBranchId(pendingBranch === "all" ? undefined : pendingBranch);
  }, [pendingDateRange, pendingBranch, pendingDept, pendingSeccion, pendingFamilia, includeIgv, yesterday, setGlobalDateRange, setGlobalBranchId]);

  const handleClear = useCallback(() => {
    setPendingDateRange({ from: yesterday, to: new Date(yesterday.getTime() + 86399999) });
    if (!isStoreUser) setPendingBranch("all");
    setPendingDept("all");
    setPendingSeccion("all");
    setPendingFamilia("all");
  }, [yesterday, isStoreUser]);

  // ─── Category tree ─────────────────────────────────────────────────────────
  const { data: categoryTree, isLoading: treeLoading } =
    trpc.categoryAnalysis.getCategoryTree.useQuery(undefined, {
      staleTime: 5 * 60 * 1000,
    });

  // Cascading selects derived from tree
  const departments = useMemo(() => categoryTree ?? [], [categoryTree]);

  const secciones = useMemo(() => {
    if (pendingDept === "all") return [];
    const dept = departments.find((d: { id: string }) => d.id === pendingDept);
    return (dept as any)?.secciones ?? [];
  }, [departments, pendingDept]);

  const familias = useMemo(() => {
    if (pendingSeccion === "all") return [];
    const dept = departments.find((d: { id: string }) => d.id === pendingDept);
    const sec = (dept as any)?.secciones?.find((s: { id: string }) => s.id === pendingSeccion);
    return (sec as any)?.familias ?? [];
  }, [departments, pendingDept, pendingSeccion]);

  // Reset child filters when parent changes
  const handleDeptChange = (v: string) => {
    setPendingDept(v);
    setPendingSeccion("all");
    setPendingFamilia("all");
  };
  const handleSeccionChange = (v: string) => {
    setPendingSeccion(v);
    setPendingFamilia("all");
  };

  // ─── Branch list from aggregated sales hook ────────────────────────────────
  const { metrics: salesMetrics } = useAggregatedSales();
  const branches = salesMetrics.branches;

  const lockedBranchName = useMemo(() => {
    if (!isStoreUser || !assignedStoreCode) return null;
    return branches.find((b) => b.sap_id === assignedStoreCode)?.name ?? assignedStoreCode;
  }, [isStoreUser, assignedStoreCode, branches]);

  // ─── Evolution table state ─────────────────────────────────────────────────
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [showProduct, setShowProduct] = useState(true);
  const [showStore, setShowStore] = useState(true);
  const [lineMetric, setLineMetric] = useState<"amount" | "quantity">("amount");

  // ─── Queries (only active when hasApplied) ─────────────────────────────────
  const lineQuery = trpc.categoryAnalysis.getCategoryLineChart.useQuery(
    {
      fecha_min: applied?.fecha_min ?? "",
      fecha_max: applied?.fecha_max ?? "",
      branch_id: applied?.branch_id,
      include_igv: applied?.include_igv ?? true,
      dept_id: applied?.dept_id,
      seccion_id: applied?.seccion_id,
      familia_id: applied?.familia_id,
      granularity,
    },
    { enabled: hasApplied && !!applied }
  );

  const pieQuery = trpc.categoryAnalysis.getCategoryPieBreakdown.useQuery(
    {
      fecha_min: applied?.fecha_min ?? "",
      fecha_max: applied?.fecha_max ?? "",
      branch_id: applied?.branch_id,
      include_igv: applied?.include_igv ?? true,
      dept_id: applied?.dept_id,
      seccion_id: applied?.seccion_id,
      familia_id: applied?.familia_id,
    },
    { enabled: hasApplied && !!applied }
  );

  const evoQuery = trpc.categoryAnalysis.getCategoryEvolution.useQuery(
    {
      fecha_min: applied?.fecha_min ?? "",
      fecha_max: applied?.fecha_max ?? "",
      branch_id: applied?.branch_id,
      include_igv: applied?.include_igv ?? true,
      dept_id: applied?.dept_id,
      seccion_id: applied?.seccion_id,
      familia_id: applied?.familia_id,
      granularity,
      group_by_product: showProduct,
      group_by_store: showStore,
    },
    { enabled: hasApplied && !!applied }
  );

  // ─── Line chart data ───────────────────────────────────────────────────────
  const lineChartData = useMemo(() => {
    if (!lineQuery.data) return [];
    return lineQuery.data.map((row) => ({
      period: String(row.period).slice(0, 10),
      label: formatPeriodLabel(String(row.period).slice(0, 10), granularity),
      amount: parseFloat(row.amount ?? "0"),
      quantity: parseFloat(row.quantity ?? "0"),
    }));
  }, [lineQuery.data, granularity]);

  // ─── Pie chart data ────────────────────────────────────────────────────────
  const pieChartData = useMemo(() => {
    if (!pieQuery.data) return [];
    const total = pieQuery.data.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
    return pieQuery.data.map((row) => ({
      id: row.category_id,
      name: row.category_name,
      amount: parseFloat(row.amount ?? "0"),
      quantity: parseFloat(row.quantity ?? "0"),
      pct: total > 0 ? (parseFloat(row.amount ?? "0") / total) * 100 : 0,
    }));
  }, [pieQuery.data]);

  // ─── Evolution table data ──────────────────────────────────────────────────
  const evoData: EvolutionRow[] | undefined = useMemo(() => {
    if (!evoQuery.data) return undefined;
    return evoQuery.data.map((r) => ({
      period: r.period,
      product_id: r.product_id,
      producto: r.producto,
      sku: r.sku,
      branch_id: r.branch_id,
      tienda: r.tienda,
      sap_id: r.sap_id,
      amount: r.amount,
      quantity: r.quantity,
    }));
  }, [evoQuery.data]);

  // ─── Selected category label ───────────────────────────────────────────────
  const selectedCategoryLabel = useMemo(() => {
    if (applied?.familia_id) {
      const dept = departments.find((d) => d.id === applied.dept_id);
      const sec = dept?.secciones.find((s) => s.id === applied.seccion_id);
      return sec?.familias.find((f) => f.id === applied.familia_id)?.name ?? "Familia";
    }
    if (applied?.seccion_id) {
      const dept = departments.find((d) => d.id === applied.dept_id);
      return dept?.secciones.find((s) => s.id === applied.seccion_id)?.name ?? "Sección";
    }
    if (applied?.dept_id) {
      return departments.find((d) => d.id === applied.dept_id)?.name ?? "Departamento";
    }
    return "Todas las categorías";
  }, [applied, departments]);

  // ─── Pie label ────────────────────────────────────────────────────────────
  const pieChildLabel = useMemo(() => {
    if (applied?.familia_id) return "Familia";
    if (applied?.seccion_id) return "Familias";
    if (applied?.dept_id) return "Secciones";
    return "Departamentos";
  }, [applied]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <NavigationMenu />
      <div className="container py-6 space-y-6">
        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight uppercase">
              Análisis por Categorías
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Ventas desagregadas por departamento, sección y familia de producto.
            </p>
          </div>
          {applied && (
            <Badge variant="secondary" className="text-xs">
              {applied.fecha_min} → {applied.fecha_max}
              {applied.branch_id ? ` · ${applied.branch_id}` : ""}
            </Badge>
          )}
        </div>

        {/* ── Filter panel ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* Fecha inicio */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fecha inicio</Label>
                <DatePicker
                  date={pendingDateRange?.from}
                  onDateChange={(d) =>
                    setPendingDateRange((prev) => ({ from: d, to: prev?.to ?? d }))
                  }
                  maxDate={new Date()}
                  placeholder="Desde"
                />
              </div>

              {/* Fecha fin */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fecha fin</Label>
                <DatePicker
                  date={pendingDateRange?.to}
                  onDateChange={(d) =>
                    setPendingDateRange((prev) => ({ from: prev?.from ?? d, to: d }))
                  }
                  maxDate={new Date()}
                  placeholder="Hasta"
                />
              </div>

              {/* Tienda */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  Tienda
                  {isStoreUser && <Lock className="h-3 w-3 text-muted-foreground" />}
                </Label>
                {isStoreUser ? (
                  <div className="h-9 flex items-center px-3 border rounded-md bg-muted/50 text-sm text-muted-foreground">
                    {lockedBranchName ?? assignedStoreCode}
                  </div>
                ) : (
                  <Select value={pendingBranch} onValueChange={setPendingBranch}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todas las tiendas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las tiendas</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.sap_id} value={b.sap_id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Departamento */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Departamento</Label>
                <Select
                  value={pendingDept}
                  onValueChange={handleDeptChange}
                  disabled={treeLoading}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={treeLoading ? "Cargando…" : "Todos"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los departamentos</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sección */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Sección</Label>
                <Select
                  value={pendingSeccion}
                  onValueChange={handleSeccionChange}
                  disabled={pendingDept === "all" || secciones.length === 0}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todas las secciones" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las secciones</SelectItem>
                    {(secciones as { id: string; name: string }[]).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Familia */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Familia</Label>
                <Select
                  value={pendingFamilia}
                  onValueChange={setPendingFamilia}
                  disabled={pendingSeccion === "all" || familias.length === 0}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todas las familias" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las familias</SelectItem>
                    {(familias as { id: string; name: string }[]).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* IGV toggle */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Impuesto</Label>
                <div className="h-9 flex items-center gap-2">
                  <Switch
                    id="igv-toggle"
                    checked={includeIgv}
                    onCheckedChange={setIncludeIgv}
                  />
                  <Label htmlFor="igv-toggle" className="text-sm cursor-pointer">
                    {includeIgv ? "Con IGV" : "Sin IGV"}
                  </Label>
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground invisible">Acciones</Label>
                <div className="flex gap-2">
                  <Button
                    onClick={handleApply}
                    size="sm"
                    className="flex-1 h-9"
                  >
                    <Filter className="h-3.5 w-3.5 mr-1.5" />
                    Aplicar Filtros
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClear}
                    className="h-9"
                  >
                    Limpiar
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Empty state ── */}
        {!hasApplied && (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
            <BarChart2 className="h-12 w-12 opacity-30" />
            <p className="text-sm">
              Selecciona los filtros y haz clic en <strong>Aplicar Filtros</strong> para ver el análisis.
            </p>
          </div>
        )}

        {hasApplied && (
          <>
            {/* ── Line chart ── */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Evolución de Ventas — {selectedCategoryLabel}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {/* Metric toggle */}
                    <div className="flex rounded-md border overflow-hidden text-xs">
                      <button
                        className={`px-3 py-1.5 transition-colors ${lineMetric === "amount" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                        onClick={() => setLineMetric("amount")}
                      >
                        Monto
                      </button>
                      <button
                        className={`px-3 py-1.5 transition-colors ${lineMetric === "quantity" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                        onClick={() => setLineMetric("quantity")}
                      >
                        Unidades
                      </button>
                    </div>
                    {/* Granularity toggle */}
                    <div className="flex rounded-md border overflow-hidden text-xs">
                      {(["day", "week", "month"] as Granularity[]).map((g) => (
                        <button
                          key={g}
                          className={`px-3 py-1.5 transition-colors ${granularity === g ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                          onClick={() => setGranularity(g)}
                        >
                          {g === "day" ? "Día" : g === "week" ? "Semana" : "Mes"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {lineQuery.isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : lineChartData.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    Sin datos para el período seleccionado
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={lineChartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) =>
                          lineMetric === "amount"
                            ? `S/ ${(v / 1000).toFixed(0)}k`
                            : fmtQty(v)
                        }
                        width={60}
                      />
                      <Tooltip
                        formatter={(v: number) =>
                          lineMetric === "amount"
                            ? [fmtCurrency(v), "Monto"]
                            : [fmtQty(v), "Unidades"]
                        }
                        labelStyle={{ fontWeight: 600 }}
                      />
                      <Line
                        type="monotone"
                        dataKey={lineMetric}
                        stroke="var(--ff-esmeralda)"
                        strokeWidth={2}
                        dot={lineChartData.length <= 31}
                        activeDot={{ r: 5 }}
                        name={lineMetric === "amount" ? "Monto" : "Unidades"}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* ── Pie chart ── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4" />
                  Distribución por {pieChildLabel}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pieQuery.isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : pieChartData.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    Sin datos para el período seleccionado
                  </div>
                ) : (
                  <div className="flex flex-col lg:flex-row gap-6 items-start">
                    {/* Pie */}
                    <div className="flex-shrink-0">
                      <ResponsiveContainer width={280} height={280}>
                        <PieChart>
                          <Pie
                            data={pieChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={110}
                            paddingAngle={2}
                            dataKey="amount"
                            nameKey="name"
                          >
                            {pieChartData.map((_, i) => (
                              <Cell
                                key={i}
                                fill={PIE_COLORS[i % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v: number) => [fmtCurrency(v), "Monto"]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Legend table */}
                    <div className="flex-1 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-muted-foreground border-b">
                            <th className="text-left pb-2 font-medium">Categoría</th>
                            <th className="text-right pb-2 font-medium">Monto</th>
                            <th className="text-right pb-2 font-medium">Unidades</th>
                            <th className="text-right pb-2 font-medium">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pieChartData.map((row, i) => (
                            <tr key={row.id} className="border-b last:border-0">
                              <td className="py-1.5 flex items-center gap-2">
                                <span
                                  className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                                  style={{
                                    backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                                  }}
                                />
                                <span className="truncate max-w-[180px]">{row.name}</span>
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {fmtCurrency(row.amount)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {fmtQty(row.quantity)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                                {row.pct.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Evolution table ── */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Table2 className="h-4 w-4" />
                    Artículos — {selectedCategoryLabel}
                  </CardTitle>
                  {/* Dimension toggles */}
                  <div className="flex items-center gap-4 text-sm">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <Switch
                        checked={showProduct}
                        onCheckedChange={setShowProduct}
                        id="show-product"
                      />
                      <span>Producto</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <Switch
                        checked={showStore}
                        onCheckedChange={setShowStore}
                        id="show-store"
                      />
                      <span>Tienda</span>
                    </label>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <SalesEvolutionTable
                  data={evoData}
                  isLoading={evoQuery.isLoading}
                  granularity={granularity}
                  setGranularity={setGranularity}
                  showProduct={showProduct}
                  showStore={showStore}
                  includeIgv={includeIgv}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
