import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Loader2, Plus } from "lucide-react";
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

export default function SalesVsTarget() {
  const { user, loading: authLoading } = useAuth();

  // Filtros
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    // Por defecto: mes actual a la fecha
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      from: firstDayOfMonth,
      to: now,
    };
  });

  const [selectedStores, setSelectedStores] = useState<string[]>([]);

  // Modal de edición
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<{ id: string; name: string } | null>(null);

  // Consultar ventas vs meta
  const { data, isLoading, refetch } = trpc.targets.getSalesVsTarget.useQuery(
    {
      fecha_min: dateRange?.from?.toISOString() || new Date().toISOString(),
      fecha_max: dateRange?.to?.toISOString() || new Date().toISOString(),
      store_ids: selectedStores.length > 0 ? selectedStores : undefined,
    },
    {
      enabled: !!dateRange?.from && !!dateRange?.to,
    }
  );

  // Obtener lista única de tiendas para el filtro
  const availableStores = useMemo(() => {
    if (!data?.stores) return [];
    return data.stores.map(s => ({ id: s.store_id, name: s.store_name }));
  }, [data]);

  // Verificar si el usuario puede editar metas
  const canEdit = user?.role === 'admin';

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
    setDateRange({ from: firstDayOfMonth, to: now });
    setSelectedStores([]);
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
      <div className="container py-8 space-y-8">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight uppercase" style={{ fontFamily: 'Italian Plate No 1, serif' }}>
              Ventas vs Meta
            </h1>
            <p className="text-muted-foreground" style={{ fontFamily: 'Sailec, sans-serif' }}>
              Cumplimiento de metas por tienda
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
        <div className="bg-card rounded-lg border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ fontFamily: 'Sailec, sans-serif' }}>
              Filtros
            </h2>
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              Limpiar Filtros
            </Button>
          </div>

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

            {/* Filtro de Tiendas (multi-select) */}
            <div className="space-y-2">
              <Label style={{ fontFamily: 'Sailec, sans-serif' }}>Tiendas</Label>
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
                  <SelectItem value="all">Todas las tiendas</SelectItem>
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
            </div>
          </div>
        </div>

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
    </div>
  );
}
