import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { NavigationMenu } from "@/components/NavigationMenu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Loader2, Plus, Lock, Store, ShoppingCart, Bike } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { ReportDiscrepancyButton } from "@/components/ReportDiscrepancyButton";
import { StoreMultiSelect } from "@/components/StoreMultiSelect";
import { AppliedFilterActions } from "@/components/AppliedFilterActions";
import { useTemporalUrlState } from "@/hooks/useTemporalUrlState";

type UserRole = 'system_specialist' | 'operations_specialist' | 'cst_user' | 'commercial_specialist' | 'management_user' | 'store_user' | 'supplier_user' | 'own_brand_user';
type SalesChannel = "all" | "presencial" | "ecommerce" | "rappi";

const CHANNEL_OPTIONS: { value: SalesChannel; label: string; icon: React.ReactNode; toneClass: string }[] = [
  { value: "all", label: "Todos los canales", icon: null, toneClass: "ff-channel-neutral" },
  { value: "presencial", label: "Presencial", icon: <Store className="h-3.5 w-3.5" />, toneClass: "ff-channel-presencial" },
  { value: "ecommerce", label: "eCommerce", icon: <ShoppingCart className="h-3.5 w-3.5" />, toneClass: "ff-channel-ecommerce" },
  { value: "rappi", label: "Rappi", icon: <Bike className="h-3.5 w-3.5" />, toneClass: "ff-channel-rappi" },
];

type TargetControls = {
  storeIds: string[];
  channels: SalesChannel[];
};

const TARGET_CONTROL_QUERY_KEYS = ["store_ids", "channels"] as const;
const TARGET_CHANNELS = new Set<SalesChannel>(["presencial", "ecommerce", "rappi"]);

function normalizeChannels(values: string[]): SalesChannel[] {
  const channels = values.filter((value): value is Exclude<SalesChannel, "all"> => TARGET_CHANNELS.has(value as SalesChannel));
  return channels.length > 0 ? Array.from(new Set(channels)) : ["all"];
}

