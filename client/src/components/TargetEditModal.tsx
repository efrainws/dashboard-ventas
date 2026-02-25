import { useState, useMemo, useEffect } from "react";
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
import { trpc } from "@/lib/trpc";
import { Loader2, Save, Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

interface TargetEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialStoreId?: string | null;
}

interface EditableTarget {
  month: string;
  store_id: string;
  store_name: string;
  store_sap_id: string;
  monthly_target_amount: number;
  isNew?: boolean;
  isModified?: boolean;
}

export function TargetEditModal({
  open,
  onOpenChange,
  onSuccess,
  initialStoreId,
}: TargetEditModalProps) {
  // Filtros
  const [filterStore, setFilterStore] = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Obtener metas existentes
  const { data: targetsData, isLoading: loadingTargets, refetch } = trpc.targets.getStoreTargets.useQuery(
    {},
    { enabled: open }
  );

  // Obtener lista de tiendas desde getAllStores
  const { data: storesData } = trpc.targets.getAllStores.useQuery(
    undefined,
    { enabled: open }
  );

  // Mutations
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

  // Estado local de metas editables
  const [editableTargets, setEditableTargets] = useState<EditableTarget[]>([]);

  // Inicializar metas editables cuando se cargan los datos
  useEffect(() => {
    if (targetsData && storesData) {
      const targets: EditableTarget[] = targetsData.targets.map((t: any) => {
        const store = storesData.stores.find((s: any) => s.store_id === t.store_id);
        return {
          month: t.month,
          store_id: t.store_id,
          store_name: store?.store_name || "Desconocida",
          store_sap_id: store?.store_sap_id || "",
          monthly_target_amount: t.monthly_target_amount,
          isNew: false,
          isModified: false,
        };
      });
      setEditableTargets(targets);
    }
  }, [targetsData, storesData]);

  // Obtener lista única de tiendas para filtro
  const availableStores = useMemo(() => {
    if (!storesData?.stores) return [];
    return storesData.stores.map((s: any) => ({
      id: s.store_id,
      name: s.store_name,
      sapId: s.store_sap_id,
    }));
  }, [storesData]);

  // Obtener períodos únicos
  const availablePeriods = useMemo(() => {
    const periods = new Set(editableTargets.map((t: EditableTarget) => t.month));
    return Array.from(periods).sort().reverse();
  }, [editableTargets]);

  // Filtrar metas
  const filteredTargets = useMemo(() => {
    return editableTargets.filter(t => {
      const matchesStore = filterStore === "all" || t.store_id === filterStore;
      const matchesPeriod = filterPeriod === "all" || t.month === filterPeriod;
      const matchesSearch = searchTerm === "" || 
        t.store_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.store_sap_id.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStore && matchesPeriod && matchesSearch;
    });
  }, [editableTargets, filterStore, filterPeriod, searchTerm]);

  // Actualizar valor de meta
  const handleTargetChange = (month: string, storeId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setEditableTargets(prev =>
      prev.map(t =>
        t.month === month && t.store_id === storeId
          ? { ...t, monthly_target_amount: numValue, isModified: true }
          : t
      )
    );
  };

  // Agregar nueva meta
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

    setEditableTargets(prev => [newTarget, ...prev]);
  };

  // Guardar meta individual
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
    
    // Marcar como no modificada
    setEditableTargets(prev =>
      prev.map(t =>
        t.month === target.month && t.store_id === target.store_id
          ? { ...t, isNew: false, isModified: false }
          : t
      )
    );
  };

  // Eliminar meta
  const handleDeleteTarget = async (month: string, storeId: string) => {
    // Si es nueva, solo removerla del estado local
    const target = editableTargets.find(t => t.month === month && t.store_id === storeId);
    if (target?.isNew) {
      setEditableTargets(prev => prev.filter(t => !(t.month === month && t.store_id === storeId)));
      return;
    }

    // Si existe en BD, eliminarla
    await deleteMutation.mutateAsync({ month, store_id: storeId } as any);
  };

  // Guardar todas las metas modificadas
  const handleSaveAll = async () => {
    const modifiedTargets = editableTargets.filter(t => t.isModified);
    
    if (modifiedTargets.length === 0) {
      toast.info("No hay cambios para guardar");
      return;
    }

    const invalidTargets = modifiedTargets.filter(t => t.monthly_target_amount <= 0);
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
      
      // Marcar todas como no modificadas
      setEditableTargets(prev =>
        prev.map(t => ({ ...t, isNew: false, isModified: false }))
      );
    } catch (error) {
      toast.error("Error al guardar algunas metas");
    }
  };

  // Limpiar filtros
  const handleClearFilters = () => {
    setFilterStore("all");
    setFilterPeriod("all");
    setSearchTerm("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'Sailec, sans-serif' }}>
            Gestión de Metas Mensuales
          </DialogTitle>
        </DialogHeader>

        {loadingTargets ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto space-y-4">
            {/* Filtros y Acciones */}
            <div className="flex flex-wrap gap-4 items-end">
              {/* Búsqueda */}
              <div className="flex-1 min-w-[200px]">
                <Label style={{ fontFamily: 'Sailec, sans-serif' }}>Buscar</Label>
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

              {/* Filtro por Tienda */}
              <div className="w-[200px]">
                <Label style={{ fontFamily: 'Sailec, sans-serif' }}>Tienda</Label>
                <Select value={filterStore} onValueChange={setFilterStore}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas las tiendas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las tiendas</SelectItem>
                    {availableStores.map(store => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name} ({store.sapId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro por Período */}
              <div className="w-[150px]">
                <Label style={{ fontFamily: 'Sailec, sans-serif' }}>Período</Label>
                <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {availablePeriods.map(period => (
                      <SelectItem key={period} value={period}>
                        {period}
                      </SelectItem>
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

              <Button onClick={handleSaveAll} disabled={upsertMutation.isPending}>
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
                    <TableHead style={{ fontFamily: 'Sailec, sans-serif' }}>Período</TableHead>
                    <TableHead style={{ fontFamily: 'Sailec, sans-serif' }}>Tienda</TableHead>
                    <TableHead style={{ fontFamily: 'Sailec, sans-serif' }}>Código SAP</TableHead>
                    <TableHead style={{ fontFamily: 'Sailec, sans-serif' }}>Meta Mensual (S/)</TableHead>
                    <TableHead style={{ fontFamily: 'Sailec, sans-serif' }}>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTargets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No hay metas configuradas. Haz clic en "Agregar Meta" para crear una.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTargets.map((target, index) => (
                      <TableRow
                        key={`${target.month}-${target.store_id}-${index}`}
                        className={target.isModified ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}
                      >
                        <TableCell style={{ fontFamily: 'Sailec, sans-serif' }}>
                          {target.isNew ? (
                            <Input
                              type="month"
                              value={target.month}
                              onChange={(e) => {
                                setEditableTargets(prev =>
                                  prev.map((t, i) =>
                                    i === index ? { ...t, month: e.target.value, isModified: true } : t
                                  )
                                );
                              }}
                            />
                          ) : (
                            target.month
                          )}
                        </TableCell>
                        <TableCell style={{ fontFamily: 'Sailec, sans-serif' }}>
                          {target.isNew ? (
                            <Select
                              value={target.store_id}
                              onValueChange={(value) => {
                                const store = availableStores.find((s: any) => s.id === value);
                                if (store) {
                                  setEditableTargets(prev =>
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
                                {availableStores.map((store: any) => (
                                  <SelectItem key={store.id} value={store.id}>
                                    {store.name} ({store.sapId})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            target.store_name
                          )}
                        </TableCell>
                        <TableCell style={{ fontFamily: 'Sailec, sans-serif' }}>
                          {target.store_sap_id}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={target.monthly_target_amount}
                            onChange={(e) => handleTargetChange(target.month, target.store_id, e.target.value)}
                            min="0"
                            step="1000"
                            style={{ fontFamily: 'Sailec, sans-serif' }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSaveTarget(target)}
                              disabled={!target.isModified || upsertMutation.isPending}
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteTarget(target.month, target.store_id)}
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
