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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  Trophy,
  LayoutGrid,
  LayoutList,
  Store,
  TrendingUp,
  ChevronLeft,
  Receipt,
  Package,
} from "lucide-react";
import { useState, useMemo } from "react";
import { ReportDiscrepancyButton } from "@/components/ReportDiscrepancyButton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";

const ALL_CHANNELS = ['Presencial', 'eCommerce', 'Rappi'] as const;
type Channel = typeof ALL_CHANNELS[number];

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

function fmtDate(d: Date | string) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
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

/** Capitaliza nombre propio: lowercase + capitalize cada palabra */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(?:^|\s|\(|\-)[a-zà-ÿ]/g, (c) => c.toUpperCase());
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

interface SelectedCustomer {
  customer_id: string;
  customer_name: string;
}

interface SelectedTransaction {
  header_id: string;
  comprobante: string;
  fecha: Date | string;
  tienda_nombre: string;
  monto_total: number;
}

// ─── Modal de detalle de artículos ──────────────────────────────────────────

function TransactionDetailModal({
  transaction,
  includeIgv,
  onBack,
}: {
  transaction: SelectedTransaction;
  includeIgv: boolean;
  onBack: () => void;
}) {
  const { data, isLoading } = trpc.sales.getTransactionDetail.useQuery(
    { header_id: transaction.header_id, include_igv: includeIgv },
    { enabled: !!transaction.header_id }
  );

  const rows = data?.data ?? [];
  const totalMonto = rows.reduce((s, r) => s + r.monto_linea, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border/50 bg-muted/30">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver a transacciones
        </button>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4" style={{ color: "#1A6894" }} />
          <span
            className="text-sm font-bold uppercase tracking-wide"
            style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}
          >
            {transaction.comprobante}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
          <span>{fmtDate(transaction.fecha)}</span>
          <span className="font-medium text-foreground">{transaction.tienda_nombre}</span>
          <span className="font-bold text-base" style={{ color: "#008064", fontFamily: "Sailec, sans-serif" }}>
            S/ {fmtCurrency(transaction.monto_total)}
          </span>
        </div>
      </div>

      {/* Tabla de artículos */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Cargando artículos...</span>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No se encontraron artículos para esta transacción.
          </p>
        ) : (
          <Table className="table-fixed w-full">
            <colgroup>
              {/* Artículo: ocupa todo el espacio restante */}
              <col />
              {/* Int. SKU */}
              <col style={{ width: "7rem" }} />
              {/* Cantidad */}
              <col style={{ width: "6rem" }} />
              {/* Precio Unit. */}
              <col style={{ width: "9rem" }} />
              {/* Monto Línea */}
              <col style={{ width: "9rem" }} />
            </colgroup>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead className="text-xs">Artículo</TableHead>
                <TableHead className="text-xs">Int. SKU</TableHead>
                <TableHead className="text-xs text-right">Cantidad</TableHead>
                <TableHead className="text-xs text-right">Precio Unit.</TableHead>
                <TableHead className="text-xs text-right">Monto Línea</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i} className="border-border/30">
                  <TableCell className="text-sm font-medium">
                    <span className="block" title={r.producto_nombre}>
                      {r.producto_nombre}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {r.sku}
                  </TableCell>
                  <TableCell className="text-sm text-right tabular-nums">
                    {fmtNumber(r.cantidad)}
                  </TableCell>
                  <TableCell className="text-sm text-right tabular-nums text-muted-foreground">
                    S/ {fmtCurrency(r.precio_unitario)}
                  </TableCell>
                  <TableCell
                    className="text-sm text-right tabular-nums font-semibold"
                    style={{ color: "#008064" }}
                  >
                    S/ {fmtCurrency(r.monto_linea)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {rows.length > 0 && (
              <tfoot>
                <TableRow className="border-t-2 border-border/60 font-bold">
                  <TableCell colSpan={4} className="text-sm text-right pr-4">
                    Total
                  </TableCell>
                  <TableCell
                    className="text-sm text-right tabular-nums font-bold"
                    style={{ color: "#008064" }}
                  >
                    S/ {fmtCurrency(totalMonto)}
                  </TableCell>
                </TableRow>
              </tfoot>
            )}
          </Table>
        )}
      </div>
    </div>
  );
}

