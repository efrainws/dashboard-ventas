import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { NavigationMenu } from "@/components/NavigationMenu";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DashboardFilters } from "@/components/DashboardFilters";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Search, Download, LayoutGrid, TableIcon, Upload, Info, ImageIcon, Trash2, Save, BarChart3 } from "lucide-react";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { DateRange } from "react-day-picker";
import { useFilters } from "@/contexts/FiltersContext";
import { useIgv } from "@/contexts/IgvContext";
import { useAggregatedSales } from "@/hooks/useAggregatedSales";
import { Stage, Layer, Rect, Text, Group, Image as KonvaImage } from "react-konva";
import type Konva from "konva";
import { toast } from "sonner";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ShelfRow {
  branch_sap_id: string;
  branch_name: string;
  stock_id: string | null;
  product_id: string;
  int_sku: string;
  product_name: string;
  shelf_status: string;
  shelf_id: string | null;
  shelf_name: string;
  category_name: string;
  cantidad_vendida: number;
  monto_total: number;
}

interface ShelfAggRow {
  branch_sap_id: string;
  branch_name: string;
  shelf_id: string | null;
  shelf_name: string;
  shelf_status: string;
  productos_distintos: number;
  cantidad_vendida: number;
  monto_total: number;
}

interface ShelfZone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNumber(n: number) {
  return n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
}

function statusBadge(status: string) {
  if (status === "Sin registro en stocks")
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "#F8D7DC", color: "#BC2C46" }}>
        Sin registro
      </span>
    );
  if (status === "Stock sin shelf")
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "#FBF3D5", color: "#8B6B04" }}>
        Sin shelf
      </span>
    );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "#D6EDE8", color: "#005A47" }}>
      Con shelf
    </span>
  );
}

function getStatusColor(status: string): string {
  if (status === "Sin registro en stocks") return "#ef4444";
  if (status === "Stock sin shelf") return "#f59e0b";
  return "#10b981";
}

// ─── Componente de visualización Konva ───────────────────────────────────────

interface StoreLayoutViewerProps {
  data: ShelfRow[];
  selectedBranch: string;
  branchName: string;
}

