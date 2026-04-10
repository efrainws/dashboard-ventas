import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { NavigationMenu } from "@/components/NavigationMenu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

const MODULE_LABELS: Record<string, string> = {
  "sales-by-category": "Análisis General",
  "hourly-analysis": "Análisis por Horas",
  "sales-vs-target": "Ventas vs Meta",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  open: {
    label: "Abierto",
    // Granate F&F — urgente / alerta
    color: "bg-[#BC2C46]/15 text-[#BC2C46] border-[#BC2C46]/30",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  in_review: {
    label: "En Revisión",
    // Mostaza F&F — advertencia / pendiente
    color: "bg-[#C49705]/15 text-[#C49705] border-[#C49705]/30",
    icon: <Clock className="h-3 w-3" />,
  },
  resolved: {
    label: "Resuelto",
    // Esmeralda F&F — éxito / positivo
    color: "bg-[#008064]/15 text-[#008064] border-[#008064]/30",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  closed: {
    label: "Cerrado",
    // Humo F&F — neutro / inactivo
    color: "bg-[#919291]/15 text-[#919291] border-[#919291]/30",
    icon: <XCircle className="h-3 w-3" />,
  },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  // Celeste F&F — positivo suave
  low: { label: "Baja", color: "bg-[#5BB6B7]/15 text-[#5BB6B7] border-[#5BB6B7]/30" },
  // Mostaza F&F — advertencia
  medium: { label: "Media", color: "bg-[#C49705]/15 text-[#C49705] border-[#C49705]/30" },
  // Granate F&F — urgente
  high: { label: "Alta", color: "bg-[#BC2C46]/15 text-[#BC2C46] border-[#BC2C46]/30" },
};

function formatDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function formatAmount(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return `S/ ${n.toLocaleString("es-PE")}`;
}

export default function DiscrepancyTickets() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [selectedTicket, setSelectedTicket] = useState<number | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [resolutionNotes, setResolutionNotes] = useState("");

  const { data: tickets, isLoading, refetch } = trpc.tickets.list.useQuery({
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
    module: moduleFilter !== "all" ? moduleFilter : undefined,
    limit: 100,
  });

  const updateStatus = trpc.tickets.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Estado del ticket actualizado");
      setSelectedTicket(null);
      setNewStatus("");
      setResolutionNotes("");
      refetch();
    },
    onError: (e) => toast.error(`Error: ${e.message}`),
  });

  const openTickets = tickets?.filter((t) => t.status === "open").length ?? 0;
  const inReviewTickets = tickets?.filter((t) => t.status === "in_review").length ?? 0;

  const selectedTicketData = tickets?.find((t) => t.id === selectedTicket);

  return (
    <div className="min-h-screen bg-background">
      <NavigationMenu />

      <div className="container py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Tickets de Discrepancias
            </h1>
            <p className="text-muted-foreground mt-1">
              Reportes de diferencias entre el dashboard y las fuentes de los analistas
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Actualizar
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Abiertos", value: openTickets, color: "text-[#BC2C46]" },
            { label: "En Revisión", value: inReviewTickets, color: "text-[#C49705]" },
            {
              label: "Resueltos",
              value: tickets?.filter((t) => t.status === "resolved").length ?? 0,
              color: "text-[#008064]",
            },
            { label: "Total", value: tickets?.length ?? 0, color: "text-foreground" },
          ].map((item) => (
            <Card key={item.label} className="py-4">
              <CardContent className="p-0 px-4 text-center">
                <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-heading uppercase text-base tracking-wide">
                  Filtros
                </CardTitle>
                <CardDescription>
                  Filtra los tickets por estado y módulo
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setStatusFilter("all"); setModuleFilter("all"); }}
              >
                <X className="mr-2 h-4 w-4" />
                Limpiar Filtros
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="open">Abiertos</SelectItem>
              <SelectItem value="in_review">En Revisión</SelectItem>
              <SelectItem value="resolved">Resueltos</SelectItem>
              <SelectItem value="closed">Cerrados</SelectItem>
            </SelectContent>
          </Select>

          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Módulo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los módulos</SelectItem>
              <SelectItem value="sales-by-category">Análisis General</SelectItem>
              <SelectItem value="hourly-analysis">Análisis por Horas</SelectItem>
              <SelectItem value="sales-vs-target">Ventas vs Meta</SelectItem>
            </SelectContent>
          </Select>
            </div>
          </CardContent>
        </Card>

        {/* Ticket list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !tickets?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mb-3 opacity-30" />
            <p className="font-medium">No hay tickets</p>
            <p className="text-sm">
              {statusFilter !== "all" || moduleFilter !== "all"
                ? "Prueba cambiando los filtros"
                : "Los analistas pueden reportar discrepancias desde los dashboards"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => {
              const statusCfg = STATUS_CONFIG[ticket.status];
              const priorityCfg = PRIORITY_CONFIG[ticket.priority];
              return (
                <Card
                  key={ticket.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => {
                    setSelectedTicket(ticket.id);
                    setNewStatus(ticket.status);
                    setResolutionNotes(ticket.resolutionNotes ?? "");
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-muted-foreground">
                            #{ticket.id}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${statusCfg.color} flex items-center gap-1`}
                          >
                            {statusCfg.icon}
                            {statusCfg.label}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs ${priorityCfg.color}`}
                          >
                            {priorityCfg.label}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {MODULE_LABELS[ticket.module] ?? ticket.module}
                          </Badge>
                        </div>
                        <p className="mt-1.5 text-sm line-clamp-2">{ticket.description}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            📅 {formatDate(ticket.dateFrom)}
                            {ticket.dateFrom !== ticket.dateTo &&
                              ` → ${formatDate(ticket.dateTo)}`}
                          </span>
                          <span>🏪 {ticket.storeName}</span>
                          {ticket.dashboardAmount !== null && (
                            <span>
                              Dashboard: {formatAmount(ticket.dashboardAmount)}
                            </span>
                          )}
                          {ticket.analystAmount !== null && (
                            <span>
                              Analista: {formatAmount(ticket.analystAmount)}
                            </span>
                          )}
                          {ticket.difference !== null && (
                            <span
                              className={
                                Math.abs(ticket.difference) > 0
                                  ? "text-[#C49705] font-medium"
                                  : ""
                              }
                            >
                              Diferencia: {formatAmount(ticket.difference)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground shrink-0">
                        <p>{ticket.reportedByName}</p>
                        <p>
                          {new Date(ticket.createdAt).toLocaleDateString("es-PE", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Ticket detail / update dialog */}
      <Dialog
        open={selectedTicket !== null}
        onOpenChange={(v) => !v && setSelectedTicket(null)}
      >
        <DialogContent className="sm:max-w-[560px]">
          {selectedTicketData && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Ticket #{selectedTicketData.id} —{" "}
                  {MODULE_LABELS[selectedTicketData.module] ?? selectedTicketData.module}
                </DialogTitle>
                <DialogDescription>
                  Reportado por {selectedTicketData.reportedByName} el{" "}
                  {new Date(selectedTicketData.createdAt).toLocaleDateString("es-PE", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 my-2">
                {/* Details */}
                <div className="rounded-md bg-muted/50 border p-3 text-sm space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Período</span>
                    <span>
                      {formatDate(selectedTicketData.dateFrom)}
                      {selectedTicketData.dateFrom !== selectedTicketData.dateTo &&
                        ` → ${formatDate(selectedTicketData.dateTo)}`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tienda</span>
                    <span>{selectedTicketData.storeName}</span>
                  </div>
                  {selectedTicketData.dashboardAmount !== null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Monto dashboard</span>
                      <span className="font-mono">
                        {formatAmount(selectedTicketData.dashboardAmount)}
                      </span>
                    </div>
                  )}
                  {selectedTicketData.analystAmount !== null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Monto analista</span>
                      <span className="font-mono">
                        {formatAmount(selectedTicketData.analystAmount)}
                      </span>
                    </div>
                  )}
                  {selectedTicketData.difference !== null && (
                    <div className="flex justify-between font-medium">
                      <span className="text-muted-foreground">Diferencia</span>
                      <span
                        className={
                          selectedTicketData.difference !== 0
                            ? "text-[#C49705]"
                            : "text-[#008064]"
                        }
                      >
                        {formatAmount(selectedTicketData.difference)}
                      </span>
                    </div>
                  )}
                  {selectedTicketData.dataSource && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fuente</span>
                      <span>{selectedTicketData.dataSource}</span>
                    </div>
                  )}
                  {(selectedTicketData as any).relatedSaleAmount && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Monto venta con error</span>
                      <span className="font-mono text-sm">
                        S/ {parseFloat((selectedTicketData as any).relatedSaleAmount).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-sm font-medium mb-1">Descripción</p>
                  <p className="text-sm text-muted-foreground bg-muted/30 rounded p-2">
                    {selectedTicketData.description}
                  </p>
                </div>

                {selectedTicketData.resolutionNotes && (
                  <div>
                    <p className="text-sm font-medium mb-1">Notas de resolución anteriores</p>
                    <p className="text-sm text-muted-foreground bg-muted/30 rounded p-2">
                      {selectedTicketData.resolutionNotes}
                    </p>
                  </div>
                )}

                {/* system_specialist update controls */}
                {user?.role === "system_specialist" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Cambiar estado</Label>
                      <Select value={newStatus} onValueChange={setNewStatus}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Abierto</SelectItem>
                          <SelectItem value="in_review">En Revisión</SelectItem>
                          <SelectItem value="resolved">Resuelto</SelectItem>
                          <SelectItem value="closed">Cerrado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Notas de resolución</Label>
                      <Textarea
                        placeholder="Explica qué se encontró y cómo se resolvió..."
                        value={resolutionNotes}
                        onChange={(e) => setResolutionNotes(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedTicket(null)}>
                  Cerrar
                </Button>
                {user?.role === "system_specialist" && (
                  <Button
                    onClick={() =>
                      updateStatus.mutate({
                        id: selectedTicketData.id,
                        status: newStatus as any,
                        resolutionNotes: resolutionNotes || undefined,
                      })
                    }
                    disabled={
                      updateStatus.isPending ||
                      (newStatus === selectedTicketData.status &&
                        resolutionNotes === (selectedTicketData.resolutionNotes ?? ""))
                    }
                  >
                    {updateStatus.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Guardar Cambios
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
