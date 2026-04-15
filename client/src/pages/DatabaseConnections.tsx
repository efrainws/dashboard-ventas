import { useState } from "react";
import { trpc } from "@/lib/trpc";
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

function TestStatusBadge({ status, message }: { status: string | null; message: string | null }) {
  if (!status || status === "pending") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            Pendiente
          </Badge>
        </TooltipTrigger>
        <TooltipContent>No se ha probado aún</TooltipContent>
      </Tooltip>
    );
  }
  if (status === "ok") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800">
            <CheckCircle2 className="h-3 w-3" />
            OK
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{message ?? "Conexión exitosa"}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="gap-1 text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800">
          <XCircle className="h-3 w-3" />
          Error
        </Badge>
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
          password: "", // never pre-fill password
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
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            {isEditing ? "Editar Conexión" : "Nueva Conexión PostgreSQL"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modifica los parámetros de la conexión. Deja la contraseña vacía para mantener la actual."
              : "Configura los parámetros de conexión a la base de datos PostgreSQL externa."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* Nombre y descripción */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="conn-name">Nombre de la conexión *</Label>
              <Input
                id="conn-name"
                placeholder="Ej: Producción — Ventas"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conn-purpose">Propósito</Label>
              <Select value={form.purpose} onValueChange={(v) => set("purpose", v as FormData["purpose"])}>
                <SelectTrigger id="conn-purpose">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Ventas y Stock</SelectItem>
                  <SelectItem value="sales">Solo Ventas</SelectItem>
                  <SelectItem value="stock">Solo Stock</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="conn-desc">Descripción</Label>
            <Textarea
              id="conn-desc"
              placeholder="Descripción opcional del propósito de esta conexión..."
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
            />
          </div>

          {/* Host y puerto */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="conn-host">Host / Endpoint *</Label>
              <Input
                id="conn-host"
                placeholder="Ej: db.example.com o 10.0.0.1"
                value={form.host}
                onChange={(e) => set("host", e.target.value)}
                required
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conn-port">Puerto *</Label>
              <Input
                id="conn-port"
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => set("port", parseInt(e.target.value) || 5432)}
                required
                className="font-mono text-sm"
              />
            </div>
          </div>

          {/* Base de datos */}
          <div className="space-y-1.5">
            <Label htmlFor="conn-db">Nombre de la base de datos *</Label>
            <Input
              id="conn-db"
              placeholder="Ej: dba_qa_middleware"
              value={form.database}
              onChange={(e) => set("database", e.target.value)}
              required
              className="font-mono text-sm"
            />
          </div>

          {/* Usuario y contraseña */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="conn-user">Usuario *</Label>
              <Input
                id="conn-user"
                placeholder="Ej: postgres"
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
                required
                autoComplete="off"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conn-pass">
                Contraseña {isEditing && <span className="text-muted-foreground text-xs">(vacío = mantener actual)</span>}
                {!isEditing && <span className="text-destructive ml-0.5">*</span>}
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
              />
            </div>
          </div>

          {/* SSL */}
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  SSL / TLS
                </Label>
                <p className="text-xs text-muted-foreground">Cifrado en tránsito para la conexión</p>
              </div>
              <Switch
                checked={form.sslEnabled}
                onCheckedChange={(v) => set("sslEnabled", v)}
              />
            </div>
            {form.sslEnabled && (
              <div className="space-y-1.5">
                <Label htmlFor="conn-sslmode">Modo SSL</Label>
                <Select value={form.sslMode} onValueChange={(v) => set("sslMode", v as FormData["sslMode"])}>
                  <SelectTrigger id="conn-sslmode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="require">require — cifrado obligatorio</SelectItem>
                    <SelectItem value="verify-ca">verify-ca — verificar CA</SelectItem>
                    <SelectItem value="verify-full">verify-full — verificar CA + hostname</SelectItem>
                    <SelectItem value="disable">disable — sin cifrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Estado activo */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label>Conexión activa</Label>
              <p className="text-xs text-muted-foreground">Las conexiones inactivas no se usan para consultas</p>
            </div>
            <Switch
              checked={form.isActive}
              onCheckedChange={(v) => set("isActive", v)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
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
    <div className="min-h-screen bg-background">
      <NavigationMenu />
      <div className="container py-8 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight uppercase" style={{ fontFamily: "Italian Plate No 1, serif" }}>
              Conexiones de Base de Datos
            </h1>
            <p className="text-muted-foreground">
              Gestiona las conexiones a bases de datos PostgreSQL externas para ventas y stock.
            </p>
          </div>
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva Conexión
          </Button>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-300">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Las contraseñas se almacenan cifradas con AES-256. Esta sección es exclusiva para
            <strong className="font-semibold"> Especialistas de Sistemas</strong>. Las conexiones marcadas
            como activas son las que el sistema utiliza para cargar datos de ventas y stock.
          </p>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold uppercase tracking-wide font-heading">
                  Conexiones Registradas
                </CardTitle>
                <CardDescription>
                  {connections ? `${connections.length} conexión${connections.length !== 1 ? "es" : ""} registrada${connections.length !== 1 ? "s" : ""}` : "Cargando..."}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1.5 text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5" />
                Actualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Cargando conexiones...</span>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-16 text-destructive gap-2">
                <XCircle className="h-5 w-5" />
                <span>Error al cargar conexiones: {error.message}</span>
              </div>
            ) : !connections || connections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <Database className="h-10 w-10 opacity-30" />
                <p className="text-sm">No hay conexiones configuradas.</p>
                <Button variant="outline" size="sm" onClick={handleOpenCreate} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Crear primera conexión
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[220px]">Nombre</TableHead>
                      <TableHead>Host</TableHead>
                      <TableHead className="w-[110px]">Base de Datos</TableHead>
                      <TableHead className="w-[120px]">Propósito</TableHead>
                      <TableHead className="w-[90px]">Estado</TableHead>
                      <TableHead className="w-[110px]">Último Test</TableHead>
                      <TableHead className="w-[130px] text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {connections.map((conn) => (
                      <TableRow key={conn.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Database className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div>
                              <p className="font-medium text-sm">{conn.name}</p>
                              {conn.description && (
                                <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                                  {conn.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-xs text-muted-foreground">
                            <span>{conn.host}</span>
                            <span className="text-muted-foreground/60">:{conn.port}</span>
                          </div>
                          <div className="text-xs text-muted-foreground/60 mt-0.5">
                            {conn.sslEnabled ? "SSL: " + (conn.sslMode ?? "require") : "Sin SSL"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{conn.database}</span>
                          <div className="text-xs text-muted-foreground/60">{conn.username}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {purposeLabel(conn.purpose)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {conn.isActive ? (
                            <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 text-xs">
                              <Wifi className="h-3 w-3" />
                              Activa
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-muted-foreground text-xs">
                              <WifiOff className="h-3 w-3" />
                              Inactiva
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <TestStatusBadge status={conn.lastTestStatus} message={conn.lastTestMessage} />
                          {conn.lastTestedAt && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {new Date(conn.lastTestedAt).toLocaleString("es-PE", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Test button */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleTest(conn.id)}
                                  disabled={testingId === conn.id}
                                >
                                  {testingId === conn.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Probar conexión</TooltipContent>
                            </Tooltip>

                            {/* Edit button */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleOpenEdit(conn as DbConn)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Editar</TooltipContent>
                            </Tooltip>

                            {/* Delete button */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeletingId(conn.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Eliminar</TooltipContent>
                            </Tooltip>
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
            <AlertDialogTitle>¿Eliminar conexión?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La conexión y sus credenciales serán eliminadas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
