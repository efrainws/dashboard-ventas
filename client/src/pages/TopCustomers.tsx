import { useTheme } from "@/contexts/ThemeContext";
import { NavigationMenu } from "@/components/NavigationMenu";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Trophy,
  LayoutGrid,
  LayoutList,
  Store,
  TrendingUp,
} from "lucide-react";
import { useState, useMemo } from "react";
import { ReportDiscrepancyButton } from "@/components/ReportDiscrepancyButton";

// ─── helpers ────────────────────────────────────────────────────────────────

function toLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtNumber(n: number) {
  return new Intl.NumberFormat("es-PE").format(n);
}

/** Medalla de posición */
function MedalBadge({ pos }: { pos: number }) {
  if (pos === 1) return <span className="text-base">🥇</span>;
  if (pos === 2) return <span className="text-base">🥈</span>;
  if (pos === 3) return <span className="text-base">🥉</span>;
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold"
      style={{ background: "#1A6894", color: "#fff", fontFamily: "Sailec, sans-serif" }}
    >
      {pos}
    </span>
  );
}

/** Barra de porcentaje */
function PctBar({ pct }: { pct: number }) {
  const color = pct >= 10 ? "#BC2C46" : pct >= 5 ? "#C49705" : "#008064";
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(pct * 5, 100)}%`, background: color }}
        />
      </div>
      <span className="text-xs tabular-nums font-medium" style={{ color, fontFamily: "Sailec, sans-serif" }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── tipos ──────────────────────────────────────────────────────────────────

interface CustomerRow {
  codigo_tienda: string;
  nombre_tienda: string;
  customer_id: string | null;
  customer_name: string;
  monto: number;
  transacciones: number;
  total_tienda: number;
  txn_tienda: number;
  pct_tienda: number;
  rn: number;
}

interface GeneralRow {
  customer_id: string | null;
  customer_name: string;
  monto_total: number;
  total_transacciones: number;
  monto_promedio_mes: number;
  txn_promedio_mes: number;
  tiendas: string[];
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function TopCustomers() {
  const { theme } = useTheme();
  // ── Fechas por defecto: últimos 30 días ──
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const [from, setFrom] = useState<Date>(thirtyDaysAgo);
  const [to, setTo] = useState<Date>(today);
  const [topN, setTopN] = useState<number>(10);
  const [includeIgv, setIncludeIgv] = useState(true);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const fechaMin = toLocalDate(from);
  const fechaMax = toLocalDate(to);

  // Límite de tarjetas: máximo 20 en modo cards
  const effectiveTopN = viewMode === "cards" ? Math.min(topN, 20) : topN;

  // ── Queries ──
  const { data: byBranchData, isLoading: loadingCards } =
    trpc.sales.getTopCustomersByBranch.useQuery(
      { fecha_min: fechaMin, fecha_max: fechaMax, top_n: effectiveTopN, include_igv: includeIgv },
      { enabled: viewMode === "cards" }
    );

  const { data: generalData, isLoading: loadingGeneral } =
    trpc.sales.getTopCustomersGeneral.useQuery(
      { fecha_min: fechaMin, fecha_max: fechaMax, top_n: topN, include_igv: includeIgv },
      { enabled: viewMode === "table" }
    );

  // ── Agrupar filas por tienda para las tarjetas ──
  const storeCards = useMemo(() => {
    const rows: CustomerRow[] = byBranchData?.data ?? [];
    const map = new Map<string, { nombre: string; codigo: string; total: number; txn: number; customers: CustomerRow[] }>();
    for (const r of rows) {
      if (!map.has(r.codigo_tienda)) {
        map.set(r.codigo_tienda, {
          nombre: r.nombre_tienda,
          codigo: r.codigo_tienda,
          total: r.total_tienda,
          txn: r.txn_tienda,
          customers: [],
        });
      }
      map.get(r.codigo_tienda)!.customers.push(r);
    }
    return Array.from(map.values()).sort((a, b) => {
      const na = parseInt(a.codigo.replace(/\D/g, "") || "9999");
      const nb = parseInt(b.codigo.replace(/\D/g, "") || "9999");
      return na - nb;
    });
  }, [byBranchData]);

  const generalRows: GeneralRow[] = generalData?.data ?? [];

  // ── KPIs globales (modo cards) ──
  const kpis = useMemo(() => {
    const rows: CustomerRow[] = byBranchData?.data ?? [];
    const uniqueCustomers = new Set(rows.map((r) => r.customer_id)).size;
    const totalMonto = rows.reduce((s, r) => (r.rn === 1 ? s + r.total_tienda : s), 0);
    const topMonto = rows.reduce((s, r) => s + r.monto, 0);
    return { uniqueCustomers, totalMonto, topMonto };
  }, [byBranchData]);

  return (
    <div className={`min-h-screen bg-background ${theme}`}>
      <NavigationMenu />

      <main className="container py-6 space-y-6">
        {/* ── Encabezado ── */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5" style={{ color: "#C49705" }} />
            <h1
              className="text-2xl font-bold tracking-tight uppercase"
              style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}
            >
              Top Clientes
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Clientes con mayor monto de compra por tienda en el período seleccionado.
          </p>
        </div>

        {/* ── Filtros ── */}
        <Card className="border border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-4 items-end">
              {/* Fecha inicio */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Fecha inicio</Label>
                <DatePicker
                  date={from}
                  onDateChange={(d) => d && setFrom(d)}
                  maxDate={to}
                />
              </div>

              {/* Fecha fin */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Fecha fin</Label>
                <DatePicker
                  date={to}
                  onDateChange={(d) => d && setTo(d)}
                  minDate={from}
                  maxDate={today}
                />
              </div>

              {/* Top N */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Top clientes</Label>
                <Select
                  value={String(topN)}
                  onValueChange={(v) => setTopN(Number(v))}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">Top 10</SelectItem>
                    <SelectItem value="20">Top 20</SelectItem>
                    <SelectItem value="50">Top 50</SelectItem>
                    <SelectItem value="100">Top 100</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Toggle IGV */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Montos</Label>
                <div className="flex items-center gap-2 h-9">
                  <span className="text-xs text-muted-foreground">Sin IGV</span>
                  <Switch checked={includeIgv} onCheckedChange={setIncludeIgv} />
                  <span className="text-xs font-medium">Con IGV</span>
                </div>
              </div>

              {/* Vista */}
              <div className="flex flex-col gap-1 ml-auto">
                <Label className="text-xs text-muted-foreground">Vista</Label>
                <div className="flex items-center border border-border rounded-md overflow-hidden h-9">
                  <button
                    onClick={() => setViewMode("cards")}
                    className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium transition-colors ${
                      viewMode === "cards"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Tarjetas
                  </button>
                  <button
                    onClick={() => setViewMode("table")}
                    className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium transition-colors ${
                      viewMode === "table"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <LayoutList className="h-3.5 w-3.5" />
                    Tabla
                  </button>
                </div>
              </div>

              <ReportDiscrepancyButton
                context={{
                  module: "top-customers",
                  dateFrom: fechaMin,
                  dateTo: fechaMax,
                }}
              />
            </div>

            {/* Aviso de límite en modo tarjetas */}
            {viewMode === "cards" && topN > 20 && (
              <p className="mt-2 text-xs text-muted-foreground italic">
                En modo tarjetas se muestran máximo 20 clientes por tienda. Cambia a vista Tabla para ver los {topN} clientes completos.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── KPIs (solo modo tarjetas) ── */}
        {viewMode === "cards" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border border-border/60">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: "#C49705" + "20" }}>
                  <Trophy className="h-5 w-5" style={{ color: "#C49705" }} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Clientes únicos en Top</p>
                  <p className="text-2xl font-bold" style={{ fontFamily: "Sailec, sans-serif" }}>
                    {loadingCards ? "—" : fmtNumber(kpis.uniqueCustomers)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-border/60">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: "#008064" + "20" }}>
                  <TrendingUp className="h-5 w-5" style={{ color: "#008064" }} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Venta total (todas las tiendas)</p>
                  <p className="text-2xl font-bold" style={{ fontFamily: "Sailec, sans-serif", color: "#008064" }}>
                    {loadingCards ? "—" : `S/ ${fmtCurrency(kpis.totalMonto)}`}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-border/60">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: "#1A6894" + "20" }}>
                  <Store className="h-5 w-5" style={{ color: "#1A6894" }} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Monto acumulado Top clientes</p>
                  <p className="text-2xl font-bold" style={{ fontFamily: "Sailec, sans-serif", color: "#1A6894" }}>
                    {loadingCards ? "—" : `S/ ${fmtCurrency(kpis.topMonto)}`}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            MODO TARJETAS
        ══════════════════════════════════════════════════════════════════ */}
        {viewMode === "cards" && (
          <>
            {loadingCards ? (
              <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Cargando datos...</span>
              </div>
            ) : storeCards.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No se encontraron datos para el período seleccionado.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {storeCards.map((store) => (
                  <Card
                    key={store.codigo}
                    className="border border-border/60 hover:shadow-md transition-shadow"
                  >
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle
                            className="text-sm font-bold uppercase tracking-wide leading-tight truncate"
                            style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}
                          >
                            {store.nombre}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Cód. {store.codigo} · {fmtNumber(store.txn)} txn · S/ {fmtCurrency(store.total)}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className="shrink-0 text-xs"
                          style={{ borderColor: "#C49705", color: "#C49705" }}
                        >
                          Top {store.customers.length}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="px-4 pb-4">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/40">
                            <TableHead className="py-1.5 px-2 text-xs w-8">#</TableHead>
                            <TableHead className="py-1.5 px-2 text-xs">Cliente</TableHead>
                            <TableHead className="py-1.5 px-2 text-xs text-right">Monto</TableHead>
                            <TableHead className="py-1.5 px-2 text-xs text-right">Txn</TableHead>
                            <TableHead className="py-1.5 px-2 text-xs text-right">%</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {store.customers.map((c) => (
                            <TableRow key={c.customer_id ?? c.rn} className="border-border/30">
                              <TableCell className="py-1.5 px-2 text-xs">
                                <MedalBadge pos={c.rn} />
                              </TableCell>
                              <TableCell className="py-1.5 px-2 text-xs max-w-[140px]">
                                <span className="block truncate font-medium" title={c.customer_name}>
                                  {c.customer_name}
                                </span>
                              </TableCell>
                              <TableCell
                                className="py-1.5 px-2 text-xs text-right tabular-nums font-medium"
                                style={{ color: "#008064" }}
                              >
                                {fmtCurrency(c.monto)}
                              </TableCell>
                              <TableCell className="py-1.5 px-2 text-xs text-right tabular-nums text-muted-foreground">
                                {fmtNumber(c.transacciones)}
                              </TableCell>
                              <TableCell className="py-1.5 px-2 text-xs text-right tabular-nums">
                                <span
                                  className="font-medium"
                                  style={{
                                    color: c.pct_tienda >= 10 ? "#BC2C46" : c.pct_tienda >= 5 ? "#C49705" : "#008064",
                                  }}
                                >
                                  {c.pct_tienda.toFixed(1)}%
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            MODO TABLA GENERAL
        ══════════════════════════════════════════════════════════════════ */}
        {viewMode === "table" && (
          <Card className="border border-border/60">
            <CardHeader className="pb-2 pt-4">
              <CardTitle
                className="text-sm font-bold uppercase tracking-wide"
                style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}
              >
                Top {topN} Clientes — Período {fechaMin} al {fechaMax}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {loadingGeneral ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : generalRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No se encontraron datos para el período seleccionado.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/50">
                        <TableHead className="w-8 text-xs">#</TableHead>
                        <TableHead className="text-xs">Cliente</TableHead>
                        <TableHead className="text-xs text-right">Monto Total</TableHead>
                        <TableHead className="text-xs text-right">Transacciones</TableHead>
                        <TableHead className="text-xs text-right">Monto Prom./Mes</TableHead>
                        <TableHead className="text-xs text-right">Txn Prom./Mes</TableHead>
                        <TableHead className="text-xs">Tiendas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {generalRows.map((r, i) => (
                        <TableRow key={r.customer_id ?? i} className="border-border/30">
                          <TableCell className="text-xs text-muted-foreground">
                            <MedalBadge pos={i + 1} />
                          </TableCell>
                          <TableCell className="text-sm font-medium max-w-[200px]">
                            <span className="block truncate" title={r.customer_name}>
                              {r.customer_name}
                            </span>
                          </TableCell>
                          <TableCell
                            className="text-sm text-right tabular-nums font-semibold"
                            style={{ color: "#008064" }}
                          >
                            S/ {fmtCurrency(r.monto_total)}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums text-muted-foreground">
                            {fmtNumber(r.total_transacciones)}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            S/ {fmtCurrency(r.monto_promedio_mes)}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums text-muted-foreground">
                            {r.txn_promedio_mes.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-xs max-w-[220px]">
                            <div className="flex flex-wrap gap-1">
                              {r.tiendas.slice(0, 4).map((t) => (
                                <Badge
                                  key={t}
                                  variant="outline"
                                  className="text-xs py-0 px-1.5 h-5"
                                >
                                  {t}
                                </Badge>
                              ))}
                              {r.tiendas.length > 4 && (
                                <Badge variant="secondary" className="text-xs py-0 px-1.5 h-5">
                                  +{r.tiendas.length - 4}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