function targetControlsFromSearch(search: string): TargetControls {
  const params = new URLSearchParams(search);
  const storeIds = (params.get("store_ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const channels = normalizeChannels((params.get("channels") ?? "").split(","));

  return { storeIds: Array.from(new Set(storeIds)), channels };
}

function targetControlsEqual(left: TargetControls, right: TargetControls) {
  return left.storeIds.join(",") === right.storeIds.join(",") && left.channels.join(",") === right.channels.join(",");
}

function isoToDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function toLocalDateStr(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function SalesVsTarget() {
  const { user, loading: authLoading } = useAuth();
  const temporal = useTemporalUrlState("P03");

  const userRole = user?.role as UserRole | undefined;
  const isStoreUser = userRole === 'store_user';
  const assignedStoreCode = (user as any)?.assignedStoreCode as string | null | undefined;

  const [draftControls, setDraftControls] = useState<TargetControls>(() => targetControlsFromSearch(window.location.search));
  const [appliedControls, setAppliedControls] = useState<TargetControls>(() => targetControlsFromSearch(window.location.search));
  const dateRange = useMemo<DateRange>(() => ({
    from: isoToDate(temporal.draft.primary.start),
    to: isoToDate(temporal.draft.primary.end),
  }), [temporal.draft.primary]);
  const appliedDateRange = useMemo<DateRange>(() => ({
    from: isoToDate(temporal.applied.primary.start),
    to: isoToDate(temporal.applied.primary.end),
  }), [temporal.applied.primary]);

  // Inicializar filtro de tienda para store_user
  useEffect(() => {
    if (isStoreUser && assignedStoreCode) {
      const lockedControls = (current: TargetControls): TargetControls => ({
        ...current,
        storeIds: [assignedStoreCode],
      });
      setDraftControls(lockedControls);
      setAppliedControls(lockedControls);
    }
  }, [isStoreUser, assignedStoreCode]);

  // La URL siempre reconstruye los filtros aplicados, incluso con atrás/adelante.
  useEffect(() => {
    const next = targetControlsFromSearch(window.location.search);
    if (isStoreUser && assignedStoreCode) next.storeIds = [assignedStoreCode];
    setDraftControls(next);
    setAppliedControls(next);
  }, [temporal.applied, isStoreUser, assignedStoreCode]);

  // Modal de edición
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<{ id: string; name: string } | null>(null);

  // Para store_user: siempre filtrar por su tienda asignada
  const effectiveStoreFilter = useMemo(() => {
    if (isStoreUser && assignedStoreCode) {
      return [assignedStoreCode];
    }
    return appliedControls.storeIds;
  }, [isStoreUser, assignedStoreCode, appliedControls.storeIds]);

  // Canales efectivos para la query (nunca vacío)
  const effectiveChannels = useMemo<SalesChannel[]>(() => {
    if (appliedControls.channels.length === 0 || appliedControls.channels.includes("all")) return ["all"];
    return appliedControls.channels;
  }, [appliedControls.channels]);

  const { data, isLoading, isFetching, refetch } = trpc.targets.getSalesVsTarget.useQuery(
    {
      fecha_min: temporal.applied.primary.start,
      fecha_max: temporal.applied.primary.end,
      store_ids: effectiveStoreFilter.length > 0 ? effectiveStoreFilter : undefined,
      channels: effectiveChannels,
    },
    {
      enabled: !authLoading && !!temporal.applied.primary.start && !!temporal.applied.primary.end,
      placeholderData: (previousData) => previousData,
    }
  );

  // Obtener lista única de tiendas para el filtro
  const availableStores = useMemo(() => {
    if (!data?.stores) return [];
    return data.stores.map(s => ({ id: s.store_sap_id || s.store_id, name: s.store_name }));
  }, [data]);

  // system_specialist y cst_user pueden editar metas
  const canEdit = userRole === 'system_specialist' || userRole === 'cst_user';

  // ─── Totales agregados (respeta todos los filtros activos) ──────────────────
  const totals = useMemo(() => {
    if (!data?.stores || data.stores.length === 0) return null;
    const totalSales = data.stores.reduce((sum, s) => sum + s.total_sales, 0);
    const proratedTarget = data.stores.reduce((sum, s) => sum + s.prorated_target, 0);
    const monthlyTarget = data.stores.reduce((sum, s) => sum + (s.monthly_target ?? 0), 0);
    const completionPercentage = proratedTarget > 0 ? (totalSales / proratedTarget) * 100 : 0;
    const hasTarget = data.stores.some((s) => s.has_target);
    return { totalSales, proratedTarget, monthlyTarget, completionPercentage, hasTarget };
  }, [data]);

  // Calcular días transcurridos en el período y días totales del mes
  const { daysElapsed, daysInMonth } = useMemo(() => {
    if (!appliedDateRange?.from || !appliedDateRange?.to) {
      return { daysElapsed: 1, daysInMonth: 30 };
    }
    const from = appliedDateRange.from;
    const to = appliedDateRange.to;
    const msPerDay = 1000 * 60 * 60 * 24;
    const elapsed = Math.max(1, Math.round((to.getTime() - from.getTime()) / msPerDay) + 1);
    const year = to.getFullYear();
    const month = to.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    return { daysElapsed: elapsed, daysInMonth: totalDays };
  }, [appliedDateRange]);

  // ─── Handlers de canal ────────────────────────────────────────────────────────
  const handleChannelToggle = (channel: SalesChannel) => {
    if (channel === "all") {
      setDraftControls(current => ({ ...current, channels: ["all"] }));
      return;
    }
    setDraftControls(current => {
      // Quitar "all" si había
      const withoutAll = current.channels.filter((value) => value !== "all");
      if (withoutAll.includes(channel)) {
        // Desmarcar canal
        const next = withoutAll.filter((c) => c !== channel);
        return { ...current, channels: next.length === 0 ? ["all"] : next };
      } else {
        return { ...current, channels: [...withoutAll, channel] };
      }
    });
  };

  const setDraftDateRange = (nextRange: DateRange | undefined) => {
    if (!nextRange?.from || !nextRange.to) return;
    temporal.setDraft(current => ({
      ...current,
      primary: { start: toLocalDateStr(nextRange.from!), end: toLocalDateStr(nextRange.to!) },
    }));
  };

  const applyFilters = () => {
    const params = new URLSearchParams(window.location.search);
    TARGET_CONTROL_QUERY_KEYS.forEach((key) => params.delete(key));
    if (!isStoreUser && draftControls.storeIds.length > 0) {
      params.set("store_ids", draftControls.storeIds.join(","));
    }
    if (!draftControls.channels.includes("all")) {
      params.set("channels", draftControls.channels.join(","));
    }
    temporal.apply(params);
    setAppliedControls(draftControls);
  };

  const resetFilters = () => {
    const nextTemporal = temporal.reset();
    const nextControls: TargetControls = {
      storeIds: isStoreUser && assignedStoreCode ? [assignedStoreCode] : [],
      channels: ["all"],
    };
    const params = new URLSearchParams(window.location.search);
    TARGET_CONTROL_QUERY_KEYS.forEach((key) => params.delete(key));
    temporal.applyState(nextTemporal, params);
    setDraftControls(nextControls);
    setAppliedControls(nextControls);
  };

  const hasPendingChanges = temporal.hasPendingChanges || !targetControlsEqual(draftControls, appliedControls);

  const handleEditStore = (storeId: string, storeName: string) => {
    setEditingStore({ id: storeId, name: storeName });
    setEditModalOpen(true);
  };

  const handleModalSuccess = () => {
    refetch();
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Ventas vs meta
            </h1>
            <p className="text-muted-foreground">
              Cumplimiento de metas por tienda
              {isStoreUser && assignedStoreCode && (
                <span className="ml-2 inline-flex items-center gap-1 border border-border bg-muted px-2 py-0.5 text-xs">
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
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Fecha Inicio */}
              <div className="space-y-2">
                <Label>Fecha Inicio</Label>
                <DatePicker
                  date={dateRange?.from}
                  onDateChange={(from) => setDraftDateRange({ from, to: dateRange?.to })}
                  placeholder="Fecha inicio"
                  maxDate={dateRange?.to ?? new Date()}
                />
              </div>

              {/* Fecha Fin */}
              <div className="space-y-2">
                <Label>Fecha Fin</Label>
                <DatePicker
                  date={dateRange?.to}
                  onDateChange={(to) => setDraftDateRange({ from: dateRange?.from, to })}
                  placeholder="Fecha fin"
                  minDate={dateRange?.from}
                  maxDate={new Date()}
                />
              </div>

              {/* Filtro de Tiendas — bloqueado para store_user */}
              <div className="space-y-2">
                <Label>
                  Tiendas
                  {isStoreUser && <Lock className="inline ml-1 h-3 w-3 text-muted-foreground" />}
                </Label>
                <StoreMultiSelect
                  stores={availableStores}
                  selectedIds={draftControls.storeIds}
                  onChange={(storeIds) => setDraftControls(current => ({ ...current, storeIds }))}
                  locked={isStoreUser}
                  lockedLabel={availableStores[0]?.name ?? assignedStoreCode ?? 'Tu tienda asignada'}
                />
              </div>

              {/* Filtro de Canal */}
              <div className="space-y-2">
                <Label>Canal de Venta</Label>
                <div className="flex flex-wrap gap-2">
                  {CHANNEL_OPTIONS.map((opt) => {
                    const isActive =
                      opt.value === "all"
                        ? draftControls.channels.includes("all")
                        : draftControls.channels.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleChannelToggle(opt.value)}
                        aria-pressed={isActive}
                        className={`ff-channel-filter ${opt.toneClass}`}
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {/* Nota informativa sobre el canal presencial */}
                {draftControls.channels.includes("presencial") && !draftControls.channels.includes("all") && (
                  <p className="ff-target-note">
                    La meta del canal Presencial se calcula como: 100% − % eCommerce − % Rappi definidos en la configuración de metas.
                  </p>
                )}
                {/* Nota cuando se combinan eCommerce + Rappi */}
                {draftControls.channels.includes("ecommerce") && draftControls.channels.includes("rappi") && (
                  <p className="ff-target-note">
                    La meta combinada usa la suma de los porcentajes eCommerce + Rappi.
                  </p>
                )}
              </div>
            </div>

            {/* Indicador de canal activo */}
            {!effectiveChannels.includes("all") && (
              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Mostrando metas ajustadas para:
                </span>
                {effectiveChannels.map((ch) => {
                  const opt = CHANNEL_OPTIONS.find((o) => o.value === ch);
                  return (
                    <span key={ch} className={`ff-channel-chip ${opt?.toneClass ?? "ff-channel-neutral"}`}>
                      {opt?.icon && <span className="mr-1">{opt.icon}</span>}
                      {opt?.label ?? ch}
                    </span>
                  );
                })}
              </div>
            )}
            <AppliedFilterActions
              onApply={applyFilters}
              onReset={resetFilters}
              isPending={hasPendingChanges}
              isApplying={isFetching}
            />
          </CardContent>
        </Card>

        {isFetching && !isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            Actualizando resultados…
          </div>
        )}

        {/* Tarjeta de Totales */}
        {!isStoreUser && !isLoading && totals && (
          <div>
            <h2 className="ff-section-label mb-3">
              Total Consolidado
            </h2>
            <StoreTargetCard
              storeName="Todas las Tiendas"
              totalSales={totals.totalSales}
              proratedTarget={totals.proratedTarget}
              completionPercentage={totals.completionPercentage}
              hasTarget={totals.hasTarget}
              canEdit={false}
              daysElapsed={daysElapsed}
              daysInMonth={daysInMonth}
              monthlyTarget={totals.monthlyTarget}
              activeChannelLabel={activeChannelLabel}
            />
          </div>
        )}

        {/* Grid de Tarjetas */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-lg font-medium">Cargando datos...</span>
          </div>
        ) : data?.stores && data.stores.length > 0 ? isStoreUser ? (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading uppercase text-base tracking-wide">Cumplimiento de tu tienda</CardTitle>
              <CardDescription>El detalle se limita a la tienda asignada a tu usuario.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Tienda</TableHead>
                    <TableHead className="text-right">Venta período</TableHead>
                    <TableHead className="text-right">Meta período</TableHead>
                    <TableHead className="text-right">Cumplimiento</TableHead>
                    <TableHead className="text-right">Proyección mensual</TableHead>
                    <TableHead className="text-right pr-6">Meta mensual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.stores.map((store) => {
                    const projection = (store.total_sales / Math.max(daysElapsed, 1)) * daysInMonth;
                    const completion = store.prorated_target > 0
                      ? (store.total_sales / store.prorated_target) * 100
                      : null;

                    return (
                      <TableRow key={store.store_id}>
                        <TableCell className="pl-6 font-medium">{store.store_name}</TableCell>
                        <TableCell className="text-right tabular-nums">S/ {store.total_sales.toLocaleString("es-PE", { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {store.has_target ? `S/ ${store.prorated_target.toLocaleString("es-PE", { maximumFractionDigits: 0 })}` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {completion === null ? "—" : `${completion.toFixed(1)}%`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">S/ {projection.toLocaleString("es-PE", { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell className="pr-6 text-right tabular-nums">
                          {store.monthly_target ? `S/ ${store.monthly_target.toLocaleString("es-PE", { maximumFractionDigits: 0 })}` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
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
            <p className="text-muted-foreground">
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
              dateFrom: temporal.applied.primary.start,
              dateTo: temporal.applied.primary.end,
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
