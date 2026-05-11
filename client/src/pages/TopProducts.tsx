import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { NavigationMenu } from "@/components/NavigationMenu";
import { DashboardFilters } from "@/components/DashboardFilters";
import { useAggregatedSales, type AggregatedSalesFilters } from "@/hooks/useAggregatedSales";
import { useFilters } from "@/contexts/FiltersContext";
import { IgvToggle } from "@/components/IgvToggle";
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

// ─── Paleta de colores aprobada Flora & Fauna ────────────────────────────────
// Solo se usan los colores de la lista aprobada:
// #BC2C46, #5E1623, #DEA5A3, #008064, #004032, #80C8CA,
// #C49705, #624C02, #EACB82, #1A6894, #0D344A, #8DB4CA,
// #E5BAC1, #724D60, #F2DDDE, #5BB6B7, #2D5B5B, #AEDBDB,
// #EAE8E2, #757471, #F5F4F1, #232523, #111211, #919291
const FF_PALETTE = [
  "#1A6894", // Cobalto
  "#008064", // Esmeralda
  "#C49705", // Mostaza
  "#BC2C46", // Granate
  "#5BB6B7", // Celeste
  "#0D344A", // Cobalto oscuro
  "#004032", // Esmeralda oscuro
  "#624C02", // Mostaza oscuro
  "#5E1623", // Granate oscuro
  "#2D5B5B", // Celeste oscuro
  "#8DB4CA", // Cobalto claro
  "#80C8CA", // Celeste claro
  "#EACB82", // Mostaza claro
  "#DEA5A3", // Granate claro
  "#AEDBDB", // Celeste muy claro
  "#724D60", // Rosado oscuro
  "#E5BAC1", // Rosado
  "#757471", // Humo
  "#232523", // Carbon
  "#919291", // Humo claro
];

const getBarColor = (idx: number) => FF_PALETTE[idx % FF_PALETTE.length];

// Colores de iconos KPI — de la paleta aprobada
const KPI_COLORS = {
  products: { bg: "#0D344A", icon: "#8DB4CA" },   // Cobalto oscuro / Cobalto claro
  qty:      { bg: "#004032", icon: "#80C8CA" },   // Esmeralda oscuro / Celeste claro
  amount:   { bg: "#624C02", icon: "#EACB82" },   // Mostaza oscuro / Mostaza claro
};

