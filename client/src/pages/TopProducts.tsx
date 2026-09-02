import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { NavigationMenu } from "@/components/NavigationMenu";
import { DashboardFilters } from "@/components/DashboardFilters";
import { useAggregatedSales, type AggregatedSalesFilters } from "@/hooks/useAggregatedSales";
import { useFilters } from "@/contexts/FiltersContext";
import { useIgv } from "@/contexts/IgvContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Trophy, Hash, DollarSign, Package, Store, X } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const FF_PALETTE = [
  "var(--ff-canal-presencial)",
  "var(--ff-canal-rappi)",
  "var(--ff-canal-ecommerce)",
  "var(--ff-granate)",
  "var(--ff-celeste-dark)",
  "var(--ff-cobalto-dark)",
  "var(--ff-esmeralda-dark)",
  "var(--ff-mostaza-dark)",
  "var(--ff-granate-dark)",
  "var(--ff-celeste-light)",
  "var(--ff-cobalto-light)",
  "var(--ff-esmeralda-light)",
  "var(--ff-mostaza-light)",
  "var(--ff-granate-light)",
  "var(--ff-humo)",
  "var(--ff-carbon)",
];

const getBarColor = (idx: number) => FF_PALETTE[idx % FF_PALETTE.length];

const MEDAL_COLORS = ["var(--ff-mostaza)", "var(--ff-humo)", "var(--ff-mostaza-dark)"];

