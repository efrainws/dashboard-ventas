/**
 * SupplierMonitor.tsx
 * Página de administración de usuarios proveedor.
 * Accesible solo para system_specialist y commercial_specialist.
 */
import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { NavigationMenu } from "@/components/NavigationMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  Clock,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Eye,
  EyeOff,
  Info,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { useLocation } from "wouter";

type SupplierStatus = "pending_activation" | "trial_active" | "trial_expired" | "subscribed_active" | "access_requested" | "suspended";

const STATUS_LABELS: Record<SupplierStatus, string> = {
  pending_activation: "Pendiente de activación",
  trial_active: "Trial activo",
  trial_expired: "Trial vencido",
  subscribed_active: "Suscrito activo",
  access_requested: "Solicitud pendiente",
  suspended: "Suspendido",
};

const STATUS_COLORS: Record<SupplierStatus, { bg: string; text: string; border: string }> = {
  pending_activation: { bg: "#EFF6FF", text: "#1E40AF", border: "#BFDBFE" },
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

// ─── Botón de reenvío de activación ────────────────────────────────────────

function ResendActivationButton({ userId, userName }: { userId: number; userName: string }) {
  const utils = trpc.useUtils();
  const resend = trpc.activation.resendActivation.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.supplierTrial.listSupplierUsers.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 text-xs"
      disabled={resend.isPending}
      onClick={() => resend.mutate({ userId })}
      title={`Reenviar correo de activación a ${userName}`}
    >
      {resend.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5 mr-1" />
      )}
      Reenviar
    </Button>
  );
}

// ─── Diálogo de creación de usuario proveedor ────────────────────────────────

