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
import { Input } from "@/components/ui/input";
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
  Settings2,
  Info,
  ChevronLeft,
  ShoppingBasket,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { useFilters } from "@/contexts/FiltersContext";
import { ReportDiscrepancyButton } from "@/components/ReportDiscrepancyButton";

// ─── Paleta F&F ──────────────────────────────────────────────────────────────
const COLOR = {
  green:   "#008064", // Esmeralda — por debajo del umbral (bien)
  yellow:  "#C49705", // Mostaza  — entre umbral y umbral*1.5 (alerta)
  red:     "#BC2C46", // Granate  — por encima del umbral*1.5 (crítico)
  neutral: "#1A6894", // Cobalto  — sin datos suficientes
};

// ─── Clave localStorage ───────────────────────────────────────────────────────
const LS_KEY = "ff_credit_notes_thresholds";

interface Thresholds {
  pct_txn:    number; // % de transacciones (ej. 0.1 significa 0.1%)
  pct_monto:  number; // % de monto
}

const DEFAULT_THRESHOLDS: Thresholds = { pct_txn: 0.5, pct_monto: 0.5 };

function loadThresholds(): Thresholds {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_THRESHOLDS };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

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

/**
 * Determina el color del semáforo para una tienda.
 *
 * - Verde:    NC < umbral objetivo
 * - Amarillo: umbral ≤ NC < umbral * 1.5
 * - Rojo:     NC ≥ umbral * 1.5
 * - Neutro:   no hay ventas totales (no se puede calcular)
 *
 * Se evalúa el peor caso entre cantidad y monto.
 */
function getTrafficLight(
  total_nc: number,
  monto_nc: number,
  total_txn: number,
  monto_ventas: number,
  thresholds: Thresholds
): { color: string; label: string; pct_txn: number | null; pct_monto: number | null } {
  if (total_txn === 0 && monto_ventas === 0) {
    return { color: COLOR.neutral, label: "Sin datos", pct_txn: null, pct_monto: null };
  }

  const pct_txn   = total_txn   > 0 ? (total_nc   / total_txn)   * 100 : null;
  const pct_monto = monto_ventas > 0 ? (monto_nc   / monto_ventas) * 100 : null;

  const thr_txn   = thresholds.pct_txn;
  const thr_monto = thresholds.pct_monto;

  // Nivel de alerta por dimensión (0=verde, 1=amarillo, 2=rojo)
  function level(pct: number | null, thr: number): number {
    if (pct === null) return 0;
    if (pct >= thr * 1.5) return 2;
    if (pct >= thr)       return 1;
    return 0;
  }

  const worst = Math.max(level(pct_txn, thr_txn), level(pct_monto, thr_monto));

  const color = worst === 2 ? COLOR.red : worst === 1 ? COLOR.yellow : COLOR.green;
  const label = worst === 2 ? "Crítico" : worst === 1 ? "Alerta" : "Normal";

  return { color, label, pct_txn, pct_monto };
}

// ─── tipos ────────────────────────────────────────────────────────────────────

interface StoreRow {
  nombre: string;
  codigo_tienda: string;
  total_nc: number;
  monto_total_nc: number;
  monto_subtotal_nc: number;
  total_txn_tienda: number;
  monto_total_ventas: number;
  monto_subtotal_ventas: number;
}

interface CashierRow {
  cashier_id: string | null;
  cashier_name: string;
  cashier_num_doc: string | null;
  total_nc: number;
  monto_total_nc: number;
  monto_subtotal_nc: number;
}

