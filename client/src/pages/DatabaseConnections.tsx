import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { NavigationMenu } from "@/components/NavigationMenu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Database,
  Plus,
  Pencil,
  Trash2,
  Wifi,
  WifiOff,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

// ── Design System tokens (Flora & Fauna) ────────────────────────────────────
const FF = {
  granate: "#BC2C46",
  esmeralda: "#008064",
  mostaza: "#C49705",
  cobalto: "#1A6894",
  carbon: "#232523",
  humo: "#919291",
  beige: "#EAE8E2",
  hueso: "#F5F4F1",
  blanco: "#FFFFFF",
  esmeraldaLight: "#E6F4F1",
  mostazaLight: "#FDF6E3",
  cobaltaLight: "#E8F1F7",
  granateLight: "#FAEAED",
};

// ── Types ────────────────────────────────────────────────────────────────────
type DbConn = {
  id: number;
  name: string;
  description: string | null;
  host: string;
  port: number;
  database: string;
  username: string;
  sslEnabled: number;
  sslMode: string | null;
  purpose: "sales" | "stock" | "both" | "other";
  isActive: number;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  lastTestedAt: Date | null;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
};

type FormData = {
  name: string;
  description: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslEnabled: boolean;
  sslMode: "disable" | "require" | "verify-ca" | "verify-full";
  purpose: "sales" | "stock" | "both" | "other";
  isActive: boolean;
};

const DEFAULT_FORM: FormData = {
  name: "",
  description: "",
  host: "",
  port: 5432,
  database: "",
  username: "",
  password: "",
  sslEnabled: true,
  sslMode: "require",
  purpose: "both",
  isActive: true,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function purposeLabel(p: string) {
  switch (p) {
    case "sales": return "Ventas";
    case "stock": return "Stock";
    case "both": return "Ventas y Stock";
    case "other": return "Otro";
    default: return p;
  }
}

function purposeColor(p: string): { bg: string; text: string; border: string } {
  switch (p) {
    case "sales":  return { bg: FF.cobaltaLight, text: FF.cobalto, border: "#B8D3E4" };
    case "stock":  return { bg: FF.mostazaLight, text: "#8B6B04", border: "#E8D080" };
    case "both":   return { bg: FF.esmeraldaLight, text: FF.esmeralda, border: "#A0D4C8" };
    default:       return { bg: FF.hueso, text: FF.humo, border: FF.beige };
  }
}

// ── TestStatusBadge ───────────────────────────────────────────────────────────
function TestStatusBadge({ status, message }: { status: string | null; message: string | null }) {
  if (!status || status === "pending") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ background: FF.hueso, color: FF.humo, border: `1px solid ${FF.beige}` }}
          >
            <Clock className="h-3 w-3" />
            Pendiente
          </span>
        </TooltipTrigger>
        <TooltipContent>No se ha probado aún</TooltipContent>
      </Tooltip>
    );
  }
  if (status === "ok") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ background: FF.esmeraldaLight, color: FF.esmeralda, border: "1px solid #A0D4C8" }}
          >
            <CheckCircle2 className="h-3 w-3" />
            OK
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{message ?? "Conexión exitosa"}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ background: FF.granateLight, color: FF.granate, border: "1px solid #E8B0BC" }}
        >
          <XCircle className="h-3 w-3" />
          Error
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{message ?? "Error de conexión"}</TooltipContent>
    </Tooltip>
  );
}

