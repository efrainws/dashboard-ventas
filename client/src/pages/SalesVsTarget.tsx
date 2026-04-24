import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { NavigationMenu } from "@/components/NavigationMenu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Loader2, Plus, Lock, X, Store, ShoppingCart, Bike } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { ReportDiscrepancyButton } from "@/components/ReportDiscrepancyButton";

type UserRole = 'system_specialist' | 'cst_user' | 'store_user';
type SalesChannel = "all" | "presencial" | "ecommerce" | "rappi";

const CHANNEL_OPTIONS: { value: SalesChannel; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "all", label: "Todos los canales", icon: null, color: "bg-muted text-muted-foreground" },
  { value: "presencial", label: "Presencial", icon: <Store className="h-3.5 w-3.5" />, color: "bg-[#1A6894]/10 text-[#1A6894] border-[#1A6894]/30" },
  { value: "ecommerce", label: "eCommerce", icon: <ShoppingCart className="h-3.5 w-3.5" />, color: "bg-[#008064]/10 text-[#008064] border-[#008064]/30" },
  { value: "rappi", label: "Rappi", icon: <Bike className="h-3.5 w-3.5" />, color: "bg-[#FF6900]/10 text-[#FF6900] border-[#FF6900]/30" },
];

export default function SalesVsTarget() {
  const { user, loading: authLoading } = useAuth();

  const userRole = user?.role as UserRole | undefined;
  const isStoreUser = userRole === 'store_user';
  const assignedStoreCode = (user as any)?.assignedStoreCode as string | null | undefined;

  // ─── Filtros ─────────────────────────────────────────────────────────────────
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return { from: firstDayOfMonth, to: yesterday };
  });

  const [selectedStores, setSelectedStores] = useState<string[]>([]);

  /**
   * Canales activos. "all" = sin filtro de canal.
   * Puede ser un solo canal o múltiples (ecommerce + rappi a la vez).
   */
  const [selectedChannels, setSelectedChannels] = useState<SalesChannel[]>(["all"]);

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

  // Canales efectivos para la query (nunca vacío)
  const effectiveChannels = useMemo<SalesChannel[]>(() => {
    if (selectedChannels.length === 0 || selectedChannels.includes("all")) return ["all"];
    return selectedChannels;
  }, [selectedChannels]);

  const { data, isLoading, refetch } = trpc.targets.getSalesVsTarget.useQuery(
    {
      fecha_min: dateRange?.from ? toLocalDateStr(dateRange.from) : toLocalDateStr(new Date()),
      fecha_max: dateRange?.to ? toLocalDateStr(dateRange.to) : toLocalDateStr(new Date()),
      store_ids: effectiveStoreFilter.length > 0 ? effectiveStoreFilter : undefined,
      channels: effectiveChannels,
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

  // ─── Handlers de canal ────────────────────────────────────────────────────────
  const handleChannelToggle = (channel: SalesChannel) => {
    if (channel === "all") {
      setSelectedChannels(["all"]);
      return;
    }
    setSelectedChannels((prev) => {
      // Quitar "all" si había
      const withoutAll = prev.filter((c) => c !== "all");
      if (withoutAll.includes(channel)) {
        // Desmarcar canal
        const next = withoutAll.filter((c) => c !== channel);
        return next.length === 0 ? ["all"] : next;
      } else {
        return [...withoutAll, channel];
      }
    });
  };

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
    setSelectedChannels(["all"]);
  };

  // Etiqueta del canal activo para mostrar en las tarjetas
  const activeChannelLabel = useMemo(() => {
    if (effectiveChannels.includes("all")) return undefined;
    return effectiveChannels
      .map((c) => CHANNEL_OPTIONS.find((o) => o.value === c)?.label ?? c)
      .join(" + ");
  }, [effectiveChannels]);

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
                  Selecciona un rango de fechas, tienda y canal de venta
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={handleClearFilters}>
                <X className="mr-2 h-4 w-4" />
                Limpiar Filtros
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Fecha Inicio */}
              <div className="space-y-2">
                <Label style={{ fontFamily: 'Sailec, sans-serif' }}>Fecha Inicio</Label>
                <DatePicker
                  date={dateRange?.from}
                  onDateChange={(from) => setDateRange({ from, to: dateRange?.to })}
                  placeholder="Fecha inicio"
                  maxDate={dateRange?.to ?? new Date()}
                />
              </div>

              {/* Fecha Fin */}
              <div className="space-y-2">
                <Label style={{ fontFamily: 'Sailec, sans-serif' }}>Fecha Fin</Label>
                <DatePicker
                  date={dateRange?.to}
                  onDateChange={(to) => setDateRange({ from: dateRange?.from, to })}
                  placeholder="Fecha fin"
                  minDate={dateRange?.from}
                  maxDate={new Date()}
                />
              </div>

              {/* Filtro de Tiendas — bloqueado para store_user */}
              <div className="space-y-2">
                <Label style={{ fontFamily: 'Sailec, sans-serif' }}>
                  Tiendas
                  {isStoreUser && <Lock className="inline ml-1 h-3 w-3 text-muted-foreground" />}
                </Label>
                {isStoreUser ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/50 text-sm text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span>{availableStores[0]?.name ?? assignedStoreCode ?? 'Tu tienda asignada'}</span>
                  </div>
                ) : (
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

              {/* Filtro de Canal */}
              <div className="space-y-2">
                <Label style={{ fontFamily: 'Sailec, sans-serif' }}>Canal de Venta</Label>
                <div className="flex flex-wrap gap-2">
                  {CHANNEL_OPTIONS.map((opt) => {
                    const isActive =
                      opt.value === "all"
                        ? effectiveChannels.includes("all")
                        : selectedChannels.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleChannelToggle(opt.value)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          isActive
                            ? opt.color + " border-current"
                            : "bg-muted/30 text-muted-foreground border-border hover:bg-muted"
                        }`}
                        style={{ fontFamily: 'Sailec, sans-serif' }}
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {/* Nota informativa sobre el canal presencial */}
                {selectedChannels.includes("presencial") && !selectedChannels.includes("all") && (
                  <p className="text-xs text-muted-foreground" style={{ fontFamily: 'Sailec, sans-serif' }}>
                    La meta del canal Presencial se calcula como: 100% − % eCommerce − % Rappi definidos en la configuración de metas.
                  </p>
                )}
                {/* Nota cuando se combinan eCommerce + Rappi */}
                {selectedChannels.includes("ecommerce") && selectedChannels.includes("rappi") && (
                  <p className="text-xs text-muted-foreground" style={{ fontFamily: 'Sailec, sans-serif' }}>
                    La meta combinada usa la suma de los porcentajes eCommerce + Rappi.
                  </p>
                )}
              </div>
            </div>

            {/* Indicador de canal activo */}
            {!effectiveChannels.includes("all") && (
              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs text-muted-foreground" style={{ fontFamily: 'Sailec, sans-serif' }}>
                  Mostrando metas ajustadas para:
                </span>
                {effectiveChannels.map((ch) => {
                  const opt = CHANNEL_OPTIONS.find((o) => o.value === ch);
                  return (
                    <Badge
                      key={ch}
                      variant="outline"
                      className={`text-xs ${opt?.color ?? ""}`}
                    >
                      {opt?.icon && <span className="mr-1">{opt.icon}</span>}
                      {opt?.label ?? ch}
                    </Badge>
                  );
                })}
              </div>
            )}
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
                monthlyTarget={store.monthly_target}
                activeChannelLabel={activeChannelLabel}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground" style={{ fontFamily: 'Sailec, sans-serif' }}>
              No hay datos disponibles para el rango de fechas y canal seleccionados
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
        const singleStoreId = effectiveStoreFilter.length === 1 ? effectiveStoreFilter[0] : undefined;
        const singleStore = singleStoreId
          ? data?.stores?.find((s) => (s.store_sap_id || s.store_id) === singleStoreId)
          : undefined;
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
