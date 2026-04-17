import { useState, useMemo, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Loader2,
  Save,
  Plus,
  Trash2,
  Search,
  Upload,
  Download,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface TargetEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialStoreId?: string | null;
}

interface EditableTarget {
  id?: number;
  month: string;
  store_id: string;
  store_name: string;
  store_sap_id: string;
  monthly_target_amount: number;
  isNew?: boolean;
  isModified?: boolean;
}

interface CSVRow {
  month: string;
  store_sap_id: string;
  monthly_target_amount: number;
  _rowNum: number;
  _error?: string;
}

export function TargetEditModal({
  open,
  onOpenChange,
  onSuccess,
  initialStoreId,
}: TargetEditModalProps) {
  // ─── Filtros ────────────────────────────────────────────────────────────────
  const [filterStore, setFilterStore] = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // ─── CSV state ──────────────────────────────────────────────────────────────
  const [csvRows, setCsvRows] = useState<CSVRow[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>("");
  const [csvUploading, setCsvUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const { data: targetsData, isLoading: loadingTargets, refetch } =
    trpc.targets.getStoreTargets.useQuery({}, { enabled: open });

  const { data: storesData } = trpc.targets.getAllStores.useQuery(undefined, {
    enabled: open,
  });

  // ─── Mutations ───────────────────────────────────────────────────────────────
  const upsertMutation = trpc.targets.upsertStoreTarget.useMutation({
    onSuccess: () => {
      refetch();
      if (onSuccess) onSuccess();
    },
    onError: (error) => {
      toast.error(`Error al guardar meta: ${error.message}`);
    },
  });

  const deleteMutation = trpc.targets.deleteStoreTarget.useMutation({
    onSuccess: () => {
      toast.success("Meta eliminada correctamente");
      refetch();
      if (onSuccess) onSuccess();
    },
    onError: (error) => {
      toast.error(`Error al eliminar meta: ${error.message}`);
    },
  });

  const bulkMutation = trpc.targets.bulkUpsertFromCSV.useMutation({
    onSuccess: (result) => {
      const msg = `Carga completada: ${result.inserted} nuevas, ${result.updated} actualizadas.`;
      if (result.errors.length > 0) {
        toast.warning(`${msg} ${result.errors.length} fila(s) con errores.`);
      } else {
        toast.success(msg);
      }
      setCsvRows([]);
      setCsvFileName("");
      refetch();
      if (onSuccess) onSuccess();
    },
    onError: (error) => {
      toast.error(`Error en la carga masiva: ${error.message}`);
    },
  });

  // ─── Estado local de metas editables ─────────────────────────────────────────
  const [editableTargets, setEditableTargets] = useState<EditableTarget[]>([]);

  useEffect(() => {
    if (targetsData && storesData) {
      const targets: EditableTarget[] = targetsData.targets.map((t: any) => {
        const store = storesData.stores.find((s: any) => s.store_id === t.storeId);
        return {
          id: t.id,
          month: t.month,
          store_id: t.storeId,
          store_name: store?.store_name || "Desconocida",
          store_sap_id: store?.store_sap_id || "",
          monthly_target_amount: t.monthlyTargetAmount,
          isNew: false,
          isModified: false,
        };
      });
      setEditableTargets(targets);
    }
  }, [targetsData, storesData]);

  // ─── Tiendas disponibles ──────────────────────────────────────────────────────
  const availableStores = useMemo(() => {
    if (!storesData?.stores) return [];
    return storesData.stores.map((s: any) => ({
      id: s.store_id,
      name: s.store_name,
      sapId: s.store_sap_id,
    }));
  }, [storesData]);

  const availablePeriods = useMemo(() => {
    const periods = new Set(editableTargets.map((t) => t.month));
    return Array.from(periods).sort().reverse();
  }, [editableTargets]);

  const filteredTargets = useMemo(() => {
    return editableTargets.filter((t) => {
      const matchesStore = filterStore === "all" || t.store_id === filterStore;
      const matchesPeriod = filterPeriod === "all" || t.month === filterPeriod;
      const matchesSearch =
        searchTerm === "" ||
        t.store_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.store_sap_id.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStore && matchesPeriod && matchesSearch;
    });
  }, [editableTargets, filterStore, filterPeriod, searchTerm]);

  // ─── Handlers de edición manual ───────────────────────────────────────────────
  const handleTargetChange = (month: string, storeId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setEditableTargets((prev) =>
      prev.map((t) =>
        t.month === month && t.store_id === storeId
          ? { ...t, monthly_target_amount: numValue, isModified: true }
          : t
      )
    );
  };

  const handleAddTarget = () => {
    if (availableStores.length === 0) {
      toast.error("No hay tiendas disponibles");
      return;
    }
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const firstStore = availableStores[0];
    const newTarget: EditableTarget = {
      month: currentMonth,
      store_id: firstStore.id,
      store_name: firstStore.name,
      store_sap_id: firstStore.sapId,
      monthly_target_amount: 0,
      isNew: true,
      isModified: true,
    };
    setEditableTargets((prev) => [newTarget, ...prev]);
  };

  const handleSaveTarget = async (target: EditableTarget) => {
    if (target.monthly_target_amount <= 0) {
      toast.error("La meta debe ser mayor a 0");
      return;
    }
    await upsertMutation.mutateAsync({
      month: target.month,
      store_id: target.store_id,
      monthly_target_amount: target.monthly_target_amount,
    });
    toast.success("Meta guardada correctamente");
    setEditableTargets((prev) =>
      prev.map((t) =>
        t.month === target.month && t.store_id === target.store_id
          ? { ...t, isNew: false, isModified: false }
          : t
      )
    );
  };

  const handleDeleteTarget = async (month: string, storeId: string) => {
    const target = editableTargets.find(
      (t) => t.month === month && t.store_id === storeId
    );
    if (target?.isNew) {
      setEditableTargets((prev) =>
        prev.filter((t) => !(t.month === month && t.store_id === storeId))
      );
      return;
    }
    if (target?.id) {
      await deleteMutation.mutateAsync({ id: target.id });
    } else {
      toast.error("No se puede eliminar: meta sin ID");
    }
  };

  const handleSaveAll = async () => {
    const modifiedTargets = editableTargets.filter((t) => t.isModified);
    if (modifiedTargets.length === 0) {
      toast.info("No hay cambios para guardar");
      return;
    }
    const invalidTargets = modifiedTargets.filter(
      (t) => t.monthly_target_amount <= 0
    );
    if (invalidTargets.length > 0) {
      toast.error("Todas las metas deben ser mayores a 0");
      return;
    }
    try {
      for (const target of modifiedTargets) {
        await upsertMutation.mutateAsync({
          month: target.month,
          store_id: target.store_id,
          monthly_target_amount: target.monthly_target_amount,
        });
      }
      toast.success(`${modifiedTargets.length} meta(s) guardada(s) correctamente`);
      await refetch();
      if (onSuccess) onSuccess();
    } catch {
      toast.error("Error al guardar algunas metas");
    }
  };

  const handleClearFilters = () => {
    setFilterStore("all");
    setFilterPeriod("all");
    setSearchTerm("");
  };

  // ─── Handlers de CSV ──────────────────────────────────────────────────────────

  /** Genera y descarga la plantilla CSV modelo */
  const handleDownloadTemplate = () => {
    // Obtener el mes actual y el siguiente como ejemplos
    const now = new Date();
    const m1 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const m2 = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;

    // Usar las tiendas reales si están disponibles, si no usar ejemplos
    const exampleRows =
      availableStores.length > 0
        ? availableStores
            .slice(0, Math.min(availableStores.length, 5))
            .map((s) => `${m1},${s.sapId},150000`)
            .join("\n")
        : [
            `${m1},FF01,150000`,
            `${m1},FF02,200000`,
            `${m2},FF01,155000`,
            `${m2},FF02,205000`,
          ].join("\n");

    const csvContent = [
      "# Plantilla de carga masiva de metas - Flora & Fauna",
      "# Columnas: mes (YYYY-MM) | codigo_sap | meta_mensual",
      "# El codigo_sap debe coincidir exactamente con el código SAP de la tienda",
      "# La meta_mensual debe ser un número positivo (sin puntos de miles ni símbolo de moneda)",
      "mes,codigo_sap,meta_mensual",
      exampleRows,
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `plantilla_metas_${m1}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Plantilla descargada correctamente");
  };

  /** Parsea el archivo CSV seleccionado */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast.error("El archivo debe ser un CSV (.csv)");
      return;
    }

    setCsvFileName(file.name);
    setCsvUploading(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#")); // ignorar comentarios y vacías

        // Encontrar la línea de encabezado
        const headerIdx = lines.findIndex((l) =>
          l.toLowerCase().includes("mes") || l.toLowerCase().includes("month")
        );
        const dataLines =
          headerIdx >= 0 ? lines.slice(headerIdx + 1) : lines;

        const parsed: CSVRow[] = [];

        dataLines.forEach((line, idx) => {
          const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
          if (cols.length < 3) {
            parsed.push({
              month: "",
              store_sap_id: "",
              monthly_target_amount: 0,
              _rowNum: idx + 2,
              _error: "Faltan columnas (se esperan 3: mes, codigo_sap, meta_mensual)",
            });
            return;
          }

          const [month, store_sap_id, amountStr] = cols;
          const amount = parseFloat(amountStr.replace(/[^0-9.]/g, ""));

          const row: CSVRow = {
            month: month.trim(),
            store_sap_id: store_sap_id.trim(),
            monthly_target_amount: amount,
            _rowNum: idx + 2,
          };

          // Validaciones
          if (!/^\d{4}-\d{2}$/.test(row.month)) {
            row._error = `Mes inválido '${row.month}' (debe ser YYYY-MM)`;
          } else if (!row.store_sap_id) {
            row._error = "Código SAP vacío";
          } else if (isNaN(amount) || amount <= 0) {
            row._error = `Meta inválida '${amountStr}' (debe ser un número positivo)`;
          }

          parsed.push(row);
        });

        setCsvRows(parsed);
        const errCount = parsed.filter((r) => r._error).length;
        if (errCount > 0) {
          toast.warning(
            `CSV cargado con ${parsed.length} filas. ${errCount} fila(s) con errores (se omitirán al importar).`
          );
        } else {
          toast.success(`CSV cargado: ${parsed.length} fila(s) listas para importar.`);
        }
      } catch {
        toast.error("Error al leer el archivo CSV");
        setCsvRows([]);
        setCsvFileName("");
      } finally {
        setCsvUploading(false);
        // Reset input para permitir volver a cargar el mismo archivo
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  /** Envía las filas válidas al servidor */
  const handleImportCSV = async () => {
    const validRows = csvRows.filter((r) => !r._error);
    if (validRows.length === 0) {
      toast.error("No hay filas válidas para importar");
      return;
    }

    await bulkMutation.mutateAsync({
      rows: validRows.map((r) => ({
        month: r.month,
        store_sap_id: r.store_sap_id,
        monthly_target_amount: r.monthly_target_amount,
      })),
    });
  };

  const csvValidRows = csvRows.filter((r) => !r._error).length;
  const csvErrorRows = csvRows.filter((r) => r._error).length;

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] lg:max-w-[1200px] xl:max-w-[1400px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Sailec, sans-serif" }}>
            Gestión de Metas Mensuales
          </DialogTitle>
        </DialogHeader>

        {loadingTargets ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Tabs defaultValue="manual" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="manual" style={{ fontFamily: "Sailec, sans-serif" }}>
                <FileText className="h-4 w-4 mr-2" />
                Edición Manual
              </TabsTrigger>
              <TabsTrigger value="csv" style={{ fontFamily: "Sailec, sans-serif" }}>
                <Upload className="h-4 w-4 mr-2" />
                Carga Masiva CSV
              </TabsTrigger>
            </TabsList>

            {/* ── TAB: Edición Manual ─────────────────────────────────────── */}
            <TabsContent value="manual" className="space-y-4">
              {/* Filtros y Acciones */}
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <Label style={{ fontFamily: "Sailec, sans-serif" }}>Buscar</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nombre o código SAP..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>

                <div className="w-[200px]">
                  <Label style={{ fontFamily: "Sailec, sans-serif" }}>Tienda</Label>
                  <Select value={filterStore} onValueChange={setFilterStore}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todas las tiendas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all"><span>Todas las tiendas</span></SelectItem>
                      {availableStores.map((store) => (
                        <SelectItem key={store.id} value={store.id}><span>
                          {store.name} ({store.sapId})
                        </span></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-[150px]">
                  <Label style={{ fontFamily: "Sailec, sans-serif" }}>Período</Label>
                  <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all"><span>Todos</span></SelectItem>
                      {availablePeriods.map((period) => (
                        <SelectItem key={period} value={period}><span>
                          {period}
                        </span></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button variant="outline" onClick={handleClearFilters}>
                  Limpiar Filtros
                </Button>

                <Button onClick={handleAddTarget}>
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar Meta
                </Button>

                <Button
                  onClick={handleSaveAll}
                  disabled={upsertMutation.isPending}
                >
                  {upsertMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Guardar Todos
                </Button>
              </div>

              {/* Tabla de Metas */}
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead style={{ fontFamily: "Sailec, sans-serif" }}>Período</TableHead>
                      <TableHead style={{ fontFamily: "Sailec, sans-serif" }}>Tienda</TableHead>
                      <TableHead style={{ fontFamily: "Sailec, sans-serif" }}>Código SAP</TableHead>
                      <TableHead style={{ fontFamily: "Sailec, sans-serif" }}>Meta Mensual (S/)</TableHead>
                      <TableHead style={{ fontFamily: "Sailec, sans-serif" }}>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTargets.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-muted-foreground"
                        >
                          No hay metas configuradas. Haz clic en "Agregar Meta" para crear una.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTargets.map((target, index) => (
                        <TableRow
                          key={`${target.month}-${target.store_id}-${index}`}
                          className={
                            target.isModified
                              ? "bg-[#C49705]/10 dark:bg-[#C49705]/15"
                              : ""
                          }
                        >
                          <TableCell style={{ fontFamily: "Sailec, sans-serif" }}>
                            {target.isNew ? (
                              <Input
                                type="month"
                                value={target.month}
                                onChange={(e) => {
                                  setEditableTargets((prev) =>
                                    prev.map((t, i) =>
                                      i === index
                                        ? { ...t, month: e.target.value, isModified: true }
                                        : t
                                    )
                                  );
                                }}
                              />
                            ) : (
                              target.month
                            )}
                          </TableCell>
                          <TableCell style={{ fontFamily: "Sailec, sans-serif" }}>
                            {target.isNew ? (
                              <Select
                                value={target.store_id}
                                onValueChange={(value) => {
                                  const store = availableStores.find(
                                    (s) => s.id === value
                                  );
                                  if (store) {
                                    setEditableTargets((prev) =>
                                      prev.map((t, i) =>
                                        i === index
                                          ? {
                                              ...t,
                                              store_id: value,
                                              store_name: store.name,
                                              store_sap_id: store.sapId,
                                              isModified: true,
                                            }
                                          : t
                                      )
                                    );
                                  }
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableStores.map((store) => (
                                    <SelectItem key={store.id} value={store.id}><span>
                                      {store.name} ({store.sapId})
                                    </span></SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              target.store_name
                            )}
                          </TableCell>
                          <TableCell style={{ fontFamily: "Sailec, sans-serif" }}>
                            {target.store_sap_id}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={target.monthly_target_amount}
                              onChange={(e) =>
                                handleTargetChange(
                                  target.month,
                                  target.store_id,
                                  e.target.value
                                )
                              }
                              min="0"
                              step="1000"
                              style={{ fontFamily: "Sailec, sans-serif" }}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSaveTarget(target)}
                                disabled={
                                  !target.isModified || upsertMutation.isPending
                                }
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() =>
                                  handleDeleteTarget(target.month, target.store_id)
                                }
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ── TAB: Carga Masiva CSV ───────────────────────────────────── */}
            <TabsContent value="csv" className="space-y-6">
              {/* Instrucciones y descarga de plantilla */}
              <div className="bg-muted/40 border rounded-lg p-5 space-y-3">
                <h3
                  className="font-semibold text-base"
                  style={{ fontFamily: "Sailec, sans-serif" }}
                >
                  Instrucciones para la carga masiva
                </h3>
                <ol
                  className="text-sm text-muted-foreground space-y-1 list-decimal list-inside"
                  style={{ fontFamily: "Sailec, sans-serif" }}
                >
                  <li>
                    Descarga la plantilla CSV modelo con el botón de abajo. Incluye
                    las tiendas activas como referencia.
                  </li>
                  <li>
                    Completa las columnas: <strong>mes</strong> (YYYY-MM),{" "}
                    <strong>codigo_sap</strong> (código SAP exacto de la tienda) y{" "}
                    <strong>meta_mensual</strong> (número positivo en soles, sin
                    puntos de miles).
                  </li>
                  <li>
                    Guarda el archivo como CSV y cárgalo con el botón "Seleccionar
                    archivo".
                  </li>
                  <li>
                    Revisa la vista previa. Las filas con errores se resaltan en rojo
                    y serán omitidas.
                  </li>
                  <li>
                    Haz clic en <strong>"Importar Metas"</strong> para confirmar la
                    carga. Las metas existentes para el mismo mes y tienda serán
                    actualizadas.
                  </li>
                </ol>

                <Button
                  variant="outline"
                  onClick={handleDownloadTemplate}
                  className="mt-2"
                >
                  <Download className="mr-2 h-4 w-4 text-[#1A6894]" />
                  <span style={{ fontFamily: "Sailec, sans-serif" }}>
                    Descargar Plantilla CSV
                  </span>
                </Button>
              </div>

              {/* Zona de carga de archivo */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                    id="csv-upload"
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={csvUploading}
                  >
                    {csvUploading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    <span style={{ fontFamily: "Sailec, sans-serif" }}>
                      Seleccionar archivo CSV
                    </span>
                  </Button>

                  {csvFileName && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      <span style={{ fontFamily: "Sailec, sans-serif" }}>
                        {csvFileName}
                      </span>
                      <button
                        onClick={() => {
                          setCsvRows([]);
                          setCsvFileName("");
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Resumen de validación */}
                {csvRows.length > 0 && (
                  <div className="flex gap-3 flex-wrap">
                    <Badge
                      variant="outline"
                      className="text-[#008064] border-[#008064]/40 bg-[#008064]/10"
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {csvValidRows} fila(s) válidas
                    </Badge>
                    {csvErrorRows > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[#BC2C46] border-[#BC2C46]/40 bg-[#BC2C46]/10"
                      >
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {csvErrorRows} fila(s) con errores
                      </Badge>
                    )}
                  </div>
                )}

                {/* Errores de validación */}
                {csvErrorRows > 0 && (
                  <Alert className="border-[#BC2C46]/30 bg-[#BC2C46]/5">
                    <AlertCircle className="h-4 w-4 text-[#BC2C46]" />
                    <AlertDescription
                      className="text-sm"
                      style={{ fontFamily: "Sailec, sans-serif" }}
                    >
                      Las siguientes filas tienen errores y serán omitidas al
                      importar:
                      <ul className="mt-2 space-y-1 list-disc list-inside">
                        {csvRows
                          .filter((r) => r._error)
                          .map((r) => (
                            <li key={r._rowNum}>
                              Fila {r._rowNum}: {r._error}
                            </li>
                          ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Vista previa de filas */}
              {csvRows.length > 0 && (
                <div className="space-y-2">
                  <h4
                    className="font-medium text-sm"
                    style={{ fontFamily: "Sailec, sans-serif" }}
                  >
                    Vista previa ({csvRows.length} filas)
                  </h4>
                  <div className="border rounded-lg max-h-[320px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead style={{ fontFamily: "Sailec, sans-serif" }}>
                            Fila
                          </TableHead>
                          <TableHead style={{ fontFamily: "Sailec, sans-serif" }}>
                            Mes
                          </TableHead>
                          <TableHead style={{ fontFamily: "Sailec, sans-serif" }}>
                            Código SAP
                          </TableHead>
                          <TableHead style={{ fontFamily: "Sailec, sans-serif" }}>
                            Meta (S/)
                          </TableHead>
                          <TableHead style={{ fontFamily: "Sailec, sans-serif" }}>
                            Estado
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvRows.map((row) => (
                          <TableRow
                            key={row._rowNum}
                            className={
                              row._error
                                ? "bg-[#BC2C46]/5 dark:bg-[#BC2C46]/10"
                                : ""
                            }
                          >
                            <TableCell
                              className="text-muted-foreground text-xs"
                              style={{ fontFamily: "Sailec, sans-serif" }}
                            >
                              {row._rowNum}
                            </TableCell>
                            <TableCell style={{ fontFamily: "Sailec, sans-serif" }}>
                              {row.month || "—"}
                            </TableCell>
                            <TableCell style={{ fontFamily: "Sailec, sans-serif" }}>
                              {row.store_sap_id || "—"}
                            </TableCell>
                            <TableCell style={{ fontFamily: "Sailec, sans-serif" }}>
                              {row._error
                                ? "—"
                                : row.monthly_target_amount.toLocaleString("es-PE")}
                            </TableCell>
                            <TableCell>
                              {row._error ? (
                                <span className="text-xs text-[#BC2C46] flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  {row._error}
                                </span>
                              ) : (
                                <span className="text-xs text-[#008064] flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Válida
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Botón de importar */}
              {csvValidRows > 0 && (
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleImportCSV}
                    disabled={bulkMutation.isPending}
                    className="bg-[#008064] hover:bg-[#006650] text-white"
                  >
                    {bulkMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    <span style={{ fontFamily: "Sailec, sans-serif" }}>
                      Importar {csvValidRows} Meta(s)
                    </span>
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
