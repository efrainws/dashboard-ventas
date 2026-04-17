import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { NavigationMenu } from "@/components/NavigationMenu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Loader2, Plus, Lock, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { StoreTargetCard } from "@/components/StoreTargetCard";
import { TargetEditModal } from "@/components/TargetEditModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ReportDiscrepancyButton } from "@/components/ReportDiscrepancyButton";

type UserRole = 'system_specialist' | 'cst_user' | 'store_user';

export default function SalesVsTarget() {
  const { user, loading: authLoading } = useAuth();

  const userRole = user?.role as UserRole | undefined;
  const isStoreUser = userRole === 'store_user';
  const assignedStoreCode = (user as any)?.assignedStoreCode as string | null | undefined;

  // Filtros
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return { from: firstDayOfMonth, to: yesterday };
  });

  // Para store_user: el filtro de tiendas queda fijo en su tienda asignada
  const [selectedStores, setSelectedStores] = useState<string[]>([]);

  // Inicializar filtro de tienda para store_user
  useEffect(() => {
    if (isStoreUser && assignedStoreCode) {
      setSelectedStores([assignedStoreCode]);
    }
  }, [isStoreUser, assignedStoreCode]);

  // Modal de edición
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<{ id: string; name: string } | null>(null);

  // Convertir fechas a formato YYYY-MM-DD local para evitar desfase UTC/Lima
  const toLocalDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Para store_user: siempre filtrar por su tienda asignada
  const effectiveStoreFilter = useMemo(() => {
    if (isStoreUser && assignedStoreCode) {
      return [assignedStoreCode];
    }
    return selectedStores;
  }, [isStoreUser, assignedStoreCode, selectedStores]);

  const { data, isLoading, refetch } = trpc.targets.getSalesVsTarget.useQuery(
    {
      fecha_min: dateRange?.from ? toLocalDateStr(dateRange.from) : toLocalDateStr(new Date()),
      fecha_max: dateRange?.to ? toLocalDateStr(dateRange.to) : toLocalDateStr(new Date()),
      store_ids: effectiveStoreFilter.length > 0 ? effectiveStoreFilter : undefined,
    },
    {
      enabled: !!dateRange?.from && !!dateRange?.to,
    }
  );

  // Obtener lista única de tiendas para el filtro
  const availableStores = useMemo(() => {
    if (!data?.stores) return [];
    return data.stores.map(s => ({ id: s.store_sap_id || s.store_id, name: s.store_name }));
  }, [data]);

  // system_specialist y cst_user pueden editar metas
  const canEdit = userRole === 'system_specialist' || userRole === 'cst_user';

  // Calcular días transcurridos en el período y días totales del mes
  const { daysElapsed, daysInMonth } = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) {
      return { daysElapsed: 1, daysInMonth: 30 };
    }
    const from = dateRange.from;
    const to = dateRange.to;
    const msPerDay = 1000 * 60 * 60 * 24;
    const elapsed = Math.max(1, Math.round((to.getTime() - from.getTime()) / msPerDay) + 1);
    const year = to.getFullYear();
    const month = to.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    return { daysElapsed: elapsed, daysInMonth: totalDays };
  }, [dateRange]);

  const handleEditStore = (storeId: string, storeName: string) => {
    setEditingStore({ id: storeId, name: storeName });
    setEditModalOpen(true);
  };

  const handleModalSuccess = () => {
    refetch();
  };

  const handleClearFilters = () => {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    setDateRange({ from: firstDayOfMonth, to: yesterday });
    if (!isStoreUser) {
      setSelectedStores([]);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationMenu />
      <div className="container py-8 space-y-8">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight uppercase" style={{ fontFamily: 'Italian Plate No 1, serif' }}>
              Ventas vs Meta
            </h1>
            <p className="text-muted-foreground" style={{ fontFamily: 'Sailec, sans-serif' }}>
              Cumplimiento de metas por tienda
              {isStoreUser && assignedStoreCode && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                  Vista restringida a tu tienda
                </span>
              )}
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => setEditModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Editar Metas
            </Button>
          )}
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
                  Selecciona un rango de fechas y/o tienda para explorar los datos
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleClearFilters}>
                <X className="mr-2 h-4 w-4" />
                Limpiar Filtros
              </Button>
            </div>
          </CardHeader>
          <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Rango de Fechas */}
            <div className="space-y-2">
              <Label style={{ fontFamily: 'Sailec, sans-serif' }}>Rango de Fechas</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "dd MMM yyyy", { locale: es })} -{" "}
                          {format(dateRange.to, "dd MMM yyyy", { locale: es })}
                        </>
                      ) : (
                        format(dateRange.from, "dd MMM yyyy", { locale: es })
                      )
                    ) : (
                      <span>Seleccionar rango</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Filtro de Tiendas — bloqueado para store_user */}
            <div className="space-y-2">
              <Label style={{ fontFamily: 'Sailec, sans-serif' }}>
                Tiendas
                {isStoreUser && <Lock className="inline ml-1 h-3 w-3 text-muted-foreground" />}
              </Label>
              {isStoreUser ? (
                /* store_user: solo ve su tienda, no puede cambiarla */
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/50 text-sm text-muted-foreground">
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  <span>{availableStores[0]?.name ?? assignedStoreCode ?? 'Tu tienda asignada'}</span>
                </div>
              ) : (
                /* system_specialist y cst_user: selector completo */
                <Select
                  value={selectedStores.length === 0 ? "all" : "custom"}
                  onValueChange={(value) => {
                    if (value === "all") {
                      setSelectedStores([]);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {selectedStores.length === 0
                        ? "Todas las tiendas"
                        : `${selectedStores.length} tienda(s) seleccionada(s)`}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all"><span>Todas las tiendas</span></SelectItem>
                    {availableStores.map((store) => (
                      <div
                        key={store.id}
                        className="flex items-center space-x-2 px-2 py-1.5 cursor-pointer hover:bg-accent"
                        onClick={(e) => {
                          e.preventDefault();
                          setSelectedStores((prev) =>
                            prev.includes(store.id)
                              ? prev.filter((id) => id !== store.id)
                              : [...prev, store.id]
                          );
                        }}
                      >
                        <Checkbox
                          checked={selectedStores.includes(store.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedStores((prev) => [...prev, store.id]);
                            } else {
                              setSelectedStores((prev) => prev.filter((id) => id !== store.id));
                            }
                          }}
                        />
                        <Label className="cursor-pointer">{store.name}</Label>
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          </CardContent>
        </Card>

        {/* Grid de Tarjetas */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-lg font-medium">Cargando datos...</span>
          </div>
        ) : data?.stores && data.stores.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {data.stores.map((store) => (
              <StoreTargetCard
                key={store.store_id}
                storeName={store.store_name}
                totalSales={store.total_sales}
                proratedTarget={store.prorated_target}
                completionPercentage={store.completion_percentage}
                hasTarget={store.has_target}
                canEdit={canEdit}
                onEditClick={() => handleEditStore(store.store_id, store.store_name)}
                daysElapsed={daysElapsed}
                daysInMonth={daysInMonth}
                monthlyTarget={store.has_target ? store.prorated_target * (daysInMonth / Math.max(daysElapsed, 1)) : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground" style={{ fontFamily: 'Sailec, sans-serif' }}>
              No hay datos disponibles para el rango de fechas seleccionado
            </p>
          </div>
        )}
      </div>

      {/* Modal de Edición */}
      <TargetEditModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        initialStoreId={editingStore?.id}
        onSuccess={handleModalSuccess}
      />

      {/* Floating button to report discrepancies */}
      {(() => {
        // Determinar tienda y monto para el contexto del reporte
        const singleStoreId = effectiveStoreFilter.length === 1 ? effectiveStoreFilter[0] : undefined;
        const singleStore = singleStoreId
          ? data?.stores?.find((s) => (s.store_sap_id || s.store_id) === singleStoreId)
          : undefined;
        // Si hay más de una tienda, sumar todas las ventas del período
        const totalSalesAmount = data?.stores
          ? Math.round(data.stores.reduce((sum, s) => sum + s.total_sales, 0))
          : undefined;
        const contextAmount = singleStore
          ? Math.round(singleStore.total_sales)
          : totalSalesAmount;
        return (
          <ReportDiscrepancyButton
            variant="fab"
            context={{
              module: "sales-vs-target",
              moduleLabel: "Ventas vs Meta",
              dateFrom: dateRange?.from ? toLocalDateStr(dateRange.from) : undefined,
              dateTo: dateRange?.to ? toLocalDateStr(dateRange.to) : undefined,
              storeId: singleStoreId,
              storeName: singleStoreId
                ? availableStores.find((s) => s.id === singleStoreId)?.name
                : effectiveStoreFilter.length === 0
                  ? "Todas las tiendas"
                  : `${effectiveStoreFilter.length} tiendas seleccionadas`,
              dashboardAmount: contextAmount && contextAmount > 0 ? contextAmount : undefined,
              relatedSaleAmount: contextAmount && contextAmount > 0 ? contextAmount : undefined,
            }}
          />
        );
      })()}
    </div>
  );
}
