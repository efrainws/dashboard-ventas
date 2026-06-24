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
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, Download, LayoutGrid, TableIcon, Upload, Info, ImageIcon, Trash2, Save, BarChart3, Maximize2, Minimize2, TrendingUp, TrendingDown, Minus, RefreshCw, CheckCircle2, XCircle, Edit3 } from "lucide-react";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { DateRange } from "react-day-picker";
import { useFilters } from "@/contexts/FiltersContext";
import { useIgv } from "@/contexts/IgvContext";
import { useAggregatedSales } from "@/hooks/useAggregatedSales";
import { Stage, Layer, Rect, Text, Group, Image as KonvaImage, Transformer } from "react-konva";
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
  fillColor?: string; // color personalizado (sobreescribe el heatmap)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNumber(n: number) {
  return n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
}

function statusBadge(status: string) {
  if (status === "Sin registro en stocks" || status === "Sin registro")
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "#F8D7DC", color: "#BC2C46" }}>
        Sin registro
      </span>
    );
  if (status === "Stock sin góndola" || status === "Stock sin shelf")
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "#FBF3D5", color: "#8B6B04" }}>
        Sin góndola
      </span>
    );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "#D6EDE8", color: "#005A47" }}>
      Con góndola
    </span>
  );
}
function getStatusColor(status: string): string {
  if (status === "Sin registro en stocks" || status === "Sin registro") return "#ef4444";
  if (status === "Stock sin góndola" || status === "Stock sin shelf") return "#f59e0b";
  return "#10b981";
}

// ─── Comparación de períodos ──────────────────────────────────────────────
interface ShelfCompEntry {
  branch_sap_id: string;
  branch_name: string;
  shelf_id: string | null;
  shelf_name: string;
  shelf_status: string;
  current:  { monto_total: number; cantidad_vendida: number; productos_distintos: number };
  previous: { monto_total: number; cantidad_vendida: number; productos_distintos: number };
}