function StoreLayoutViewer({ data, selectedBranch, branchName }: StoreLayoutViewerProps) {
  const utils = trpc.useUtils();
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [zones, setZones] = useState<ShelfZone[]>([]);
  const [selectedZone, setSelectedZone] = useState<ShelfZone | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; zone: ShelfZone } | null>(null);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Queries de layout y zonas persistentes
  const { data: layoutData, isLoading: layoutLoading } = trpc.shelfLayout.listLayouts.useQuery(
    undefined,
    { enabled: selectedBranch !== "all" }
  );
  const { data: zonesData, isLoading: zonesLoading } = trpc.shelfLayout.listZones.useQuery(
    { sapId: selectedBranch },
    { enabled: selectedBranch !== "all" }
  );

  // Mutations
  const upsertLayout = trpc.shelfLayout.upsertLayout.useMutation({
    onSuccess: () => {
      utils.shelfLayout.listLayouts.invalidate();
      toast.success("Layout guardado correctamente.");
    },
    onError: (e) => toast.error(`Error al guardar layout: ${e.message}`),
  });
  const deleteLayout = trpc.shelfLayout.deleteLayout.useMutation({
    onSuccess: () => {
      utils.shelfLayout.listLayouts.invalidate();
      setBgImage(null);
      toast.success("Layout eliminado.");
    },
    onError: (e) => toast.error(`Error al eliminar layout: ${e.message}`),
  });
  const saveZones = trpc.shelfLayout.saveAllZones.useMutation({
    onSuccess: () => {
      utils.shelfLayout.listZones.invalidate({ sapId: selectedBranch });
      setHasUnsavedChanges(false);
      toast.success("Zonas de góndola guardadas.");
    },
    onError: (e) => toast.error(`Error al guardar zonas: ${e.message}`),
  });

  // Cargar layout desde BD cuando cambia la tienda
  const currentLayout = useMemo(() => {
    if (!layoutData || !Array.isArray(layoutData)) return null;
    return layoutData.find((l: any) => l.sapId === selectedBranch) ?? null;
  }, [layoutData, selectedBranch]);

  useEffect(() => {
    if (currentLayout?.imageUrl) {
      const img = new window.Image();
      img.onload = () => setBgImage(img);
      img.src = currentLayout.imageUrl;
    } else {
      setBgImage(null);
    }
  }, [currentLayout]);

  // Cargar zonas desde BD cuando cambia la tienda
  useEffect(() => {
    if (Array.isArray(zonesData)) {
      setZones(zonesData.map((z: any) => ({
        id: String(z.id),
        name: z.shelfName ?? `Góndola ${z.id}`,
        x: Number(z.x),
        y: Number(z.y),
        width: Number(z.width),
        height: Number(z.height),
      })));
      setHasUnsavedChanges(false);
    }
  }, [zonesData]);

  // Calcular métricas por shelf para el heatmap
  const shelfMetrics = useMemo(() => {
    const map = new Map<string, { monto: number; productos: number; status: string }>();
    data.forEach((row) => {
      const key = row.shelf_name || row.shelf_id || "sin_shelf";
      const existing = map.get(key);
      if (existing) {
        existing.monto += row.monto_total;
        existing.productos += 1;
      } else {
        map.set(key, { monto: row.monto_total, productos: 1, status: row.shelf_status });
      }
    });
    return map;
  }, [data]);

  const maxMonto = useMemo(() => {
    let max = 0;
    shelfMetrics.forEach((v) => { if (v.monto > max) max = v.monto; });
    return max || 1;
  }, [shelfMetrics]);

  // Ajustar tamaño del canvas al contenedor
  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setStageSize({ width: Math.max(width, 400), height: Math.max(height, 400) });
      }
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Cargar imagen de fondo (layout de tienda) y subirla a S3 vía backend
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (selectedBranch === "all") {
        toast.error("Debes seleccionar una tienda específica para cargar su layout.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      // Mostrar preview inmediato
      const img = new window.Image();
      img.onload = () => {
        setBgImage(img);
        const scaleX = stageSize.width / img.width;
        const scaleY = stageSize.height / img.height;
        setScale(Math.min(scaleX, scaleY, 1));
      };
      img.src = dataUrl;
      // Separar el prefijo data:mime;base64, del contenido
      const [header, base64] = dataUrl.split(",");
      const mimeMatch = header.match(/data:([^;]+);/);
      const mimeType = (mimeMatch?.[1] ?? "image/png") as "image/png" | "image/jpeg" | "image/svg+xml" | "image/webp";
      // Guardar en backend
      upsertLayout.mutate({
        sapId: selectedBranch,
        branchName: branchName,
        imageBase64: base64,
        mimeType,
        fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [selectedBranch, branchName, stageSize, upsertLayout, toast]);

  // Color del heatmap según monto relativo
  function getHeatColor(monto: number): string {
    const ratio = monto / maxMonto;
    if (ratio > 0.75) return "#065f46";
    if (ratio > 0.5)  return "#059669";
    if (ratio > 0.25) return "#34d399";
    if (ratio > 0)    return "#a7f3d0";
    return "#f3f4f6";
  }

  // Agregar zona manualmente (doble click en canvas vacío)
  const handleStageDblClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target !== e.target.getStage()) return;
    const pos = e.target.getStage()!.getPointerPosition()!;
    const newZone: ShelfZone = {
      id: `zone-${Date.now()}`,
      name: `Góndola ${zones.length + 1}`,
      x: (pos.x - stagePos.x) / scale,
      y: (pos.y - stagePos.y) / scale,
      width: 120,
      height: 60,
    };
    setZones((prev) => [...prev, newZone]);
    setHasUnsavedChanges(true);
  }, [zones.length, scale, stagePos]);

  // Guardar zonas en BD
  const handleSaveZones = () => {
    if (selectedBranch === "all") {
        toast.error("Debes seleccionar una tienda específica para guardar las zonas.");
      return;
    }
      saveZones.mutate({
        sapId: selectedBranch,
        zones: zones.map((z) => ({ shelfName: z.name, x: z.x, y: z.y, width: z.width, height: z.height })),
      });
  };

  const isLoadingPersisted = layoutLoading || zonesLoading;

  return (
    <div className="flex flex-col gap-4">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        {selectedBranch === "all" ? (
          <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-1.5 rounded-md">
            <Info className="h-4 w-4 shrink-0" />
            Selecciona una tienda específica para gestionar su layout y zonas.
          </div>
        ) : (
          <>
            <label className="flex items-center gap-2 cursor-pointer">
              <Button variant="outline" size="sm" asChild disabled={upsertLayout.isPending}>
                <span>
                  {upsertLayout.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <ImageIcon className="h-4 w-4 mr-1" />
                  )}
                  {currentLayout ? "Reemplazar layout" : "Cargar layout (PNG/SVG/JPG)"}
                </span>
              </Button>
              <input type="file" accept="image/png,image/svg+xml,image/jpeg" className="hidden" onChange={handleFileUpload} />
            </label>

            {currentLayout && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => deleteLayout.mutate({ sapId: selectedBranch })}
                disabled={deleteLayout.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Eliminar layout
              </Button>
            )}

            {hasUnsavedChanges && (
              <Button
                size="sm"
                onClick={handleSaveZones}
                disabled={saveZones.isPending}
                style={{ background: "#1A6894" }}
                className="text-white"
              >
                {saveZones.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Guardar zonas
              </Button>
            )}

            {zones.length > 0 && !hasUnsavedChanges && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveZones}
                disabled={saveZones.isPending}
              >
                <Save className="h-4 w-4 mr-1" />
                Guardar zonas
              </Button>
            )}

            {zones.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => { setZones([]); setHasUnsavedChanges(true); }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Limpiar zonas
              </Button>
            )}
          </>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Doble clic en el canvas para agregar una góndola. Arrastra para mover.
        </div>
      </div>

      {/* Leyenda del heatmap */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="font-medium">Intensidad de ventas:</span>
        {[
          { color: "#f3f4f6", label: "Sin ventas" },
          { color: "#a7f3d0", label: "Baja" },
          { color: "#34d399", label: "Media" },
          { color: "#059669", label: "Alta" },
          { color: "#065f46", label: "Muy alta" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div className="w-4 h-4 rounded border border-border/50" style={{ background: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Canvas Konva */}
      <div
        ref={containerRef}
        className="border border-border rounded-lg overflow-hidden bg-muted/20 relative"
        style={{ height: 520 }}
      >
        {isLoadingPersisted && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          scaleX={scale}
          scaleY={scale}
          x={stagePos.x}
          y={stagePos.y}
          draggable
          onDragStart={() => setIsDragging(true)}
          onDragEnd={(e) => {
            setIsDragging(false);
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }}
          onDblClick={handleStageDblClick}
          onWheel={(e) => {
            e.evt.preventDefault();
            const scaleBy = 1.05;
            const stage = stageRef.current!;
            const oldScale = stage.scaleX();
            const pointer = stage.getPointerPosition()!;
            const mousePointTo = {
              x: (pointer.x - stage.x()) / oldScale,
              y: (pointer.y - stage.y()) / oldScale,
            };
            const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
            setScale(newScale);
            setStagePos({
              x: pointer.x - mousePointTo.x * newScale,
              y: pointer.y - mousePointTo.y * newScale,
            });
          }}
          style={{ cursor: isDragging ? "grabbing" : "grab" }}
        >
          <Layer>
            {bgImage && (
              <KonvaImage
                image={bgImage}
                x={0}
                y={0}
                width={bgImage.width}
                height={bgImage.height}
                opacity={0.85}
              />
            )}

            {zones.map((zone) => {
              const metrics = shelfMetrics.get(zone.name);
              const fillColor = metrics ? getHeatColor(metrics.monto) : "#e5e7eb";
              const isSelected = selectedZone?.id === zone.id;

              return (
                <Group
                  key={zone.id}
                  x={zone.x}
                  y={zone.y}
                  draggable
                  onDragEnd={(e) => {
                    setZones((prev) =>
                      prev.map((z) =>
                        z.id === zone.id
                          ? { ...z, x: e.target.x(), y: e.target.y() }
                          : z
                      )
                    );
                    setHasUnsavedChanges(true);
                  }}
                  onClick={() => setSelectedZone(isSelected ? null : zone)}
                  onMouseEnter={(e) => {
                    const stage = e.target.getStage()!;
                    const pos = stage.getPointerPosition()!;
                    setTooltip({ x: pos.x, y: pos.y, zone });
                    stage.container().style.cursor = "pointer";
                  }}
                  onMouseLeave={(e) => {
                    setTooltip(null);
                    e.target.getStage()!.container().style.cursor = "grab";
                  }}
                >
                  <Rect
                    width={zone.width}
                    height={zone.height}
                    fill={fillColor}
                    stroke={isSelected ? "#1A6894" : "#94a3b8"}
                    strokeWidth={isSelected ? 2.5 : 1}
                    cornerRadius={4}
                    shadowBlur={isSelected ? 8 : 0}
                    shadowColor="#1A6894"
                    opacity={0.85}
                  />
                  <Text
                    text={zone.name}
                    x={4}
                    y={4}
                    width={zone.width - 8}
                    fontSize={11}
                    fontStyle="bold"
                    fill={metrics && metrics.monto > maxMonto * 0.5 ? "#fff" : "#1e293b"}
                    ellipsis
                    wrap="none"
                  />
                  {metrics && (
                    <Text
                      text={`S/ ${fmtCurrency(metrics.monto)}`}
                      x={4}
                      y={20}
                      width={zone.width - 8}
                      fontSize={10}
                      fill={metrics.monto > maxMonto * 0.5 ? "#d1fae5" : "#475569"}
                      ellipsis
                      wrap="none"
                    />
                  )}
                </Group>
              );
            })}

            {tooltip && (() => {
              const metrics = shelfMetrics.get(tooltip.zone.name);
              const tipX = (tooltip.x - stagePos.x) / scale + 10;
              const tipY = (tooltip.y - stagePos.y) / scale - 10;
              return (
                <Group x={tipX} y={tipY}>
                  <Rect width={180} height={metrics ? 70 : 40} fill="#1e293b" cornerRadius={6} opacity={0.92} />
                  <Text text={tooltip.zone.name} x={8} y={8} fontSize={12} fontStyle="bold" fill="#f8fafc" />
                  {metrics ? (
                    <>
                      <Text text={`Monto: S/ ${fmtCurrency(metrics.monto)}`} x={8} y={26} fontSize={11} fill="#94a3b8" />
                      <Text text={`Productos: ${metrics.productos}`} x={8} y={42} fontSize={11} fill="#94a3b8" />
                      <Text text={metrics.status} x={8} y={56} fontSize={10} fill={getStatusColor(metrics.status)} />
                    </>
                  ) : (
                    <Text text="Sin datos en el período" x={8} y={26} fontSize={11} fill="#94a3b8" />
                  )}
                </Group>
              );
            })()}
          </Layer>
        </Stage>
      </div>

      {/* Panel de zona seleccionada */}
      {selectedZone && (
        <Card className="border-primary/30">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" style={{ color: "#1A6894" }} />
              {selectedZone.name}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 text-xs"
                onClick={() => {
                  const name = prompt("Nombre de la góndola:", selectedZone.name);
                  if (name) {
                    setZones((prev) =>
                      prev.map((z) => (z.id === selectedZone.id ? { ...z, name } : z))
                    );
                    setSelectedZone({ ...selectedZone, name });
                    setHasUnsavedChanges(true);
                  }
                }}
              >
                Renombrar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={() => {
                  setZones((prev) => prev.filter((z) => z.id !== selectedZone.id));
                  setSelectedZone(null);
                  setHasUnsavedChanges(true);
                }}
              >
                Eliminar
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {(() => {
              const metrics = shelfMetrics.get(selectedZone.name);
              if (!metrics) return <p className="text-sm text-muted-foreground">Sin datos de ventas para esta góndola en el período seleccionado.</p>;
              return (
                <div className="flex gap-6 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Monto total</p>
                    <p className="font-bold" style={{ color: "#008064" }}>S/ {fmtCurrency(metrics.monto)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Productos</p>
                    <p className="font-semibold">{metrics.productos}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Estado</p>
                    {statusBadge(metrics.status)}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function SalesByShelf() {
  const { user } = useAuth();
  const { effectiveTheme } = useTheme();
   const {
    dateRange: globalDateRange,
    setDateRange: setGlobalDateRange,
    branchId: globalBranchId,
    setBranchId: setGlobalBranchId,
  } = useFilters();
  const { includeIgv } = useIgv();

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (globalDateRange) return globalDateRange;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return { from: yesterday, to: new Date(yesterday.getTime() + 86399999) };
  });

  const userRole = user?.role as string | undefined;
  const isStoreUser = userRole === "store_user";
  const assignedStoreCode = (user as any)?.assignedStoreCode as string | null | undefined;
  const [selectedBranch, setSelectedBranch] = useState<string>(() => globalBranchId || "all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [shelfStatus, setShelfStatus] = useState<"all" | "sin_registro" | "sin_shelf" | "con_shelf">("all");
  const [search, setSearch] = useState("");
  const [searchAgg, setSearchAgg] = useState("");
  const [activeTab, setActiveTab] = useState<"tabla" | "agregado" | "mapa">("agregado");

  useEffect(() => {
    if (isStoreUser && assignedStoreCode) setSelectedBranch(assignedStoreCode);
  }, [isStoreUser, assignedStoreCode]);

  useEffect(() => { setGlobalDateRange(dateRange); }, [dateRange, setGlobalDateRange]);
  useEffect(() => { setGlobalBranchId(selectedBranch === "all" ? undefined : selectedBranch); }, [selectedBranch, setGlobalBranchId]);

  const { fechaMin, fechaMax } = useMemo(() => {
    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      fechaMin: dateRange?.from ? fmt(dateRange.from) : fmt(yesterday),
      fechaMax: dateRange?.to ? fmt(dateRange.to) : fmt(yesterday),
    };
  }, [dateRange]);

  // Query principal (por producto)
  const { data: queryResult, isLoading, error } = trpc.sales.getSalesByShelf.useQuery({
    fecha_min: fechaMin,
    fecha_max: fechaMax,
    branch_id: selectedBranch !== "all" ? selectedBranch : undefined,
    category_id: selectedCategory !== "all" ? selectedCategory : undefined,
    include_igv: includeIgv,
    shelf_status: shelfStatus,
  });

  // Query agregado (por góndola)
  const { data: aggResult, isLoading: aggLoading, error: aggError } = trpc.sales.getSalesByShelfAggregated.useQuery({
    fecha_min: fechaMin,
    fecha_max: fechaMax,
    branch_id: selectedBranch !== "all" ? selectedBranch : undefined,
    category_id: selectedCategory !== "all" ? selectedCategory : undefined,
    include_igv: includeIgv,
    shelf_status: shelfStatus,
  });

  const rows: ShelfRow[] = queryResult?.data ?? [];
  const aggRows: ShelfAggRow[] = aggResult?.data ?? [];

  const { metrics: salesMetrics } = useAggregatedSales(
    useMemo(() => ({
      fecha_min: fechaMin,
      fecha_max: fechaMax,
      include_igv: includeIgv,
    }), [fechaMin, fechaMax, includeIgv])
  );

  const branchName = useMemo(() => {
    if (selectedBranch === "all") return "";
    return salesMetrics.branches.find((b) => b.sap_id === selectedBranch)?.name ?? selectedBranch;
  }, [selectedBranch, salesMetrics.branches]);

  // Filtrar por búsqueda de texto (tabla de datos)
  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.product_name.toLowerCase().includes(q) ||
        r.int_sku.toLowerCase().includes(q) ||
        r.shelf_name.toLowerCase().includes(q) ||
        r.branch_name.toLowerCase().includes(q) ||
        r.category_name.toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Filtrar por búsqueda de texto (tabla agregada)
  const filteredAggRows = useMemo(() => {
    if (!searchAgg.trim()) return aggRows;
    const q = searchAgg.toLowerCase();
    return aggRows.filter(
      (r) =>
        r.shelf_name.toLowerCase().includes(q) ||
        r.branch_name.toLowerCase().includes(q)
    );
  }, [aggRows, searchAgg]);

  // KPIs resumen
  const kpis = useMemo(() => {
    const totalMonto = rows.reduce((s, r) => s + r.monto_total, 0);
    const totalCantidad = rows.reduce((s, r) => s + r.cantidad_vendida, 0);
    const sinRegistro = rows.filter((r) => r.shelf_status === "Sin registro en stocks").length;
    const sinShelf = rows.filter((r) => r.shelf_status === "Stock sin shelf").length;
    const conShelf = rows.filter((r) => r.shelf_status === "Con shelf asignado").length;
    const uniqueProducts = new Set(rows.map((r) => r.product_id)).size;
    return { totalMonto, totalCantidad, sinRegistro, sinShelf, conShelf, uniqueProducts };
  }, [rows]);

  // Exportar CSV (tabla de datos)
  const exportCsv = () => {
    const headers = ["Tienda", "SAP ID", "Int. SKU", "Producto", "Categoría", "Góndola", "Estado Shelf", "Cantidad Vendida", "Monto Total"];
    const csvRows = filteredRows.map((r) => [
      r.branch_name, r.branch_sap_id, r.int_sku, r.product_name, r.category_name,
      r.shelf_name || "—", r.shelf_status, r.cantidad_vendida, r.monto_total,
    ]);
    const csv = [headers, ...csvRows].map((row) => row.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas-gondola-${fechaMin}-${fechaMax}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Exportar CSV (tabla agregada)
  const exportAggCsv = () => {
    const headers = ["Tienda", "SAP ID", "Góndola", "Estado", "Productos distintos", "Cantidad Vendida", "Monto Total"];
    const csvRows = filteredAggRows.map((r) => [
      r.branch_name, r.branch_sap_id, r.shelf_name, r.shelf_status,
      r.productos_distintos, r.cantidad_vendida, r.monto_total,
    ]);
    const csv = [headers, ...csvRows].map((row) => row.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas-gondola-agregado-${fechaMin}-${fechaMax}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearFilters = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    setDateRange({ from: yesterday, to: new Date(yesterday.getTime() + 86399999) });
    if (!isStoreUser) setSelectedBranch("all");
    setSelectedCategory("all");
    setShelfStatus("all");
    setSearch("");
    setSearchAgg("");
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F5F4F1" }} data-theme={effectiveTheme}>
      <NavigationMenu />
      <div className="container py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading uppercase tracking-wide">Venta por Góndola</h1>
            <p className="text-sm mt-1" style={{ color: "#919291" }}>
              Análisis de ventas por posición de góndola (shelf) en tienda.
              {includeIgv ? " Con IGV." : " Sin IGV."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={activeTab === "agregado" ? exportAggCsv : exportCsv}
            disabled={activeTab === "tabla" ? filteredRows.length === 0 : filteredAggRows.length === 0}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Exportar CSV
          </Button>
        </div>

        {/* Filtros */}
        <DashboardFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          selectedBranch={selectedBranch}
          branches={salesMetrics.branches}
          onBranchChange={isStoreUser ? () => {} : setSelectedBranch}
          branchLocked={isStoreUser}
          selectedCategory={selectedCategory}
          categories={salesMetrics.categories}
          onCategoryChange={setSelectedCategory}
          onClearFilters={handleClearFilters}
          showIgvToggle
        />

        {/* Filtro adicional: estado de shelf */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium" style={{ color: "#919291" }}>Estado shelf:</span>
          <Select value={shelfStatus} onValueChange={(v) => setShelfStatus(v as typeof shelfStatus)}>
            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="sin_registro">Sin registro en stocks</SelectItem>
              <SelectItem value="sin_shelf">Stock sin shelf</SelectItem>
              <SelectItem value="con_shelf">Con shelf asignado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPIs */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg animate-pulse" style={{ backgroundColor: "#EAE8E2" }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Monto Total", value: `S/ ${fmtCurrency(kpis.totalMonto)}`, color: "#008064" },
              { label: "Cantidad Vendida", value: fmtNumber(kpis.totalCantidad), color: "#1A6894" },
              { label: "Productos únicos", value: kpis.uniqueProducts.toString(), color: "#232523" },
              { label: "Con shelf", value: kpis.conShelf.toString(), color: "#008064" },
              { label: "Sin shelf", value: kpis.sinShelf.toString(), color: "#C49705" },
              { label: "Sin registro", value: kpis.sinRegistro.toString(), color: "#BC2C46" },
            ].map((kpi) => (
              <Card key={kpi.label} className="border-0 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
                <CardContent className="p-3">
                  <p className="text-xs" style={{ color: "#919291", fontFamily: "var(--font-sans)" }}>{kpi.label}</p>
                  <p className="text-lg font-bold mt-1 tabular-nums" style={{ color: kpi.color, fontFamily: "var(--font-sans)" }}>
                    {kpi.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Tabs: Agregado / Mapa / Tabla */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "tabla" | "agregado" | "mapa")}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Botones de selección de vista — separados, estilo F&F */}
            <div className="flex items-center gap-2">
              {([
                { value: "agregado", icon: <BarChart3 className="h-4 w-4" />, label: "Agregado por Góndola" },
                { value: "mapa",     icon: <LayoutGrid className="h-4 w-4" />, label: "Mapa de Tienda" },
                { value: "tabla",    icon: <TableIcon className="h-4 w-4" />,  label: "Tabla de Datos" },
              ] as const).map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: activeTab === tab.value ? "#232523" : "transparent",
                    color: activeTab === tab.value ? "#FFFFFF" : "#919291",
                    border: activeTab === tab.value ? "1px solid #232523" : "1px solid #EAE8E2",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "tabla" && (
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto, SKU, góndola…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            )}
            {activeTab === "agregado" && (
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar góndola o tienda…"
                  value={searchAgg}
                  onChange={(e) => setSearchAgg(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            )}
          </div>

          {/* Tab: Tabla de datos (por producto) */}
          <TabsContent value="tabla" className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Cargando datos de góndola…</span>
              </div>
            ) : error ? (
              <div className="py-12 text-center text-destructive text-sm">
                Error al cargar datos: {error.message}
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No se encontraron resultados para los filtros seleccionados.
              </div>
            ) : (
              <Card className="border-0 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow style={{ backgroundColor: "#F5F4F1", borderBottom: "1px solid #EAE8E2" }}>
                          <TableHead className="text-xs w-12 font-heading uppercase" style={{ color: "#919291" }}>SAP</TableHead>
                          <TableHead className="text-xs font-heading uppercase" style={{ color: "#919291" }}>Tienda</TableHead>
                          <TableHead className="text-xs font-heading uppercase" style={{ color: "#919291" }}>Int. SKU</TableHead>
                          <TableHead className="text-xs font-heading uppercase" style={{ color: "#919291" }}>Producto</TableHead>
                          <TableHead className="text-xs font-heading uppercase" style={{ color: "#919291" }}>Categoría</TableHead>
                          <TableHead className="text-xs font-heading uppercase" style={{ color: "#919291" }}>Góndola</TableHead>
                          <TableHead className="text-xs font-heading uppercase" style={{ color: "#919291" }}>Estado</TableHead>
                          <TableHead className="text-xs font-heading uppercase text-right" style={{ color: "#919291" }}>Cantidad</TableHead>
                          <TableHead className="text-xs font-heading uppercase text-right" style={{ color: "#919291" }}>Monto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRows.map((row, i) => (
                          <TableRow
                            key={i}
                            style={{ borderBottom: "1px solid #EAE8E2" }}
                            className="transition-colors"
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F5F4F1")}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                          >
                            <TableCell className="text-xs tabular-nums" style={{ color: "#919291" }}>{row.branch_sap_id}</TableCell>
                            <TableCell className="text-xs font-medium" style={{ color: "#232523" }}>{row.branch_name}</TableCell>
                            <TableCell className="text-xs tabular-nums" style={{ color: "#919291" }}>{row.int_sku || "—"}</TableCell>
                            <TableCell className="text-xs max-w-[200px]" style={{ color: "#232523" }}>
                              <span className="block truncate" title={row.product_name}>{row.product_name}</span>
                            </TableCell>
                            <TableCell className="text-xs" style={{ color: "#919291" }}>{row.category_name}</TableCell>
                            <TableCell className="text-xs" style={{ color: "#232523" }}>{row.shelf_name || <span style={{ color: "#919291" }}>—</span>}</TableCell>
                            <TableCell className="text-xs">{statusBadge(row.shelf_status)}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums" style={{ color: "#232523" }}>{fmtNumber(row.cantidad_vendida)}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums font-semibold" style={{ color: "#008064" }}>
                              S/ {fmtCurrency(row.monto_total)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="px-4 py-2 text-xs" style={{ borderTop: "1px solid #EAE8E2", color: "#919291" }}>
                    {filteredRows.length.toLocaleString()} registros
                    {search && ` (filtrados de ${rows.length.toLocaleString()})`}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Agregado por góndola */}
          <TabsContent value="agregado" className="mt-4">
            {aggLoading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Cargando agregado por góndola…</span>
              </div>
            ) : aggError ? (
              <div className="py-12 text-center text-destructive text-sm">
                Error al cargar datos: {aggError.message}
              </div>
            ) : filteredAggRows.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No se encontraron resultados para los filtros seleccionados.
              </div>
            ) : (
              <Card className="border-0 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow style={{ backgroundColor: "#F5F4F1", borderBottom: "1px solid #EAE8E2" }}>
                          <TableHead className="text-xs w-12 font-heading uppercase" style={{ color: "#919291" }}>SAP</TableHead>
                          <TableHead className="text-xs font-heading uppercase" style={{ color: "#919291" }}>Tienda</TableHead>
                          <TableHead className="text-xs font-heading uppercase" style={{ color: "#919291" }}>Góndola</TableHead>
                          <TableHead className="text-xs font-heading uppercase" style={{ color: "#919291" }}>Estado</TableHead>
                          <TableHead className="text-xs font-heading uppercase text-right" style={{ color: "#919291" }}>Productos</TableHead>
                          <TableHead className="text-xs font-heading uppercase text-right" style={{ color: "#919291" }}>Cantidad</TableHead>
                          <TableHead className="text-xs font-heading uppercase text-right" style={{ color: "#919291" }}>Monto Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAggRows.map((row, i) => (
                          <TableRow
                            key={i}
                            style={{ borderBottom: "1px solid #EAE8E2" }}
                            className="transition-colors"
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F5F4F1")}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                          >
                            <TableCell className="text-xs tabular-nums" style={{ color: "#919291" }}>{row.branch_sap_id}</TableCell>
                            <TableCell className="text-xs font-medium" style={{ color: "#232523" }}>{row.branch_name}</TableCell>
                            <TableCell className="text-xs font-semibold" style={{ color: "#232523" }}>
                              {row.shelf_name || <span style={{ color: "#919291", fontStyle: "italic" }}>(Sin góndola asignada)</span>}
                            </TableCell>
                            <TableCell className="text-xs">{statusBadge(row.shelf_status)}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums" style={{ color: "#232523" }}>{row.productos_distintos.toLocaleString()}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums" style={{ color: "#232523" }}>{fmtNumber(row.cantidad_vendida)}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums font-bold" style={{ color: "#008064" }}>
                              S/ {fmtCurrency(row.monto_total)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="px-4 py-2 text-xs" style={{ borderTop: "1px solid #EAE8E2", color: "#919291" }}>
                    {filteredAggRows.length.toLocaleString()} góndolas
                    {searchAgg && ` (filtradas de ${aggRows.length.toLocaleString()})`}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Mapa Konva */}
          <TabsContent value="mapa" className="mt-4">
            <Card className="border-0 shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
              <CardHeader className="pb-3" style={{ borderBottom: "1px solid #EAE8E2" }}>
                <CardTitle className="text-base flex items-center gap-2 font-heading uppercase" style={{ color: "#232523" }}>
                  <LayoutGrid className="h-4 w-4" style={{ color: "#1A6894" }} />
                  Mapa de Tienda — Heatmap de Ventas
                  {selectedBranch !== "all" && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "#EAE8E2", color: "#919291", fontFamily: "var(--font-sans)", fontWeight: 400, textTransform: "none" }}>
                      {branchName || selectedBranch}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Cargando datos…</span>
                  </div>
                ) : (
                  <StoreLayoutViewer
                    data={rows}
                    selectedBranch={selectedBranch}
                    branchName={branchName}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