interface CreateSupplierUserDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function CreateSupplierUserDialog({ open, onClose, onCreated }: CreateSupplierUserDialogProps) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
    supplierSearch: "",
    assignedSupplierId: "",
    supplierLabel: "",
    initialSupplierStatus: "pending_activation" as "pending_activation" | "subscribed_active",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [supplierResults, setSupplierResults] = useState<{ id: string; ruc: string; name: string }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setForm({ name: "", email: "", username: "", password: "", supplierSearch: "", assignedSupplierId: "", supplierLabel: "", initialSupplierStatus: "pending_activation" });
      setShowPassword(false);
      setSupplierResults([]);
      setShowDropdown(false);
    }
  }, [open]);

  const supplierQuery = trpc.users.getSuppliers.useQuery(
    { search: form.supplierSearch },
    { enabled: form.supplierSearch.length >= 2 }
  );

  useEffect(() => {
    if (supplierQuery.data?.suppliers) {
      setSupplierResults(supplierQuery.data.suppliers);
      setShowDropdown(form.supplierSearch.length >= 2 && supplierQuery.data.suppliers.length > 0);
    }
  }, [supplierQuery.data, form.supplierSearch]);

  const createMutation = trpc.users.createUser.useMutation({
    onSuccess: (data) => {
      if (data.emailSent) {
        toast.success("Usuario creado. Se envió el correo de activación.");
      } else {
        toast.success("Usuario creado. No se pudo enviar el correo de activación (revisa el email).");
      }
      onCreated();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error("El nombre es requerido.");
    if (!form.username.trim() || form.username.length < 3) return toast.error("El usuario debe tener al menos 3 caracteres.");
    if (!form.password || form.password.length < 6) return toast.error("La contraseña debe tener al menos 6 caracteres.");
    if (!form.assignedSupplierId) return toast.error("Debes seleccionar un proveedor.");

    createMutation.mutate({
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      username: form.username.trim(),
      password: form.password,
      role: "supplier_user",
      assignedSupplierId: form.assignedSupplierId,
      sendWelcomeEmail: !!form.email.trim(),
      initialSupplierStatus: form.initialSupplierStatus,
    });
  };

  const selectSupplier = (s: { id: string; ruc: string; name: string }) => {
    setForm((f) => ({
      ...f,
      assignedSupplierId: s.id,
      supplierSearch: `${s.ruc} — ${s.name}`,
      supplierLabel: `${s.ruc} — ${s.name}`,
    }));
    setShowDropdown(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" style={{ color: "#008064" }} />
            Nuevo Usuario Proveedor
          </DialogTitle>
          <DialogDescription>
            Completa los datos para crear la cuenta de acceso al portal de proveedores.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Nombre */}
          <div className="space-y-1.5">
            <Label htmlFor="sup-name">Nombre completo <span className="text-destructive">*</span></Label>
            <Input
              id="sup-name"
              placeholder="Ej. Juan Pérez"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="sup-email">
              Correo electrónico
              <span className="text-muted-foreground text-xs ml-1">(opcional, para envío de activación)</span>
            </Label>
            <Input
              id="sup-email"
              type="email"
              placeholder="proveedor@empresa.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          {/* Username */}
          <div className="space-y-1.5">
            <Label htmlFor="sup-username">Usuario <span className="text-destructive">*</span></Label>
            <Input
              id="sup-username"
              placeholder="Mínimo 3 caracteres"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, "") }))}
            />
          </div>

          {/* Contraseña */}
          <div className="space-y-1.5">
            <Label htmlFor="sup-password">Contraseña temporal <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Input
                id="sup-password"
                type={showPassword ? "text" : "password"}
                placeholder="Mínimo 6 caracteres"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Proveedor */}
          <div className="space-y-1.5">
            <Label htmlFor="sup-supplier">Proveedor asignado <span className="text-destructive">*</span></Label>
            <div className="relative" ref={dropdownRef}>
              <Input
                id="sup-supplier"
                placeholder="Buscar por RUC..."
                value={form.supplierSearch}
                onChange={(e) => {
                  setForm((f) => ({ ...f, supplierSearch: e.target.value, assignedSupplierId: "", supplierLabel: "" }));
                }}
                autoComplete="off"
              />
              {showDropdown && supplierResults.length > 0 && (
                <div
                  className="absolute z-50 w-full mt-1 rounded-md shadow-lg max-h-48 overflow-y-auto bg-card border border-border"
                >
                  {supplierResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                      onClick={() => selectSupplier(s)}
                    >
                      <span className="font-mono text-xs text-muted-foreground mr-2">{s.ruc}</span>
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {form.assignedSupplierId && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" style={{ color: "#008064" }} />
                Proveedor seleccionado: {form.supplierLabel}
              </p>
            )}
          </div>

          {/* Estado inicial del proveedor */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Estado inicial de acceso <span className="text-destructive">*</span></Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, initialSupplierStatus: "pending_activation" }))}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${
                  form.initialSupplierStatus === "pending_activation"
                    ? "border-[#008064] bg-[#008064]/5 ring-1 ring-[#008064]"
                    : "border-border hover:border-muted-foreground/50"
                }`}
              >
                <span className="text-xs font-semibold">Iniciar trial</span>
                <span className="text-xs text-muted-foreground">7 días de prueba al activar cuenta</span>
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, initialSupplierStatus: "subscribed_active" }))}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${
                  form.initialSupplierStatus === "subscribed_active"
                    ? "border-[#008064] bg-[#008064]/5 ring-1 ring-[#008064]"
                    : "border-border hover:border-muted-foreground/50"
                }`}
              >
                <span className="text-xs font-semibold">Suscripción activa</span>
                <span className="text-xs text-muted-foreground">Acceso facturado desde el inicio</span>
              </button>
            </div>
          </div>

          {/* Aviso de contraseña */}
          <div
            className="flex gap-2 rounded-lg p-3 text-xs"
            style={{ background: "#FEF3C7", border: "1px solid #FCD34D", color: "#78350F" }}
          >
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              La contraseña temporal <strong>no se enviará por correo</strong>. Debes comunicársela al usuario por otro medio.
              {form.email && " Se enviará un enlace de activación al correo indicado para que el usuario establezca su propia contraseña."}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={createMutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !form.name || !form.username || !form.password || !form.assignedSupplierId}
            style={{ background: "#008064", color: "#fff" }}
          >
            {createMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creando...</>
            ) : (
              <><UserPlus className="h-4 w-4 mr-2" />Crear usuario</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function SupplierMonitor() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [filterStatus, setFilterStatus] = useState<SupplierStatus | "all">("all");
  const [confirmAction, setConfirmAction] = useState<{ userId: number; action: "approve" | "suspend" | "activate_trial" | "activate_subscription" } | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

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

  const activateSubscriptionMutation = trpc.supplierTrial.activateSubscription.useMutation({
    onSuccess: () => {
      utils.supplierTrial.listSupplierUsers.invalidate();
      toast.success("Suscripción activada. El proveedor ha sido notificado.");
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
    } else if (confirmAction.action === "activate_subscription") {
      activateSubscriptionMutation.mutate({ userId: confirmAction.userId });
    }
  };

  const isPending = approveMutation.isPending || setStatusMutation.isPending || activateTrialMutation.isPending || activateSubscriptionMutation.isPending;
  const pendingCount = suppliers?.filter((s) => s.effectiveStatus === "access_requested").length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <NavigationMenu />
      <div className="container py-8 max-w-screen-2xl mx-auto space-y-6 pt-20">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}>
              Administración de Proveedores
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestión del ciclo de vida de acceso de usuarios proveedor
            </p>
          </div>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
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
              variant="outline"
              onClick={() => navigate("/afiliacion")}
            >
              Ver reporte de afiliación
            </Button>
            <Button
              size="sm"
              onClick={() => setShowCreateDialog(true)}
              style={{ background: "#008064", color: "#fff" }}
            >
              <UserPlus className="h-4 w-4 mr-1.5" />
              Nuevo Proveedor
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
              <SelectItem value="pending_activation">Pendiente de activación</SelectItem>
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
        <div className="rounded-lg overflow-hidden border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs font-semibold">Nombre</TableHead>
                <TableHead className="text-xs font-semibold">Email</TableHead>
                <TableHead className="text-xs font-semibold">Proveedor</TableHead>
                <TableHead className="text-xs font-semibold">Estado</TableHead>
                <TableHead className="text-xs font-semibold">Activación</TableHead>
                <TableHead className="text-xs font-semibold">Fin trial</TableHead>
                <TableHead className="text-xs font-semibold">Suscripción</TableHead>
                <TableHead className="text-xs font-semibold">T&amp;C aceptados</TableHead>
                <TableHead className="text-xs font-semibold text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" style={{ color: "#008064" }} />
                  </TableCell>
                </TableRow>
              ) : !suppliers?.length ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                    No hay usuarios proveedor con este filtro.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/30">
                    <TableCell className="text-sm">{s.name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.email ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {s.supplierRuc && s.supplierName
                        ? <span><span className="font-mono text-xs text-muted-foreground">{s.supplierRuc}</span> — {s.supplierName}</span>
                        : <span className="text-muted-foreground text-xs">{s.assignedSupplierId ?? "—"}</span>
                      }
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.effectiveStatus as SupplierStatus | null} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(s.activationDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(s.trialEndDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(s.subscriptionStartDate)}</TableCell>
                    <TableCell className="text-sm">
                      {s.termsAcceptedAt ? (
                        <span className="text-xs text-muted-foreground">{fmtDate(s.termsAcceptedAt)}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {s.effectiveStatus === "pending_activation" && (
                          <ResendActivationButton userId={s.id} userName={s.name ?? s.email ?? ""} />
                        )}
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
                        {s.effectiveStatus !== "subscribed_active" && s.effectiveStatus && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            style={{ borderColor: "#008064", color: "#008064" }}
                            onClick={() => setConfirmAction({ userId: s.id, action: "activate_subscription" })}
                          >
                            <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                            Activar suscripción
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

      {/* Diálogo de creación */}
      <CreateSupplierUserDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={() => {
          utils.supplierTrial.listSupplierUsers.invalidate();
          refetch();
        }}
      />

      {/* Dialog de confirmación de acción */}
      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.action === "approve" && "Aprobar solicitud de acceso"}
              {confirmAction?.action === "suspend" && "Suspender acceso"}
              {confirmAction?.action === "activate_trial" && "Activar período de prueba"}
              {confirmAction?.action === "activate_subscription" && "Activar suscripción"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.action === "approve" && "El proveedor pasará a estado 'Suscrito activo' y recibirá una notificación por correo."}
              {confirmAction?.action === "suspend" && "El proveedor perderá acceso inmediatamente. Podrás reactivarlo después."}
              {confirmAction?.action === "activate_trial" && "Se iniciará un nuevo período de prueba de 7 días para este usuario."}
              {confirmAction?.action === "activate_subscription" && "El proveedor pasará a estado suscrito activo de forma inmediata y recibirá una notificación por correo."}
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
