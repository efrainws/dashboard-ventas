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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  FileText,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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

// ─── Diálogo de gestión de Términos y Condiciones ────────────────────────────

type TermsVersion = {
  id: number;
  version: string;
  content: string;
  isActive: number;
  createdAt: Date;
  acceptanceCount: number;
};

type TermsDialogMode = "list" | "create" | "edit" | "preview";

function TermsManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<TermsDialogMode>("list");
  const [selectedVersion, setSelectedVersion] = useState<TermsVersion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TermsVersion | null>(null);
  const [activateTarget, setActivateTarget] = useState<TermsVersion | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [form, setForm] = useState({ version: "", content: "" });

  const { data: versions, isLoading, refetch } = trpc.supplierTrial.getAllTermsVersionsWithCount.useQuery(
    undefined,
    { enabled: open }
  );

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setMode("list");
      setSelectedVersion(null);
      setDeleteTarget(null);
      setActivateTarget(null);
      setExpandedId(null);
    }
  }, [open]);

  const createMutation = trpc.supplierTrial.createTermsVersion.useMutation({
    onSuccess: () => {
      toast.success("Versión creada y activada correctamente.");
      utils.supplierTrial.getAllTermsVersionsWithCount.invalidate();
      setMode("list");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.supplierTrial.updateTermsVersion.useMutation({
    onSuccess: () => {
      toast.success("Versión actualizada correctamente.");
      utils.supplierTrial.getAllTermsVersionsWithCount.invalidate();
      setMode("list");
    },
    onError: (e) => toast.error(e.message),
  });

  const activateMutation = trpc.supplierTrial.setActiveTermsVersion.useMutation({
    onSuccess: () => {
      toast.success("Versión activada. Los proveedores verán esta versión al ingresar.");
      utils.supplierTrial.getAllTermsVersionsWithCount.invalidate();
      setActivateTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.supplierTrial.deleteTermsVersion.useMutation({
    onSuccess: (result) => {
      if (result.deleted) {
        toast.success("Versión eliminada.");
        utils.supplierTrial.getAllTermsVersionsWithCount.invalidate();
      } else {
        toast.error(result.reason ?? "No se pudo eliminar la versión.");
      }
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setForm({ version: "", content: "" });
    setMode("create");
  };

  const openEdit = (v: TermsVersion) => {
    setSelectedVersion(v);
    setForm({ version: v.version, content: v.content });
    setMode("edit");
  };

  const openPreview = (v: TermsVersion) => {
    setSelectedVersion(v);
    setMode("preview");
  };

  const handleSubmit = () => {
    if (!form.version.trim()) return toast.error("El número de versión es requerido.");
    if (form.content.trim().length < 10) return toast.error("El contenido debe tener al menos 10 caracteres.");

    if (mode === "create") {
      createMutation.mutate({ version: form.version.trim(), content: form.content.trim() });
    } else if (mode === "edit" && selectedVersion) {
      updateMutation.mutate({ id: selectedVersion.id, version: form.version.trim(), content: form.content.trim() });
    }
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-center gap-2">
              {(mode === "edit" || mode === "preview") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setMode("list")}
                >
                  ← Volver
                </Button>
              )}
              {mode === "create" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setMode("list")}
                >
                  ← Volver
                </Button>
              )}
              <DialogTitle className="text-lg font-semibold">
                {mode === "list" && "Gestión de Términos y Condiciones"}
                {mode === "create" && "Nueva versión de T&C"}
                {mode === "edit" && `Editar versión ${selectedVersion?.version}`}
                {mode === "preview" && `Vista previa — versión ${selectedVersion?.version}`}
              </DialogTitle>
            </div>
            <DialogDescription>
              {mode === "list" && "Administra las versiones de los términos y condiciones. Solo una versión puede estar activa a la vez."}
              {mode === "create" && "Al crear una nueva versión, esta quedará activa automáticamente y desactivará la versión anterior."}
              {mode === "edit" && "Modifica el contenido o el número de versión. El estado activo/inactivo no cambia al editar."}
              {mode === "preview" && "Contenido completo de esta versión de términos y condiciones."}
            </DialogDescription>
          </DialogHeader>

          {/* ── LISTA ── */}
          {mode === "list" && (
            <div className="flex flex-col gap-4 flex-1 overflow-hidden">
              <div className="flex justify-end shrink-0">
                <Button size="sm" onClick={openCreate} style={{ background: "#008064", color: "#fff" }}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Nueva versión
                </Button>
              </div>

              <div className="overflow-y-auto flex-1 pr-1">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !versions || versions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                    <FileText className="h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No hay versiones de T&C registradas.</p>
                    <Button size="sm" onClick={openCreate} style={{ background: "#008064", color: "#fff" }}>
                      <Plus className="h-4 w-4 mr-1.5" />
                      Crear primera versión
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {versions.map((v) => (
                      <div
                        key={v.id}
                        className={`rounded-lg border p-4 transition-colors ${
                          v.isActive ? "border-[#008064]/40 bg-[#008064]/5" : "border-border bg-card"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex flex-col gap-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-foreground">
                                  Versión {v.version}
                                </span>
                                {v.isActive ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#008064]/10 text-[#008064] border border-[#008064]/30">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Activa
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                                    Inactiva
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {fmtDate(v.createdAt)}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span>
                                  {v.acceptanceCount === 0
                                    ? "Sin aceptaciones"
                                    : `${v.acceptanceCount} aceptación${v.acceptanceCount !== 1 ? "es" : ""}`}
                                </span>
                                <button
                                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                                  onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                                >
                                  {expandedId === v.id ? (
                                    <><ChevronUp className="h-3 w-3" /> Ocultar contenido</>
                                  ) : (
                                    <><ChevronDown className="h-3 w-3" /> Ver contenido</>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Acciones */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {!v.isActive && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                style={{ borderColor: "#008064", color: "#008064" }}
                                onClick={() => setActivateTarget(v)}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                Activar
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="Editar"
                              onClick={() => openEdit(v)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title={v.acceptanceCount > 0 ? "No se puede eliminar: tiene aceptaciones" : "Eliminar"}
                              disabled={v.isActive === 1 || v.acceptanceCount > 0}
                              onClick={() => setDeleteTarget(v)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Contenido expandible */}
                        {expandedId === v.id && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
                              {v.content}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CREAR / EDITAR ── */}
          {(mode === "create" || mode === "edit") && (
            <div className="flex flex-col gap-4 flex-1 overflow-hidden">
              <div className="overflow-y-auto flex-1 pr-1 space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="tc-version">Número de versión</Label>
                  <Input
                    id="tc-version"
                    placeholder="Ej: 1.0, 2.1, 2024-01"
                    value={form.version}
                    onChange={(e) => setForm({ ...form, version: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Identificador legible de esta versión (ej: "1.0", "2.0", "2025-01").
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="tc-content">Contenido de los términos</Label>
                  <Textarea
                    id="tc-content"
                    placeholder="Escribe aquí el texto completo de los términos y condiciones..."
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    className="min-h-[280px] font-mono text-sm resize-y"
                  />
                  <p className="text-xs text-muted-foreground">
                    Puedes usar texto plano o Markdown. Este contenido se mostrará a los proveedores al activar su cuenta.
                  </p>
                </div>

                {mode === "create" && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                      <strong>Al crear esta versión quedará activa automáticamente.</strong>{" "}
                      La versión anterior será desactivada. Los proveedores que aún no han aceptado verán esta nueva versión.
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter className="shrink-0">
                <Button variant="outline" onClick={() => setMode("list")} disabled={isMutating}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isMutating}
                  style={{ background: "#008064", color: "#fff" }}
                >
                  {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {mode === "create" ? "Crear versión" : "Guardar cambios"}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* ── VISTA PREVIA ── */}
          {mode === "preview" && selectedVersion && (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto flex-1 pr-1">
                <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                  {selectedVersion.content}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmar activación */}
      <AlertDialog open={!!activateTarget} onOpenChange={(o) => { if (!o) setActivateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Activar versión {activateTarget?.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta versión pasará a estar activa y la versión anterior quedará inactiva.
              Los proveedores que aún no han aceptado los T&C verán esta versión al ingresar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={activateMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => activateTarget && activateMutation.mutate({ id: activateTarget.id })}
              disabled={activateMutation.isPending}
              style={{ background: "#008064" }}
            >
              {activateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Activar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar eliminación */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar versión {deleteTarget?.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Solo se pueden eliminar versiones sin aceptaciones registradas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
      setForm({ name: "", email: "", password: "", supplierSearch: "", assignedSupplierId: "", supplierLabel: "", initialSupplierStatus: "pending_activation" });
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
    if (!form.email.trim()) return toast.error("El correo electrónico es requerido.");
    if (!form.password || form.password.length < 6) return toast.error("La contraseña debe tener al menos 6 caracteres.");
    if (!form.assignedSupplierId) return toast.error("Debes seleccionar un proveedor.");

    createMutation.mutate({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      role: "supplier_user",
      assignedSupplierId: form.assignedSupplierId,
      sendWelcomeEmail: true,
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
              Correo electrónico <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sup-email"
              type="email"
              placeholder="proveedor@empresa.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
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
                <div className="absolute z-50 w-full mt-1 rounded-md shadow-lg max-h-48 overflow-y-auto bg-card border border-border">
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
          {/* Estado inicial */}
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
          {/* Aviso contraseña */}
          <div
            className="flex gap-2 rounded-lg p-3 text-xs"
            style={{ background: "#FEF3C7", border: "1px solid #FCD34D", color: "#78350F" }}
          >
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              La contraseña temporal <strong>no se enviará por correo</strong>. Debes comunicársela al usuario por otro medio.
              {form.email && " Se enviará un enlace de activación al correo indicado."}
            </span>
          </div>
        </div>
        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={createMutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !form.name || !form.email || !form.password || !form.assignedSupplierId}
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
  const [showTermsDialog, setShowTermsDialog] = useState(false);

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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTermsDialog(true)}
            >
              <FileText className="h-4 w-4 mr-1.5" />
              Términos y Condiciones
            </Button>
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
              <SelectItem value="all"><span>Todos</span></SelectItem>
              <SelectItem value="pending_activation"><span>Pendiente de activación</span></SelectItem>
              <SelectItem value="trial_active"><span>Trial activo</span></SelectItem>
              <SelectItem value="trial_expired"><span>Trial vencido</span></SelectItem>
              <SelectItem value="access_requested"><span>Solicitud pendiente</span></SelectItem>
              <SelectItem value="subscribed_active"><span>Suscrito activo</span></SelectItem>
              <SelectItem value="suspended"><span>Suspendido</span></SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabla */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/30">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Usuario</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proveedor</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activación</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fin trial</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">T&C aceptados</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : !suppliers || suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                    No hay usuarios proveedor registrados.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((s) => (
                  <TableRow key={s.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">{s.name ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">{s.email ?? "—"}</span>
                        <span className="text-xs text-muted-foreground font-mono">{s.username ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-mono text-muted-foreground">{s.supplierRuc ?? "—"}</span>
                        <span className="text-sm">{s.supplierName ?? s.assignedSupplierId ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.effectiveStatus as SupplierStatus | null} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(s.activationDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(s.trialEndDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(s.termsAcceptedAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
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

      {/* Diálogo de gestión de T&C */}
      <TermsManagerDialog
        open={showTermsDialog}
        onClose={() => setShowTermsDialog(false)}
      />

      {/* Diálogo de creación de proveedor */}
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