function formatTransactionDate(value: string | null) {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Modal de configuración de umbrales ──────────────────────────────────────

function ThresholdsModal({
  open,
  thresholds,
  onSave,
  onClose,
}: {
  open: boolean;
  thresholds: Thresholds;
  onSave: (t: Thresholds) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Thresholds>({ ...thresholds });

  // Sincronizar cuando se abre
  useEffect(() => {
    if (open) setDraft({ ...thresholds });
  }, [open, thresholds]);

  const handleSave = () => {
    const t: Thresholds = {
      pct_txn:   Math.max(0.01, Math.min(100, Number(draft.pct_txn)   || DEFAULT_THRESHOLDS.pct_txn)),
      pct_monto: Math.max(0.01, Math.min(100, Number(draft.pct_monto) || DEFAULT_THRESHOLDS.pct_monto)),
    };
    onSave(t);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle
            className="text-base font-bold uppercase tracking-wide"
            style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}
          >
            Configurar Umbrales de Alerta
          </DialogTitle>
          <DialogDescription className="text-xs">
            Define el porcentaje máximo aceptable de notas de crédito respecto al total de ventas.
            Las tarjetas cambiarán de color según si la tienda supera estos umbrales.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Semáforo explicativo */}
          <div className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-1.5 text-xs">
            <p className="font-semibold text-sm mb-2">Lógica de colores</p>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: COLOR.green }} />
              <span><strong>Normal:</strong> NC &lt; umbral configurado</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: COLOR.yellow }} />
              <span><strong>Alerta:</strong> umbral ≤ NC &lt; umbral × 1.5</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: COLOR.red }} />
              <span><strong>Crítico:</strong> NC ≥ umbral × 1.5</span>
            </div>
            <p className="text-muted-foreground mt-1">
              Se evalúa el peor caso entre cantidad y monto.
            </p>
          </div>

          {/* Umbral de transacciones */}
          <div className="space-y-2">
            <Label htmlFor="pct_txn" className="flex items-center gap-1.5">
              Umbral — Cantidad de NC
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-[220px]">
                  Si las transacciones totales son 1,000 y el umbral es 0.5%, el límite aceptable
                  es 5 NC. Si la tienda supera 5 NC, se activa la alerta.
                </TooltipContent>
              </Tooltip>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="pct_txn"
                type="number"
                min={0.01}
                max={100}
                step={0.01}
                value={draft.pct_txn}
                onChange={(e) => setDraft((d) => ({ ...d, pct_txn: parseFloat(e.target.value) || 0 }))}
                className="w-28 tabular-nums"
              />
              <span className="text-sm text-muted-foreground">% de transacciones totales</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Ejemplo: si el total de txn es 1,000 y el umbral es {draft.pct_txn}%,
              el límite es <strong>{formatNumber(Math.round(1000 * (draft.pct_txn / 100)))}</strong> NC.
            </p>
          </div>

          {/* Umbral de monto */}
          <div className="space-y-2">
            <Label htmlFor="pct_monto" className="flex items-center gap-1.5">
              Umbral — Monto de NC
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-[220px]">
                  Si el monto total de ventas es S/ 100,000 y el umbral es 0.5%, el límite aceptable
                  es S/ 500 en NC. Si la tienda supera ese monto, se activa la alerta.
                </TooltipContent>
              </Tooltip>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="pct_monto"
                type="number"
                min={0.01}
                max={100}
                step={0.01}
                value={draft.pct_monto}
                onChange={(e) => setDraft((d) => ({ ...d, pct_monto: parseFloat(e.target.value) || 0 }))}
                className="w-28 tabular-nums"
              />
              <span className="text-sm text-muted-foreground">% del monto total de ventas</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Ejemplo: si el monto total es S/ 100,000 y el umbral es {draft.pct_monto}%,
              el límite es <strong>S/ {formatCurrency(100000 * (draft.pct_monto / 100))}</strong> en NC.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Segundo nivel: transacciones y productos de un cajero ─────────────────────

