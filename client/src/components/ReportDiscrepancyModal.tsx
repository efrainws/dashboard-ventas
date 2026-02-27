import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface DiscrepancyContext {
  module: string;
  moduleLabel?: string;
  dateFrom?: string;
  dateTo?: string;
  storeId?: string;
  storeName?: string;
  dashboardAmount?: number;
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
  const [submitted, setSubmitted] = useState(false);
  const [ticketId, setTicketId] = useState<number | null>(null);

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
    });
  };

  const handleClose = () => {
    setAnalystAmount("");
    setDescription("");
    setDataSource("");
    setPriority("medium");
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[520px]">
        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-600" />
            <DialogHeader>
              <DialogTitle>Ticket #{ticketId} creado</DialogTitle>
              <DialogDescription>
                Tu reporte fue enviado al equipo técnico. Recibirás una
                notificación cuando sea revisado.
              </DialogDescription>
            </DialogHeader>
            <Button onClick={handleClose} className="mt-2">
              Cerrar
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <DialogTitle>Reportar Discrepancia</DialogTitle>
              </div>
              <DialogDescription>
                Reporta una diferencia entre los datos del dashboard y tu fuente
                de información. El equipo técnico recibirá una alerta inmediata.
              </DialogDescription>
            </DialogHeader>

            {/* Context summary */}
            <div className="my-4 rounded-md bg-muted/50 border p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Módulo</span>
                <span className="font-medium">{context.moduleLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Período</span>
                <span className="font-medium">
                  {context.dateFrom ? formatDate(context.dateFrom) : "—"}
                  {context.dateFrom && context.dateTo && context.dateFrom !== context.dateTo &&
                    ` → ${formatDate(context.dateTo!)}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tienda</span>
                <span className="font-medium">
                  {context.storeName ?? "Todas las tiendas"}
                </span>
              </div>
              {context.dashboardAmount !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monto en dashboard</span>
                  <span className="font-medium font-mono">
                    {formatAmount(context.dashboardAmount)}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* Analyst amount */}
              <div className="space-y-1.5">
                <Label htmlFor="analystAmount">
                  Monto según tu fuente{" "}
                  <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <Input
                  id="analystAmount"
                  type="number"
                  placeholder="Ej: 150000"
                  value={analystAmount}
                  onChange={(e) => setAnalystAmount(e.target.value)}
                />
                {difference !== null && (
                  <p
                    className={`text-xs font-medium ${
                      difference > 0 ? "text-amber-600" : "text-red-600"
                    }`}
                  >
                    Diferencia: {difference > 0 ? "+" : ""}
                    {formatAmount(Math.abs(difference))}
                    {difference > 0
                      ? " (dashboard muestra menos)"
                      : " (dashboard muestra más)"}
                  </p>
                )}
              </div>

              {/* Data source */}
              <div className="space-y-1.5">
                <Label htmlFor="dataSource">
                  Fuente de datos{" "}
                  <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <Input
                  id="dataSource"
                  placeholder="Ej: SAP, reporte Excel, sistema POS..."
                  value={dataSource}
                  onChange={(e) => setDataSource(e.target.value)}
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="description">
                  Descripción <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="description"
                  placeholder="Describe la discrepancia encontrada, qué datos no coinciden y cualquier contexto relevante..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  required
                  minLength={10}
                />
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <Label>Prioridad</Label>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v as "low" | "medium" | "high")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">🟢 Baja — diferencia menor, no urgente</SelectItem>
                    <SelectItem value="medium">🟡 Media — requiere revisión pronto</SelectItem>
                    <SelectItem value="high">🔴 Alta — diferencia significativa, urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!description.trim() || createTicket.isPending}
              >
                {createTicket.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="mr-2 h-4 w-4" />
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