function calcVariation(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function VariationBadge({ current, previous, prefix = "" }: { current: number; previous: number; prefix?: string }) {
  const pct = calcVariation(current, previous);
  if (pct === null) return <span className="text-xs" style={{ color: "#919291" }}>—</span>;
  const isUp = pct > 0;
  const isFlat = Math.abs(pct) < 0.1;
  if (isFlat) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs tabular-nums" style={{ color: "#919291" }}>
        <Minus className="h-3 w-3" />
        0%
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs tabular-nums font-medium"
      style={{ color: isUp ? "#008064" : "#BC2C46" }}
    >
      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {prefix}{Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ─── Componente de visualización Konva ───────────────────────────────────────

interface StoreLayoutViewerProps {
  data: ShelfRow[];
  selectedBranch: string;
  branchName: string;
  compMap?: Map<string, ShelfCompEntry>;
}

function StoreLayoutViewer({ data, selectedBranch, branchName, compMap = new Map() }: StoreLayoutViewerProps) {
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
  // Diálogo de selección de góndola al hacer doble clic
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null);
  const [shelfSearch, setShelfSearch] = useState("");
  // Transformer para redimensionar la zona seleccionada
  const transformerRef = useRef<Konva.Transformer>(null);
  const selectedGroupRef = useRef<Konva.Group>(null);
  // Pantalla completa
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenWrapperRef = useRef<HTMLDivElement>(null);

  // Escuchar cambios de fullscreen (Esc, etc.)
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!isFullscreen) {
      // Intentar API nativa primero; si falla (iframe), usar pseudo-fullscreen via CSS
      const el = fullscreenWrapperRef.current;
      if (el) {
        const req = el.requestFullscreen ?? (el as any).webkitRequestFullscreen ?? (el as any).mozRequestFullScreen;
        if (req) {
          req.call(el).catch(() => {
            // Fallback: pseudo-fullscreen con position:fixed
            setIsFullscreen(true);
          });
        } else {
          setIsFullscreen(true);
        }
      }
    } else {
      const exit = document.exitFullscreen ?? (document as any).webkitExitFullscreen ?? (document as any).mozCancelFullScreen;
      if (exit && document.fullscreenElement) {
        exit.call(document).catch(() => setIsFullscreen(false));
      } else {
        setIsFullscreen(false);
      }
    }
  }, [isFullscreen]);

  // Paleta de colores F&F para las zonas
  const FF_COLORS = [
    { label: "Cobalto",    value: "#1A6894" },
    { label: "Esmeralda",  value: "#008064" },
    { label: "Granate",    value: "#BC2C46" },
    { label: "Mostaza",    value: "#C49705" },
    { label: "Berenjena",  value: "#6B3FA0" },
    { label: "Coral",      value: "#E05C3A" },
    { label: "Humo",       value: "#919291" },
    { label: "Carbón",     value: "#232523" },
    { label: "Menta",      value: "#34d399" },
    { label: "Cielo",      value: "#7dd3fc" },
  ];

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

  // Lista de góndolas disponibles para el diálogo de selección
  const { data: availableShelfs = [] } = trpc.shelfLayout.listShelfs.useQuery();
  const filteredShelfs = useMemo(() => {
    if (!shelfSearch.trim()) return availableShelfs;
    const q = shelfSearch.toLowerCase();
    return availableShelfs.filter((s: { id: string; name: string }) => s.name.toLowerCase().includes(q));
  }, [availableShelfs, shelfSearch]);

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
        fillColor: z.fillColor ?? undefined,
      })));
      setHasUnsavedChanges(false);
    }
  }, [zonesData]);

  // Conectar Transformer al Rect de la zona seleccionada
  useEffect(() => {
    if (!transformerRef.current) return;
    if (selectedZone && selectedGroupRef.current) {
      transformerRef.current.nodes([selectedGroupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    } else {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedZone]);

  // Calcular métricas por shelf para el heatmap
  const shelfMetrics = useMemo(() => {
    const map = new Map<string, { monto: number; unidades: number; skus: Set<string>; status: string }>();
    data.forEach((row) => {
      const key = row.shelf_name || row.shelf_id || "sin_gondola";
      const existing = map.get(key);
      if (existing) {
        existing.monto += row.monto_total;
        existing.unidades += row.cantidad_vendida;
        existing.skus.add(row.int_sku);
      } else {
        map.set(key, { monto: row.monto_total, unidades: row.cantidad_vendida, skus: new Set([row.int_sku]), status: row.shelf_status });
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
  // Paleta heatmap F&F: Esmeralda (oscuro→claro) + neutro para sin datos
  function getHeatColor(monto: number): string {
    const ratio = monto / maxMonto;
    if (ratio > 0.75) return "#005A47"; // Esmeralda oscuro
    if (ratio > 0.5)  return "#008064"; // Esmeralda F&F
    if (ratio > 0.25) return "#4DAB96"; // Esmeralda medio
    if (ratio > 0)    return "#A8D8D0"; // Esmeralda claro
    return "#EAE8E2"; // Beige F&F (sin datos)
  }

  // Doble clic en canvas — abre diálogo para seleccionar qué góndola agregar
  const handleStageDblClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // Ignorar doble clic sobre zonas existentes
    const targetName = e.target.name();
    if (targetName === "zone-rect" || targetName === "zone-label") return;
    let node: Konva.Node | null = e.target;
    while (node) {
      if (node.name() === "zone-group") return;
      node = node.getParent();
    }
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    // Guardar posición en coordenadas del canvas (sin escala) y abrir diálogo
    setPendingPos({
      x: (pos.x - stagePos.x) / scale,
      y: (pos.y - stagePos.y) / scale,
    });
    setShelfSearch("");
  }, [scale, stagePos]);

  // Confirmar selección de góndola desde el diálogo
  const handleSelectShelf = useCallback((shelf: { id: string; name: string }) => {
    if (!pendingPos) return;
    const newZone: ShelfZone = {
      id: `zone-${Date.now()}`,
      name: shelf.name,
      x: pendingPos.x,
      y: pendingPos.y,
      width: 120,
      height: 60,
    };
    setZones((prev) => [...prev, newZone]);
    setHasUnsavedChanges(true);
    setPendingPos(null);
  }, [pendingPos]);

  // Guardar zonas en BD
  const handleSaveZones = () => {
    if (selectedBranch === "all") {
        toast.error("Debes seleccionar una tienda específica para guardar las zonas.");
      return;
    }
      saveZones.mutate({
        sapId: selectedBranch,
        zones: zones.map((z) => ({ shelfName: z.name, x: z.x, y: z.y, width: z.width, height: z.height, fillColor: z.fillColor ?? null })),
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
          { color: "#EAE8E2", label: "Sin ventas" },
          { color: "#A8D8D0", label: "Baja" },
          { color: "#4DAB96", label: "Media" },
          { color: "#008064", label: "Alta" },
          { color: "#005A47", label: "Muy alta" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div className="w-4 h-4 rounded border border-border/50" style={{ background: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Diálogo de selección de góndola */}
      <Dialog open={!!pendingPos} onOpenChange={(open) => { if (!open) setPendingPos(null); }}>
        <DialogContent style={{ width: "min(96vw, 480px)", maxWidth: "min(96vw, 480px)" }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Italian Plate No 1', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "1rem", color: "#232523" }}>
              Seleccionar Góndola
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: "#919291" }}>Elige la góndola que deseas colocar en esta posición del mapa.</p>
          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#919291" }} />
            <Input
              placeholder="Buscar góndola..."
              value={shelfSearch}
              onChange={(e) => setShelfSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          {/* Lista de góndolas */}
          <div className="overflow-y-auto rounded-md border" style={{ maxHeight: 320, borderColor: "#EAE8E2" }}>
            {filteredShelfs.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: "#919291" }}>No se encontraron góndolas</div>
            ) : (
              filteredShelfs.map((shelf: { id: string; name: string }) => (
                <button
                  key={shelf.id}
                  onClick={() => handleSelectShelf(shelf)}
                  className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                  style={{ borderBottom: "1px solid #EAE8E2", color: "#232523" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F5F4F1")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {shelf.name}
                </button>
              ))
            )}
          </div>
          <div className="flex justify-end pt-1">
            <Button variant="outline" size="sm" onClick={() => setPendingPos(null)} style={{ borderColor: "#EAE8E2", color: "#919291" }}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Canvas Konva */}
      <div
        ref={fullscreenWrapperRef}
        style={isFullscreen ? {
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "var(--muted)",
          display: "flex",
          flexDirection: "column",
          padding: 8,
        } : { position: "relative" }}
      >
      {/* Botón pantalla completa */}
      <button
        onClick={toggleFullscreen}
        title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 20,
          background: "rgba(255,255,255,0.92)",
          border: "1px solid #EAE8E2",
          borderRadius: 6,
          padding: "6px 8px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 12,
          color: "#232523",
          boxShadow: "0 1px 4px rgba(0,0,0,0.10)",
        }}
      >
        {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        {isFullscreen ? "Salir" : "Pantalla completa"}
      </button>
      <div
        ref={containerRef}
        className="border border-border rounded-lg overflow-hidden bg-muted/20 relative"
        style={{ height: isFullscreen ? "calc(100vh - 80px)" : 520, flex: isFullscreen ? 1 : undefined }}
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
              // Color heatmap automático (sin color personalizado por zona)
              const heatColor = metrics ? getHeatColor(metrics.monto) : "#EAE8E2";
              const isSelected = selectedZone?.id === zone.id;
              // Texto siempre oscuro (fondo semitransparente claro)
              const textColor = "#232523";
              // Tamaño de fuente dinámico: escala con el área de la zona
              const zoneFontSize = Math.min(11, Math.max(6, Math.floor(Math.min(zone.width / 10, zone.height / 4))));
              // Radio del círculo indicador de heatmap (esquina superior derecha)
              const circleRadius = Math.min(7, Math.max(4, zoneFontSize * 0.5));

              return (
                <Group
                  key={zone.id}
                  ref={isSelected ? selectedGroupRef : undefined}
                  name="zone-group"
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
                  onTransformEnd={(e) => {
                    const node = e.target as Konva.Group;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scaleX(1);
                    node.scaleY(1);
                    const newWidth = Math.max(40, zone.width * scaleX);
                    const newHeight = Math.max(20, zone.height * scaleY);
                    setZones((prev) =>
                      prev.map((z) =>
                        z.id === zone.id
                          ? { ...z, x: node.x(), y: node.y(), width: newWidth, height: newHeight }
                          : z
                      )
                    );
                    setSelectedZone((prev) => prev?.id === zone.id ? { ...prev, width: newWidth, height: newHeight } : prev);
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
                  {/* Fondo semitransparente del color heatmap */}
                  <Rect
                    name="zone-rect"
                    width={zone.width}
                    height={zone.height}
                    fill={heatColor}
                    stroke="transparent"
                    cornerRadius={4}
                    opacity={0.22}
                  />
                  {/* Borde sólido del color heatmap */}
                  <Rect
                    name="zone-border"
                    width={zone.width}
                    height={zone.height}
                    fill="transparent"
                    stroke={isSelected ? "#1A6894" : (heatColor === "#EAE8E2" ? "#C4C2BC" : heatColor)}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    cornerRadius={4}
                    shadowBlur={isSelected ? 10 : 0}
                    shadowColor="#1A6894"
                    shadowOpacity={0.5}
                    listening={false}
                  />
                  {/* Nombre de la góndola (centrado verticalmente) */}
                  <Text
                    name="zone-label"
                    text={zone.name}
                    x={6}
                    y={zone.height / 2 - zoneFontSize / 2}
                    width={zone.width - circleRadius * 2 - 16}
                    fontSize={zoneFontSize}
                    fontStyle="bold"
                    fill={textColor}
                    ellipsis
                    wrap="none"
                    listening={false}
                  />
                  {/* Círculo indicador de color heatmap (esquina superior derecha) */}
                  <Rect
                    x={zone.width - circleRadius * 2 - 5}
                    y={5}
                    width={circleRadius * 2}
                    height={circleRadius * 2}
                    cornerRadius={circleRadius}
                    fill={heatColor === "#EAE8E2" ? "#C4C2BC" : heatColor}
                    opacity={0.9}
                    listening={false}
                  />
                </Group>
              );
            })}

            {/* Transformer para redimensionar la zona seleccionada */}
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 40 || newBox.height < 20) return oldBox;
                return newBox;
              }}
              rotateEnabled={false}
              borderStroke="#1A6894"
              borderStrokeWidth={1.5}
              anchorStroke="#1A6894"
              anchorFill="#FFFFFF"
              anchorSize={8}
              anchorCornerRadius={2}
            />

            {tooltip && (() => {
              const metrics = shelfMetrics.get(tooltip.zone.name);
              const tipX = (tooltip.x - stagePos.x) / scale + 10;
              const tipY = (tooltip.y - stagePos.y) / scale - 10;
              // Buscar datos de comparación para esta zona
              // La zona.name coincide con góndola_name en compMap
              const compEntry = metrics ? Array.from(compMap.values()).find(
                (e) => e.shelf_name === tooltip.zone.name
              ) : undefined;
              const montoVar = compEntry ? calcVariation(metrics!.monto, compEntry.previous.monto_total) : null;
              const unidVar  = compEntry ? calcVariation(metrics!.unidades, compEntry.previous.cantidad_vendida) : null;
              const skuVar   = compEntry ? calcVariation(metrics!.skus.size, compEntry.previous.productos_distintos) : null;
              const fmtVar = (v: number | null) => {
                if (v === null) return '';
                const sign = v > 0 ? '+' : '';
                return ` (${sign}${v.toFixed(1)}%)`;
              };
              const tooltipHeight = metrics ? (compEntry ? 100 : 70) : 40;
              return (
                <Group x={tipX} y={tipY}>
                  <Rect width={220} height={tooltipHeight} fill="#1e293b" cornerRadius={6} opacity={0.95} />
                  <Text text={tooltip.zone.name} x={8} y={8} fontSize={12} fontStyle="bold" fill="#f8fafc" />
                  {metrics ? (
                    <>
                      <Text text={`Monto: S/ ${fmtCurrency(metrics.monto)}${fmtVar(montoVar)}`} x={8} y={26} fontSize={10} fill={montoVar !== null ? (montoVar >= 0 ? "#4ade80" : "#f87171") : "#94a3b8"} />
                      <Text text={`Unidades: ${fmtNumber(metrics.unidades)}${fmtVar(unidVar)}`} x={8} y={42} fontSize={10} fill={unidVar !== null ? (unidVar >= 0 ? "#4ade80" : "#f87171") : "#94a3b8"} />
                      <Text text={`SKUs: ${metrics.skus.size}${fmtVar(skuVar)}`} x={8} y={58} fontSize={10} fill={skuVar !== null ? (skuVar >= 0 ? "#4ade80" : "#f87171") : "#94a3b8"} />
                      {compEntry && (
                        <Text text="vs período anterior" x={8} y={78} fontSize={9} fill="#64748b" fontStyle="italic" />
                      )}
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
      </div>{/* /fullscreenWrapper */}

      {/* Panel de zona seleccionada */}
      {selectedZone && (
        <div className="rounded-xl border p-4 space-y-3 bg-card" style={{ borderColor: "#1A6894" }}>
          {/* Cabecera */}
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 flex-shrink-0" style={{ color: "#1A6894" }} />
            <span className="text-sm font-semibold" style={{ fontFamily: "'Italian Plate No 1', sans-serif", color: "#232523" }}>
              {selectedZone.name}
            </span>
            <div className="ml-auto flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                style={{ color: "#1A6894" }}
                onClick={() => {
                  const name = prompt("Nombre de la góndola:", selectedZone.name);
                  if (name) {
                    setZones((prev) => prev.map((z) => (z.id === selectedZone.id ? { ...z, name } : z)));
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
                className="h-7 text-xs"
                style={{ color: "#BC2C46" }}
                onClick={() => {
                  setZones((prev) => prev.filter((z) => z.id !== selectedZone.id));
                  setSelectedZone(null);
                  setHasUnsavedChanges(true);
                }}
              >
                Eliminar
              </Button>
            </div>
          </div>


          {/* Métricas */}
          {(() => {
            const metrics = shelfMetrics.get(selectedZone.name);
            if (!metrics) return (
              <p className="text-sm" style={{ color: "#919291" }}>Sin datos de ventas para esta góndola en el período seleccionado.</p>
            );
            return (
              <div className="flex gap-6 text-sm pt-1 border-t" style={{ borderColor: "#EAE8E2" }}>
                <div>
                  <p className="text-xs" style={{ color: "#919291" }}>Monto total</p>
                  <p className="font-bold text-foreground">S/ {fmtCurrency(metrics.monto)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "#919291" }}>Unidades</p>
                  <p className="font-semibold" style={{ color: "#232523" }}>{fmtNumber(metrics.unidades)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "#919291" }}>SKUs</p>
                  <p className="font-semibold" style={{ color: "#232523" }}>{metrics.skus.size}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "#919291" }}>Estado</p>
                  {statusBadge(metrics.status)}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

// ─── Modal de reasignación de artículos por góndola ──────────────────────────
interface ReassignTarget {
  branch_sap_id: string;
  branch_name: string;
  shelf_id: string | null;
  shelf_name: string;
}

interface ProductRow {
  product_id: string;
  int_sku: string;
  product_name: string;
  stock: number;
  stock_id: string | null;
  shelf_id: string | null;
  shelf_name: string;
}

interface ShelfOption {
  shelf_id: string;
  shelf_name: string;
}

interface ReassignState {
  productId: string;
  newShelfId: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
}

function ShelfReassignModal({
  target,
  onClose,
}: {
  target: ReassignTarget | null;
  onClose: () => void;
}) {
  const [reassigning, setReassigning] = useState<Record<string, ReassignState>>({});
  const [selectedShelves, setSelectedShelves] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const { data: productsData, isLoading: loadingProducts } = trpc.sales.getProductsByShelfAndBranch.useQuery(
    { branch_sap_id: target?.branch_sap_id ?? '', shelf_id: target?.shelf_id ?? null },
    { enabled: !!target }
  );

  const { data: shelvesData, isLoading: loadingShelves } = trpc.sales.getShelfsByBranch.useQuery(
    { branch_sap_id: target?.branch_sap_id ?? '' },
    { enabled: !!target }
  );

  const products: ProductRow[] = productsData?.data ?? [];
  const shelves: ShelfOption[] = shelvesData?.data ?? [];

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) => p.product_name.toLowerCase().includes(q) || p.int_sku.toLowerCase().includes(q)
    );
  }, [products, search]);

  const handleReassign = async (product: ProductRow) => {
    const newShelfId = selectedShelves[product.product_id];
    if (!newShelfId || !target) return;

    setReassigning((prev) => ({
      ...prev,
      [product.product_id]: { productId: product.product_id, newShelfId, status: 'loading' },
    }));

    try {
      const response = await fetch('https://server.florayfauna.pe/api/productos/estantes/p', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchSapId: target.branch_sap_id,
          intSku: Number(product.int_sku),
          shelfId: newShelfId,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        throw new Error(errText || `HTTP ${response.status}`);
      }

      setReassigning((prev) => ({
        ...prev,
        [product.product_id]: { productId: product.product_id, newShelfId, status: 'success', message: 'Reasignado correctamente' },
      }));
      toast.success(`${product.product_name} reasignado correctamente`);
    } catch (err: any) {
      const msg = err?.message ?? 'Error desconocido';
      setReassigning((prev) => ({
        ...prev,
        [product.product_id]: { productId: product.product_id, newShelfId, status: 'error', message: msg },
      }));
      toast.error(`Error al reasignar: ${msg}`);
    }
  };

  if (!target) return null;

  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-base font-heading uppercase flex items-center gap-2">
            <Edit3 className="h-4 w-4 text-primary" />
            Reasignar artículos — {target.branch_name} ({target.branch_sap_id})
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            Góndola actual: <span className="font-medium text-foreground">{target.shelf_name || '(Sin góndola asignada)'}</span>
            {' · '}
            {products.length} artículo{products.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        {/* Buscador */}
        <div className="px-6 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
        </div>

        {/* Tabla */}
        <ScrollArea className="flex-1 px-6 py-4">
          {loadingProducts || loadingShelves ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Cargando artículos...</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No se encontraron artículos para esta góndola.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs font-heading uppercase w-24" style={{ color: "#919291" }}>SKU</TableHead>
                  <TableHead className="text-xs font-heading uppercase" style={{ color: "#919291" }}>Artículo</TableHead>
                  <TableHead className="text-xs font-heading uppercase text-right w-20" style={{ color: "#919291" }}>Stock</TableHead>
                  <TableHead className="text-xs font-heading uppercase w-56" style={{ color: "#919291" }}>Nueva góndola</TableHead>
                  <TableHead className="text-xs font-heading uppercase w-28 text-center" style={{ color: "#919291" }}>Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => {
                  const state = reassigning[product.product_id];
                  const selectedShelf = selectedShelves[product.product_id] ?? '';
                  const isSameShelf = selectedShelf === (product.shelf_id ?? '');
                  const canReassign = selectedShelf && !isSameShelf;

                  return (
                    <TableRow key={product.product_id} className="hover:bg-muted/20 transition-colors">
                      <TableCell className="text-xs tabular-nums text-muted-foreground">{product.int_sku}</TableCell>
                      <TableCell className="text-xs text-foreground font-medium max-w-[200px]">
                        <span className="block truncate" title={product.product_name}>{product.product_name}</span>
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums text-foreground">{product.stock.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">
                        <Select
                          value={selectedShelf}
                          onValueChange={(v) => setSelectedShelves((prev) => ({ ...prev, [product.product_id]: v }))}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Seleccionar góndola..." />
                          </SelectTrigger>
                          <SelectContent>
                            {shelves.map((s) => (
                              <SelectItem key={s.shelf_id} value={s.shelf_id} className="text-xs">
                                {s.shelf_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        {state?.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-[#008064]">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Listo
                          </span>
                        ) : state?.status === 'error' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-destructive" title={state.message}>
                            <XCircle className="h-3.5 w-3.5" /> Error
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-3"
                            disabled={!canReassign || state?.status === 'loading'}
                            onClick={() => handleReassign(product)}
                          >
                            {state?.status === 'loading' ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Reasignar
                              </>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex justify-between items-center text-xs text-muted-foreground">
          <span>
            {Object.values(reassigning).filter((s) => s.status === 'success').length} reasignación(es) exitosa(s)
          </span>
          <Button variant="outline" size="sm" onClick={onClose} className="h-7 text-xs">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


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
  const [shelfStatus, setShelfStatus] = useState<"all" | "sin_registro" | "sin_gondola" | "con_gondola">("all");
  const [search, setSearch] = useState("");
  const [searchAgg, setSearchAgg] = useState("");
  const [activeTab, setActiveTab] = useState<"tabla" | "agregado" | "mapa">("agregado");
  const [reassignTarget, setReassignTarget] = useState<ReassignTarget | null>(null);

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

  // Query de comparación por góndola (período actual vs anterior)
  const { data: compResult } = trpc.sales.getSalesByShelfComparison.useQuery({
    fecha_min: fechaMin,
    fecha_max: fechaMax,
    branch_id: selectedBranch !== "all" ? selectedBranch : undefined,
    category_id: selectedCategory !== "all" ? selectedCategory : undefined,
    include_igv: includeIgv,
    shelf_status: shelfStatus,
  });
  const compData: ShelfCompEntry[] = (compResult?.data ?? []) as ShelfCompEntry[];
  // Mapa de comparación: key = "branch_sap_id::shelf_id"
  const compMap = useMemo(() => {
    const m = new Map<string, ShelfCompEntry>();
    compData.forEach((e) => {
      const key = `${e.branch_sap_id}::${e.shelf_id ?? 'null'}`;
      m.set(key, e);
    });
    return m;
  }, [compData]);
  // Totales del período anterior para KPIs
  const prevKpis = useMemo(() => {
    let totalMonto = 0;
    let totalCantidad = 0;
    compData.forEach((e) => {
      totalMonto    += e.previous.monto_total;
      totalCantidad += e.previous.cantidad_vendida;
    });
    return { totalMonto, totalCantidad };
  }, [compData]);

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
    const sinShelf = rows.filter((r) => r.shelf_status === "Stock sin góndola" || r.shelf_status === "Stock sin shelf").length;
    const conShelf = rows.filter((r) => r.shelf_status === "Con góndola asignada" || r.shelf_status === "Con shelf asignado").length;
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
    <div className="min-h-screen bg-background" data-theme={effectiveTheme}>
      <NavigationMenu />
      <div className="container py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading uppercase tracking-wide">Análisis por Góndola</h1>
            <p className="text-sm mt-1" style={{ color: "#919291" }}>
              Análisis de ventas por posición de góndola en tienda.
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
          <Select value={shelfStatus} onValueChange={(v) => setShelfStatus(v as "all" | "sin_registro" | "sin_gondola" | "con_gondola")}>
            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="sin_registro">Sin registro en stocks</SelectItem>
              <SelectItem value="sin_gondola">Stock sin góndola</SelectItem>
              <SelectItem value="con_gondola">Con góndola asignado</SelectItem>
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
            {/* KPI: Monto Total con comparación */}
            <Card className="border-0 shadow-sm bg-card">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-sans)" }}>Monto Total</p>
                <p className="text-lg font-bold mt-1 tabular-nums" style={{ color: "#008064", fontFamily: "var(--font-sans)" }}>
                  S/ {fmtCurrency(kpis.totalMonto)}
                </p>
                {prevKpis.totalMonto > 0 && (
                  <div className="mt-1">
                    <VariationBadge current={kpis.totalMonto} previous={prevKpis.totalMonto} />
                    <span className="text-xs ml-1 text-muted-foreground">vs período ant.</span>
                  </div>
                )}
              </CardContent>
            </Card>
            {/* KPI: Cantidad Vendida con comparación */}
            <Card className="border-0 shadow-sm bg-card">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-sans)" }}>Cantidad Vendida</p>
                <p className="text-lg font-bold mt-1 tabular-nums" style={{ color: "#1A6894", fontFamily: "var(--font-sans)" }}>
                  {fmtNumber(kpis.totalCantidad)}
                </p>
                {prevKpis.totalCantidad > 0 && (
                  <div className="mt-1">
                    <VariationBadge current={kpis.totalCantidad} previous={prevKpis.totalCantidad} />
                    <span className="text-xs ml-1 text-muted-foreground">vs período ant.</span>
                  </div>
                )}
              </CardContent>
            </Card>
            {/* KPIs sin comparación */}
            {[
              { label: "Productos únicos", value: kpis.uniqueProducts.toString(), color: "var(--foreground)" },
              { label: "Con góndola",        value: kpis.conShelf.toString(),        color: "#008064" },
              { label: "Sin góndola",        value: kpis.sinShelf.toString(),        color: "#C49705" },
              { label: "Sin registro",     value: kpis.sinRegistro.toString(),     color: "#BC2C46" },
            ].map((kpi) => (
              <Card key={kpi.label} className="border-0 shadow-sm bg-card">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-sans)" }}>{kpi.label}</p>
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
              <Card className="border-0 shadow-sm bg-card">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 border-b">
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
                            className="hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => setReassignTarget({
                              branch_sap_id: row.branch_sap_id,
                              branch_name: row.branch_name,
                              shelf_id: row.shelf_id,
                              shelf_name: row.shelf_name,
                            })}
                            title="Clic para ver y reasignar artículos"
                          >
                            <TableCell className="text-xs tabular-nums" style={{ color: "#919291" }}>{row.branch_sap_id}</TableCell>
                            <TableCell className="text-xs font-medium text-foreground">{row.branch_name}</TableCell>
                            <TableCell className="text-xs tabular-nums" style={{ color: "#919291" }}>{row.int_sku || "—"}</TableCell>
                            <TableCell className="text-xs max-w-[200px] text-foreground">
                              <span className="block truncate" title={row.product_name}>{row.product_name}</span>
                            </TableCell>
                            <TableCell className="text-xs" style={{ color: "#919291" }}>{row.category_name}</TableCell>
                            <TableCell className="text-xs text-foreground">{row.shelf_name || <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="text-xs">{statusBadge(row.shelf_status)}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-foreground">{fmtNumber(row.cantidad_vendida)}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums font-semibold text-foreground">
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
              <Card className="border-0 shadow-sm bg-card">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 border-b">
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
                        {filteredAggRows.map((row, i) => {
                          const compKey = `${row.branch_sap_id}::${row.shelf_id ?? 'null'}`;
                          const comp = compMap.get(compKey);
                          return (
                          <TableRow
                            key={i}
                            style={{ borderBottom: "1px solid #EAE8E2" }}
                            className="hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => setReassignTarget({
                              branch_sap_id: row.branch_sap_id,
                              branch_name: row.branch_name,
                              shelf_id: row.shelf_id,
                              shelf_name: row.shelf_name,
                            })}
                            title="Clic para ver y reasignar artículos"
                          >
                            <TableCell className="text-xs tabular-nums" style={{ color: "#919291" }}>{row.branch_sap_id}</TableCell>
                            <TableCell className="text-xs font-medium text-foreground">{row.branch_name}</TableCell>
                            <TableCell className="text-xs font-semibold text-foreground">
                              {row.shelf_name || <span className="text-muted-foreground italic">(Sin góndola asignada)</span>}
                            </TableCell>
                            <TableCell className="text-xs">{statusBadge(row.shelf_status)}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-foreground">
                              <div>{row.productos_distintos.toLocaleString()}</div>
                              {comp && <VariationBadge current={row.productos_distintos} previous={comp.previous.productos_distintos} />}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-foreground">
                              <div>{fmtNumber(row.cantidad_vendida)}</div>
                              {comp && <VariationBadge current={row.cantidad_vendida} previous={comp.previous.cantidad_vendida} />}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums font-bold text-foreground">
                              <div>S/ {fmtCurrency(row.monto_total)}</div>
                              {comp && <VariationBadge current={row.monto_total} previous={comp.previous.monto_total} />}
                            </TableCell>
                          </TableRow>
                          );
                        })}
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
            <Card className="border-0 shadow-sm bg-card">
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
                    compMap={compMap}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      {/* Modal de reasignación */}
      <ShelfReassignModal
        target={reassignTarget}
        onClose={() => setReassignTarget(null)}
      />
    </div>
  );
}
