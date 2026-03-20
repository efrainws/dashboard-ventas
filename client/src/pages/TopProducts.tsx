import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { NavigationMenu } from "@/components/NavigationMenu";
import { trpc } from "@/lib/trpc";
import { DashboardFilters } from "@/components/DashboardFilters";
import { useAggregatedSales, type AggregatedSalesFilters } from "@/hooks/useAggregatedSales";
import { useFilters } from "@/contexts/FiltersContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trophy, Hash, DollarSign, Package, Store } from "lucide-react";
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

// ─── Paleta Flora & Fauna ───────────────────────────────────────────────────
const BRAND_COLORS = [
  "#1A6894", "#008064", "#C49705", "#BC2C46",
  "#4A90A4", "#2E8B57", "#D4A017", "#C0392B",
  "#5B9BD5", "#27AE60", "#E67E22", "#E74C3C",
];

const getBarColor = (idx: number) => BRAND_COLORS[idx % BRAND_COLORS.length];

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

// Truncar nombre largo para el eje Y del gráfico
const truncate = (s: string, max = 28) =>
  s.length > max ? s.substring(0, max) + "…" : s;

// ─── Tooltip personalizado ──────────────────────────────────────────────────
function CustomTooltip({ active, payload, mode }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-background border border-border rounded-lg p-3 shadow-lg text-sm space-y-1 max-w-xs">
      <p className="font-semibold text-foreground leading-tight">{d.product_name}</p>
      {d.sku && <p className="text-muted-foreground text-xs">SKU: {d.sku}</p>}
      <p className="text-muted-foreground text-xs">{d.category_name}</p>
      <div className="border-t border-border pt-1 mt-1 space-y-0.5">
        {mode === "qty" ? (
          <p className="font-medium">
            Cantidad: <span className="text-primary">{formatNumber(d.total_qty)}</span>
          </p>
        ) : (
          <p className="font-medium">
            Monto: <span className="text-primary">{formatCurrency(d.total_amount)}</span>
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          {mode === "qty"
            ? `Monto total: ${formatCurrency(d.total_amount)}`
            : `Unidades vendidas: ${formatNumber(d.total_qty)}`}
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
}

function RankingTable({
  rows,
  mode,
}: {
  rows: ProductRow[];
  mode: "qty" | "amount";
}) {
  return (
    <div className="overflow-x-auto">
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
            <th className="text-center py-3 px-3 font-medium hidden lg:table-cell">
              <Store className="h-3.5 w-3.5 inline" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const isTop3 = row.rank <= 3;
            const medalColors = ["text-yellow-500", "text-slate-400", "text-amber-600"];
            return (
              <tr
                key={row.product_id}
                className={`border-b border-border/50 transition-colors hover:bg-muted/40 ${
                  isTop3 ? "bg-primary/5" : ""
                }`}
              >
                {/* Rank */}
                <td className="text-center py-3 px-3">
                  {isTop3 ? (
                    <Trophy
                      className={`h-4 w-4 mx-auto ${medalColors[row.rank - 1]}`}
                    />
                  ) : (
                    <span className="text-muted-foreground font-mono text-xs">
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
                    <p className="text-xs text-muted-foreground mt-0.5">
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
                <td className="py-3 px-3 text-right font-semibold tabular-nums">
                  {mode === "qty"
                    ? formatNumber(row.total_qty)
                    : formatCurrency(row.total_amount)}
                </td>
                {/* Métrica secundaria */}
                <td className="py-3 px-3 text-right text-muted-foreground tabular-nums hidden lg:table-cell">
                  {mode === "qty"
                    ? formatCurrency(row.total_amount)
                    : formatNumber(row.total_qty)}
                </td>
                {/* Tiendas */}
                <td className="py-3 px-3 text-center text-muted-foreground hidden lg:table-cell">
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

// ─── Gráfico horizontal ──────────────────────────────────────────────────────
function HorizontalBarChart({
  rows,
  mode,
}: {
  rows: ProductRow[];
  mode: "qty" | "amount";
}) {
  // Mostrar solo top 20 en el gráfico para legibilidad
  const chartData = rows.slice(0, 20).map((r) => ({
    ...r,
    label: truncate(r.product_name),
    value: mode === "qty" ? r.total_qty : r.total_amount,
  }));

  const chartHeight = Math.max(400, chartData.length * 32);

  return (
    <div style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis
            type="number"
            tickFormatter={(v) =>
              mode === "qty"
                ? formatNumber(v)
                : v >= 1_000_000
                ? `S/ ${(v / 1_000_000).toFixed(1)}M`
                : `S/ ${(v / 1_000).toFixed(0)}K`
            }
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={180}
            tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip mode={mode} />} cursor={{ fill: "hsl(var(--muted))" }} />
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
  const { effectiveTheme } = useTheme();

  const {
    dateRange: globalDateRange,
    setDateRange: setGlobalDateRange,
    branchId: globalBranchId,
    setBranchId: setGlobalBranchId,
  } = useFilters();

  const userRole = user?.role as string | undefined;
  const isStoreUser = userRole === "store_user";
  const assignedStoreCode = (user as any)?.assignedStoreCode as string | null | undefined;

  // ── Filtros ──────────────────────────────────────────────────────────────
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (globalDateRange) return globalDateRange;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);
    return { from: yesterday, to: yesterdayEnd };
  });

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

  // ── Construir filtros para queries ───────────────────────────────────────
  const toDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const queryFilters = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const defaultDate = toDateStr(yesterday);

    return {
      fecha_min: dateRange?.from ? toDateStr(dateRange.from) : defaultDate,
      fecha_max: dateRange?.to ? toDateStr(dateRange.to) : defaultDate,
      ...(selectedBranch !== "all" ? { branch_id: selectedBranch } : {}),
      ...(selectedCategory !== "all" ? { category_id: selectedCategory } : {}),
    };
  }, [dateRange, selectedBranch, selectedCategory]);

  // ── Obtener listas de sucursales y categorías (reutilizando hook existente) ──
  const { metrics } = useAggregatedSales(queryFilters as AggregatedSalesFilters);

  // ── Query principal: Top 50 productos ───────────────────────────────────
  const { data, isLoading, error } = trpc.sales.getTopProducts.useQuery(queryFilters);

  const handleClearFilters = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);
    setDateRange({ from: yesterday, to: yesterdayEnd });
    setSelectedBranch("all");
    setSelectedCategory("all");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const dateRangeText = useMemo(() => {
    if (dateRange?.from && dateRange?.to) {
      return `${dateRange.from.toLocaleDateString("es-PE")} – ${dateRange.to.toLocaleDateString("es-PE")}`;
    }
    return "Ayer (por defecto)";
  }, [dateRange]);

  return (
    <div className="min-h-screen bg-background">
      <NavigationMenu />

      <div className="container py-8 space-y-8">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="space-y-1">
          <h1
            className="text-3xl font-bold tracking-tight uppercase"
            style={{ fontFamily: "Italian Plate No 1, serif" }}
          >
            Top 50 Productos
          </h1>
          <p className="text-muted-foreground">
            Ranking de los 50 mejores productos por cantidad vendida y por monto de ventas
          </p>
          <p className="text-xs text-muted-foreground">
            Período: {dateRangeText}
          </p>
        </div>

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
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

        {/* ── Estado de carga ─────────────────────────────────────────────── */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-lg font-medium">Cargando ranking de productos...</span>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {error && !isLoading && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Error al cargar datos</CardTitle>
              <CardDescription>{error.message}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* ── KPIs rápidos ────────────────────────────────────────────────── */}
        {!isLoading && !error && data && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#1A6894]/10 flex items-center justify-center shrink-0">
                      <Package className="h-5 w-5 text-[#1A6894]" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Productos únicos (top qty)</p>
                      <p className="text-2xl font-bold tabular-nums">
                        {formatNumber(data.byQuantity.length)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#008064]/10 flex items-center justify-center shrink-0">
                      <Hash className="h-5 w-5 text-[#008064]" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Unidades — #1 producto</p>
                      <p className="text-2xl font-bold tabular-nums">
                        {data.byQuantity[0]
                          ? formatNumber(data.byQuantity[0].total_qty)
                          : "—"}
                      </p>
                      {data.byQuantity[0] && (
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {data.byQuantity[0].product_name}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#C49705]/10 flex items-center justify-center shrink-0">
                      <DollarSign className="h-5 w-5 text-[#C49705]" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Monto — #1 producto</p>
                      <p className="text-2xl font-bold tabular-nums">
                        {data.byAmount[0]
                          ? formatCurrency(data.byAmount[0].total_amount)
                          : "—"}
                      </p>
                      {data.byAmount[0] && (
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {data.byAmount[0].product_name}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Tabs: Por Cantidad / Por Monto ──────────────────────────── */}
            <Tabs defaultValue="qty">
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

              {/* ── Tab: Por Cantidad ──────────────────────────────────────── */}
              <TabsContent value="qty" className="space-y-6">
                {data.byQuantity.length === 0 ? (
                  <Card>
                    <CardContent className="py-16 text-center text-muted-foreground">
                      No hay datos para el período y filtros seleccionados.
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Gráfico top 20 */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base font-semibold uppercase tracking-wide" style={{ fontFamily: "Italian Plate No 1, serif" }}>
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

                    {/* Tabla top 50 */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base font-semibold uppercase tracking-wide" style={{ fontFamily: "Italian Plate No 1, serif" }}>
                          Ranking Completo — Top 50 por Cantidad
                        </CardTitle>
                        <CardDescription>
                          {data.byQuantity.length} productos ordenados por unidades vendidas
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        <RankingTable rows={data.byQuantity} mode="qty" />
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>

              {/* ── Tab: Por Monto ─────────────────────────────────────────── */}
              <TabsContent value="amount" className="space-y-6">
                {data.byAmount.length === 0 ? (
                  <Card>
                    <CardContent className="py-16 text-center text-muted-foreground">
                      No hay datos para el período y filtros seleccionados.
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Gráfico top 20 */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base font-semibold uppercase tracking-wide" style={{ fontFamily: "Italian Plate No 1, serif" }}>
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

                    {/* Tabla top 50 */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base font-semibold uppercase tracking-wide" style={{ fontFamily: "Italian Plate No 1, serif" }}>
                          Ranking Completo — Top 50 por Monto
                        </CardTitle>
                        <CardDescription>
                          {data.byAmount.length} productos ordenados por monto de ventas
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
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
