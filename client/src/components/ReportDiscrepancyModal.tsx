import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

// ── Design tokens Flora & Fauna ───────────────────────────────────────────────
const FF = {
  // Corporativos
  granate:          "#BC2C46",
  esmeralda:        "#008064",
  mostaza:          "#C49705",
  cobalto:          "#1A6894",
  // Neutros
  carbon:           "#232523",
  humo:             "#919291",
  beige:            "#EAE8E2",
  hueso:            "#F5F4F1",
  blanco:           "#FFFFFF",
  // Variaciones light (para fondos de badges/alertas)
  granateLight:     "#FAEAED",   // ~15% granate sobre blanco
  granateBorder:    "#E8B0BC",
  granateDark:      "#842032",
  esmeraldaLight:   "#E6F4F1",
  esmeraldaBorder:  "#A8D9D1",
  esmeraldaDark:    "#005A47",
  mostazaLight:     "#FDF6E3",
  mostazaBorder:    "#E8D080",
  mostazaDark:      "#8B6B04",
  cobaltLight:      "#E8F1F7",   // ~15% cobalto sobre blanco
  cobaltBorder:     "#B8D3E4",
  cobaltDark:       "#124A6B",
};

// ── Estilos reutilizables ─────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  borderColor: FF.beige,
  background: FF.blanco,
  color: FF.carbon,
  fontFamily: "'Sailec', sans-serif",
};

const labelStyle: React.CSSProperties = {
  color: FF.carbon,
  fontFamily: "'Sailec', sans-serif",
  fontWeight: 500,
};

export interface DiscrepancyContext {
  module: string;
  moduleLabel?: string;
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  storeName?: string;
  dashboardAmount?: number;
  /** Monto de la venta con error. La plataforma lo autocompleta pero el usuario puede editarlo. */
  relatedSaleAmount?: number;
}

interface ReportDiscrepancyModalProps {
  open: boolean;
  onClose: () => void;
  context: DiscrepancyContext;
}