// ─── Helpers ────────────────────────────────────────────────────────────────
const formatCurrency = (v: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

const formatNumber = (v: number) =>
  new Intl.NumberFormat("es-PE").format(v);

const truncate = (s: string, max = 30) =>
  s.length > max ? s.substring(0, max) + "…" : s;

// ─── Tooltip personalizado ──────────────────────────────────────────────────
function CustomTooltip({ active, payload, mode }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="ff-chart-tooltip max-w-xs">
      <p className="font-semibold text-foreground text-sm leading-tight">{d.product_name}</p>
      {d.sku && <p className="text-muted-foreground text-xs mt-0.5">SKU: {d.sku}</p>}
      <p className="text-muted-foreground text-xs">{d.category_name}</p>
      <div className="border-t border-border pt-1 mt-1 space-y-0.5">
        {mode === "qty" ? (
          <p className="font-medium text-sm">
            Cantidad:{" "}
            <span className="text-[var(--ff-canal-presencial)]">{formatNumber(d.total_qty)}</span>
          </p>
        ) : (
          <p className="font-medium text-sm">
            Monto:{" "}
            <span className="text-[var(--ff-canal-rappi)]">{formatCurrency(d.total_amount)}</span>
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          {mode === "qty"
            ? `Monto: ${formatCurrency(d.total_amount)}`
            : `Unidades: ${formatNumber(d.total_qty)}`}
        </p>
        <p className="text-muted-foreground text-xs">Tiendas: {d.branch_count}</p>
      </div>
    </div>
  );
}

// ─── Tabla de ranking ────────────────────────────────────────────────────────
interface ProductRow {
  rank: number;
  product_id: string;
  product_name: string;
  sku: string;
  category_name: string;
  total_qty: number;
  total_amount: number;
  branch_count: number;
  total_stock: number;
  avg_daily_qty: number;
  coverage_days: number | null;
}

// Umbral de cobertura crítica (días)
const COVERAGE_ALERT_THRESHOLD = 5;

function CoverageTag({ days }: { days: number | null }) {
  if (days === null) {
    return <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>—</span>;
  }
  const isAlert = days < COVERAGE_ALERT_THRESHOLD;
  const statusClass = isAlert
    ? "ff-coverage-chip--critical"
    : days <= 10
      ? "ff-coverage-chip--healthy"
      : "ff-coverage-chip--surplus";
  return (
    <span
      className={`ff-coverage-chip ${statusClass} tabular-nums`}
      title={isAlert ? `Cobertura crítica: ${days} días (umbral: ${COVERAGE_ALERT_THRESHOLD} días)` : `${days} días de cobertura`}
    >
      {isAlert && '⚠ '}{days}d
    </span>
  );
}

// ─── Modal de detalle de fila (móvil) ──────────────────────────────────────
function ProductDetailModal({
  row,
  mode,
  onClose,
}: {
  row: ProductRow | null;
  mode: "qty" | "amount";
  onClose: () => void;
}) {
  if (!row) return null;
  const isCoverageAlert = row.coverage_days !== null && row.coverage_days < COVERAGE_ALERT_THRESHOLD;

  const fields: { label: string; value: React.ReactNode }[] = [
    {
      label: "Posición",
      value: (
        <span className="flex items-center gap-2">
          {row.rank <= 3 ? (
            <Trophy className="h-4 w-4" style={{ color: MEDAL_COLORS[row.rank - 1] }} />
          ) : null}
          <span className="font-mono font-semibold">#{row.rank}</span>
        </span>
      ),
    },
    { label: "SKU", value: row.sku || "—" },
    {
      label: "Categoría",
      value: <Badge variant="secondary" className="text-xs font-normal">{row.category_name}</Badge>,
    },
    {
      label: "Unidades vendidas",
      value: <span className="font-semibold tabular-nums text-[var(--ff-canal-presencial)]">{formatNumber(row.total_qty)}</span>,
    },
    {
      label: "Monto vendido",
      value: <span className="font-semibold tabular-nums text-[var(--ff-canal-rappi)]">{formatCurrency(row.total_amount)}</span>,
    },
    {
      label: "Ticket promedio",
      value: (
        <span className="tabular-nums text-[var(--ff-canal-ecommerce)]">
          {row.total_qty > 0 ? formatCurrency(row.total_amount / row.total_qty) : "—"}
        </span>
      ),
    },
    {
      label: "Tiendas",
      value: (
        <span className="flex items-center gap-1">
          <Store className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
          {row.branch_count}
        </span>
      ),
    },
    {
      label: "Stock actual",
      value: (
        <span className={isCoverageAlert ? "font-semibold tabular-nums text-destructive" : "font-semibold tabular-nums text-foreground"}>
          {formatNumber(Math.round(row.total_stock))}
        </span>
      ),
    },
    {
      label: "Venta diaria promedio",
      value: (
        <span className="tabular-nums text-muted-foreground">
          {row.avg_daily_qty > 0 ? row.avg_daily_qty.toFixed(1) : "—"}
        </span>
      ),
    },
    {
      label: "Cobertura",
      value: <CoverageTag days={row.coverage_days} />,
    },
  ];

  return (
    <Dialog open={!!row} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="mx-auto max-w-sm bg-background font-sans">
        <DialogHeader className="pb-2">
          {/* Rank badge */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <DialogTitle className="text-base font-semibold leading-snug text-foreground">
                {row.product_name}
              </DialogTitle>
              {row.sku && (
                <p className="mt-0.5 text-xs text-muted-foreground">SKU: {row.sku}</p>
              )}
            </div>
            {isCoverageAlert && (
              <span className="ff-coverage-chip ff-coverage-chip--critical shrink-0">
                ⚠ Cobertura crítica
              </span>
            )}
          </div>
        </DialogHeader>

        {/* Separador */}
        <div className="border-t border-border/60 my-1" />

        {/* Campos en tabla de dos columnas */}
        <div className="space-y-0">
          {fields.map(({ label, value }, i) => (
            <div
              key={label}
              className={`flex items-center justify-between px-1 py-2.5 ${i < fields.length - 1 ? "border-b border-border" : ""}`}
            >
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </span>
              <span className="text-sm text-right">{value}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RankingTable({ rows, mode }: { rows: ProductRow[]; mode: "qty" | "amount" }) {
  const [selectedRow, setSelectedRow] = useState<ProductRow | null>(null);
  const alertCount = rows.filter(r => r.coverage_days !== null && r.coverage_days < COVERAGE_ALERT_THRESHOLD).length;
  return (
    <div className="overflow-x-auto">
      {alertCount > 0 && (
        <div className="ff-top-products-alert">
          <span className="text-sm">⚠️</span>
          {alertCount} producto{alertCount > 1 ? 's' : ''} con cobertura crítica (&lt; {COVERAGE_ALERT_THRESHOLD} días)
        </div>
      )}
      {/* Modal de detalle (móvil) */}
      <ProductDetailModal row={selectedRow} mode={mode} onClose={() => setSelectedRow(null)} />

      <table className="ff-table ff-top-products-table">
        <thead>
          <tr>
            <th className="w-12 !text-center">#</th>
            <th className="!text-left">Producto</th>
            <th className="hidden !text-left md:table-cell">Categoría</th>
            <th>
              {mode === "qty" ? "Cantidad" : "Monto (S/)"}
            </th>
            <th className="hidden lg:table-cell">
              {mode === "qty" ? "Monto (S/)" : "Cantidad"}
            </th>
            <th className="hidden xl:table-cell">Stock</th>
            <th className="hidden xl:table-cell">Vta. Diaria</th>
            <th className="!text-center">Cobertura</th>
            <th className="hidden !text-center lg:table-cell">
              <Store className="h-3.5 w-3.5 inline" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isTop3 = row.rank <= 3;
            const isCoverageAlert = row.coverage_days !== null && row.coverage_days < COVERAGE_ALERT_THRESHOLD;
            return (
              <tr
                key={row.product_id}
                onClick={() => setSelectedRow(row)}
                className={`${
                  isCoverageAlert
                    ? 'bg-destructive/5'
                    : isTop3
                    ? 'bg-muted/20'
                    : ''
                }`}
              >
                {/* Rank */}
                <td className="!text-center">
                  {isTop3 ? (
                    <Trophy
                      className="h-4 w-4 mx-auto"
                      style={{ color: MEDAL_COLORS[row.rank - 1] }}
                    />
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(row.rank).padStart(2, "0")}
                    </span>
                  )}
                </td>
                {/* Nombre + SKU */}
                <td>
                  <p className="font-medium leading-tight text-foreground line-clamp-2">
                    {row.product_name}
                  </p>
                  {row.sku && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      SKU: {row.sku}
                    </p>
                  )}
                </td>
                {/* Categoría */}
                <td className="hidden md:table-cell">
                  <Badge variant="secondary" className="text-xs font-normal">
                    {row.category_name}
                  </Badge>
                </td>
                {/* Métrica principal */}
                <td className="font-semibold tabular-nums text-foreground">
                  {mode === "qty"
                    ? formatNumber(row.total_qty)
                    : formatCurrency(row.total_amount)}
                </td>
                {/* Métrica secundaria */}
                <td
                  className="hidden tabular-nums text-muted-foreground lg:table-cell"
                >
                  {mode === "qty"
                    ? formatCurrency(row.total_amount)
                    : formatNumber(row.total_qty)}
                </td>
                {/* Stock actual */}
                <td
                  className={`hidden tabular-nums xl:table-cell ${isCoverageAlert ? "font-semibold text-destructive" : "text-foreground"}`}
                >
                  {formatNumber(Math.round(row.total_stock))}
                </td>
                {/* Venta diaria promedio */}
                <td
                  className="hidden tabular-nums text-muted-foreground xl:table-cell"
                >
                  {row.avg_daily_qty > 0 ? formatNumber(Math.round(row.avg_daily_qty * 10) / 10) : '—'}
                </td>
                {/* Cobertura */}
                <td className="!text-center">
                  <CoverageTag days={row.coverage_days} />
                </td>
                {/* Tiendas */}
                <td
                  className="hidden !text-center text-muted-foreground lg:table-cell"
                >
                  {row.branch_count}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Gráfico de barras horizontal ────────────────────────────────────────────
function HorizontalBarChart({ rows, mode }: { rows: ProductRow[]; mode: "qty" | "amount" }) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    handler(); // forzar lectura inmediata al montar
    return () => window.removeEventListener("resize", handler);
  }, []);
  const chartData = rows.slice(0, 20).map((r) => ({
    ...r,
    label: truncate(r.product_name),
    value: mode === "qty" ? r.total_qty : r.total_amount,
  }));

  const chartHeight = Math.max(420, chartData.length * 34);

  return (
    <div className="font-sans" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 4, right: 28, left: isMobile ? 4 : 8, bottom: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            stroke="var(--ff-table-border)"
          />
          <XAxis
            type="number"
            tickFormatter={(v) =>
              mode === "qty"
                ? formatNumber(v)
                : v >= 1_000_000
                ? `S/ ${(v / 1_000_000).toFixed(1)}M`
                : `S/ ${(v / 1_000).toFixed(0)}K`
            }
            tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-sans)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={isMobile ? 0 : 190}
            tick={isMobile ? false : { fontSize: 11, fill: "var(--text-strong)", fontFamily: "var(--font-sans)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<CustomTooltip mode={mode} />}
            cursor={{ fill: "var(--ff-table-head-bg)" }}
          />
          <Bar dataKey="value" radius={0} maxBarSize={22}>
            {chartData.map((_, idx) => (
              <Cell key={idx} fill={getBarColor(idx)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function TopProducts() {
  const { user, loading: authLoading } = useAuth();

  const {
    dateRange: globalDateRange,
    setDateRange: setGlobalDateRange,
    branchId: globalBranchId,
    setBranchId: setGlobalBranchId,
  } = useFilters();

  const userRole = user?.role as string | undefined;
  const isStoreUser = userRole === "store_user";
  const assignedStoreCode = (user as any)?.assignedStoreCode as string | null | undefined;

  // ── Período por defecto: últimos 30 días ─────────────────────────────────
  const defaultDateRange = useMemo<DateRange>(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const from = new Date();
    from.setDate(from.getDate() - 29); // 29 días atrás + hoy = 30 días
    from.setHours(0, 0, 0, 0);
    return { from, to: today };
  }, []);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    () => globalDateRange ?? defaultDateRange
  );
  const [selectedBranch, setSelectedBranch] = useState<string>(
    () => globalBranchId || "all"
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  useEffect(() => {
    if (isStoreUser && assignedStoreCode) setSelectedBranch(assignedStoreCode);
  }, [isStoreUser, assignedStoreCode]);

  useEffect(() => { setGlobalDateRange(dateRange); }, [dateRange, setGlobalDateRange]);
  useEffect(() => {
    setGlobalBranchId(selectedBranch === "all" ? undefined : selectedBranch);
  }, [selectedBranch, setGlobalBranchId]);

  // ── Construir parámetros de query ────────────────────────────────────────
  const toDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const { includeIgv } = useIgv();

  const queryFilters = useMemo(() => {
    const fallback = defaultDateRange;
    return {
      fecha_min: dateRange?.from ? toDateStr(dateRange.from) : toDateStr(fallback.from!),
      fecha_max: dateRange?.to   ? toDateStr(dateRange.to)   : toDateStr(fallback.to!),
      ...(selectedBranch !== "all"   ? { branch_id:   selectedBranch   } : {}),
      ...(selectedCategory !== "all" ? { category_id: selectedCategory } : {}),
      include_igv: includeIgv,
    };
  }, [dateRange, selectedBranch, selectedCategory, defaultDateRange, includeIgv]);

  // Listas de sucursales y categorías reutilizando el hook existente
  const { metrics } = useAggregatedSales(queryFilters as AggregatedSalesFilters);

  // Query principal
  const { data, isLoading, error } = trpc.sales.getTopProducts.useQuery(queryFilters);

  const handleClearFilters = () => {
    setDateRange(defaultDateRange);
    setSelectedBranch("all");
    setSelectedCategory("all");
  };

  const dateRangeText = useMemo(() => {
    if (dateRange?.from && dateRange?.to) {
      return `${dateRange.from.toLocaleDateString("es-PE")} – ${dateRange.to.toLocaleDateString("es-PE")}`;
    }
    return "Últimos 30 días";
  }, [dateRange]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#1A6894" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Sailec', system-ui, sans-serif" }}>
      <NavigationMenu />

      <div className="container py-8 space-y-8">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="space-y-1">
          <h1
            className="text-3xl font-bold tracking-tight uppercase"
            style={{ fontFamily: "'Italian Plate No 1', sans-serif", fontWeight: 800 }}
          >
            Top 50 Productos
          </h1>
          <p className="text-muted-foreground text-sm">
            Ranking de los 50 mejores productos por cantidad vendida y por monto de ventas
          </p>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Período: {dateRangeText}
          </p>
        </div>
        {/* ── Filtros ───────────────────────────────────────────────────────────────────── */}
        <DashboardFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          selectedBranch={selectedBranch}
          branches={metrics.branches}
          onBranchChange={isStoreUser ? () => {} : setSelectedBranch}
          branchLocked={isStoreUser}
          selectedCategory={selectedCategory}
          categories={metrics.categories}
          onCategoryChange={setSelectedCategory}
          onClearFilters={handleClearFilters}
          showIgvToggle
        />

        {/* ── Cargando ───────────────────────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#1A6894" }} />
            <span className="ml-3 text-lg font-medium">Cargando ranking de productos...</span>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {error && !isLoading && (
          <Card style={{ borderColor: "#BC2C46" }}>
            <CardHeader>
              <CardTitle style={{ color: "#BC2C46", fontFamily: "'Italian Plate No 1', sans-serif" }}>
                Error al cargar datos
              </CardTitle>
              <CardDescription>{error.message}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* ── Contenido principal ─────────────────────────────────────────── */}
        {!isLoading && !error && data && (
          <>
            {/* KPIs */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* Productos únicos */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="ff-top-products-kpi-icon ff-top-products-kpi-icon--products">
                      <Package className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Productos únicos (top qty)</p>
                      <p
                        className="text-2xl font-bold tabular-nums"
                        style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}
                      >
                        {formatNumber(data.byQuantity.length)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* #1 por cantidad */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="ff-top-products-kpi-icon ff-top-products-kpi-icon--quantity">
                      <Hash className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">Unidades — #1 producto</p>
                      <p
                        className="text-2xl font-bold tabular-nums"
                        style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}
                      >
                        {data.byQuantity[0] ? formatNumber(data.byQuantity[0].total_qty) : "—"}
                      </p>
                      {data.byQuantity[0] && (
                        <p className="truncate text-xs text-muted-foreground">
                          {data.byQuantity[0].product_name}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* #1 por monto */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="ff-top-products-kpi-icon ff-top-products-kpi-icon--amount">
                      <DollarSign className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">Monto — #1 producto</p>
                      <p
                        className="text-2xl font-bold tabular-nums"
                        style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}
                      >
                        {data.byAmount[0] ? formatCurrency(data.byAmount[0].total_amount) : "—"}
                      </p>
                      {data.byAmount[0] && (
                        <p className="truncate text-xs text-muted-foreground">
                          {data.byAmount[0].product_name}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Tabs ────────────────────────────────────────────────────── */}
            <Tabs defaultValue="amount">
              <TabsList className="mb-2">
                <TabsTrigger value="qty" className="gap-2">
                  <Hash className="h-4 w-4" />
                  Por Cantidad
                </TabsTrigger>
                <TabsTrigger value="amount" className="gap-2">
                  <DollarSign className="h-4 w-4" />
                  Por Monto
                </TabsTrigger>
              </TabsList>

              {/* Tab: Por Cantidad */}
              <TabsContent value="qty" className="space-y-6">
                {data.byQuantity.length === 0 ? (
                  <Card>
                    <CardContent className="py-16 text-center text-muted-foreground">
                      No hay datos para el período y filtros seleccionados.
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle
                          className="text-base font-bold uppercase tracking-wide"
                          style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}
                        >
                          Top 20 — Unidades Vendidas
                        </CardTitle>
                        <CardDescription>
                          Los 20 productos con mayor cantidad de unidades vendidas en el período
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <HorizontalBarChart rows={data.byQuantity} mode="qty" />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle
                          className="text-base font-bold uppercase tracking-wide"
                          style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}
                        >
                          Ranking Completo — Top 50 por Cantidad
                        </CardTitle>
                        <CardDescription>
                          {data.byQuantity.length} productos ordenados por unidades vendidas
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="px-6 pb-6">
                        <RankingTable rows={data.byQuantity} mode="qty" />
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>

              {/* Tab: Por Monto */}
              <TabsContent value="amount" className="space-y-6">
                {data.byAmount.length === 0 ? (
                  <Card>
                    <CardContent className="py-16 text-center text-muted-foreground">
                      No hay datos para el período y filtros seleccionados.
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle
                          className="text-base font-bold uppercase tracking-wide"
                          style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}
                        >
                          Top 20 — Monto de Ventas
                        </CardTitle>
                        <CardDescription>
                          Los 20 productos con mayor monto de ventas en el período
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <HorizontalBarChart rows={data.byAmount} mode="amount" />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle
                          className="text-base font-bold uppercase tracking-wide"
                          style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}
                        >
                          Ranking Completo — Top 50 por Monto
                        </CardTitle>
                        <CardDescription>
                          {data.byAmount.length} productos ordenados por monto de ventas
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="px-6 pb-6">
                        <RankingTable rows={data.byAmount} mode="amount" />
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
