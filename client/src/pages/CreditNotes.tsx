import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { NavigationMenu } from "@/components/NavigationMenu";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Loader2,
  X,
  Store,
  Lock,
  UserCircle2,
  ReceiptText,
  FileX2,
  Banknote,
  TrendingDown,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { useFilters } from "@/contexts/FiltersContext";
import { ReportDiscrepancyButton } from "@/components/ReportDiscrepancyButton";

// ─── helpers ────────────────────────────────────────────────────────────────

function toLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("es-PE").format(n);
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// Color según volumen relativo de NC (sin semáforo de % — aquí menos es mejor)
// Usamos una escala de intensidad neutra basada en la paleta F&F
const NC_COLOR = "#BC2C46"; // Granate — las NC siempre son "negativas"

// ─── tipos ──────────────────────────────────────────────────────────────────

interface StoreRow {
  nombre: string;
  codigo_tienda: string;
  total_nc: number;
  monto_total_nc: number;
  monto_subtotal_nc: number;
}

interface ModalState {
  open: boolean;
  store: StoreRow | null;
}

// ─── sub-componente: modal de detalle por cajero ─────────────────────────────

function CashierDetailModal({
  open,
  store,
  fechaMin,
  fechaMax,
  includeIgv,
  onClose,
}: {
  open: boolean;
  store: StoreRow | null;
  fechaMin: string;
  fechaMax: string;
  includeIgv: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.sales.getCreditNotesByCashier.useQuery(
    {
      fecha_min: fechaMin,
      fecha_max: fechaMax,
      branch_sap_id: store?.codigo_tienda ?? "",
    },
    { enabled: open && !!store?.codigo_tienda }
  );

  const rows = data?.data ?? [];

  const totals = useMemo(() => {
    const total_nc = rows.reduce((s, r) => s + r.total_nc, 0);
    const monto = rows.reduce(
      (s, r) => s + (includeIgv ? r.monto_total_nc : r.monto_subtotal_nc),
      0
    );
    return { total_nc, monto };
  }, [rows, includeIgv]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          <div className="flex items-start gap-3">
            <div
              className="shrink-0 w-1 self-stretch rounded-full"
              style={{ backgroundColor: NC_COLOR }}
            />
            <div className="min-w-0">
              <DialogTitle
                className="text-base font-bold uppercase tracking-wide leading-tight"
                style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}
              >
                {store?.nombre ?? "—"}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Código: {store?.codigo_tienda ?? "—"} · Período: {fechaMin} – {fechaMax}
              </DialogDescription>
            </div>
            {/* KPI compacto */}
            {store && (
              <div className="ml-auto shrink-0 text-right">
                <p
                  className="text-2xl font-bold leading-none"
                  style={{ fontFamily: "Sailec, sans-serif", color: NC_COLOR }}
                >
                  {formatNumber(store.total_nc)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">notas de crédito</p>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Cuerpo scrollable */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <UserCircle2 className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No hay notas de crédito para este período
              </p>
            </div>
          ) : (
            <TooltipProvider delayDuration={300}>
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="pl-4">Cajero</TableHead>
                    <TableHead className="text-right">Cantidad NC</TableHead>
                    <TableHead className="text-right pr-4">
                      Monto ({includeIgv ? "c/ IGV" : "s/ IGV"})
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => {
                    const monto = includeIgv ? row.monto_total_nc : row.monto_subtotal_nc;
                    return (
                      <TableRow
                        key={row.cashier_id ?? idx}
                        className="border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        {/* Nombre del cajero con tooltip del num_doc */}
                        <TableCell className="pl-4 max-w-[220px]">
                          {row.cashier_num_doc ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default truncate block leading-tight">
                                  {row.cashier_name}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Doc: {row.cashier_num_doc}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="truncate block leading-tight text-muted-foreground italic">
                              {row.cashier_name}
                            </span>
                          )}
                        </TableCell>

                        {/* Cantidad NC */}
                        <TableCell
                          className="text-right tabular-nums font-semibold"
                          style={{ color: NC_COLOR }}
                        >
                          {formatNumber(row.total_nc)}
                        </TableCell>

                        {/* Monto */}
                        <TableCell className="text-right tabular-nums pr-4">
                          S/ {formatCurrency(monto)}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Fila de totales */}
                  <TableRow className="border-t-2 border-border font-semibold bg-muted/20">
                    <TableCell className="pl-4 text-sm">Total General</TableCell>
                    <TableCell
                      className="text-right tabular-nums text-sm"
                      style={{ color: NC_COLOR }}
                    >
                      {formatNumber(totals.total_nc)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm pr-4">
                      S/ {formatCurrency(totals.monto)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border/50 shrink-0 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── componente principal ────────────────────────────────────────────────────

export default function CreditNotes() {
  const { user, loading: authLoading } = useAuth();
  const isStoreUser = user?.role === "store_user";
  const assignedStoreCode = (user as any)?.assignedStoreCode as string | null | undefined;
  const { effectiveTheme } = useTheme();

  const {
    dateRange: globalDateRange,
    setDateRange: setGlobalDateRange,
    setBranchId: setGlobalBranchId,
  } = useFilters();

  // Filtros — por defecto: ayer
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (globalDateRange) return globalDateRange;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);
    return { from: yesterday, to: yesterdayEnd };
  });

  const [selectedSapId, setSelectedSapId] = useState<string>("all");
  const [includeIgv, setIncludeIgv] = useState(true);
  const [modal, setModal] = useState<ModalState>({ open: false, store: null });

  useEffect(() => {
    if (isStoreUser && assignedStoreCode) {
      setSelectedSapId(assignedStoreCode);
    }
  }, [isStoreUser, assignedStoreCode]);

  useEffect(() => {
    setGlobalDateRange(dateRange);
  }, [dateRange, setGlobalDateRange]);

  const queryParams = useMemo(() => {
    const fecha_min = dateRange?.from
      ? toLocalDate(dateRange.from)
      : toLocalDate(new Date(Date.now() - 86_400_000));
    const fecha_max = dateRange?.to ? toLocalDate(dateRange.to) : fecha_min;
    return {
      fecha_min,
      fecha_max,
      branch_sap_id: selectedSapId !== "all" ? selectedSapId : undefined,
    };
  }, [dateRange, selectedSapId]);

  const { data: queryData, isLoading, error } =
    trpc.sales.getCreditNotes.useQuery(queryParams);

  // Agrupar por tienda (suma de todos los días del rango)
  const storeData = useMemo<StoreRow[]>(() => {
    if (!queryData?.data) return [];
    const map = new Map<string, StoreRow>();
    for (const row of queryData.data) {
      const key = row.codigo_tienda || row.nombre;
      const existing = map.get(key);
      if (existing) {
        existing.total_nc += row.total_nc;
        existing.monto_total_nc += row.monto_total_nc;
        existing.monto_subtotal_nc += row.monto_subtotal_nc;
      } else {
        map.set(key, { ...row });
      }
    }
    const rows = Array.from(map.values());
    rows.sort((a, b) => {
      const na = parseInt(a.codigo_tienda?.replace(/\D/g, "") || "0", 10);
      const nb = parseInt(b.codigo_tienda?.replace(/\D/g, "") || "0", 10);
      return na - nb;
    });
    return rows;
  }, [queryData]);

  const availableStores = useMemo(() => {
    if (!queryData?.data) return [];
    const seen = new Set<string>();
    const stores: { sap_id: string; nombre: string }[] = [];
    for (const row of queryData.data) {
      if (row.codigo_tienda && !seen.has(row.codigo_tienda)) {
        seen.add(row.codigo_tienda);
        stores.push({ sap_id: row.codigo_tienda, nombre: row.nombre });
      }
    }
    stores.sort((a, b) => {
      const na = parseInt(a.sap_id?.replace(/\D/g, "") || "0", 10);
      const nb = parseInt(b.sap_id?.replace(/\D/g, "") || "0", 10);
      return na - nb;
    });
    return stores;
  }, [queryData]);

  // KPIs globales
  const summary = useMemo(() => {
    const total_nc = storeData.reduce((s, r) => s + r.total_nc, 0);
    const monto = storeData.reduce(
      (s, r) => s + (includeIgv ? r.monto_total_nc : r.monto_subtotal_nc),
      0
    );
    const promedio = storeData.length > 0 ? monto / storeData.length : 0;
    return { total_nc, monto, promedio };
  }, [storeData, includeIgv]);

  const handleClearFilters = () => {
    setDateRange(undefined);
    setSelectedSapId("all");
    setGlobalBranchId(undefined);
  };

  const dateRangeText = useMemo(() => {
    if (dateRange?.from && dateRange?.to) {
      return `${dateRange.from.toLocaleDateString("es-PE")} – ${dateRange.to.toLocaleDateString("es-PE")}`;
    } else if (dateRange?.from) {
      return `Desde ${dateRange.from.toLocaleDateString("es-PE")}`;
    }
    return "Ayer (por defecto)";
  }, [dateRange]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-lg font-medium">Cargando...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationMenu />

      <div className="container py-8 space-y-8">
        {/* ── Header ── */}
        <div className="space-y-2">
          <h1
            className="text-3xl font-bold tracking-tight uppercase"
            style={{ fontFamily: "Italian Plate No 1, serif" }}
          >
            NOTAS DE CRÉDITO
          </h1>
          <p className="text-muted-foreground">
            Detalle de notas de crédito emitidas por tienda en el período seleccionado.{" "}
            <span className="text-xs">Haz clic en una tarjeta para ver el detalle por cajero.</span>
          </p>
          {queryData?.metadata && (
            <p className="text-xs text-muted-foreground">
              Actualizado:{" "}
              {new Date(queryData.metadata.generated_at).toLocaleString("es-PE")} |
              Total registros: {formatNumber(queryData.metadata.total_rows)}
            </p>
          )}
        </div>

        {/* ── Filtros ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-heading uppercase text-base tracking-wide">
                  Filtros
                </CardTitle>
                <CardDescription>
                  Selecciona un rango de fechas y/o tienda para explorar los datos
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleClearFilters}>
                <X className="mr-2 h-4 w-4" />
                Limpiar Filtros
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-4">
              {/* Fecha Inicio */}
              <div className="space-y-2">
                <Label>Fecha Inicio</Label>
                <DatePicker
                  date={dateRange?.from}
                  onDateChange={(from) => setDateRange({ from, to: dateRange?.to })}
                  placeholder="Fecha inicio"
                  maxDate={dateRange?.to ?? new Date()}
                />
              </div>

              {/* Fecha Fin */}
              <div className="space-y-2">
                <Label>Fecha Fin</Label>
                <DatePicker
                  date={dateRange?.to}
                  onDateChange={(to) => setDateRange({ from: dateRange?.from, to })}
                  placeholder="Fecha fin"
                  minDate={dateRange?.from}
                  maxDate={new Date()}
                />
              </div>

              {/* Tienda */}
              <div className="space-y-2">
                <Label htmlFor="store">
                  Tienda
                  {isStoreUser && <Lock className="inline ml-1 h-3 w-3 text-muted-foreground" />}
                </Label>
                {isStoreUser ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/50 text-sm text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {availableStores.find((s) => s.sap_id === assignedStoreCode)?.nombre ??
                        assignedStoreCode ??
                        "Tu tienda"}
                    </span>
                  </div>
                ) : (
                  <Select value={selectedSapId} onValueChange={setSelectedSapId}>
                    <SelectTrigger id="store">
                      <SelectValue placeholder="Todas las tiendas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <span>Todas las tiendas</span>
                      </SelectItem>
                      {availableStores.map((s) => (
                        <SelectItem key={s.sap_id} value={s.sap_id}>
                          <span>
                            {s.nombre} ({s.sap_id})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Toggle IGV */}
              <div className="space-y-2">
                <Label>Montos</Label>
                <div className="flex rounded-md border border-border overflow-hidden h-9">
                  <button
                    onClick={() => setIncludeIgv(true)}
                    className={`flex-1 text-xs font-medium transition-colors ${
                      includeIgv
                        ? "bg-foreground text-background"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Con IGV
                  </button>
                  <button
                    onClick={() => setIncludeIgv(false)}
                    className={`flex-1 text-xs font-medium transition-colors border-l border-border ${
                      !includeIgv
                        ? "bg-foreground text-background"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Sin IGV
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Estado de carga ── */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-lg font-medium">Cargando datos...</span>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Error al cargar datos</CardTitle>
              <CardDescription>{error.message}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {!isLoading && !error && (
          <>
            {/* ── KPIs globales ── */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* Total NC */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Notas de Crédito</CardTitle>
                  <FileX2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div
                    className="text-2xl font-bold"
                    style={{ fontFamily: "Sailec, sans-serif", color: NC_COLOR }}
                  >
                    {formatNumber(summary.total_nc)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{dateRangeText}</p>
                </CardContent>
              </Card>

              {/* Monto total NC */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Monto Total NC ({includeIgv ? "c/ IGV" : "s/ IGV"})
                  </CardTitle>
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div
                    className="text-2xl font-bold"
                    style={{ fontFamily: "Sailec, sans-serif", color: NC_COLOR }}
                  >
                    S/ {formatCurrency(summary.monto)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {storeData.length} tienda{storeData.length !== 1 ? "s" : ""}
                  </p>
                </CardContent>
              </Card>

              {/* Promedio por tienda */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Promedio por Tienda</CardTitle>
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div
                    className="text-2xl font-bold"
                    style={{ fontFamily: "Sailec, sans-serif" }}
                  >
                    S/ {formatCurrency(summary.promedio)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {storeData.length > 0
                      ? `${formatNumber(Math.round(summary.total_nc / storeData.length))} NC/tienda`
                      : "—"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* ── Tarjetas por tienda ── */}
            {storeData.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Store className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">
                    No hay notas de crédito para el período seleccionado
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ajusta el rango de fechas o el filtro de tienda
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <ReceiptText className="h-5 w-5 text-muted-foreground" />
                  <h2
                    className="text-xl font-semibold tracking-tight"
                    style={{ fontFamily: "Italian Plate No 1, serif" }}
                  >
                    DETALLE POR TIENDA
                  </h2>
                  <span className="text-sm text-muted-foreground ml-1">
                    ({storeData.length} tienda{storeData.length !== 1 ? "s" : ""})
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {storeData.map((store) => {
                    const monto = includeIgv
                      ? store.monto_total_nc
                      : store.monto_subtotal_nc;
                    // Proporción del monto respecto al máximo (para barra visual)
                    const maxMonto = Math.max(
                      ...storeData.map((s) =>
                        includeIgv ? s.monto_total_nc : s.monto_subtotal_nc
                      )
                    );
                    const pct = maxMonto > 0 ? (monto / maxMonto) * 100 : 0;

                    return (
                      <Card
                        key={store.codigo_tienda || store.nombre}
                        className="relative overflow-hidden cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                        onClick={() => setModal({ open: true, store })}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setModal({ open: true, store });
                          }
                        }}
                        aria-label={`Ver detalle por cajero de ${store.nombre}`}
                      >
                        {/* Franja de color superior */}
                        <div
                          className="absolute top-0 left-0 right-0 h-1"
                          style={{ backgroundColor: NC_COLOR }}
                        />

                        <CardHeader className="pb-2 pt-5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <CardTitle
                                className="text-sm font-semibold leading-tight truncate"
                                style={{ fontFamily: "Sailec, sans-serif" }}
                                title={store.nombre}
                              >
                                {store.nombre}
                              </CardTitle>
                              <CardDescription className="text-xs mt-0.5">
                                Código: {store.codigo_tienda || "—"}
                              </CardDescription>
                            </div>
                            {/* Cantidad NC */}
                            <div
                              className="shrink-0 text-2xl font-bold leading-none"
                              style={{ fontFamily: "Sailec, sans-serif", color: NC_COLOR }}
                            >
                              {formatNumber(store.total_nc)}
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-3">
                          {/* Barra de proporción relativa */}
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(pct, 100)}%`,
                                backgroundColor: NC_COLOR,
                              }}
                            />
                          </div>

                          {/* Métricas */}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">Cantidad NC</p>
                              <p
                                className="font-semibold"
                                style={{ fontFamily: "Sailec, sans-serif", color: NC_COLOR }}
                              >
                                {formatNumber(store.total_nc)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Monto ({includeIgv ? "c/ IGV" : "s/ IGV"})
                              </p>
                              <p
                                className="font-semibold"
                                style={{ fontFamily: "Sailec, sans-serif" }}
                              >
                                S/ {formatCurrency(monto)}
                              </p>
                            </div>
                          </div>

                          {/* Indicador de drill-down */}
                          <p className="text-xs text-muted-foreground/60 text-right leading-none">
                            Ver por cajero ›
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Modal de detalle por cajero ── */}
      <CashierDetailModal
        open={modal.open}
        store={modal.store}
        fechaMin={queryParams.fecha_min}
        fechaMax={queryParams.fecha_max}
        includeIgv={includeIgv}
        onClose={() => setModal({ open: false, store: null })}
      />

      {/* Botón flotante de reporte de discrepancias */}
      <ReportDiscrepancyButton
        variant="fab"
        context={{
          module: "credit-notes",
          dateFrom: queryParams.fecha_min,
          dateTo: queryParams.fecha_max,
          storeId: selectedSapId !== "all" ? selectedSapId : undefined,
          storeName:
            selectedSapId !== "all"
              ? availableStores.find((s) => s.sap_id === selectedSapId)?.nombre
              : undefined,
        }}
      />
    </div>
  );
}