// Colores de medallas — de la paleta aprobada
const MEDAL_COLORS = ["#C49705", "#757471", "#624C02"]; // Mostaza, Humo, Mostaza oscuro

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
    <div
      className="bg-card border border-border rounded-lg p-3 shadow-lg max-w-xs"
      style={{ fontFamily: "'Sailec', system-ui, sans-serif" }}
    >
      <p className="font-semibold text-foreground text-sm leading-tight">{d.product_name}</p>
      {d.sku && <p className="text-muted-foreground text-xs mt-0.5">SKU: {d.sku}</p>}
      <p className="text-muted-foreground text-xs">{d.category_name}</p>
      <div className="border-t border-border pt-1 mt-1 space-y-0.5">
        {mode === "qty" ? (
          <p className="font-medium text-sm">
            Cantidad:{" "}
            <span style={{ color: "#1A6894" }}>{formatNumber(d.total_qty)}</span>
          </p>
        ) : (
          <p className="font-medium text-sm">
            Monto:{" "}
            <span style={{ color: "#008064" }}>{formatCurrency(d.total_amount)}</span>
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
    return <span className="text-xs" style={{ color: '#919291' }}>—</span>;
  }
  const isAlert = days < COVERAGE_ALERT_THRESHOLD;
  // Semáforo: rojo < 5 días | verde 5–10 días | amarillo > 10 días
  const bg = isAlert ? '#BC2C46' : days <= 10 ? '#008064' : '#C49705';
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tabular-nums whitespace-nowrap"
      style={{ backgroundColor: bg, color: '#F5F4F1' }}
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
      value: <span className="font-semibold tabular-nums" style={{ color: "#1A6894" }}>{formatNumber(row.total_qty)}</span>,
    },
    {
      label: "Monto vendido",
      value: <span className="font-semibold tabular-nums" style={{ color: "#008064" }}>{formatCurrency(row.total_amount)}</span>,
    },
    {
      label: "Ticket promedio",
      value: (
        <span className="tabular-nums" style={{ color: "#C49705" }}>
          {row.total_qty > 0 ? formatCurrency(row.total_amount / row.total_qty) : "—"}
        </span>
      ),
    },
    {
      label: "Tiendas",
      value: (
        <span className="flex items-center gap-1">
          <Store className="h-3.5 w-3.5" style={{ color: "#757471" }} />
          {row.branch_count}
        </span>
      ),
    },
    {
      label: "Stock actual",
      value: (
        <span
          className="font-semibold tabular-nums"
          style={{ color: isCoverageAlert ? "#BC2C46" : "#232523" }}
        >
          {formatNumber(Math.round(row.total_stock))}
        </span>
      ),
    },
    {
      label: "Venta diaria promedio",
      value: (
        <span className="tabular-nums" style={{ color: "#757471" }}>
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
      <DialogContent
        className="max-w-sm mx-auto rounded-2xl"
        style={{ fontFamily: "'Sailec', system-ui, sans-serif", backgroundColor: "#F5F4F1" }}
      >
        <DialogHeader className="pb-2">
          {/* Rank badge */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <DialogTitle
                className="text-base font-semibold leading-snug"
                style={{ color: "#232523" }}
              >
                {row.product_name}
              </DialogTitle>
              {row.sku && (
                <p className="text-xs mt-0.5" style={{ color: "#919291" }}>SKU: {row.sku}</p>
              )}
            </div>
            {isCoverageAlert && (
              <span
                className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ backgroundColor: "#BC2C46", color: "#F5F4F1" }}
              >
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
              className="flex items-center justify-between py-2.5 px-1"
              style={{
                borderBottom: i < fields.length - 1 ? "1px solid #EAE8E2" : "none",
              }}
            >
              <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "#919291" }}>
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
    <div className="overflow-x-auto" style={{ fontFamily: "'Sailec', system-ui, sans-serif" }}>
      {alertCount > 0 && (
        <div
          className="flex items-center gap-2 px-4 py-2 text-xs font-medium"
          style={{ backgroundColor: '#BC2C4615', borderBottom: '1px solid #BC2C4630', color: '#BC2C46' }}
        >
          <span className="text-sm">⚠️</span>
          {alertCount} producto{alertCount > 1 ? 's' : ''} con cobertura crítica (&lt; {COVERAGE_ALERT_THRESHOLD} días)
        </div>
      )}
      {/* Modal de detalle (móvil) */}
      <ProductDetailModal row={selectedRow} mode={mode} onClose={() => setSelectedRow(null)} />

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="text-center py-3 px-3 w-12 font-medium">#</th>
            <th className="text-left py-3 px-3 font-medium">Producto</th>
            <th className="text-left py-3 px-3 font-medium hidden md:table-cell">Categoría</th>
            <th className="text-right py-3 px-3 font-medium">
              {mode === "qty" ? "Cantidad" : "Monto (S/)"}
            </th>
            <th className="text-right py-3 px-3 font-medium hidden lg:table-cell">
              {mode === "qty" ? "Monto (S/)" : "Cantidad"}
            </th>
            <th className="text-right py-3 px-3 font-medium hidden xl:table-cell">Stock</th>
            <th className="text-right py-3 px-3 font-medium hidden xl:table-cell">Vta. Diaria</th>
            <th className="text-center py-3 px-3 font-medium">Cobertura</th>
            <th className="text-center py-3 px-3 font-medium hidden lg:table-cell">
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
                className={`border-b border-border/50 transition-colors hover:bg-muted/40 cursor-pointer md:cursor-default ${
                  isCoverageAlert
                    ? 'bg-[#BC2C460A]'
                    : isTop3
                    ? 'bg-muted/20'
                    : ''
                }`}
              >
                {/* Rank */}
                <td className="text-center py-3 px-3">
                  {isTop3 ? (
                    <Trophy
                      className="h-4 w-4 mx-auto"
                      style={{ color: MEDAL_COLORS[row.rank - 1] }}
                    />
                  ) : (
                    <span
                      className="font-mono text-xs"
                      style={{ color: "#919291" }}
                    >
                      {String(row.rank).padStart(2, "0")}
                    </span>
                  )}
                </td>
                {/* Nombre + SKU */}
                <td className="py-3 px-3">
                  <p className="font-medium text-foreground leading-tight line-clamp-2">
                    {row.product_name}
                  </p>
                  {row.sku && (
                    <p className="text-xs mt-0.5" style={{ color: "#919291" }}>
                      SKU: {row.sku}
                    </p>
                  )}
                </td>
                {/* Categoría */}
                <td className="py-3 px-3 hidden md:table-cell">
                  <Badge variant="secondary" className="text-xs font-normal">
                    {row.category_name}
                  </Badge>
                </td>
                {/* Métrica principal */}
                <td className="py-3 px-3 text-right font-semibold tabular-nums text-foreground">
                  {mode === "qty"
                    ? formatNumber(row.total_qty)
                    : formatCurrency(row.total_amount)}
                </td>
                {/* Métrica secundaria */}
                <td
                  className="py-3 px-3 text-right tabular-nums hidden lg:table-cell"
                  style={{ color: "#757471" }}
                >
                  {mode === "qty"
                    ? formatCurrency(row.total_amount)
                    : formatNumber(row.total_qty)}
                </td>
                {/* Stock actual */}
                <td
                  className="py-3 px-3 text-right tabular-nums hidden xl:table-cell"
                  style={{ color: isCoverageAlert ? '#BC2C46' : '#232523', fontWeight: isCoverageAlert ? 600 : 400 }}
                >
                  {formatNumber(Math.round(row.total_stock))}
                </td>
                {/* Venta diaria promedio */}
                <td
                  className="py-3 px-3 text-right tabular-nums hidden xl:table-cell"
                  style={{ color: "#757471" }}
                >
                  {row.avg_daily_qty > 0 ? formatNumber(Math.round(row.avg_daily_qty * 10) / 10) : '—'}
                </td>
                {/* Cobertura */}
                <td className="py-3 px-3 text-center">
                  <CoverageTag days={row.coverage_days} />
                </td>
                {/* Tiendas */}
                <td
                  className="py-3 px-3 text-center hidden lg:table-cell"
                  style={{ color: "#757471" }}
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
    <div style={{ height: chartHeight, fontFamily: "'Sailec', system-ui, sans-serif" }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 4, right: 28, left: isMobile ? 4 : 8, bottom: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            stroke="#EAE8E2"
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
            tick={{ fontSize: 11, fill: "#757471", fontFamily: "'Sailec', system-ui, sans-serif" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={isMobile ? 0 : 190}
            tick={isMobile ? false : { fontSize: 11, fill: "#232523", fontFamily: "'Sailec', system-ui, sans-serif" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<CustomTooltip mode={mode} />}
            cursor={{ fill: "#EAE8E2" }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
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
          <p className="text-xs" style={{ color: "#919291" }}>
            Período: {dateRangeText}
          </p>
        </div>

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-0">
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
            />
          </div>
          <IgvToggle />
        </div>

        {/* ── Cargando ────────────────────────────────────────────────────── */}
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
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${KPI_COLORS.products.bg}1A` }}
                    >
                      <Package className="h-5 w-5" style={{ color: KPI_COLORS.products.bg }} />
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
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${KPI_COLORS.qty.bg}1A` }}
                    >
                      <Hash className="h-5 w-5" style={{ color: KPI_COLORS.qty.bg }} />
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
                        <p className="text-xs truncate" style={{ color: "#919291" }}>
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
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${KPI_COLORS.amount.bg}1A` }}
                    >
                      <DollarSign className="h-5 w-5" style={{ color: KPI_COLORS.amount.bg }} />
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
                        <p className="text-xs truncate" style={{ color: "#919291" }}>
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
