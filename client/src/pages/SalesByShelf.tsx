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
import { Loader2, Search, Download, LayoutGrid, TableIcon, Upload, Info } from "lucide-react";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { DateRange } from "react-day-picker";
import { useFilters } from "@/contexts/FiltersContext";
import { useIgv } from "@/contexts/IgvContext";
import { useAggregatedSales } from "@/hooks/useAggregatedSales";
import { Stage, Layer, Rect, Text, Group, Image as KonvaImage } from "react-konva";
import type Konva from "konva";

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

interface ShelfZone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
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
    return <Badge variant="destructive" className="text-xs whitespace-nowrap">Sin registro</Badge>;
  if (status === "Stock sin shelf")
    return <Badge className="text-xs whitespace-nowrap bg-amber-500 hover:bg-amber-600">Sin shelf</Badge>;
  return (
    <Badge className="text-xs whitespace-nowrap bg-emerald-600 hover:bg-emerald-700">
      Con shelf
    </Badge>
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
}

function StoreLayoutViewer({ data, selectedBranch }: StoreLayoutViewerProps) {
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
        map.set(key, {
          monto: row.monto_total,
          productos: 1,
          status: row.shelf_status,
        });
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

  // Cargar imagen de fondo (layout de tienda)
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === "application/pdf") {
      // Para PDF: usar pdf.js para renderizar la primera página
      const url = URL.createObjectURL(file);
      // Mostrar mensaje de que se necesita convertir a imagen
      alert("Para layouts en PDF, por favor convierta el archivo a PNG o SVG primero usando una herramienta como Adobe Acrobat o pdf2image.");
      URL.revokeObjectURL(url);
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      setBgImage(img);
      // Ajustar escala para que la imagen quepa en el canvas
      const scaleX = stageSize.width / img.width;
      const scaleY = stageSize.height / img.height;
      setScale(Math.min(scaleX, scaleY, 1));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [stageSize]);

  // Color del heatmap según monto relativo
  function getHeatColor(monto: number): string {
    const ratio = monto / maxMonto;
    if (ratio > 0.75) return "#065f46"; // verde oscuro = alta venta
    if (ratio > 0.5)  return "#059669";
    if (ratio > 0.25) return "#34d399";
    if (ratio > 0)    return "#a7f3d0";
    return "#f3f4f6"; // gris = sin ventas
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
  }, [zones.length, scale, stagePos]);

  // Exportar zonas como JSON
  const exportZones = () => {
    const json = JSON.stringify(zones, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gondolas-${selectedBranch || "tienda"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Importar zonas desde JSON
  const handleZoneImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string) as ShelfZone[];
        setZones(imported);
      } catch {
        alert("Archivo JSON inválido");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <Button variant="outline" size="sm" asChild>
            <span>
              <Upload className="h-4 w-4 mr-1" />
              Cargar layout (PNG/SVG)
            </span>
          </Button>
          <input type="file" accept="image/png,image/svg+xml,image/jpeg,application/pdf" className="hidden" onChange={handleFileUpload} />
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <Button variant="outline" size="sm" asChild>
            <span>
              <Upload className="h-4 w-4 mr-1" />
              Importar zonas (JSON)
            </span>
          </Button>
          <input type="file" accept="application/json" className="hidden" onChange={handleZoneImport} />
        </label>

        {zones.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportZones}>
            <Download className="h-4 w-4 mr-1" />
            Exportar zonas
          </Button>
        )}

        {zones.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setZones([])}>
            Limpiar zonas
          </Button>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Doble clic en el canvas para agregar una góndola. Arrastra para mover.
        </div>
      </div>

      {/* Leyenda del heatmap */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
        className="border border-border rounded-lg overflow-hidden bg-muted/20"
        style={{ height: 520 }}
      >
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
            {/* Imagen de fondo del layout */}
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

            {/* Zonas de góndola */}
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

            {/* Tooltip flotante */}
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

  // Filtros globales compartidos con otras páginas
  const {
    dateRange: globalDateRange,
    setDateRange: setGlobalDateRange,
    branchId: globalBranchId,
    setBranchId: setGlobalBranchId,
  } = useFilters();
  const { includeIgv } = useIgv();

  // Estado local de filtros
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (globalDateRange) return globalDateRange;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);
    return { from: yesterday, to: yesterdayEnd };
  });

  const userRole = user?.role as string | undefined;
  const isStoreUser = userRole === "store_user";
  const assignedStoreCode = (user as any)?.assignedStoreCode as string | null | undefined;
  const [selectedBranch, setSelectedBranch] = useState<string>(() => globalBranchId || "all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [shelfStatus, setShelfStatus] = useState<"all" | "sin_registro" | "sin_shelf" | "con_shelf">("all");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"tabla" | "mapa">("tabla");

  useEffect(() => {
    if (isStoreUser && assignedStoreCode) setSelectedBranch(assignedStoreCode);
  }, [isStoreUser, assignedStoreCode]);

  useEffect(() => { setGlobalDateRange(dateRange); }, [dateRange, setGlobalDateRange]);
  useEffect(() => { setGlobalBranchId(selectedBranch === "all" ? undefined : selectedBranch); }, [selectedBranch, setGlobalBranchId]);

  // Construir fechas para el query
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

  // Query principal
  const { data: queryResult, isLoading, error } = trpc.sales.getSalesByShelf.useQuery({
    fecha_min: fechaMin,
    fecha_max: fechaMax,
    branch_id: selectedBranch !== "all" ? selectedBranch : undefined,
    category_id: selectedCategory !== "all" ? selectedCategory : undefined,
    include_igv: includeIgv,
    shelf_status: shelfStatus,
  });

  const rows: ShelfRow[] = queryResult?.data ?? [];

  // Obtener branches y categories del hook de ventas agregadas (para los selectores de filtro)
  const { metrics: salesMetrics } = useAggregatedSales(
    useMemo(() => ({
      fecha_min: fechaMin,
      fecha_max: fechaMax,
      include_igv: includeIgv,
    }), [fechaMin, fechaMax, includeIgv])
  );

  // Filtrar por búsqueda de texto
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

  // Exportar CSV
  const exportCsv = () => {
    const headers = ["Tienda", "SAP ID", "Int. SKU", "Producto", "Categoría", "Góndola", "Estado Shelf", "Cantidad Vendida", "Monto Total"];
    const csvRows = filteredRows.map((r) => [
      r.branch_name,
      r.branch_sap_id,
      r.int_sku,
      r.product_name,
      r.category_name,
      r.shelf_name || "—",
      r.shelf_status,
      r.cantidad_vendida,
      r.monto_total,
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

  const handleClearFilters = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    setDateRange({ from: yesterday, to: new Date(yesterday.getTime() + 86399999) });
    if (!isStoreUser) setSelectedBranch("all");
    setSelectedCategory("all");
    setShelfStatus("all");
    setSearch("");
  };

  return (
    <div className="min-h-screen bg-background" data-theme={effectiveTheme}>
      <NavigationMenu />
      <div className="container py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Venta por Góndola</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Análisis de ventas por posición de góndola (shelf) en tienda.
              {includeIgv ? " Con IGV." : " Sin IGV."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filteredRows.length === 0}>
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
          <span className="text-sm font-medium text-muted-foreground">Estado shelf:</span>
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
              <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Monto Total", value: `S/ ${fmtCurrency(kpis.totalMonto)}`, color: "#008064" },
              { label: "Cantidad Vendida", value: fmtNumber(kpis.totalCantidad), color: "#1A6894" },
              { label: "Productos únicos", value: kpis.uniqueProducts.toString(), color: "#6366f1" },
              { label: "Con shelf", value: kpis.conShelf.toString(), color: "#10b981" },
              { label: "Sin shelf", value: kpis.sinShelf.toString(), color: "#f59e0b" },
              { label: "Sin registro", value: kpis.sinRegistro.toString(), color: "#ef4444" },
            ].map((kpi) => (
              <Card key={kpi.label} className="border-border/50">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="text-lg font-bold mt-1 tabular-nums" style={{ color: kpi.color }}>
                    {kpi.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Tabs: Tabla / Mapa */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "tabla" | "mapa")}>
          <div className="flex items-center justify-between gap-4">
            <TabsList>
              <TabsTrigger value="tabla" className="flex items-center gap-1.5">
                <TableIcon className="h-4 w-4" />
                Tabla de datos
              </TabsTrigger>
              <TabsTrigger value="mapa" className="flex items-center gap-1.5">
                <LayoutGrid className="h-4 w-4" />
                Mapa de tienda
              </TabsTrigger>
            </TabsList>

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
          </div>

          {/* Tab: Tabla */}
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
              <Card className="border-border/50">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/50 bg-muted/30">
                          <TableHead className="text-xs w-12">SAP</TableHead>
                          <TableHead className="text-xs">Tienda</TableHead>
                          <TableHead className="text-xs">Int. SKU</TableHead>
                          <TableHead className="text-xs">Producto</TableHead>
                          <TableHead className="text-xs">Categoría</TableHead>
                          <TableHead className="text-xs">Góndola</TableHead>
                          <TableHead className="text-xs">Estado</TableHead>
                          <TableHead className="text-xs text-right">Cantidad</TableHead>
                          <TableHead className="text-xs text-right">Monto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRows.map((row, i) => (
                          <TableRow key={i} className="border-border/30 hover:bg-muted/20">
                            <TableCell className="text-xs font-mono text-muted-foreground">
                              {row.branch_sap_id}
                            </TableCell>
                            <TableCell className="text-xs font-medium">
                              {row.branch_name}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground">
                              {row.int_sku || "—"}
                            </TableCell>
                            <TableCell className="text-xs max-w-[200px]">
                              <span className="block truncate" title={row.product_name}>
                                {row.product_name}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.category_name}
                            </TableCell>
                            <TableCell className="text-xs">
                              {row.shelf_name || <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-xs">
                              {statusBadge(row.shelf_status)}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums">
                              {fmtNumber(row.cantidad_vendida)}
                            </TableCell>
                            <TableCell
                              className="text-xs text-right tabular-nums font-semibold"
                              style={{ color: "#008064" }}
                            >
                              S/ {fmtCurrency(row.monto_total)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="px-4 py-2 border-t border-border/30 text-xs text-muted-foreground">
                    {filteredRows.length.toLocaleString()} registros
                    {search && ` (filtrados de ${rows.length.toLocaleString()})`}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Mapa Konva */}
          <TabsContent value="mapa" className="mt-4">
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4" style={{ color: "#1A6894" }} />
                  Mapa de Tienda — Heatmap de Ventas
                  {selectedBranch !== "all" && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {salesMetrics.branches.find((b) => b.sap_id === selectedBranch)?.name ?? selectedBranch}
                    </Badge>
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
                  <StoreLayoutViewer data={rows} selectedBranch={selectedBranch} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
