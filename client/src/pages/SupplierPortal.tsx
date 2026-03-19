/**
 * SupplierPortal.tsx
 * Portal exclusivo para usuarios proveedor (supplier_user).
 * Muestra KPIs, tendencia de ventas, top productos, ventas por tienda,
 * stock actual, recepciones y catálogo de productos.
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  TrendingUp,
  Package,
  Store,
  ShoppingCart,
  Layers,
  Search,
  ChevronLeft,
  ChevronRight,
  LogOut,
  AlertTriangle,
  BarChart2,
  Truck,
} from "lucide-react";
import { useState, useMemo } from "react";
import { format, subDays, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(val: string | number | null | undefined): string {
  if (val == null) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtCurrency(val: string | number | null | undefined): string {
  if (val == null) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function defaultFrom() {
  return format(startOfMonth(new Date()), "yyyy-MM-dd");
}
function defaultTo() {
  return format(subDays(new Date(), 1), "yyyy-MM-dd");
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  loading,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  loading?: boolean;
}) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {title}
            </p>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <p className="text-2xl font-bold text-foreground font-heading">{value}</p>
            )}
          </div>
          <div className={`p-2.5 rounded-lg ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Sección: Tabs de navegación ─────────────────────────────────────────────

type Tab = "dashboard" | "productos" | "stock" | "recepciones";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: BarChart2 },
  { id: "productos", label: "Catálogo", icon: Package },
  { id: "stock", label: "Stock", icon: Layers },
  { id: "recepciones", label: "Recepciones", icon: Truck },
];

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SupplierPortal() {
  const { logout, user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [stockSearch, setStockSearch] = useState("");
  const [stockBranchId, setStockBranchId] = useState<string | undefined>(undefined);
  const [stockPage, setStockPage] = useState(0);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogPage, setCatalogPage] = useState(0);
  const [recPage, setRecPage] = useState(0);
  const PAGE_SIZE = 20;

  // Queries
  const { data: supplier, isLoading: supplierLoading } =
    trpc.supplierPortal.getMySupplier.useQuery();

  const { data: summary, isLoading: summaryLoading } =
    trpc.supplierPortal.getSalesSummary.useQuery({ from, to });

  const { data: dailySales, isLoading: dailyLoading } =
    trpc.supplierPortal.getDailySales.useQuery({ from, to });

  const { data: topProducts, isLoading: topLoading } =
    trpc.supplierPortal.getTopProducts.useQuery({ from, to, limit: 10 });

  const { data: salesByBranch, isLoading: branchLoading } =
    trpc.supplierPortal.getSalesByBranch.useQuery({ from, to });

  const { data: monthlySales, isLoading: monthlyLoading } =
    trpc.supplierPortal.getMonthlySales.useQuery();

  const { data: branchesForStock } =
    trpc.supplierPortal.getBranchesForStock.useQuery();

  const { data: stockData, isLoading: stockLoading } =
    trpc.supplierPortal.getStockByProduct.useQuery({
      search: stockSearch || undefined,
      branchId: stockBranchId,
      limit: PAGE_SIZE,
      offset: stockPage * PAGE_SIZE,
    });

  const { data: catalogData, isLoading: catalogLoading } =
    trpc.supplierPortal.getProductCatalog.useQuery({
      search: catalogSearch || undefined,
      limit: PAGE_SIZE,
      offset: catalogPage * PAGE_SIZE,
    });

  const { data: receptionsData, isLoading: recLoading } =
    trpc.supplierPortal.getReceptions.useQuery({
      limit: PAGE_SIZE,
      offset: recPage * PAGE_SIZE,
    });

  // Colores para gráficos
  const CHART_COLORS = [
    "#008064", "#1A6894", "#5BB6B7", "#C49705", "#BC2C46", "#E5BAC1",
  ];

  // Datos de gráfico mensual formateados
  const monthlyChartData = useMemo(() => {
    if (!monthlySales) return [];
    return monthlySales.map((r) => ({
      mes: r.mes.slice(5), // MM
      ventas: parseFloat(r.total_ventas),
      tickets: r.tickets,
    }));
  }, [monthlySales]);

  const dailyChartData = useMemo(() => {
    if (!dailySales) return [];
    return dailySales.map((r) => ({
      fecha: format(new Date(r.fecha), "dd/MM", { locale: es }),
      ventas: parseFloat(r.total_ventas),
      tickets: r.tickets,
    }));
  }, [dailySales]);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            {/* Logo modo claro */}
            <img
              src="/Logonegro.svg"
              alt="Flora & Fauna"
              className="h-6 block dark:hidden"
            />
            {/* Logo modo oscuro */}
            <img
              src="/Logoclarochico.svg"
              alt="Flora & Fauna"
              className="h-6 hidden dark:block"
            />
            <span className="text-xs text-muted-foreground border-l border-border pl-3 hidden sm:block">
              Portal de Proveedores
            </span>
          </div>
          <div className="flex items-center gap-3">
            {supplierLoading ? (
              <Skeleton className="h-10 w-40" />
            ) : (
              <div className="text-right hidden sm:block space-y-0.5">
                {/* Nombre del proveedor: Italian Plate No 1, mayúsculas */}
                <p
                  className="text-xs text-muted-foreground leading-none tracking-wide"
                  style={{ fontFamily: "'Italian Plate No 1', serif", textTransform: "uppercase" }}
                >
                  {supplier?.name}
                </p>
                {/* Nombre del usuario: Sailec, negrita, capitalize */}
                <p
                  className="text-sm font-bold text-foreground leading-none"
                  style={{ fontFamily: "'Sailec', sans-serif", textTransform: "capitalize" }}
                >
                  {user?.name?.toLowerCase()}
                </p>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={logout} className="gap-1.5">
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Tabs de navegación ── */}
      <div className="border-b border-border bg-card">
        <div className="container">
          <nav className="flex gap-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="container py-6 space-y-6">
        {/* ══════════════════════════════════════════════
            TAB: DASHBOARD
        ══════════════════════════════════════════════ */}
        {activeTab === "dashboard" && (
          <>
            {/* Filtro de fechas */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">Desde</label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-36 text-sm h-8"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">Hasta</label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-36 text-sm h-8"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFrom(defaultFrom());
                  setTo(defaultTo());
                }}
              >
                Este mes
              </Button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <KpiCard
                title="Ventas Totales"
                value={fmtCurrency(summary?.total_ventas)}
                icon={TrendingUp}
                color="bg-[var(--ff-esmeralda)]"
                loading={summaryLoading}
              />
              <KpiCard
                title="Tickets"
                value={fmt(summary?.total_tickets)}
                icon={ShoppingCart}
                color="bg-[var(--ff-cobalto)]"
                loading={summaryLoading}
              />
              <KpiCard
                title="Unidades"
                value={fmt(summary?.total_unidades)}
                icon={Package}
                color="bg-[var(--ff-celeste)]"
                loading={summaryLoading}
              />
              <KpiCard
                title="Productos Vendidos"
                value={fmt(summary?.productos_vendidos)}
                icon={Layers}
                color="bg-[var(--ff-mostaza)]"
                loading={summaryLoading}
              />
              <KpiCard
                title="Tiendas Activas"
                value={fmt(summary?.tiendas_activas)}
                icon={Store}
                color="bg-[var(--ff-granate)]"
                loading={summaryLoading}
              />
            </div>

            {/* Gráficos: Tendencia diaria + Ventas por mes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Tendencia diaria */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">
                    Tendencia de Ventas Diarias
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dailyLoading ? (
                    <Skeleton className="h-52 w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={210}>
                      <LineChart data={dailyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="fecha"
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          tickFormatter={(v) => `S/ ${fmt(v)}`}
                          width={70}
                        />
                        <Tooltip
                          formatter={(v: number) => [fmtCurrency(v), "Ventas"]}
                          labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                          contentStyle={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: "0.5rem",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="ventas"
                          stroke="var(--ff-esmeralda)"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Ventas por mes */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">
                    Ventas por Mes (últimos 6 meses)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {monthlyLoading ? (
                    <Skeleton className="h-52 w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={210}>
                      <BarChart data={monthlyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="mes"
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          tickFormatter={(v) => `S/ ${fmt(v)}`}
                          width={70}
                        />
                        <Tooltip
                          formatter={(v: number) => [fmtCurrency(v), "Ventas"]}
                          contentStyle={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: "0.5rem",
                          }}
                        />
                        <Bar dataKey="ventas" fill="var(--ff-cobalto)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top productos + Ventas por tienda */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top 10 productos */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">
                    Top 10 Productos por Ventas
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {topLoading ? (
                    <div className="p-4 space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">#</TableHead>
                            <TableHead className="text-xs">Producto</TableHead>
                            <TableHead className="text-xs text-right">Ventas</TableHead>
                            <TableHead className="text-xs text-right">Uds.</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {topProducts?.map((p, i) => (
                            <TableRow key={p.int_sku}>
                              <TableCell className="text-xs text-muted-foreground w-8">
                                {i + 1}
                              </TableCell>
                              <TableCell className="text-xs max-w-[180px]">
                                <p className="truncate font-medium">{p.producto}</p>
                                <p className="text-muted-foreground">{p.int_sku}</p>
                              </TableCell>
                              <TableCell className="text-xs text-right font-medium">
                                {fmtCurrency(p.total_ventas)}
                              </TableCell>
                              <TableCell className="text-xs text-right">
                                {fmt(p.unidades_vendidas)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {!topProducts?.length && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                                Sin ventas en el período seleccionado
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Ventas por tienda */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">
                    Ventas por Tienda
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {branchLoading ? (
                    <Skeleton className="h-52 w-full" />
                  ) : salesByBranch && salesByBranch.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={salesByBranch.slice(0, 10).map((b) => ({
                          tienda: b.tienda,
                          ventas: parseFloat(b.total_ventas),
                        }))}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickFormatter={(v) => `S/ ${fmt(v)}`}
                        />
                        <YAxis
                          type="category"
                          dataKey="tienda"
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          width={80}
                        />
                        <Tooltip
                          formatter={(v: number) => [fmtCurrency(v), "Ventas"]}
                          contentStyle={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: "0.5rem",
                          }}
                        />
                        <Bar dataKey="ventas" radius={[0, 4, 4, 0]}>
                          {salesByBranch.slice(0, 10).map((_, i) => (
                            <Cell
                              key={i}
                              fill={CHART_COLORS[i % CHART_COLORS.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-52 text-muted-foreground text-sm">
                      Sin ventas en el período seleccionado
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════
            TAB: CATÁLOGO
        ══════════════════════════════════════════════ */}
        {activeTab === "productos" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre o SKU..."
                  value={catalogSearch}
                  onChange={(e) => {
                    setCatalogSearch(e.target.value);
                    setCatalogPage(0);
                  }}
                  className="pl-8 h-9"
                />
              </div>
              {catalogData && (
                <span className="text-sm text-muted-foreground">
                  {catalogData.total} productos
                </span>
              )}
            </div>

            <Card className="border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Stock Total</TableHead>
                        <TableHead className="text-right">Tiendas c/ Stock</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catalogLoading
                        ? Array.from({ length: 8 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell colSpan={5}>
                                <Skeleton className="h-5 w-full" />
                              </TableCell>
                            </TableRow>
                          ))
                        : catalogData?.rows.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium text-sm max-w-[240px]">
                                <p className="truncate">{p.name}</p>
                                {p.description && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {p.description}
                                  </p>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {p.int_sku}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {fmt(p.stock_total)}
                              </TableCell>
                              <TableCell className="text-right">
                                {p.tiendas_con_stock}
                              </TableCell>
                              <TableCell>
                                {p.stock_total === 0 ? (
                                  <Badge variant="destructive" className="text-xs">
                                    Sin stock
                                  </Badge>
                                ) : p.stock_total < 5 ? (
                                  <Badge className="text-xs bg-[var(--ff-mostaza)] text-white">
                                    Stock bajo
                                  </Badge>
                                ) : (
                                  <Badge className="text-xs bg-[var(--ff-esmeralda)] text-white">
                                    En stock
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Paginación catálogo */}
            {catalogData && catalogData.total > PAGE_SIZE && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Mostrando {catalogPage * PAGE_SIZE + 1}–
                  {Math.min((catalogPage + 1) * PAGE_SIZE, catalogData.total)} de{" "}
                  {catalogData.total}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={catalogPage === 0}
                    onClick={() => setCatalogPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(catalogPage + 1) * PAGE_SIZE >= catalogData.total}
                    onClick={() => setCatalogPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            TAB: STOCK
        ══════════════════════════════════════════════ */}
        {activeTab === "stock" && (
          <div className="space-y-4">
            {/* Barra de filtros */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Filtro por producto */}
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre o SKU..."
                  value={stockSearch}
                  onChange={(e) => {
                    setStockSearch(e.target.value);
                    setStockPage(0);
                  }}
                  className="pl-8 h-9"
                />
              </div>

              {/* Filtro por tienda */}
              <Select
                value={stockBranchId ?? "all"}
                onValueChange={(val) => {
                  setStockBranchId(val === "all" ? undefined : val);
                  setStockPage(0);
                }}
              >
                <SelectTrigger className="h-9 w-[200px]">
                  <Store className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Todas las tiendas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las tiendas</SelectItem>
                  {branchesForStock?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Botón limpiar filtros (visible solo si hay algún filtro activo) */}
              {(stockSearch || stockBranchId) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-muted-foreground"
                  onClick={() => {
                    setStockSearch("");
                    setStockBranchId(undefined);
                    setStockPage(0);
                  }}
                >
                  Limpiar filtros
                </Button>
              )}

              {stockData && (
                <span className="text-sm text-muted-foreground ml-auto">
                  {stockData.total} registros
                </span>
              )}
            </div>

            <Card className="border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Tienda</TableHead>
                        <TableHead className="text-right">Stock Actual</TableHead>
                        <TableHead className="text-right">Stock Mín.</TableHead>
                        <TableHead>Alerta</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockLoading
                        ? Array.from({ length: 8 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell colSpan={6}>
                                <Skeleton className="h-5 w-full" />
                              </TableCell>
                            </TableRow>
                          ))
                        : stockData?.rows.map((s, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium text-sm max-w-[200px]">
                                <p className="truncate">{s.producto}</p>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {s.int_sku}
                              </TableCell>
                              <TableCell className="text-sm">{s.tienda}</TableCell>
                              <TableCell className="text-right font-medium">
                                {fmt(s.stock_actual)}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {s.min_stock != null ? fmt(s.min_stock) : "—"}
                              </TableCell>
                              <TableCell>
                                {s.min_stock != null &&
                                s.stock_actual <= s.min_stock ? (
                                  <div className="flex items-center gap-1 text-[var(--ff-mostaza)]">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    <span className="text-xs">Bajo mínimo</span>
                                  </div>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Paginación stock */}
            {stockData && stockData.total > PAGE_SIZE && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Mostrando {stockPage * PAGE_SIZE + 1}–
                  {Math.min((stockPage + 1) * PAGE_SIZE, stockData.total)} de{" "}
                  {stockData.total}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={stockPage === 0}
                    onClick={() => setStockPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(stockPage + 1) * PAGE_SIZE >= stockData.total}
                    onClick={() => setStockPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            TAB: RECEPCIONES
        ══════════════════════════════════════════════ */}
        {activeTab === "recepciones" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Órdenes de Compra / Recepciones
              </h2>
              {receptionsData && (
                <span className="text-sm text-muted-foreground">
                  {receptionsData.total} registros
                </span>
              )}
            </div>

            <Card className="border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>N° OC</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tienda</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Cant. Ordenada</TableHead>
                        <TableHead className="text-right">Cant. Recibida</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recLoading
                        ? Array.from({ length: 8 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell colSpan={7}>
                                <Skeleton className="h-5 w-full" />
                              </TableCell>
                            </TableRow>
                          ))
                        : receptionsData?.rows.map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs font-mono font-medium">
                                {r.oc}
                              </TableCell>
                              <TableCell className="text-sm">
                                {r.fecha
                                  ? format(new Date(r.fecha), "dd/MM/yyyy")
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-sm">{r.tienda}</TableCell>
                              <TableCell className="text-sm max-w-[180px]">
                                <p className="truncate">{r.producto}</p>
                                <p className="text-xs text-muted-foreground">{r.int_sku}</p>
                              </TableCell>
                              <TableCell className="text-right">
                                {fmt(r.ordered_quantity)}
                              </TableCell>
                              <TableCell className="text-right">
                                {r.received_quantity != null
                                  ? fmt(r.received_quantity)
                                  : "—"}
                              </TableCell>
                              <TableCell>
                                {r.status ? (
                                  <Badge className="text-xs bg-[var(--ff-esmeralda)] text-white">
                                    {r.status}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs">
                                    Pendiente
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                      {!recLoading && !receptionsData?.rows.length && (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center text-sm text-muted-foreground py-10"
                          >
                            No hay recepciones registradas en el período
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Paginación recepciones */}
            {receptionsData && receptionsData.total > PAGE_SIZE && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Mostrando {recPage * PAGE_SIZE + 1}–
                  {Math.min((recPage + 1) * PAGE_SIZE, receptionsData.total)} de{" "}
                  {receptionsData.total}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={recPage === 0}
                    onClick={() => setRecPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(recPage + 1) * PAGE_SIZE >= receptionsData.total}
                    onClick={() => setRecPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
