import { useAuth } from "@/_core/hooks/useAuth";
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
  Users,
  ShoppingCart,
  UserCheck,
  TrendingUp,
  Store,
  Lock,
  UserCircle2,
} from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import type { DateRange } from "react-day-picker";
import { ReportDiscrepancyButton } from "@/components/ReportDiscrepancyButton";
import { AppliedFilterActions } from "@/components/AppliedFilterActions";
import { useTemporalUrlState } from "@/hooks/useTemporalUrlState";
import { isRangeValid } from "@shared/temporalFilterState";

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

/** Color de la barra de porcentaje según la paleta F&F */
function percentColor(pct: number): string {
  if (pct < 75) return "#BC2C46";   // Granate
  if (pct < 90) return "#C49705";   // Mostaza
  if (pct < 100) return "#1A6894";  // Cobalto
  return "#008064";                  // Esmeralda
}

interface IdentifiedTransactionControls {
  sapId: string;
}

function identifiedTransactionControlsFromSearch(search: string): IdentifiedTransactionControls {
  const sapId = new URLSearchParams(search).get("branch_sap_id")?.trim();
  return { sapId: sapId || "all" };
}

function isoToLocalDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

// ─── tipos ──────────────────────────────────────────────────────────────────

interface StoreRow {
  nombre: string;
  codigo_tienda: string;
  total_transactions: number;
  identified_transactions: number;
  identified_percentage: number;
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
  onClose,
}: {
  open: boolean;
  store: StoreRow | null;
  fechaMin: string;
  fechaMax: string;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.sales.getIdentifiedTransactionsByCashier.useQuery(
    {
      fecha_min: fechaMin,
      fecha_max: fechaMax,
      branch_sap_id: store?.codigo_tienda ?? "",
    },
    { enabled: open && !!store?.codigo_tienda }
  );

  const rows = data?.data ?? [];

  // Totales de la tabla
  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.total_transactions, 0);
    const identified = rows.reduce((s, r) => s + r.identified_transactions, 0);
    const pct = total > 0 ? Math.round((identified / total) * 10000) / 100 : 0;
    return { total, identified, pct };
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          <div className="flex items-start gap-3">
            <div
              className="shrink-0 w-1 self-stretch rounded-full"
              style={{ backgroundColor: store ? percentColor(store.identified_percentage) : "#1A6894" }}
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
                  style={{
                    fontFamily: "Sailec, sans-serif",
                    color: percentColor(store.identified_percentage),
                  }}
                >
                  {store.identified_percentage.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">identificación</p>
              </div>
            )}
          </div>

          {/* Barra de progreso de la tienda */}
          {store && (
            <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(store.identified_percentage, 100)}%`,
                  backgroundColor: percentColor(store.identified_percentage),
                }}
              />
            </div>
          )}
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
                No hay datos de cajeros para este período
              </p>
            </div>
          ) : (
            <TooltipProvider delayDuration={300}>
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="pl-4">Cajero</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Identificadas</TableHead>
                    <TableHead className="text-right">Sin Ident.</TableHead>
                    <TableHead className="text-right pr-4">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => (
                    <TableRow
                      key={row.cashier_id ?? idx}
                      className="border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      {/* Nombre del cajero con tooltip del num_doc */}
                      <TableCell className="pl-4 max-w-[200px]">
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

                      {/* Total */}
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.total_transactions)}
                      </TableCell>

                      {/* Identificadas */}
                      <TableCell
                        className="text-right tabular-nums font-medium"
                        style={{ color: percentColor(row.identified_percentage) }}
                      >
                        {formatNumber(row.identified_transactions)}
                      </TableCell>

                      {/* Sin identificar */}
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatNumber(row.total_transactions - row.identified_transactions)}
                      </TableCell>

                      {/* Porcentaje con mini-barra */}
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(row.identified_percentage, 100)}%`,
                                backgroundColor: percentColor(row.identified_percentage),
                              }}
                            />
                          </div>
                          <span
                            className="tabular-nums font-semibold text-xs"
                            style={{ color: percentColor(row.identified_percentage) }}
                          >
                            {row.identified_percentage.toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Fila de totales */}
                  <TableRow className="border-t-2 border-border font-semibold bg-muted/20">
                    <TableCell className="pl-4 text-sm">Total General</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {formatNumber(totals.total)}
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums text-sm"
                      style={{ color: percentColor(totals.pct) }}
                    >
                      {formatNumber(totals.identified)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                      {formatNumber(totals.total - totals.identified)}
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <span
                        className="tabular-nums font-bold text-sm"
                        style={{ color: percentColor(totals.pct) }}
                      >
                        {totals.pct.toFixed(1)}%
                      </span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
        </div>

        {/* Footer con botón cerrar */}
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

export default function IdentifiedTransactions() {
  const { user, loading: authLoading } = useAuth();
  const temporal = useTemporalUrlState("P09");
  const isStoreUser = user?.role === 'store_user';
  const assignedStoreCode = (user as any)?.assignedStoreCode as string | null | undefined;

  // El borrador no consulta ni cambia la URL. El estado aplicado se reconstruye desde URL.
  const [draftControls, setDraftControls] = useState<IdentifiedTransactionControls>(() =>
    identifiedTransactionControlsFromSearch(window.location.search),
  );
  const [appliedControls, setAppliedControls] = useState<IdentifiedTransactionControls>(() =>
    identifiedTransactionControlsFromSearch(window.location.search),
  );
  const draftDateRange = useMemo<DateRange>(() => ({
    from: isoToLocalDate(temporal.draft.primary.start),
    to: isoToLocalDate(temporal.draft.primary.end),
  }), [temporal.draft.primary.start, temporal.draft.primary.end]);

  // Estado del modal
  const [modal, setModal] = useState<ModalState>({ open: false, store: null });

  // Las restricciones de tienda por rol prevalecen sobre cualquier parámetro de URL.
  useEffect(() => {
    if (isStoreUser && assignedStoreCode) {
      const restricted = { sapId: assignedStoreCode };
      setDraftControls(restricted);
      setAppliedControls(restricted);
    }
  }, [isStoreUser, assignedStoreCode]);

  useEffect(() => {
    const syncControlsFromUrl = () => {
      const next = identifiedTransactionControlsFromSearch(window.location.search);
      const controls = isStoreUser && assignedStoreCode ? { sapId: assignedStoreCode } : next;
      setDraftControls(controls);
      setAppliedControls(controls);
    };
    window.addEventListener("popstate", syncControlsFromUrl);
    return () => window.removeEventListener("popstate", syncControlsFromUrl);
  }, [isStoreUser, assignedStoreCode]);

  const setDraftDateRange = (range: DateRange | undefined) => {
    if (!range?.from || !range.to) return;
    const { from, to } = range;
    temporal.setDraft(current => ({
      ...current,
      primary: { start: toLocalDate(from), end: toLocalDate(to) },
    }));
  };

  const applyFilters = () => {
    if (!isRangeValid(temporal.draft.primary)) {
      temporal.setIssue("Selecciona un rango de fechas válido.");
      return;
    }
    const nextControls = isStoreUser && assignedStoreCode
      ? { sapId: assignedStoreCode }
      : draftControls;
    const params = new URLSearchParams(window.location.search);
    params.delete("branch_sap_id");
    if (!isStoreUser && nextControls.sapId !== "all") {
      params.set("branch_sap_id", nextControls.sapId);
    }
    temporal.apply(params);
    setDraftControls(nextControls);
    setAppliedControls(nextControls);
  };

  const handleResetFilters = () => {
    const nextTemporal = temporal.reset();
    const nextControls = isStoreUser && assignedStoreCode
      ? { sapId: assignedStoreCode }
      : { sapId: "all" };
    const params = new URLSearchParams(window.location.search);
    params.delete("branch_sap_id");
    temporal.applyState(nextTemporal, params);
    setDraftControls(nextControls);
    setAppliedControls(nextControls);
  };

  const hasPendingChanges = temporal.hasPendingChanges ||
    JSON.stringify(draftControls) !== JSON.stringify(appliedControls);

  // Construir parámetros de la query
  const queryParams = useMemo(() => {
    return {
      fecha_min: temporal.applied.primary.start,
      fecha_max: temporal.applied.primary.end,
      branch_sap_id: appliedControls.sapId !== "all" ? appliedControls.sapId : undefined,
    };
  }, [temporal.applied.primary.start, temporal.applied.primary.end, appliedControls.sapId]);

  const { data: queryData, isLoading, isFetching, error } = trpc.sales.getIdentifiedTransactions.useQuery(queryParams);
  const lastQueryData = useRef<typeof queryData>(undefined);

  useEffect(() => {
    if (queryData) lastQueryData.current = queryData;
  }, [queryData]);

  // React Query puede retirar data al cambiar la clave; se conserva la última respuesta visible.
  const displayedQueryData = queryData ?? lastQueryData.current;
  const isInitialLoading = isLoading && !displayedQueryData;

  // Agrupar filas por tienda (suma de todos los días del rango)
  const storeData = useMemo<StoreRow[]>(() => {
    if (!displayedQueryData?.data) return [];

    const map = new Map<string, StoreRow>();
    for (const row of displayedQueryData.data) {
      const key = row.codigo_tienda || row.nombre;
      const existing = map.get(key);
      if (existing) {
        existing.total_transactions += row.total_transactions;
        existing.identified_transactions += row.identified_transactions;
      } else {
        map.set(key, {
          nombre: row.nombre,
          codigo_tienda: row.codigo_tienda,
          total_transactions: row.total_transactions,
          identified_transactions: row.identified_transactions,
          identified_percentage: 0, // se recalcula abajo
        });
      }
    }

    // Recalcular porcentaje y ordenar por codigo_tienda numérico
    const rows = Array.from(map.values()).map((r) => ({
      ...r,
      identified_percentage:
        r.total_transactions > 0
          ? Math.round((r.identified_transactions / r.total_transactions) * 10000) / 100
          : 0,
    }));

    rows.sort((a, b) => {
      const na = parseInt(a.codigo_tienda?.replace(/\D/g, "") || "0", 10);
      const nb = parseInt(b.codigo_tienda?.replace(/\D/g, "") || "0", 10);
      return na - nb;
    });

    return rows;
  }, [displayedQueryData]);

  // Lista de tiendas disponibles para el filtro (extraída de los datos)
  const availableStores = useMemo(() => {
    if (!displayedQueryData?.data) return [];
    const seen = new Set<string>();
    const stores: { sap_id: string; nombre: string }[] = [];
    for (const row of displayedQueryData.data) {
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
  }, [displayedQueryData]);

  // Resumen consolidado
  const summary = useMemo(() => {
    const total = storeData.reduce((s, r) => s + r.total_transactions, 0);
    const identified = storeData.reduce((s, r) => s + r.identified_transactions, 0);
    const pct = total > 0 ? Math.round((identified / total) * 10000) / 100 : 0;
    return { total, identified, pct };
  }, [storeData]);

  const dateRangeText = useMemo(() => {
    const from = isoToLocalDate(temporal.applied.primary.start);
    const to = isoToLocalDate(temporal.applied.primary.end);
    return `${from.toLocaleDateString("es-PE")} – ${to.toLocaleDateString("es-PE")}`;
  }, [temporal.applied.primary.start, temporal.applied.primary.end]);

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
            TRANSACCIONES IDENTIFICADAS
          </h1>
          <p className="text-muted-foreground">
            Porcentaje de identificación de clientes por tienda en el período seleccionado. {" "}
            <span className="text-xs">
              {isStoreUser ? "Usa Ver cajeros para abrir el detalle de tu tienda." : "Haz clic en una tarjeta para ver el detalle por cajero."}
            </span>
          </p>
          {displayedQueryData?.metadata && (
            <p className="text-xs text-muted-foreground">
              Actualizado:{" "}
              {new Date(displayedQueryData.metadata.generated_at).toLocaleString("es-PE")} |
              Total registros: {formatNumber(displayedQueryData.metadata.total_rows)}
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
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              {/* Fecha Inicio */}
              <div className="space-y-2">
                <Label>Fecha Inicio</Label>
                <DatePicker
                  date={draftDateRange.from}
                  onDateChange={(from) => setDraftDateRange({ from, to: draftDateRange.to })}
                  placeholder="Fecha inicio"
                  maxDate={draftDateRange.to ?? new Date()}
                />
              </div>

              {/* Fecha Fin */}
              <div className="space-y-2">
                <Label>Fecha Fin</Label>
                <DatePicker
                  date={draftDateRange.to}
                  onDateChange={(to) => setDraftDateRange({ from: draftDateRange.from, to })}
                  placeholder="Fecha fin"
                  minDate={draftDateRange.from}
                  maxDate={new Date()}
                />
              </div>

              {/* Tienda — bloqueado para store_user */}
              <div className="space-y-2">
                <Label htmlFor="store">
                  Tienda
                  {isStoreUser && <Lock className="inline ml-1 h-3 w-3 text-muted-foreground" />}
                </Label>
                {isStoreUser ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/50 text-sm text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span>{availableStores.find(s => s.sap_id === assignedStoreCode)?.nombre ?? assignedStoreCode ?? 'Tu tienda'}</span>
                  </div>
                ) : (
                  <Select
                    value={draftControls.sapId}
                    onValueChange={(sapId) => setDraftControls(current => ({ ...current, sapId }))}
                  >
                    <SelectTrigger id="store">
                      <SelectValue placeholder="Todas las tiendas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all"><span>Todas las tiendas</span></SelectItem>
                      {availableStores.map((s) => (
                        <SelectItem key={s.sap_id} value={s.sap_id}><span>
                          {s.nombre} ({s.sap_id})
                        </span></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            {temporal.issue && (
              <p className="mt-4 text-sm text-destructive" role="alert">{temporal.issue}</p>
            )}
            <AppliedFilterActions
              onApply={applyFilters}
              onReset={handleResetFilters}
              isPending={hasPendingChanges}
              isApplying={isFetching}
            />
          </CardContent>
        </Card>

        {/* La primera carga ocupa el área de resultados; en recargas se mantienen los datos anteriores. */}
        {isInitialLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-lg font-medium">Cargando datos...</span>
          </div>
        )}

        {isFetching && !isInitialLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            Actualizando resultados…
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

        {!isInitialLoading && !error && (
          <>
            {/* ── Resumen consolidado ── */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* Total transacciones */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Transacciones</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" style={{ fontFamily: "Sailec, sans-serif" }}>
                    {formatNumber(summary.total)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{dateRangeText}</p>
                </CardContent>
              </Card>

              {/* Transacciones identificadas */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Transacciones Identificadas</CardTitle>
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" style={{ fontFamily: "Sailec, sans-serif" }}>
                    {formatNumber(summary.identified)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatNumber(summary.total - summary.identified)} sin identificar
                  </p>
                </CardContent>
              </Card>

              {/* Porcentaje global */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">% Global de Identificación</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div
                    className="text-4xl font-bold"
                    style={{
                      fontFamily: "Sailec, sans-serif",
                      color: percentColor(summary.pct),
                    }}
                  >
                    {summary.pct.toFixed(1)}%
                  </div>
                  {/* Barra de progreso */}
                  <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(summary.pct, 100)}%`,
                        backgroundColor: percentColor(summary.pct),
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {storeData.length} tienda{storeData.length !== 1 ? "s" : ""} en el período
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
                    No hay datos para el período seleccionado
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ajusta el rango de fechas o el filtro de tienda
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
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

                {isStoreUser ? (
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="pl-4">Tienda</TableHead>
                            <TableHead>Código</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right">Identificadas</TableHead>
                            <TableHead className="text-right">Sin identificar</TableHead>
                            <TableHead className="text-right">Identificación</TableHead>
                            <TableHead className="w-28 pr-4" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {storeData.map((store) => (
                            <TableRow key={store.codigo_tienda || store.nombre}>
                              <TableCell className="pl-4 font-medium">{store.nombre}</TableCell>
                              <TableCell className="text-muted-foreground">{store.codigo_tienda || "—"}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatNumber(store.total_transactions)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatNumber(store.identified_transactions)}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {formatNumber(store.total_transactions - store.identified_transactions)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-semibold" style={{ color: percentColor(store.identified_percentage) }}>
                                {store.identified_percentage.toFixed(1)}%
                              </TableCell>
                              <TableCell className="pr-4 text-right">
                                <Button variant="outline" size="sm" onClick={() => setModal({ open: true, store })}>
                                  Ver cajeros
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {storeData.map((store) => (
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
                      {/* Franja de color superior según porcentaje */}
                      <div
                        className="absolute top-0 left-0 right-0 h-1"
                        style={{ backgroundColor: percentColor(store.identified_percentage) }}
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
                          {/* Porcentaje — alta visibilidad */}
                          <div
                            className="shrink-0 text-2xl font-bold leading-none"
                            style={{
                              fontFamily: "Sailec, sans-serif",
                              color: percentColor(store.identified_percentage),
                            }}
                          >
                            {store.identified_percentage.toFixed(1)}%
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-3">
                        {/* Barra de progreso */}
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(store.identified_percentage, 100)}%`,
                              backgroundColor: percentColor(store.identified_percentage),
                            }}
                          />
                        </div>

                        {/* Métricas */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Total</p>
                            <p
                              className="font-semibold"
                              style={{ fontFamily: "Sailec, sans-serif" }}
                            >
                              {formatNumber(store.total_transactions)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Identificadas</p>
                            <p
                              className="font-semibold"
                              style={{
                                fontFamily: "Sailec, sans-serif",
                                color: percentColor(store.identified_percentage),
                              }}
                            >
                              {formatNumber(store.identified_transactions)}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-xs text-muted-foreground">Sin identificar</p>
                            <p
                              className="font-semibold text-muted-foreground"
                              style={{ fontFamily: "Sailec, sans-serif" }}
                            >
                              {formatNumber(store.total_transactions - store.identified_transactions)}
                            </p>
                          </div>
                        </div>

                        {/* Indicador de drill-down */}
                        <p className="text-xs text-muted-foreground/60 text-right leading-none">
                          Ver por cajero ›
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                )}
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
        onClose={() => setModal({ open: false, store: null })}
      />

      {/* Botón flotante de reporte de discrepancias */}
      <ReportDiscrepancyButton
        variant="fab"
        context={{
          module: "identified-transactions",
          dateFrom: queryParams.fecha_min,
          dateTo: queryParams.fecha_max,
          storeId: appliedControls.sapId !== "all" ? appliedControls.sapId : undefined,
          storeName:
            appliedControls.sapId !== "all"
              ? availableStores.find((s) => s.sap_id === appliedControls.sapId)?.nombre
              : undefined,
        }}
      />
    </div>
  );
}
