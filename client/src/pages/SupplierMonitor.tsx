/**
 * SupplierMonitor.tsx
 * Página de monitoreo de usuarios proveedor.
 * Accesible solo para system_specialist y commercial_specialist.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Loader2, CheckCircle2, Clock, XCircle, AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { useLocation } from "wouter";

type SupplierStatus = "trial_active" | "trial_expired" | "subscribed_active" | "access_requested" | "suspended";

const STATUS_LABELS: Record<SupplierStatus, string> = {
  trial_active: "Trial activo",
  trial_expired: "Trial vencido",
  subscribed_active: "Suscrito activo",
  access_requested: "Solicitud pendiente",
  suspended: "Suspendido",
};

const STATUS_COLORS: Record<SupplierStatus, { bg: string; text: string; border: string }> = {
  trial_active: { bg: "#DCFCE7", text: "#004032", border: "#86EFAC" },
  trial_expired: { bg: "#FEE2E2", text: "#7F1D1D", border: "#FCA5A5" },
  subscribed_active: { bg: "#D1FAE5", text: "#065F46", border: "#6EE7B7" },
  access_requested: { bg: "#FEF3C7", text: "#78350F", border: "#FCD34D" },
  suspended: { bg: "#F3F4F6", text: "#374151", border: "#D1D5DB" },
};

function StatusBadge({ status }: { status: SupplierStatus | null }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const colors = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return format(new Date(d), "dd/MM/yyyy", { locale: es });
}

export default function SupplierMonitor() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [filterStatus, setFilterStatus] = useState<SupplierStatus | "all">("all");
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ userId: number; action: "approve" | "suspend" | "activate_trial" } | null>(null);

  const { data: suppliers, isLoading, refetch } = trpc.supplierTrial.listSupplierUsers.useQuery(
    filterStatus !== "all" ? { status: filterStatus } : {}
  );

  const utils = trpc.useUtils();

  const approveMutation = trpc.supplierTrial.approveAccessRequest.useMutation({
    onSuccess: () => {
      utils.supplierTrial.listSupplierUsers.invalidate();
      toast.success("Solicitud aprobada. El proveedor ha sido notificado.");
      setConfirmAction(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const setStatusMutation = trpc.supplierTrial.setStatus.useMutation({
    onSuccess: () => {
      utils.supplierTrial.listSupplierUsers.invalidate();
      toast.success("Estado actualizado.");
      setConfirmAction(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const activateTrialMutation = trpc.supplierTrial.activateTrial.useMutation({
    onSuccess: () => {
      utils.supplierTrial.listSupplierUsers.invalidate();
      toast.success("Trial activado.");
      setConfirmAction(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // Guard de rol
  if (!user || (user.role !== "system_specialist" && user.role !== "commercial_specialist")) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">No tienes permisos para acceder a esta página.</p>
      </div>
    );
  }

  const handleConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.action === "approve") {
      approveMutation.mutate({ userId: confirmAction.userId });
    } else if (confirmAction.action === "suspend") {
      setStatusMutation.mutate({ userId: confirmAction.userId, status: "suspended" });
    } else if (confirmAction.action === "activate_trial") {
      activateTrialMutation.mutate({ userId: confirmAction.userId });
    }
  };

  const isPending = approveMutation.isPending || setStatusMutation.isPending || activateTrialMutation.isPending;

  const pendingCount = suppliers?.filter((s) => s.effectiveStatus === "access_requested").length ?? 0;

  return (
    <div className="min-h-screen" style={{ background: "#F5F4F1" }}>
      <div className="container py-8 max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}>
              Monitoreo de Proveedores
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestión del ciclo de vida de acceso de usuarios proveedor
            </p>
          </div>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ background: "#FEF3C7", color: "#78350F", border: "1px solid #FCD34D" }}>
                <AlertTriangle className="h-4 w-4" />
                {pendingCount} solicitud{pendingCount > 1 ? "es" : ""} pendiente{pendingCount > 1 ? "s" : ""}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Actualizar
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/afiliacion")}
              style={{ background: "#008064", color: "#fff" }}
            >
              Ver reporte de afiliación
            </Button>
          </div>
        </div>

        {/* Filtro */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Filtrar por estado:</span>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as SupplierStatus | "all")}>
            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="trial_active">Trial activo</SelectItem>
              <SelectItem value="trial_expired">Trial vencido</SelectItem>
              <SelectItem value="access_requested">Solicitud pendiente</SelectItem>
              <SelectItem value="subscribed_active">Suscrito activo</SelectItem>
              <SelectItem value="suspended">Suspendido</SelectItem>
            </SelectContent>
          </Select>
          {suppliers && (
            <span className="text-xs text-muted-foreground">
              {suppliers.length} usuario{suppliers.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Tabla */}
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #EAE8E2", background: "#fff" }}>
          <Table>
            <TableHeader>
              <TableRow style={{ background: "#F5F4F1" }}>
                <TableHead className="text-xs font-semibold">Nombre</TableHead>
                <TableHead className="text-xs font-semibold">Email</TableHead>
                <TableHead className="text-xs font-semibold">Proveedor ID</TableHead>
                <TableHead className="text-xs font-semibold">Estado</TableHead>
                <TableHead className="text-xs font-semibold">Activación</TableHead>
                <TableHead className="text-xs font-semibold">Fin trial</TableHead>
                <TableHead className="text-xs font-semibold">Suscripción</TableHead>
                <TableHead className="text-xs font-semibold text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" style={{ color: "#008064" }} />
                  </TableCell>
                </TableRow>
              ) : !suppliers?.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                    No hay usuarios proveedor con este filtro.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/30">
                    <TableCell className="text-sm">{s.name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.email ?? "—"}</TableCell>
                    <TableCell className="text-sm font-mono text-xs">{s.assignedSupplierId ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={s.effectiveStatus as SupplierStatus | null} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(s.activationDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(s.trialEndDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(s.subscriptionStartDate)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {s.effectiveStatus === "access_requested" && (
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            style={{ background: "#008064", color: "#fff" }}
                            onClick={() => setConfirmAction({ userId: s.id, action: "approve" })}
                          >
                            <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                            Aprobar
                          </Button>
                        )}
                        {(!s.supplierStatus || s.effectiveStatus === "trial_expired" || s.effectiveStatus === "suspended") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setConfirmAction({ userId: s.id, action: "activate_trial" })}
                          >
                            <Clock className="h-3.5 w-3.5 mr-1" />
                            Activar trial
                          </Button>
                        )}
                        {s.effectiveStatus !== "suspended" && s.effectiveStatus && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-destructive"
                            onClick={() => setConfirmAction({ userId: s.id, action: "suspend" })}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            Suspender
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dialog de confirmación */}
      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.action === "approve" && "Aprobar solicitud de acceso"}
              {confirmAction?.action === "suspend" && "Suspender acceso"}
              {confirmAction?.action === "activate_trial" && "Activar período de prueba"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.action === "approve" && "El proveedor pasará a estado 'Suscrito activo' y recibirá una notificación por correo."}
              {confirmAction?.action === "suspend" && "El proveedor perderá acceso inmediatamente. Podrás reactivarlo después."}
              {confirmAction?.action === "activate_trial" && "Se iniciará un nuevo período de prueba de 7 días para este usuario."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmAction(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              style={{
                background: confirmAction?.action === "suspend" ? "#DC2626" : "#008064",
                color: "#fff",
              }}
              onClick={handleConfirm}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
