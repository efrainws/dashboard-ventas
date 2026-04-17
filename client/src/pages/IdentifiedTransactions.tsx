import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { NavigationMenu } from "@/components/NavigationMenu";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import {
  Loader2,
  Users,
  ShoppingCart,
  UserCheck,
  TrendingUp,
  X,
  Store,
  Lock,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { useFilters } from "@/contexts/FiltersContext";
import { ReportDiscrepancyButton } from "@/components/ReportDiscrepancyButton";

// ─── helpers ────────────────────────────────────────────────────────────────

function toLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatNumber(n: number) {
  return new Intl.NumberFormat("es-PE").format(n);
}

/** Color de la barra de porcentaje según la paleta F&F */
function percentColor(pct: number): string {
  if (pct < 75) return "#BC2C46";   // Granate
  if (pct < 90) return "#C49705";   // Mostaza
  if (pct < 100) return "#1A6894";  // Cobalto
  return "#008064";                  // Esmeralda
}

// ─── tipos ──────────────────────────────────────────────────────────────────

interface StoreRow {
  nombre: string;
  codigo_tienda: string;
  total_transactions: number;
  identified_transactions: number;
  identified_percentage: number;
}

// ─── componente ─────────────────────────────────────────────────────────────

export default function IdentifiedTransactions() {
  const { user, loading: authLoading } = useAuth();
  const isStoreUser = user?.role === 'store_user';
  const assignedStoreCode = (user as any)?.assignedStoreCode as string | null | undefined;
  const { effectiveTheme } = useTheme();

  // Filtros globales compartidos entre páginas
  const {
    dateRange: globalDateRange,
    setDateRange: setGlobalDateRange,
    branchId: globalBranchId,
    setBranchId: setGlobalBranchId,
  } = useFilters();

  // Estado local de filtros — por defecto: ayer
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (globalDateRange) return globalDateRange;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);
    return { from: yesterday, to: yesterdayEnd };
  });

  // El filtro de tienda en esta página usa sap_id (no UUID) porque el query agrupa por sap_id
  const [selectedSapId, setSelectedSapId] = useState<string>("all");

  // Inicializar filtro de tienda para store_user
  useEffect(() => {
    if (isStoreUser && assignedStoreCode) {
      setSelectedSapId(assignedStoreCode);
    }
  }, [isStoreUser, assignedStoreCode]);

  // Sincronizar con contexto global
  useEffect(() => {
    setGlobalDateRange(dateRange);
  }, [dateRange, setGlobalDateRange]);

  // Construir parámetros de la query
  const queryParams = useMemo(() => {
    const fecha_min = dateRange?.from ? toLocalDate(dateRange.from) : toLocalDate(new Date(Date.now() - 86_400_000));
    const fecha_max = dateRange?.to   ? toLocalDate(dateRange.to)   : fecha_min;
    return {
      fecha_min,
      fecha_max,
      branch_sap_id: selectedSapId !== "all" ? selectedSapId : undefined,
    };
  }, [dateRange, selectedSapId]);

  const { data: queryData, isLoading, error } = trpc.sales.getIdentifiedTransactions.useQuery(queryParams);

  // Agrupar filas por tienda (suma de todos los días del rango)
  const storeData = useMemo<StoreRow[]>(() => {
    if (!queryData?.data) return [];

    const map = new Map<string, StoreRow>();
    for (const row of queryData.data) {
      const key = row.codigo_tienda || row.nombre;
      const existing = map.get(key);
      if (existing) {
        existing.total_transactions += row.total_transactions;
        existing.identified_transactions += row.identified_transactions;
      } else {
        map.set(key, {
          nombre: row.nombre,
          codigo_tienda: row.codigo_tienda,
          total_transactions: row.total_transactions,
          identified_transactions: row.identified_transactions,
          identified_percentage: 0, // se recalcula abajo
        });
      }
    }

    // Recalcular porcentaje y ordenar por codigo_tienda numérico
    const rows = Array.from(map.values()).map((r) => ({
      ...r,
      identified_percentage:
        r.total_transactions > 0
          ? Math.round((r.identified_transactions / r.total_transactions) * 10000) / 100
          : 0,
    }));

    rows.sort((a, b) => {
      const na = parseInt(a.codigo_tienda?.replace(/\D/g, "") || "0", 10);
      const nb = parseInt(b.codigo_tienda?.replace(/\D/g, "") || "0", 10);
      return na - nb;
    });

    return rows;
  }, [queryData]);

  // Lista de tiendas disponibles para el filtro (extraída de los datos)
  const availableStores = useMemo(() => {
    if (!queryData?.data) return [];
    const seen = new Set<string>();
    const stores: { sap_id: string; nombre: string }[] = [];
    for (const row of queryData.data) {
      if (row.codigo_tienda && !seen.has(row.codigo_tienda)) {
        seen.add(row.codigo_tienda);
        stores.push({ sap_id: row.codigo_tienda, nombre: row.nombre });
      }
    }
    stores.sort((a, b) => {
      const na = parseInt(a.sap_id?.replace(/\D/g, "") || "0", 10);
      const nb = parseInt(b.sap_id?.replace(/\D/g, "") || "0", 10);
      return na - nb;
    });
    return stores;
  }, [queryData]);

  // Resumen consolidado
  const summary = useMemo(() => {
    const total = storeData.reduce((s, r) => s + r.total_transactions, 0);
    const identified = storeData.reduce((s, r) => s + r.identified_transactions, 0);
    const pct = total > 0 ? Math.round((identified / total) * 10000) / 100 : 0;
    return { total, identified, pct };
  }, [storeData]);

  const handleClearFilters = () => {
    setDateRange(undefined);
    setSelectedSapId("all");
    setGlobalBranchId(undefined);
  };

  const hasActiveFilters = dateRange !== undefined || selectedSapId !== "all";

  const dateRangeText = useMemo(() => {
    if (dateRange?.from && dateRange?.to) {
      return `${dateRange.from.toLocaleDateString("es-PE")} – ${dateRange.to.toLocaleDateString("es-PE")}`;
    } else if (dateRange?.from) {
      return `Desde ${dateRange.from.toLocaleDateString("es-PE")}`;
    }
    return "Ayer (por defecto)";
  }, [dateRange]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-lg font-medium">Cargando...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationMenu />

      <div className="container py-8 space-y-8">
        {/* ── Header ── */}
        <div className="space-y-2">
          <h1
            className="text-3xl font-bold tracking-tight uppercase"
            style={{ fontFamily: "Italian Plate No 1, serif" }}
          >
            TRANSACCIONES IDENTIFICADAS
          </h1>
          <p className="text-muted-foreground">
            Porcentaje de identificación de clientes por tienda en el período seleccionado
          </p>
          {queryData?.metadata && (
            <p className="text-xs text-muted-foreground">
              Actualizado:{" "}
              {new Date(queryData.metadata.generated_at).toLocaleString("es-PE")} |
              Total registros: {formatNumber(queryData.metadata.total_rows)}
            </p>
          )}
        </div>

        {/* ── Filtros ── */}
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
            <div className="grid gap-6 md:grid-cols-2">
              {/* Rango de Fechas */}
              <div className="space-y-2">
                <Label>Rango de Fechas</Label>
                <DatePickerWithRange date={dateRange} onDateChange={setDateRange} />
              </div>

              {/* Tienda — bloqueado para store_user */}
              <div className="space-y-2">
                <Label htmlFor="store">
                  Tienda
                  {isStoreUser && <Lock className="inline ml-1 h-3 w-3 text-muted-foreground" />}
                </Label>
                {isStoreUser ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/50 text-sm text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span>{availableStores.find(s => s.sap_id === assignedStoreCode)?.nombre ?? assignedStoreCode ?? 'Tu tienda'}</span>
                  </div>
                ) : (
                  <Select value={selectedSapId} onValueChange={setSelectedSapId}>
                    <SelectTrigger id="store">
                      <SelectValue placeholder="Todas las tiendas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all"><span>Todas las tiendas</span></SelectItem>
                      {availableStores.map((s) => (
                        <SelectItem key={s.sap_id} value={s.sap_id}><span>
                          {s.nombre} ({s.sap_id})
                        </span></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Estado de carga ── */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-lg font-medium">Cargando datos...</span>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Error al cargar datos</CardTitle>
              <CardDescription>{error.message}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {!isLoading && !error && (
          <>
            {/* ── Resumen consolidado ── */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* Total transacciones */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Transacciones</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" style={{ fontFamily: "Sailec, sans-serif" }}>
                    {formatNumber(summary.total)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{dateRangeText}</p>
                </CardContent>
              </Card>

              {/* Transacciones identificadas */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Transacciones Identificadas</CardTitle>
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" style={{ fontFamily: "Sailec, sans-serif" }}>
                    {formatNumber(summary.identified)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatNumber(summary.total - summary.identified)} sin identificar
                  </p>
                </CardContent>
              </Card>

              {/* Porcentaje global */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">% Global de Identificación</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div
                    className="text-4xl font-bold"
                    style={{
                      fontFamily: "Sailec, sans-serif",
                      color: percentColor(summary.pct),
                    }}
                  >
                    {summary.pct.toFixed(1)}%
                  </div>
                  {/* Barra de progreso */}
                  <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(summary.pct, 100)}%`,
                        backgroundColor: percentColor(summary.pct),
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {storeData.length} tienda{storeData.length !== 1 ? "s" : ""} en el período
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* ── Tarjetas por tienda ── */}
            {storeData.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Store className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">
                    No hay datos para el período seleccionado
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ajusta el rango de fechas o el filtro de tienda
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <h2
                    className="text-xl font-semibold tracking-tight"
                    style={{ fontFamily: "Italian Plate No 1, serif" }}
                  >
                    DETALLE POR TIENDA
                  </h2>
                  <span className="text-sm text-muted-foreground ml-1">
                    ({storeData.length} tienda{storeData.length !== 1 ? "s" : ""})
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {storeData.map((store) => (
                    <Card
                      key={store.codigo_tienda || store.nombre}
                      className="relative overflow-hidden"
                    >
                      {/* Franja de color superior según porcentaje */}
                      <div
                        className="absolute top-0 left-0 right-0 h-1"
                        style={{ backgroundColor: percentColor(store.identified_percentage) }}
                      />

                      <CardHeader className="pb-2 pt-5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <CardTitle
                              className="text-sm font-semibold leading-tight truncate"
                              style={{ fontFamily: "Sailec, sans-serif" }}
                              title={store.nombre}
                            >
                              {store.nombre}
                            </CardTitle>
                            <CardDescription className="text-xs mt-0.5">
                              Código: {store.codigo_tienda || "—"}
                            </CardDescription>
                          </div>
                          {/* Porcentaje — alta visibilidad */}
                          <div
                            className="shrink-0 text-2xl font-bold leading-none"
                            style={{
                              fontFamily: "Sailec, sans-serif",
                              color: percentColor(store.identified_percentage),
                            }}
                          >
                            {store.identified_percentage.toFixed(1)}%
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-3">
                        {/* Barra de progreso */}
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(store.identified_percentage, 100)}%`,
                              backgroundColor: percentColor(store.identified_percentage),
                            }}
                          />
                        </div>

                        {/* Métricas */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Total</p>
                            <p
                              className="font-semibold"
                              style={{ fontFamily: "Sailec, sans-serif" }}
                            >
                              {formatNumber(store.total_transactions)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Identificadas</p>
                            <p
                              className="font-semibold"
                              style={{
                                fontFamily: "Sailec, sans-serif",
                                color: percentColor(store.identified_percentage),
                              }}
                            >
                              {formatNumber(store.identified_transactions)}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-xs text-muted-foreground">Sin identificar</p>
                            <p
                              className="font-semibold text-muted-foreground"
                              style={{ fontFamily: "Sailec, sans-serif" }}
                            >
                              {formatNumber(store.total_transactions - store.identified_transactions)}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Botón flotante de reporte de discrepancias */}
      <ReportDiscrepancyButton
        variant="fab"
        context={{
          module: "identified-transactions",
          dateFrom: queryParams.fecha_min,
          dateTo: queryParams.fecha_max,
          storeId: selectedSapId !== "all" ? selectedSapId : undefined,
          storeName:
            selectedSapId !== "all"
              ? availableStores.find((s) => s.sap_id === selectedSapId)?.nombre
              : undefined,
        }}
      />
    </div>
  );
}