// ── Connection Form Modal ─────────────────────────────────────────────────────
function ConnectionFormModal({
  open,
  onClose,
  editingConn,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  editingConn: DbConn | null;
  onSuccess: () => void;
}) {
  const isEditing = editingConn !== null;
  const [form, setForm] = useState<FormData>(() =>
    editingConn
      ? {
          name: editingConn.name,
          description: editingConn.description ?? "",
          host: editingConn.host,
          port: editingConn.port,
          database: editingConn.database,
          username: editingConn.username,
          password: "",
          sslEnabled: editingConn.sslEnabled === 1,
          sslMode: (editingConn.sslMode ?? "require") as FormData["sslMode"],
          purpose: editingConn.purpose,
          isActive: editingConn.isActive === 1,
        }
      : DEFAULT_FORM
  );

  const utils = trpc.useUtils();

  const createMutation = trpc.dbConnections.create.useMutation({
    onSuccess: () => {
      toast.success("Conexión creada exitosamente");
      utils.dbConnections.list.invalidate();
      onSuccess();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.dbConnections.update.useMutation({
    onSuccess: () => {
      toast.success("Conexión actualizada exitosamente");
      utils.dbConnections.list.invalidate();
      onSuccess();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing) {
      updateMutation.mutate({ id: editingConn!.id, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2 uppercase tracking-wide"
            style={{ fontFamily: "'Italian Plate No 1', serif", color: FF.carbon }}
          >
            <Database className="h-5 w-5" style={{ color: FF.esmeralda }} />
            {isEditing ? "Editar Conexión" : "Nueva Conexión PostgreSQL"}
          </DialogTitle>
          <DialogDescription style={{ color: FF.humo }}>
            {isEditing
              ? "Modifica los parámetros de la conexión. Deja la contraseña vacía para mantener la actual."
              : "Configura los parámetros de conexión a la base de datos PostgreSQL externa."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* Nombre y propósito */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="conn-name" className="text-sm font-medium" style={{ color: FF.carbon }}>
                Nombre de la conexión <span style={{ color: FF.granate }}>*</span>
              </Label>
              <Input
                id="conn-name"
                placeholder="Ej: Producción — Ventas"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
                style={{ borderColor: FF.beige, background: FF.blanco }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conn-purpose" className="text-sm font-medium" style={{ color: FF.carbon }}>
                Propósito
              </Label>
              <Select value={form.purpose} onValueChange={(v) => set("purpose", v as FormData["purpose"])}>
                <SelectTrigger id="conn-purpose" style={{ borderColor: FF.beige }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both"><span>Ventas y Stock</span></SelectItem>
                  <SelectItem value="sales"><span>Solo Ventas</span></SelectItem>
                  <SelectItem value="stock"><span>Solo Stock</span></SelectItem>
                  <SelectItem value="other"><span>Otro</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="conn-desc" className="text-sm font-medium" style={{ color: FF.carbon }}>
              Descripción
            </Label>
            <Textarea
              id="conn-desc"
              placeholder="Descripción opcional del propósito de esta conexión..."
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              style={{ borderColor: FF.beige, background: FF.blanco }}
            />
          </div>

          {/* Host y puerto */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="conn-host" className="text-sm font-medium" style={{ color: FF.carbon }}>
                Host / Endpoint <span style={{ color: FF.granate }}>*</span>
              </Label>
              <Input
                id="conn-host"
                placeholder="Ej: db.example.com o 10.0.0.1"
                value={form.host}
                onChange={(e) => set("host", e.target.value)}
                required
                className="font-mono text-sm"
                style={{ borderColor: FF.beige, background: FF.blanco }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conn-port" className="text-sm font-medium" style={{ color: FF.carbon }}>
                Puerto <span style={{ color: FF.granate }}>*</span>
              </Label>
              <Input
                id="conn-port"
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => set("port", parseInt(e.target.value) || 5432)}
                required
                className="font-mono text-sm"
                style={{ borderColor: FF.beige, background: FF.blanco }}
              />
            </div>
          </div>

          {/* Base de datos */}
          <div className="space-y-1.5">
            <Label htmlFor="conn-db" className="text-sm font-medium" style={{ color: FF.carbon }}>
              Nombre de la base de datos <span style={{ color: FF.granate }}>*</span>
            </Label>
            <Input
              id="conn-db"
              placeholder="Ej: dba_qa_middleware"
              value={form.database}
              onChange={(e) => set("database", e.target.value)}
              required
              className="font-mono text-sm"
              style={{ borderColor: FF.beige, background: FF.blanco }}
            />
          </div>

          {/* Usuario y contraseña */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="conn-user" className="text-sm font-medium" style={{ color: FF.carbon }}>
                Usuario <span style={{ color: FF.granate }}>*</span>
              </Label>
              <Input
                id="conn-user"
                placeholder="Ej: postgres"
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
                required
                autoComplete="off"
                className="font-mono text-sm"
                style={{ borderColor: FF.beige, background: FF.blanco }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conn-pass" className="text-sm font-medium" style={{ color: FF.carbon }}>
                Contraseña{" "}
                {isEditing
                  ? <span className="text-xs" style={{ color: FF.humo }}>(vacío = mantener actual)</span>
                  : <span style={{ color: FF.granate }}>*</span>
                }
              </Label>
              <Input
                id="conn-pass"
                type="password"
                placeholder={isEditing ? "••••••••" : "Contraseña de la base de datos"}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                required={!isEditing}
                autoComplete="new-password"
                className="font-mono text-sm"
                style={{ borderColor: FF.beige, background: FF.blanco }}
              />
            </div>
          </div>

          {/* SSL */}
          <div
            className="rounded-lg p-4 space-y-4"
            style={{ border: `1px solid ${FF.beige}`, background: FF.hueso }}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-1.5 text-sm font-medium" style={{ color: FF.carbon }}>
                  <ShieldCheck className="h-4 w-4" style={{ color: FF.esmeralda }} />
                  SSL / TLS
                </Label>
                <p className="text-xs" style={{ color: FF.humo }}>Cifrado en tránsito para la conexión</p>
              </div>
              <Switch
                checked={form.sslEnabled}
                onCheckedChange={(v) => set("sslEnabled", v)}
              />
            </div>
            {form.sslEnabled && (
              <div className="space-y-1.5">
                <Label htmlFor="conn-sslmode" className="text-sm font-medium" style={{ color: FF.carbon }}>
                  Modo SSL
                </Label>
                <Select value={form.sslMode} onValueChange={(v) => set("sslMode", v as FormData["sslMode"])}>
                  <SelectTrigger id="conn-sslmode" style={{ borderColor: FF.beige, background: FF.blanco }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="require"><span>require — cifrado obligatorio</span></SelectItem>
                    <SelectItem value="verify-ca"><span>verify-ca — verificar CA</span></SelectItem>
                    <SelectItem value="verify-full"><span>verify-full — verificar CA + hostname</span></SelectItem>
                    <SelectItem value="disable"><span>disable — sin cifrado</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Estado activo */}
          <div
            className="flex items-center justify-between rounded-lg p-4"
            style={{ border: `1px solid ${FF.beige}`, background: FF.hueso }}
          >
            <div className="space-y-0.5">
              <Label className="text-sm font-medium" style={{ color: FF.carbon }}>Conexión activa</Label>
              <p className="text-xs" style={{ color: FF.humo }}>Las conexiones inactivas no se usan para consultas</p>
            </div>
            <Switch
              checked={form.isActive}
              onCheckedChange={(v) => set("isActive", v)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              style={{ borderColor: FF.beige, color: FF.carbon }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              style={{ background: FF.carbon, color: FF.blanco }}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Guardar Cambios" : "Crear Conexión"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DatabaseConnections() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConn, setEditingConn] = useState<DbConn | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);

  const { data: connections, isLoading, error, refetch } = trpc.dbConnections.list.useQuery();
  const utils = trpc.useUtils();

  const deleteMutation = trpc.dbConnections.delete.useMutation({
    onSuccess: () => {
      toast.success("Conexión eliminada");
      utils.dbConnections.list.invalidate();
      setDeletingId(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setDeletingId(null);
    },
  });

  const testMutation = trpc.dbConnections.testConnection.useMutation({
    onSuccess: (result) => {
      if (result.status === "ok") {
        toast.success(`Conexión exitosa: ${result.message}`);
      } else {
        toast.error(`Error de conexión: ${result.message}`);
      }
      utils.dbConnections.list.invalidate();
      setTestingId(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setTestingId(null);
    },
  });

  const handleOpenCreate = () => {
    setEditingConn(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (conn: DbConn) => {
    setEditingConn(conn);
    setModalOpen(true);
  };

  const handleTest = (id: number) => {
    setTestingId(id);
    testMutation.mutate({ id });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id });
  };

  return (
    <div className="min-h-screen" style={{ background: FF.hueso }}>
      <NavigationMenu />
      <div className="container py-8 space-y-6">

        {/* Page header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1
              className="text-3xl font-bold uppercase tracking-wide"
              style={{ fontFamily: "'Italian Plate No 1', serif", color: FF.carbon }}
            >
              Conexiones de Base de Datos
            </h1>
            <p className="text-sm" style={{ color: FF.humo }}>
              Gestiona las conexiones a bases de datos PostgreSQL externas para ventas y stock.
            </p>
          </div>
          <Button
            onClick={handleOpenCreate}
            className="gap-2 font-medium"
            style={{ background: FF.carbon, color: FF.blanco }}
          >
            <Plus className="h-4 w-4" />
            Nueva Conexión
          </Button>
        </div>

        {/* Info banner — Mostaza (advertencia/info) */}
        <div
          className="flex items-start gap-3 rounded-lg p-4 text-sm"
          style={{
            background: FF.mostazaLight,
            border: `1px solid #E8D080`,
            color: "#624C02",
          }}
        >
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" style={{ color: FF.mostaza }} />
          <p>
            Las contraseñas se almacenan cifradas con <strong>AES-256</strong>. Esta sección es
            exclusiva para <strong>Especialistas de Sistemas</strong>. Las conexiones marcadas como
            activas son las que el sistema utiliza para cargar datos de ventas y stock.
          </p>
        </div>

        {/* Table card */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: FF.blanco,
            border: `1px solid ${FF.beige}`,
            boxShadow: "0 2px 12px rgba(35,37,35,0.06)",
          }}
        >
          {/* Card header */}
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: `1px solid ${FF.beige}` }}
          >
            <div>
              <h2
                className="text-sm font-bold uppercase tracking-widest"
                style={{ fontFamily: "'Italian Plate No 1', serif", color: FF.carbon }}
              >
                Conexiones Registradas
              </h2>
              <p className="text-xs mt-0.5" style={{ color: FF.humo }}>
                {connections
                  ? `${connections.length} conexión${connections.length !== 1 ? "es" : ""} registrada${connections.length !== 1 ? "s" : ""}`
                  : "Cargando..."}
              </p>
            </div>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 text-xs rounded-md px-3 py-1.5 transition-colors"
              style={{ color: FF.humo, border: `1px solid ${FF.beige}`, background: FF.hueso }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Actualizar
            </button>
          </div>

          {/* Table body */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: FF.esmeralda }} />
              <span className="ml-2 text-sm" style={{ color: FF.humo }}>Cargando conexiones...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-16 gap-2">
              <XCircle className="h-5 w-5" style={{ color: FF.granate }} />
              <span className="text-sm" style={{ color: FF.granate }}>Error al cargar conexiones: {error.message}</span>
            </div>
          ) : !connections || connections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Database className="h-10 w-10 opacity-20" style={{ color: FF.carbon }} />
              <p className="text-sm" style={{ color: FF.humo }}>No hay conexiones configuradas.</p>
              <button
                onClick={handleOpenCreate}
                className="flex items-center gap-1.5 text-xs rounded-md px-3 py-1.5 font-medium"
                style={{ background: FF.carbon, color: FF.blanco }}
              >
                <Plus className="h-4 w-4" />
                Crear primera conexión
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: FF.hueso, borderBottom: `1px solid ${FF.beige}` }}>
                    {["Nombre", "Host", "Base de Datos", "Propósito", "Estado", "Último Test", "Acciones"].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${i === 6 ? "text-right" : ""}`}
                        style={{ color: FF.carbon, fontFamily: "'Italian Plate No 1', serif" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {connections.map((conn, idx) => (
                    <tr
                      key={conn.id}
                      style={{
                        borderBottom: `1px solid ${FF.beige}`,
                        background: idx % 2 === 0 ? FF.blanco : FF.hueso,
                      }}
                    >
                      {/* Nombre */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 shrink-0" style={{ color: FF.esmeralda }} />
                          <div>
                            <p className="font-medium" style={{ color: FF.carbon }}>{conn.name}</p>
                            {conn.description && (
                              <p className="text-xs truncate max-w-[180px]" style={{ color: FF.humo }}>
                                {conn.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Host */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs" style={{ color: FF.carbon }}>
                          {conn.host}
                          <span style={{ color: FF.humo }}>:{conn.port}</span>
                        </span>
                        <p className="text-xs mt-0.5" style={{ color: FF.humo }}>
                          {conn.sslEnabled ? `SSL: ${conn.sslMode ?? "require"}` : "Sin SSL"}
                        </p>
                      </td>

                      {/* Base de datos */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs" style={{ color: FF.carbon }}>{conn.database}</span>
                        <p className="text-xs mt-0.5" style={{ color: FF.humo }}>{conn.username}</p>
                      </td>

                      {/* Propósito */}
                      <td className="px-4 py-3">
                        {(() => {
                          const c = purposeColor(conn.purpose);
                          return (
                            <span
                              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                              style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                            >
                              {purposeLabel(conn.purpose)}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Estado activo */}
                      <td className="px-4 py-3">
                        {conn.isActive ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                            style={{ background: FF.esmeraldaLight, color: FF.esmeralda, border: "1px solid #A0D4C8" }}
                          >
                            <Wifi className="h-3 w-3" />
                            Activa
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                            style={{ background: FF.hueso, color: FF.humo, border: `1px solid ${FF.beige}` }}
                          >
                            <WifiOff className="h-3 w-3" />
                            Inactiva
                          </span>
                        )}
                      </td>

                      {/* Último test */}
                      <td className="px-4 py-3">
                        <TestStatusBadge status={conn.lastTestStatus} message={conn.lastTestMessage} />
                        {conn.lastTestedAt && (
                          <p className="text-[10px] mt-0.5" style={{ color: FF.humo }}>
                            {new Date(conn.lastTestedAt).toLocaleString("es-PE", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Test */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="h-8 w-8 flex items-center justify-center rounded-md transition-colors"
                                style={{ color: FF.cobalto }}
                                onClick={() => handleTest(conn.id)}
                                disabled={testingId === conn.id}
                              >
                                {testingId === conn.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Probar conexión</TooltipContent>
                          </Tooltip>

                          {/* Edit */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="h-8 w-8 flex items-center justify-center rounded-md transition-colors"
                                style={{ color: FF.carbon }}
                                onClick={() => handleOpenEdit(conn as DbConn)}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Editar</TooltipContent>
                          </Tooltip>

                          {/* Delete */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="h-8 w-8 flex items-center justify-center rounded-md transition-colors"
                                style={{ color: FF.granate }}
                                onClick={() => setDeletingId(conn.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Eliminar</TooltipContent>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <ConnectionFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          editingConn={editingConn}
          onSuccess={() => {}}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deletingId !== null} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle
              className="uppercase tracking-wide"
              style={{ fontFamily: "'Italian Plate No 1', serif", color: FF.carbon }}
            >
              ¿Eliminar conexión?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: FF.humo }}>
              Esta acción no se puede deshacer. La conexión y sus credenciales serán eliminadas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ borderColor: FF.beige, color: FF.carbon }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              style={{ background: FF.granate, color: FF.blanco }}
              onClick={() => deletingId !== null && handleDelete(deletingId)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