// ─── Modal de transacciones del cliente ─────────────────────────────────────

function CustomerTransactionsModal({
  customer,
  fechaMin,
  fechaMax,
  includeIgv,
  branchSapId,
  salesChannel,
  onClose,
}: {
  customer: SelectedCustomer;
  fechaMin: string;
  fechaMax: string;
  includeIgv: boolean;
  branchSapId?: string;
  salesChannel?: string;
  onClose: () => void;
}) {
  const [selectedTxn, setSelectedTxn] = useState<SelectedTransaction | null>(null);
  // Ancho del modal: forzado con style inline para sobreescribir sm:max-w-lg del DialogContent base
  const dialogStyle = selectedTxn
    ? { width: "min(96vw, 1300px)", maxWidth: "min(96vw, 1300px)" }
    : { width: "min(95vw, 896px)",  maxWidth: "min(95vw, 896px)" };

  const { data, isLoading } = trpc.sales.getCustomerTransactions.useQuery(
    {
      customer_id: customer.customer_id,
      fecha_min: fechaMin,
      fecha_max: fechaMax,
      include_igv: includeIgv,
      branch_sap_id: branchSapId,
      sales_channel: salesChannel,
    },
    { enabled: !!customer.customer_id }
  );

  const rows = data?.data ?? [];
  const totalMonto = rows.reduce((s, r) => s + r.monto_total, 0);

  return (
    <DialogContent
      className="max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden transition-all duration-200"
      style={dialogStyle}
    >
      <DialogHeader className="px-6 py-4 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: "#1A6894" + "20" }}>
            <Receipt className="h-5 w-5" style={{ color: "#1A6894" }} />
          </div>
          <div>
            <DialogTitle
              className="text-base font-bold uppercase tracking-wide"
              style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}
            >
              {toTitleCase(customer.customer_name)}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Transacciones del {fechaMin} al {fechaMax}
              {includeIgv ? " · Con IGV" : " · Sin IGV"}
            </p>
          </div>
          {!selectedTxn && (
            <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
              <span>{rows.length} transacciones</span>
              <span
                className="font-bold text-base"
                style={{ color: "#008064", fontFamily: "Sailec, sans-serif" }}
              >
                S/ {fmtCurrency(totalMonto)}
              </span>
            </div>
          )}
        </div>
      </DialogHeader>

      {/* Contenido: lista de transacciones o detalle de artículos */}
      <div className="flex-1 overflow-hidden">
        {selectedTxn ? (
          <TransactionDetailModal
            transaction={selectedTxn}
            includeIgv={includeIgv}
            onBack={() => setSelectedTxn(null)}
          />
        ) : (
          <div className="overflow-y-auto h-full px-6 py-4">
            {isLoading ? (
              <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Cargando transacciones...</span>
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No se encontraron transacciones para este cliente en el período seleccionado.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-3">
                  Haz clic en una fila para ver el detalle de artículos.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50">
                      <TableHead className="text-xs">Comprobante</TableHead>
                      <TableHead className="text-xs">Fecha</TableHead>
                      <TableHead className="text-xs">Tienda</TableHead>
                      <TableHead className="text-xs text-right">Monto Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow
                        key={r.header_id}
                        className="border-border/30 hover:bg-muted/40 cursor-pointer transition-colors"
                        onClick={() => setSelectedTxn(r)}
                      >
                        <TableCell className="text-sm font-mono font-medium">
                          <div className="flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {r.comprobante}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {fmtDate(r.fecha)}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="font-medium">{r.tienda_nombre}</span>
                          <span className="text-xs text-muted-foreground ml-1.5">({r.tienda_sap_id})</span>
                        </TableCell>
                        <TableCell
                          className="text-sm text-right tabular-nums font-semibold"
                          style={{ color: "#008064" }}
                        >
                          S/ {fmtCurrency(r.monto_total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {rows.length > 0 && (
                    <tfoot>
                      <TableRow className="border-t-2 border-border/60 font-bold">
                        <TableCell colSpan={3} className="text-sm text-right pr-4">
                          Total ({rows.length} transacciones)
                        </TableCell>
                        <TableCell
                          className="text-sm text-right tabular-nums font-bold"
                          style={{ color: "#008064" }}
                        >
                          S/ {fmtCurrency(totalMonto)}
                        </TableCell>
                      </TableRow>
                    </tfoot>
                  )}
                </Table>
              </>
            )}
          </div>
        )}
      </div>
    </DialogContent>
  );
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
  const [selectedSapId, setSelectedSapId] = useState<string>("all");
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>([...ALL_CHANNELS]);

  // Modal de transacciones
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);

  const fechaMin = toLocalDate(from);
  const fechaMax = toLocalDate(to);

  // Límite de tarjetas: máximo 20 en modo cards
  const effectiveTopN = viewMode === "cards" ? Math.min(topN, 20) : topN;

  // Canal único para el backend (si todos seleccionados → 'all', si uno → ese canal)
  const effectiveChannel = useMemo(() => {
    if (selectedChannels.length === ALL_CHANNELS.length || selectedChannels.length === 0) return 'all';
    if (selectedChannels.length === 1) return selectedChannels[0];
    return 'all'; // multi-select: filtramos en frontend
  }, [selectedChannels]);

  // ── Queries ──
  const { data: byBranchData, isLoading: loadingCards } =
    trpc.sales.getTopCustomersByBranch.useQuery(
      {
        fecha_min: fechaMin,
        fecha_max: fechaMax,
        top_n: effectiveTopN,
        include_igv: includeIgv,
        branch_sap_id: selectedSapId !== 'all' ? selectedSapId : undefined,
        sales_channel: effectiveChannel !== 'all' ? effectiveChannel : undefined,
      },
      { enabled: viewMode === "cards" }
    );

  const { data: generalData, isLoading: loadingGeneral } =
    trpc.sales.getTopCustomersGeneral.useQuery(
      {
        fecha_min: fechaMin,
        fecha_max: fechaMax,
        top_n: topN,
        include_igv: includeIgv,
        branch_sap_id: selectedSapId !== 'all' ? selectedSapId : undefined,
        sales_channel: effectiveChannel !== 'all' ? effectiveChannel : undefined,
      },
      { enabled: viewMode === "table" }
    );

  // ── Lista de tiendas disponibles (extraída de los datos de tarjetas) ──
  const availableStores = useMemo(() => {
    const rows = byBranchData?.data ?? [];
    const seen = new Set<string>();
    const stores: { sap_id: string; nombre: string }[] = [];
    for (const r of rows) {
      if (r.codigo_tienda && !seen.has(r.codigo_tienda)) {
        seen.add(r.codigo_tienda);
        stores.push({ sap_id: r.codigo_tienda, nombre: r.nombre_tienda });
      }
    }
    stores.sort((a, b) => {
      const na = parseInt(a.sap_id.replace(/\D/g, '') || '9999');
      const nb = parseInt(b.sap_id.replace(/\D/g, '') || '9999');
      return na - nb;
    });
    return stores;
  }, [byBranchData]);

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

  // ── Parámetros para el modal de transacciones ──
  const modalBranchSapId = selectedSapId !== 'all' ? selectedSapId : undefined;
  const modalSalesChannel = effectiveChannel !== 'all' ? effectiveChannel : undefined;

  const handleCustomerClick = (customerId: string | null, customerName: string) => {
    if (!customerId) return;
    setSelectedCustomer({ customer_id: customerId, customer_name: customerName });
  };

  return (
    <TooltipProvider>
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

                {/* Tienda */}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Tienda</Label>
                  <Select value={selectedSapId} onValueChange={setSelectedSapId}>
                    <SelectTrigger className="w-44">
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
                </div>

                {/* Canal */}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Canal</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-40 justify-between font-normal h-9 px-3">
                        <span className="truncate text-sm">
                          {selectedChannels.length === 0
                            ? "Sin canales"
                            : selectedChannels.length === ALL_CHANNELS.length
                            ? "Todos los canales"
                            : selectedChannels.join(", ")}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {selectedChannels.length > 0 && selectedChannels.length < ALL_CHANNELS.length && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                              {selectedChannels.length}
                            </Badge>
                          )}
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </div>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-2" align="start">
                      <div className="space-y-1">
                        <div
                          className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent"
                          onClick={() => setSelectedChannels([...ALL_CHANNELS])}
                        >
                          <Checkbox
                            checked={selectedChannels.length === ALL_CHANNELS.length}
                            onCheckedChange={() => setSelectedChannels([...ALL_CHANNELS])}
                          />
                          <span className="text-sm">Todos los canales</span>
                        </div>
                        <div className="border-t my-1" />
                        {ALL_CHANNELS.map((ch) => (
                          <div
                            key={ch}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent"
                            onClick={() => {
                              setSelectedChannels(
                                selectedChannels.includes(ch)
                                  ? selectedChannels.filter((c) => c !== ch)
                                  : [...selectedChannels, ch]
                              );
                            }}
                          >
                            <Checkbox
                              checked={selectedChannels.includes(ch)}
                              onCheckedChange={() => {
                                setSelectedChannels(
                                  selectedChannels.includes(ch)
                                    ? selectedChannels.filter((c) => c !== ch)
                                    : [...selectedChannels, ch]
                                );
                              }}
                            />
                            <span className="text-sm">{ch}</span>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
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
                              <TableRow
                                key={c.customer_id ?? c.rn}
                                className="border-border/30 hover:bg-muted/40 cursor-pointer transition-colors"
                                onClick={() => handleCustomerClick(c.customer_id, c.customer_name)}
                              >
                                <TableCell className="py-1.5 px-2 text-xs">
                                  <MedalBadge pos={c.rn} />
                                </TableCell>
                                <TableCell className="py-1.5 px-2 text-xs max-w-[140px]">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span
                                        className="block truncate font-medium underline-offset-2 hover:underline"
                                        style={{ color: "#1A6894" }}
                                      >
                                        {toTitleCase(c.customer_name)}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Ver transacciones</p>
                                    </TooltipContent>
                                  </Tooltip>
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
                          <TableHead className="text-xs text-right">% Participación</TableHead>
                          <TableHead className="text-xs text-right">Transacciones</TableHead>
                          <TableHead className="text-xs text-right">Monto Prom./Mes</TableHead>
                          <TableHead className="text-xs text-right">Txn Prom./Mes</TableHead>
                          <TableHead className="text-xs">Tiendas</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {generalRows.map((r, i) => (
                          <TableRow
                            key={r.customer_id ?? i}
                            className="border-border/30 hover:bg-muted/40 cursor-pointer transition-colors"
                            onClick={() => handleCustomerClick(r.customer_id, r.customer_name)}
                          >
                            <TableCell className="text-xs text-muted-foreground">
                              <MedalBadge pos={i + 1} />
                            </TableCell>
                            <TableCell className="text-sm font-medium max-w-[200px]">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className="block truncate underline-offset-2 hover:underline"
                                    style={{ color: "#1A6894" }}
                                    title={toTitleCase(r.customer_name)}
                                  >
                                    {toTitleCase(r.customer_name)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Ver transacciones</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell
                              className="text-sm text-right tabular-nums font-semibold"
                              style={{ color: "#008064" }}
                            >
                              S/ {fmtCurrency(r.monto_total)}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {(() => {
                                const totalGeneral = generalRows.reduce((s, x) => s + x.monto_total, 0);
                                const pct = totalGeneral > 0 ? (r.monto_total / totalGeneral) * 100 : 0;
                                const color = pct >= 10 ? "#BC2C46" : pct >= 5 ? "#C49705" : "#008064";
                                return (
                                  <span className="font-medium" style={{ color }}>
                                    {pct.toFixed(1)}%
                                  </span>
                                );
                              })()}
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

        {/* ── Modal de transacciones del cliente ── */}
        <Dialog open={!!selectedCustomer} onOpenChange={(open) => !open && setSelectedCustomer(null)}>
          {selectedCustomer && (
            <CustomerTransactionsModal
              customer={selectedCustomer}
              fechaMin={fechaMin}
              fechaMax={fechaMax}
              includeIgv={includeIgv}
              branchSapId={modalBranchSapId}
              salesChannel={modalSalesChannel}
              onClose={() => setSelectedCustomer(null)}
            />
          )}
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