export function ReportDiscrepancyModal({
  open,
  onClose,
  context,
}: ReportDiscrepancyModalProps) {
  const { user } = useAuth();
  const [analystAmount, setAnalystAmount] = useState("");
  const [description, setDescription] = useState("");
  const [dataSource, setDataSource] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");

  const initialRelatedAmount =
    context.relatedSaleAmount !== undefined
      ? context.relatedSaleAmount
      : context.dashboardAmount;

  const [relatedSaleAmount, setRelatedSaleAmount] = useState(
    initialRelatedAmount !== undefined ? String(initialRelatedAmount) : ""
  );
  const [submitted, setSubmitted] = useState(false);
  const [ticketId, setTicketId] = useState<number | null>(null);

  // Sincronizar cuando el modal se abre con nuevo contexto
  useEffect(() => {
    if (open) {
      const amt =
        context.relatedSaleAmount !== undefined
          ? context.relatedSaleAmount
          : context.dashboardAmount;
      setRelatedSaleAmount(amt !== undefined ? String(amt) : "");
    }
  }, [open, context.relatedSaleAmount, context.dashboardAmount]);

  const createTicket = trpc.tickets.create.useMutation({
    onSuccess: (data) => {
      setSubmitted(true);
      setTicketId(data.ticketId);
      toast.success(`Ticket #${data.ticketId} creado exitosamente`);
    },
    onError: (error) => {
      toast.error(`Error al crear el ticket: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    createTicket.mutate({
      module: context.module,
      dateFrom: context.dateFrom ?? "",
      dateTo: context.dateTo ?? context.dateFrom ?? "",
      storeId: context.storeId ?? "all",
      storeName: context.storeName ?? "Todas las tiendas",
      dashboardAmount: context.dashboardAmount,
      analystAmount: analystAmount ? Math.round(parseFloat(analystAmount)) : undefined,
      description: description.trim(),
      dataSource: dataSource.trim() || undefined,
      priority,
      relatedSaleAmount: relatedSaleAmount ? parseFloat(relatedSaleAmount) : undefined,
    });
  };

  const handleClose = () => {
    setAnalystAmount("");
    setDescription("");
    setDataSource("");
    setPriority("medium");
    const amt =
      context.relatedSaleAmount !== undefined
        ? context.relatedSaleAmount
        : context.dashboardAmount;
    setRelatedSaleAmount(amt !== undefined ? String(amt) : "");
    setSubmitted(false);
    setTicketId(null);
    onClose();
  };

  const formatDate = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const formatAmount = (n?: number) =>
    n !== undefined ? `S/ ${n.toLocaleString("es-PE")}` : "—";

  const difference =
    analystAmount && context.dashboardAmount !== undefined
      ? Math.round(parseFloat(analystAmount)) - context.dashboardAmount
      : null;

  const isAmountModified =
    relatedSaleAmount !== "" &&
    relatedSaleAmount !== (initialRelatedAmount !== undefined ? String(initialRelatedAmount) : "");

  // Priority config — colores semánticos FF
  const priorityConfig = {
    low:    { label: "Baja — diferencia menor, no urgente",     dot: FF.esmeralda },
    medium: { label: "Media — requiere revisión pronto",         dot: FF.mostaza },
    high:   { label: "Alta — diferencia significativa, urgente", dot: FF.granate },
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className="sm:max-w-[540px] p-0 overflow-hidden"
        style={{
          borderRadius: 12,
          border: `1px solid ${FF.beige}`,
          fontFamily: "'Sailec', sans-serif",
        }}
      >
        {submitted ? (
          /* ── Estado de éxito ── */
          <div
            className="flex flex-col items-center gap-4 py-10 px-8 text-center"
            style={{ background: FF.blanco }}
          >
            <div
              className="flex items-center justify-center h-16 w-16 rounded-full"
              style={{ background: FF.esmeraldaLight, border: `1px solid ${FF.esmeraldaBorder}` }}
            >
              <CheckCircle2 className="h-8 w-8" style={{ color: FF.esmeralda }} />
            </div>
            <div className="space-y-1">
              <h2
                className="text-xl font-bold uppercase tracking-wide"
                style={{ fontFamily: "'Italian Plate No 1', serif", color: FF.carbon }}
              >
                Ticket #{ticketId} creado
              </h2>
              <p className="text-sm" style={{ color: FF.humo, fontFamily: "'Sailec', sans-serif" }}>
                Tu reporte fue enviado al equipo técnico. Recibirás una notificación cuando sea revisado.
              </p>
            </div>
            <Button
              onClick={handleClose}
              className="mt-2 font-medium uppercase tracking-wide text-sm"
              style={{ background: FF.carbon, color: FF.blanco, fontFamily: "'Sailec', sans-serif" }}
            >
              Cerrar
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* ── Header ── */}
            <div
              className="px-6 py-4"
              style={{ borderBottom: `1px solid ${FF.beige}`, background: FF.hueso }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2.5">
                  <span
                    className="flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0"
                    style={{ background: FF.granateLight, border: `1px solid ${FF.granateBorder}` }}
                  >
                    <AlertTriangle className="h-4 w-4" style={{ color: FF.granate }} />
                  </span>
                  <span
                    className="text-base font-bold uppercase tracking-wide"
                    style={{ fontFamily: "'Italian Plate No 1', serif", color: FF.carbon }}
                  >
                    Reportar Discrepancia
                  </span>
                </DialogTitle>
                <p
                  className="text-xs mt-1.5 ml-10"
                  style={{ color: FF.humo, fontFamily: "'Sailec', sans-serif" }}
                >
                  Reporta una diferencia entre los datos del dashboard y tu fuente de información.
                  El equipo técnico recibirá una alerta inmediata.
                </p>
              </DialogHeader>
            </div>

            {/* ── Resumen de contexto ── */}
            <div
              className="mx-6 mt-4 rounded-lg overflow-hidden text-sm"
              style={{ border: `1px solid ${FF.beige}` }}
            >
              <div
                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest"
                style={{
                  background: FF.hueso,
                  color: FF.humo,
                  borderBottom: `1px solid ${FF.beige}`,
                  fontFamily: "'Italian Plate No 1', serif",
                }}
              >
                Contexto del reporte
              </div>
              <div style={{ background: FF.blanco }}>
                {[
                  { label: "Módulo",   value: context.moduleLabel },
                  {
                    label: "Período",
                    value: context.dateFrom
                      ? context.dateFrom !== context.dateTo && context.dateTo
                        ? `${formatDate(context.dateFrom)} → ${formatDate(context.dateTo)}`
                        : formatDate(context.dateFrom)
                      : "—",
                  },
                  { label: "Tienda",   value: context.storeName ?? "Todas las tiendas" },
                  ...(context.dashboardAmount !== undefined
                    ? [{ label: "Monto en dashboard", value: formatAmount(context.dashboardAmount) }]
                    : []),
                ].map((row, i, arr) => (
                  <div
                    key={row.label}
                    className="flex justify-between items-center px-3 py-2"
                    style={{
                      borderBottom: i < arr.length - 1 ? `1px solid ${FF.beige}` : "none",
                    }}
                  >
                    <span
                      className="text-sm"
                      style={{ color: FF.humo, fontFamily: "'Sailec', sans-serif" }}
                    >
                      {row.label}
                    </span>
                    <span
                      className="text-sm font-medium"
                      style={{ color: FF.carbon, fontFamily: "'Sailec', sans-serif" }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Campos del formulario ── */}
            <div className="px-6 py-4 space-y-4" style={{ background: FF.blanco }}>

              {/* Monto de la venta con error */}
              <div className="space-y-1.5">
                <Label
                  className="flex items-center gap-1.5 text-sm font-medium"
                  style={labelStyle}
                >
                  Monto de la venta con error
                  <span className="text-xs font-normal" style={{ color: FF.humo }}>(opcional)</span>
                  {initialRelatedAmount !== undefined && (
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        background: FF.cobaltLight,
                        color: FF.cobaltDark,
                        border: `1px solid ${FF.cobaltBorder}`,
                        fontFamily: "'Sailec', sans-serif",
                      }}
                    >
                      Autocompletado
                    </span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ej: 1250.50"
                    value={relatedSaleAmount}
                    onChange={(e) => setRelatedSaleAmount(e.target.value)}
                    className="font-mono text-sm pr-24"
                    style={inputStyle}
                  />
                  {isAmountModified && (
                    <button
                      type="button"
                      onClick={() =>
                        setRelatedSaleAmount(
                          initialRelatedAmount !== undefined ? String(initialRelatedAmount) : ""
                        )
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs rounded px-1.5 py-0.5 transition-colors hover:underline"
                      style={{ color: FF.cobalto, fontFamily: "'Sailec', sans-serif" }}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restaurar
                    </button>
                  )}
                </div>
                <p className="text-xs" style={{ color: FF.humo, fontFamily: "'Sailec', sans-serif" }}>
                  Monto de la transacción o venta que presenta el error reportado.
                </p>
              </div>

              {/* Monto según tu fuente */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium" style={labelStyle}>
                  Monto según tu fuente{" "}
                  <span className="text-xs font-normal" style={{ color: FF.humo }}>(opcional)</span>
                </Label>
                <Input
                  type="number"
                  placeholder="Ej: 150000"
                  value={analystAmount}
                  onChange={(e) => setAnalystAmount(e.target.value)}
                  style={inputStyle}
                />
                {difference !== null && (
                  <div
                    className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium"
                    style={{
                      background: difference > 0 ? FF.mostazaLight : FF.granateLight,
                      color: difference > 0 ? FF.mostazaDark : FF.granateDark,
                      border: `1px solid ${difference > 0 ? FF.mostazaBorder : FF.granateBorder}`,
                      fontFamily: "'Sailec', sans-serif",
                    }}
                  >
                    <span>
                      Diferencia: {difference > 0 ? "+" : ""}
                      {formatAmount(Math.abs(difference))}
                    </span>
                    <span style={{ opacity: 0.7 }}>
                      {difference > 0 ? "— dashboard muestra menos" : "— dashboard muestra más"}
                    </span>
                  </div>
                )}
              </div>

              {/* Fuente de datos */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium" style={labelStyle}>
                  Fuente de datos{" "}
                  <span className="text-xs font-normal" style={{ color: FF.humo }}>(opcional)</span>
                </Label>
                <Input
                  placeholder="Ej: SAP, reporte Excel, sistema POS..."
                  value={dataSource}
                  onChange={(e) => setDataSource(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Descripción */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium" style={labelStyle}>
                  Descripción{" "}
                  <span style={{ color: FF.granate }}>*</span>
                </Label>
                <Textarea
                  placeholder="Describe la discrepancia encontrada, qué datos no coinciden y cualquier contexto relevante..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  required
                  minLength={10}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>

              {/* Prioridad */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium" style={labelStyle}>
                  Prioridad
                </Label>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v as "low" | "medium" | "high")}
                >
                  <SelectTrigger style={{ ...inputStyle }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["low", "medium", "high"] as const).map((p) => (
                      <SelectItem key={p} value={p}>
                        <span
                          className="flex items-center gap-2"
                          style={{ fontFamily: "'Sailec', sans-serif" }}
                        >
                          <span
                            className="h-2 w-2 rounded-full inline-block flex-shrink-0"
                            style={{ background: priorityConfig[p].dot }}
                          />
                          {priorityConfig[p].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Footer ── */}
            <DialogFooter
              className="px-6 py-4 gap-2"
              style={{ borderTop: `1px solid ${FF.beige}`, background: FF.hueso }}
            >
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                style={{
                  borderColor: FF.beige,
                  color: FF.carbon,
                  background: FF.blanco,
                  fontFamily: "'Sailec', sans-serif",
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!description.trim() || createTicket.isPending}
                className="uppercase tracking-wide text-sm font-medium"
                style={{
                  background: FF.carbon,
                  color: FF.blanco,
                  fontFamily: "'Sailec', sans-serif",
                }}
              >
                {createTicket.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="mr-2 h-4 w-4" style={{ color: FF.granateLight }} />
                    Enviar Reporte
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