function CashierTransactionDetail({
  open,
  store,
  cashier,
  fechaMin,
  fechaMax,
  includeIgv,
  onBack,
}: {
  open: boolean;
  store: StoreRow | null;
  cashier: CashierRow;
  fechaMin: string;
  fechaMax: string;
  includeIgv: boolean;
  onBack: () => void;
}) {
  const { data, isLoading, error } = trpc.sales.getCreditNoteTransactionsByCashier.useQuery(
    {
      fecha_min: fechaMin,
      fecha_max: fechaMax,
      branch_sap_id: store?.codigo_tienda ?? "",
      cashier_id: cashier.cashier_id,
      include_igv: includeIgv,
    },
    { enabled: open && !!store?.codigo_tienda }
  );

  const rows = data?.data ?? [];
  const transactionSummary = useMemo(() => {
    const transactions = new Map<string, { amount: number; quantity: number }>();
    for (const row of rows) {
      if (!transactions.has(row.header_id)) {
        transactions.set(row.header_id, {
          amount: row.monto_transaccion,
          quantity: row.cantidad_total_transaccion,
        });
      }
    }
    return {
      count: transactions.size,
      amount: Array.from(transactions.values()).reduce((total, transaction) => total + transaction.amount, 0),
      quantity: Array.from(transactions.values()).reduce((total, transaction) => total + transaction.quantity, 0),
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-md border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <ShoppingBasket className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">{cashier.cashier_name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {cashier.cashier_num_doc ? `Doc: ${cashier.cashier_num_doc}` : "Sin documento de cajero"}
              {" · "}Notas de crédito y líneas de producto
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onBack} className="shrink-0 self-start sm:self-auto">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Volver a cajeros
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-full rounded" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-8 text-center">
          <p className="text-sm font-medium text-destructive">No se pudo cargar el detalle del cajero</p>
          <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ReceiptText className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No hay transacciones de notas de crédito para este cajero en el período seleccionado
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/30 p-3 text-center text-xs">
            <div>
              <p className="text-muted-foreground">Notas de crédito</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatNumber(transactionSummary.count)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Unidades</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatNumber(transactionSummary.quantity)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Monto NC</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">S/ {formatCurrency(transactionSummary.amount)}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-border/50">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="pl-4">Transacción</TableHead>
                  <TableHead>Cliente vinculado</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Monto producto ({includeIgv ? "c/ IGV" : "s/ IGV"})</TableHead>
                  <TableHead className="text-right pr-4">Monto transacción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => {
                  const isNewTransaction = index === 0 || rows[index - 1].header_id !== row.header_id;
                  return (
                    <TableRow
                      key={`${row.header_id}-${row.sku}-${index}`}
                      className={`border-border/50 ${isNewTransaction && index > 0 ? "border-t-2 border-t-border" : ""}`}
                    >
                      <TableCell className="pl-4 align-top">
                        <p className="font-medium tabular-nums leading-tight">{row.numero_transaccion}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{formatTransactionDate(row.fecha_transaccion)}</p>
                      </TableCell>
                      <TableCell className="max-w-[220px] align-top">
                        <p className="truncate text-sm" title={row.cliente_vinculado}>{row.cliente_vinculado}</p>
                        {row.customer_id && <p className="mt-0.5 text-xs text-muted-foreground">Cliente identificado</p>}
                      </TableCell>
                      <TableCell className="max-w-[250px] align-top">
                        <p className="truncate text-sm" title={row.producto_nombre}>{row.producto_nombre}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">SKU: {row.sku}</p>
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">{formatNumber(row.cantidad)}</TableCell>
                      <TableCell className="text-right align-top tabular-nums">S/ {formatCurrency(row.monto_producto)}</TableCell>
                      <TableCell className="text-right align-top tabular-nums pr-4 font-medium">S/ {formatCurrency(row.monto_transaccion)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Modal de detalle por cajero ──────────────────────────────────────────────

function CashierDetailModal({
  open,
  store,
  fechaMin,
  fechaMax,
  includeIgv,
  thresholds,
  onClose,
}: {
  open: boolean;
  store: StoreRow | null;
  fechaMin: string;
  fechaMax: string;
  includeIgv: boolean;
  thresholds: Thresholds;
  onClose: () => void;
}) {
  const [selectedCashier, setSelectedCashier] = useState<CashierRow | null>(null);
  const { data, isLoading } = trpc.sales.getCreditNotesByCashier.useQuery(
    {
      fecha_min: fechaMin,
      fecha_max: fechaMax,
      branch_sap_id: store?.codigo_tienda ?? "",
    },
    { enabled: open && !!store?.codigo_tienda }
  );

  const rows = data?.data ?? [];

  useEffect(() => {
    setSelectedCashier(null);
  }, [open, store?.codigo_tienda]);

  const totals = useMemo(() => {
    const total_nc = rows.reduce((s, r) => s + r.total_nc, 0);
    const monto = rows.reduce(
      (s, r) => s + (includeIgv ? r.monto_total_nc : r.monto_subtotal_nc),
      0
    );
    return { total_nc, monto };
  }, [rows, includeIgv]);

  // Semáforo de la tienda
  const traffic = store
    ? getTrafficLight(
        store.total_nc,
        includeIgv ? store.monto_total_nc : store.monto_subtotal_nc,
        store.total_txn_tienda,
        includeIgv ? store.monto_total_ventas : store.monto_subtotal_ventas,
        thresholds
      )
    : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          <div className="flex items-start gap-3">
            <div
              className="shrink-0 w-1 self-stretch rounded-full"
              style={{ backgroundColor: traffic?.color ?? COLOR.neutral }}
            />
            <div className="min-w-0 flex-1">
              <DialogTitle
                className="text-base font-bold uppercase tracking-wide leading-tight"
                style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}
              >
                {store?.nombre ?? "—"}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Código: {store?.codigo_tienda ?? "—"} · Período: {fechaMin} – {fechaMax}
              </DialogDescription>

              {/* Métricas de contexto */}
              {store && traffic && (
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {traffic.pct_txn !== null && (
                    <span>
                      NC / Txn:{" "}
                      <strong style={{ color: traffic.color }}>
                        {traffic.pct_txn.toFixed(2)}%
                      </strong>
                      {" "}(umbral: {thresholds.pct_txn}%)
                    </span>
                  )}
                  {traffic.pct_monto !== null && (
                    <span>
                      Monto NC / Venta:{" "}
                      <strong style={{ color: traffic.color }}>
                        {traffic.pct_monto.toFixed(2)}%
                      </strong>
                      {" "}(umbral: {thresholds.pct_monto}%)
                    </span>
                  )}
                  <span
                    className="px-1.5 py-0.5 rounded text-white text-[10px] font-semibold"
                    style={{ backgroundColor: traffic.color }}
                  >
                    {traffic.label}
                  </span>
                </div>
              )}
            </div>

            {/* KPI compacto */}
            {store && (
              <div className="shrink-0 text-right">
                <p
                  className="text-2xl font-bold leading-none"
                  style={{ fontFamily: "Sailec, sans-serif", color: traffic?.color ?? COLOR.neutral }}
                >
                  {formatNumber(store.total_nc)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">notas de crédito</p>
                <p className="text-xs text-muted-foreground">
                  de {formatNumber(store.total_txn_tienda)} txn
                </p>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Cuerpo scrollable */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {selectedCashier ? (
            <CashierTransactionDetail
              open={open}
              store={store}
              cashier={selectedCashier}
              fechaMin={fechaMin}
              fechaMax={fechaMax}
              includeIgv={includeIgv}
              onBack={() => setSelectedCashier(null)}
            />
          ) : isLoading ? (
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
                        className="cursor-pointer border-border/50 transition-colors hover:bg-muted/30 focus-visible:bg-muted/50 focus-visible:outline-none"
                        onClick={() => setSelectedCashier(row)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedCashier(row);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Ver transacciones de ${row.cashier_name}`}
                      >
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
                        <TableCell
                          className="text-right tabular-nums font-semibold"
                          style={{ color: traffic?.color ?? COLOR.neutral }}
                        >
                          {formatNumber(row.total_nc)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums pr-4">
                          S/ {formatCurrency(monto)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-t-2 border-border font-semibold bg-muted/20">
                    <TableCell className="pl-4 text-sm">Total General</TableCell>
                    <TableCell
                      className="text-right tabular-nums text-sm"
                      style={{ color: traffic?.color ?? COLOR.neutral }}
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

        <div className="px-6 py-3 border-t border-border/50 shrink-0 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

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

  // Filtros
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

  // Umbrales
  const [thresholds, setThresholds] = useState<Thresholds>(loadThresholds);
  const [thresholdsModalOpen, setThresholdsModalOpen] = useState(false);

  // Modal de cajeros
  const [modal, setModal] = useState<{ open: boolean; store: StoreRow | null }>({
    open: false,
    store: null,
  });

  useEffect(() => {
    if (isStoreUser && assignedStoreCode) setSelectedSapId(assignedStoreCode);
  }, [isStoreUser, assignedStoreCode]);

  useEffect(() => {
    setGlobalDateRange(dateRange);
  }, [dateRange, setGlobalDateRange]);

  const handleSaveThresholds = (t: Thresholds) => {
    setThresholds(t);
    try { localStorage.setItem(LS_KEY, JSON.stringify(t)); } catch {}
  };

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
        existing.total_nc             += row.total_nc;
        existing.monto_total_nc       += row.monto_total_nc;
        existing.monto_subtotal_nc    += row.monto_subtotal_nc;
        // Las ventas totales ya vienen agrupadas por tienda (no por día), tomamos el máximo
        existing.total_txn_tienda      = Math.max(existing.total_txn_tienda, row.total_txn_tienda);
        existing.monto_total_ventas    = Math.max(existing.monto_total_ventas, row.monto_total_ventas);
        existing.monto_subtotal_ventas = Math.max(existing.monto_subtotal_ventas, row.monto_subtotal_ventas);
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
    const seen = new Set<string>();
    const stores: { sap_id: string; nombre: string }[] = [];
    for (const row of storeData) {
      if (row.codigo_tienda && !seen.has(row.codigo_tienda)) {
        seen.add(row.codigo_tienda);
        stores.push({ sap_id: row.codigo_tienda, nombre: row.nombre });
      }
    }
    return stores;
  }, [storeData]);

  // KPIs globales
  const summary = useMemo(() => {
    const total_nc = storeData.reduce((s, r) => s + r.total_nc, 0);
    const monto = storeData.reduce(
      (s, r) => s + (includeIgv ? r.monto_total_nc : r.monto_subtotal_nc),
      0
    );
    const total_txn = storeData.reduce((s, r) => s + r.total_txn_tienda, 0);
    const monto_ventas = storeData.reduce(
      (s, r) => s + (includeIgv ? r.monto_total_ventas : r.monto_subtotal_ventas),
      0
    );
    const pct_txn   = total_txn   > 0 ? (total_nc / total_txn)   * 100 : null;
    const pct_monto = monto_ventas > 0 ? (monto   / monto_ventas) * 100 : null;
    const promedio  = storeData.length > 0 ? monto / storeData.length : 0;
    return { total_nc, monto, total_txn, monto_ventas, pct_txn, pct_monto, promedio };
  }, [storeData, includeIgv]);

  // Conteo de semáforo
  const trafficCount = useMemo(() => {
    const counts = { green: 0, yellow: 0, red: 0, neutral: 0 };
    for (const store of storeData) {
      const t = getTrafficLight(
        store.total_nc,
        includeIgv ? store.monto_total_nc : store.monto_subtotal_nc,
        store.total_txn_tienda,
        includeIgv ? store.monto_total_ventas : store.monto_subtotal_ventas,
        thresholds
      );
      if (t.color === COLOR.green)   counts.green++;
      else if (t.color === COLOR.yellow) counts.yellow++;
      else if (t.color === COLOR.red)    counts.red++;
      else counts.neutral++;
    }
    return counts;
  }, [storeData, thresholds, includeIgv]);

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
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-background">
        <NavigationMenu />

        <div className="container py-8 space-y-8">
          {/* ── Header ── */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h1
                className="text-3xl font-bold tracking-tight uppercase"
                style={{ fontFamily: "Italian Plate No 1, serif" }}
              >
                NOTAS DE CRÉDITO
              </h1>
              <p className="text-muted-foreground text-sm">
                Detalle de NC emitidas por tienda. Haz clic en una tarjeta para ver el breakdown por cajero.
              </p>
              {queryData?.metadata && (
                <p className="text-xs text-muted-foreground">
                  Actualizado: {new Date(queryData.metadata.generated_at).toLocaleString("es-PE")} |
                  Registros: {formatNumber(queryData.metadata.total_rows)}
                </p>
              )}
            </div>
            {/* Botón de configuración de umbrales */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setThresholdsModalOpen(true)}
              className="shrink-0 flex items-center gap-1.5"
            >
              <Settings2 className="h-4 w-4" />
              Umbrales
            </Button>
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDateRange(undefined);
                    setSelectedSapId("all");
                    setGlobalBranchId(undefined);
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  Limpiar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Fecha Inicio</Label>
                  <DatePicker
                    date={dateRange?.from}
                    onDateChange={(from) => setDateRange({ from, to: dateRange?.to })}
                    placeholder="Fecha inicio"
                    maxDate={dateRange?.to ?? new Date()}
                  />
                </div>
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
                          assignedStoreCode ?? "Tu tienda"}
                      </span>
                    </div>
                  ) : (
                    <Select value={selectedSapId} onValueChange={setSelectedSapId}>
                      <SelectTrigger id="store">
                        <SelectValue placeholder="Todas las tiendas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las tiendas</SelectItem>
                        {availableStores.map((s) => (
                          <SelectItem key={s.sap_id} value={s.sap_id}>
                            {s.nombre} ({s.sap_id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
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
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total NC</CardTitle>
                    <FileX2 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" style={{ fontFamily: "Sailec, sans-serif" }}>
                      {formatNumber(summary.total_nc)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {summary.pct_txn !== null
                        ? `${summary.pct_txn.toFixed(2)}% de ${formatNumber(summary.total_txn)} txn`
                        : dateRangeText}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Monto NC ({includeIgv ? "c/ IGV" : "s/ IGV"})
                    </CardTitle>
                    <Banknote className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" style={{ fontFamily: "Sailec, sans-serif" }}>
                      S/ {formatCurrency(summary.monto)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {summary.pct_monto !== null
                        ? `${summary.pct_monto.toFixed(2)}% de S/ ${formatCurrency(summary.monto_ventas)}`
                        : `${storeData.length} tienda${storeData.length !== 1 ? "s" : ""}`}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Promedio por Tienda</CardTitle>
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" style={{ fontFamily: "Sailec, sans-serif" }}>
                      S/ {formatCurrency(summary.promedio)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {storeData.length > 0
                        ? `${formatNumber(Math.round(summary.total_nc / storeData.length))} NC/tienda`
                        : "—"}
                    </p>
                  </CardContent>
                </Card>

                {/* Resumen del semáforo */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Estado por Tienda</CardTitle>
                    <Settings2
                      className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                      onClick={() => setThresholdsModalOpen(true)}
                    />
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      {trafficCount.red > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded-full" style={{ background: COLOR.red }} />
                          <span className="text-lg font-bold" style={{ fontFamily: "Sailec, sans-serif", color: COLOR.red }}>
                            {trafficCount.red}
                          </span>
                        </div>
                      )}
                      {trafficCount.yellow > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded-full" style={{ background: COLOR.yellow }} />
                          <span className="text-lg font-bold" style={{ fontFamily: "Sailec, sans-serif", color: COLOR.yellow }}>
                            {trafficCount.yellow}
                          </span>
                        </div>
                      )}
                      {trafficCount.green > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded-full" style={{ background: COLOR.green }} />
                          <span className="text-lg font-bold" style={{ fontFamily: "Sailec, sans-serif", color: COLOR.green }}>
                            {trafficCount.green}
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Umbral txn: {thresholds.pct_txn}% · monto: {thresholds.pct_monto}%
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
                      const monto_nc = includeIgv ? store.monto_total_nc : store.monto_subtotal_nc;
                      const monto_ventas = includeIgv ? store.monto_total_ventas : store.monto_subtotal_ventas;
                      const traffic = getTrafficLight(
                        store.total_nc,
                        monto_nc,
                        store.total_txn_tienda,
                        monto_ventas,
                        thresholds
                      );

                      const pct_txn_display   = traffic.pct_txn   !== null ? traffic.pct_txn.toFixed(2)   : null;
                      const pct_monto_display = traffic.pct_monto !== null ? traffic.pct_monto.toFixed(2) : null;

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
                          {/* Franja de color del semáforo */}
                          <div
                            className="absolute top-0 left-0 right-0 h-1.5 transition-colors duration-500"
                            style={{ backgroundColor: traffic.color }}
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
                              {/* Badge de estado */}
                              <span
                                className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded text-white"
                                style={{ backgroundColor: traffic.color }}
                              >
                                {traffic.label}
                              </span>
                            </div>
                          </CardHeader>

                          <CardContent className="space-y-3">
                            {/* Barra de % NC vs ventas (peor dimensión) */}
                            {(traffic.pct_txn !== null || traffic.pct_monto !== null) && (
                              <div className="space-y-1">
                                {traffic.pct_txn !== null && (
                                  <div>
                                    <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                                      <span>NC/Txn</span>
                                      <span style={{ color: traffic.color }}>
                                        {pct_txn_display}% / {thresholds.pct_txn}%
                                      </span>
                                    </div>
                                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                          width: `${Math.min((traffic.pct_txn / (thresholds.pct_txn * 2)) * 100, 100)}%`,
                                          backgroundColor: traffic.color,
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                                {traffic.pct_monto !== null && (
                                  <div>
                                    <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                                      <span>Monto NC/Venta</span>
                                      <span style={{ color: traffic.color }}>
                                        {pct_monto_display}% / {thresholds.pct_monto}%
                                      </span>
                                    </div>
                                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                          width: `${Math.min((traffic.pct_monto / (thresholds.pct_monto * 2)) * 100, 100)}%`,
                                          backgroundColor: traffic.color,
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Métricas */}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground">Cantidad NC</p>
                                <p
                                  className="font-semibold"
                                  style={{ fontFamily: "Sailec, sans-serif", color: traffic.color }}
                                >
                                  {formatNumber(store.total_nc)}
                                  {store.total_txn_tienda > 0 && (
                                    <span className="text-xs font-normal text-muted-foreground ml-1">
                                      / {formatNumber(store.total_txn_tienda)}
                                    </span>
                                  )}
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
                                  S/ {formatCurrency(monto_nc)}
                                </p>
                              </div>
                            </div>

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

        {/* ── Modales ── */}
        <ThresholdsModal
          open={thresholdsModalOpen}
          thresholds={thresholds}
          onSave={handleSaveThresholds}
          onClose={() => setThresholdsModalOpen(false)}
        />

        <CashierDetailModal
          open={modal.open}
          store={modal.store}
          fechaMin={queryParams.fecha_min}
          fechaMax={queryParams.fecha_max}
          includeIgv={includeIgv}
          thresholds={thresholds}
          onClose={() => setModal({ open: false, store: null })}
        />

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
    </TooltipProvider>
  );
}
