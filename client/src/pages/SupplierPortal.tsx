/**
 * SupplierPortal.tsx
 * Portal exclusivo para usuarios proveedor (supplier_user).
 * Muestra KPIs, tendencia de ventas, top productos, ventas por tienda,
 * stock actual, recepciones y catálogo de productos.
 */

import * as XLSX from "xlsx";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  TrendingUp,
  Package,
  Store,
  ShoppingCart,
  Layers,
  Search,
  ChevronLeft,
  ChevronRight,
  LogOut,
  AlertTriangle,
  BarChart2,
  Truck,
  ShoppingBag,
  X,
  FileDown,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useState, useMemo } from "react";
import { MultiProductSelect } from "@/components/MultiProductSelect";
import { SortableTableHead } from "@/components/SortableTableHead";
import { format, subDays, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(val: string | number | null | undefined): string {
  if (val == null) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtCurrency(val: string | number | null | undefined): string {
  if (val == null) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function defaultFrom() {
  return format(startOfMonth(new Date()), "yyyy-MM-dd");
}
function defaultTo() {
  return format(subDays(new Date(), 1), "yyyy-MM-dd");
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  loading,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  loading?: boolean;
}) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {title}
            </p>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <p className="text-2xl font-bold text-foreground font-heading">{value}</p>
            )}
          </div>
          <div className={`p-2.5 rounded-lg ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Sección: Tabs de navegación ─────────────────────────────────────────────

type Tab = "dashboard" | "ventas" | "productos" | "stock" | "recepciones";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: BarChart2 },
  { id: "ventas", label: "Ventas", icon: ShoppingBag },
  { id: "productos", label: "Catálogo", icon: Package },
  { id: "stock", label: "Stock", icon: Layers },
  { id: "recepciones", label: "Entregas de Mercadería", icon: Truck },
];

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SupplierPortal() {
  const { logout, user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [stockProductId, setStockProductId] = useState<string | undefined>(undefined);
  const [stockProductSearch, setStockProductSearch] = useState("");
  const [stockBranchId, setStockBranchId] = useState<string | undefined>(undefined);
  const [stockPage, setStockPage] = useState(0);
  const [catalogProductId, setCatalogProductId] = useState<string | undefined>(undefined);
  const [catalogProductSearch, setCatalogProductSearch] = useState("");
  const [catalogPage, setCatalogPage] = useState(0);
  const [recPage, setRecPage] = useState(0);
  // Estado para la pestaña Ventas
  const [salesProductIds, setSalesProductIds] = useState<string[]>([]);
  const [salesBranchId, setSalesBranchId] = useState<string | undefined>(undefined);
  const [salesPage, setSalesPage] = useState(0);
  const [productSearch, setProductSearch] = useState("");
  // Estado de exportación (ventas)
  const [isExporting, setIsExporting] = useState(false);
  // Toggles de dimensiones en la tabla de ventas
  const [showStore, setShowStore] = useState(true);
  const [showProduct, setShowProduct] = useState(true);
  // Resetear página al cambiar dimensiones para que la paginación sea correcta
  const handleToggleStore = () => { setShowStore((v) => !v); setSalesPage(0); };
  const handleToggleProduct = () => { setShowProduct((v) => !v); setSalesPage(0); };
  // Ordenamiento de la tabla de ventas
  type SortCol = "producto" | "sku" | "tienda" | "sap_id" | "cantidad" | "monto" | "tickets";
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const handleSortCol = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };
  // Estado de exportación (stock)
  const [isExportingStock, setIsExportingStock] = useState(false);
  // Modal de detalle diario
  const [detailModal, setDetailModal] = useState<{
    open: boolean;
    productId: string;
    branchId: string;
    producto: string;
    tienda: string;
  } | null>(null);
  const PAGE_SIZE = 20;

  // Para system_specialist y commercial_specialist: proveedor seleccionado manualmente
  const isSystemSpecialist = user?.role === 'system_specialist' || user?.role === 'commercial_specialist';
  const isSupplierUser = user?.role === 'supplier_user';
  const canAccessPortal = isSupplierUser || isSystemSpecialist;
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | undefined>(undefined);
  const [supplierSearch, setSupplierSearch] = useState("");

  // Lista de proveedores para el selector (system_specialist y commercial_specialist)
  const { data: allSuppliers, isLoading: allSuppliersLoading } =
    trpc.supplierPortal.listAllSuppliers.useQuery(undefined, { enabled: isSystemSpecialist });

  // El supplierId efectivo: para supplier_user viene del backend, para system_specialist del selector
  const effectiveSupplierId = isSystemSpecialist ? selectedSupplierId : undefined;
  // Solo ejecutar queries si tenemos un proveedor definido
  const queriesEnabled = isSupplierUser || (isSystemSpecialist && !!selectedSupplierId);

  const { data: supplier, isLoading: supplierLoading } =
    trpc.supplierPortal.getMySupplier.useQuery(
      { supplierId: effectiveSupplierId },
      { enabled: queriesEnabled }
    );

  const { data: summary, isLoading: summaryLoading } =
    trpc.supplierPortal.getSalesSummary.useQuery(
      { from, to, supplierId: effectiveSupplierId },
      { enabled: queriesEnabled }
    );

  const { data: dailySales, isLoading: dailyLoading } =
    trpc.supplierPortal.getDailySales.useQuery(
      { from, to, supplierId: effectiveSupplierId },
      { enabled: queriesEnabled }
    );

  const { data: topProducts, isLoading: topLoading } =
    trpc.supplierPortal.getTopProducts.useQuery(
      { from, to, limit: 10, supplierId: effectiveSupplierId },
      { enabled: queriesEnabled }
    );

  const { data: salesByBranch, isLoading: branchLoading } =
    trpc.supplierPortal.getSalesByBranch.useQuery(
      { from, to, supplierId: effectiveSupplierId },
      { enabled: queriesEnabled }
    );

  const { data: monthlySales, isLoading: monthlyLoading } =
    trpc.supplierPortal.getMonthlySales.useQuery(
      { supplierId: effectiveSupplierId },
      { enabled: queriesEnabled }
    );

  const { data: branchesForStock } =
    trpc.supplierPortal.getBranchesForStock.useQuery(
      { supplierId: effectiveSupplierId },
      { enabled: queriesEnabled }
    );

  const { data: branchesForSales } =
    trpc.supplierPortal.getBranchesForSales.useQuery(
      { supplierId: effectiveSupplierId },
      { enabled: queriesEnabled }
    );

  // Query: lista de productos del proveedor para los Selects (debe ir antes de stock y catálogo)
  const { data: supplierProducts, isLoading: supplierProductsLoading } =
    trpc.supplierPortal.getProductsForSupplier.useQuery(
      { supplierId: effectiveSupplierId },
      { enabled: queriesEnabled }
    );

  const { data: stockData, isLoading: stockLoading } =
    trpc.supplierPortal.getStockByProduct.useQuery({
      productId: stockProductId,
      search: stockProductId
        ? undefined  // cuando hay productId usamos el CROSS JOIN, no búsqueda por nombre
        : undefined,
      branchId: stockBranchId,
      supplierId: effectiveSupplierId,
      limit: PAGE_SIZE,
      offset: stockPage * PAGE_SIZE,
    }, { enabled: queriesEnabled });

  const { data: catalogData, isLoading: catalogLoading } =
    trpc.supplierPortal.getProductCatalog.useQuery({
      search: catalogProductId
        ? supplierProducts?.find((p) => p.id === catalogProductId)?.name
        : undefined,
      supplierId: effectiveSupplierId,
      limit: PAGE_SIZE,
      offset: catalogPage * PAGE_SIZE,
    }, { enabled: queriesEnabled });

  const { data: receptionsData, isLoading: recLoading } =
    trpc.supplierPortal.getReceptions.useQuery({
      supplierId: effectiveSupplierId,
      limit: PAGE_SIZE,
      offset: recPage * PAGE_SIZE,
    }, { enabled: queriesEnabled });

  // Productos filtrados por búsqueda en el Select
  const filteredProducts = useMemo(() => {
    if (!supplierProducts) return [];
    if (!productSearch.trim()) return supplierProducts;
    const q = productSearch.toLowerCase();
    return supplierProducts.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.includes(q)
    );
  }, [supplierProducts, productSearch]);

  // Query: tabla ventas por artículo × tienda
  const { data: salesByPB, isLoading: salesPBLoading } =
    trpc.supplierPortal.getSalesByProductBranch.useQuery({
      from,
      to,
      supplierId: effectiveSupplierId,
      productIds: salesProductIds.length > 0 ? salesProductIds : undefined,
      branchId: salesBranchId,
      groupByProduct: showProduct,
      groupByStore: showStore,
      limit: PAGE_SIZE,
      offset: salesPage * PAGE_SIZE,
    }, { enabled: queriesEnabled && activeTab === "ventas" });

  // Query lazy para exportación (se activa solo al hacer clic en Descargar)
  const exportQuery = trpc.supplierPortal.exportSalesByProductBranch.useQuery({
    from,
    to,
    supplierId: effectiveSupplierId,
    productIds: salesProductIds.length > 0 ? salesProductIds : undefined,
    branchId: salesBranchId,
    groupByProduct: showProduct,
    groupByStore: showStore,
  }, { enabled: false });

  // Función para descargar Excel de ventas
  const handleDownloadCSV = async () => {
    setIsExporting(true);
    try {
      const result = await exportQuery.refetch();
      const rows = result.data ?? [];
      if (rows.length === 0) return;

      const wsData = [
        ["Producto", "SKU", "Tienda", "Cód. SAP", "Cantidad", "Monto (S/)", "Tickets"],
        ...rows.map((r) => [
          r.producto,
          r.sku,
          r.tienda,
          r.sap_id ?? "",
          parseFloat(r.cantidad),
          parseFloat(r.monto),
          r.tickets,
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ventas");
      XLSX.writeFile(wb, `ventas_${from}_${to}.xlsx`);
    } finally {
      setIsExporting(false);
    }
  };

  // Query lazy para exportación de stock (se activa solo al hacer clic en Descargar)
  const exportStockQuery = trpc.supplierPortal.exportStockByProduct.useQuery({
    productId: stockProductId,
    branchId: stockBranchId,
    supplierId: effectiveSupplierId,
  }, { enabled: false });

  // Función para descargar Excel de stock
  const handleDownloadStockCSV = async () => {
    setIsExportingStock(true);
    try {
      const result = await exportStockQuery.refetch();
      const rows = result.data ?? [];
      if (rows.length === 0) return;

      const wsData = [
        ["Producto", "SKU", "Tienda", "Cód. SAP", "Stock Actual", "Stock Mínimo"],
        ...rows.map((r) => [
          r.producto,
          r.int_sku,
          r.tienda,
          r.sap_id ?? "",
          r.stock_actual,
          r.min_stock ?? "",
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Stock");
      const productLabel = stockProductId
        ? (supplierProducts?.find((p) => p.id === stockProductId)?.sku ?? "producto")
        : "todos";
      XLSX.writeFile(wb, `stock_${productLabel}.xlsx`);
    } finally {
      setIsExportingStock(false);
    }
  };

  // Query: detalle diario para el modal
  const { data: dailyDetail, isLoading: dailyDetailLoading } =
    trpc.supplierPortal.getSalesDailyDetail.useQuery({
      supplierId: effectiveSupplierId,
      productId: detailModal?.productId ?? "",
      branchId: detailModal?.branchId ?? "",
      from,
      to,
    }, { enabled: !!detailModal?.open && !!detailModal.productId && !!detailModal.branchId });

  // ── Ordenamiento de filas (agrupación ya viene del backend) ───────────────────────────────────
  const sortedSalesRows = useMemo(() => {
    const rows = salesByPB?.rows ?? [];
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => {
      let va: string | number;
      let vb: string | number;
      if (sortCol === "cantidad" || sortCol === "monto" || sortCol === "tickets") {
        va = Number(a[sortCol]);
        vb = Number(b[sortCol]);
      } else if (sortCol === "sap_id") {
        va = a.sap_id ?? "";
        vb = b.sap_id ?? "";
      } else {
        va = (a[sortCol as keyof typeof a] as string) ?? "";
        vb = (b[sortCol as keyof typeof b] as string) ?? "";
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [salesByPB?.rows, sortCol, sortDir]);

  // Colores para gráficos
  const CHART_COLORS = [
    "#008064", "#1A6894", "#5BB6B7", "#C49705", "#BC2C46", "#E5BAC1",
  ];

  // Datos de gráfico mensual formateados
  const monthlyChartData = useMemo(() => {
    if (!monthlySales) return [];
    return monthlySales.map((r) => ({
      mes: r.mes.slice(5), // MM
      ventas: parseFloat(r.total_ventas),
      tickets: r.tickets,
    }));
  }, [monthlySales]);

  const dailyChartData = useMemo(() => {
    if (!dailySales) return [];
    return dailySales.map((r) => ({
      fecha: format(new Date(r.fecha), "dd/MM", { locale: es }),
      ventas: parseFloat(r.total_ventas),
      tickets: r.tickets,
    }));
  }, [dailySales]);

  // Filtrar proveedores por búsqueda
  const filteredSuppliers = useMemo(() => {
    if (!allSuppliers) return [];
    if (!supplierSearch.trim()) return allSuppliers;
    const q = supplierSearch.toLowerCase();
    return allSuppliers.filter(s =>
      s.name.toLowerCase().includes(q) || s.ruc.includes(q)
    );
  }, [allSuppliers, supplierSearch]);

  // Guard: si el usuario no tiene acceso al portal
  if (!loading && user && !canAccessPortal) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-8">
        <img src="/Logonegro.svg" alt="Flora & Fauna" className="h-8 block dark:hidden" />
        <img src="/Logoclarochico.svg" alt="Flora & Fauna" className="h-8 hidden dark:block" />
        <div className="text-center space-y-2 max-w-md">
          <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: "'Italian Plate No 1', serif" }}>
            ACCESO RESTRINGIDO
          </h2>
          <p className="text-muted-foreground text-sm">
            Esta página es exclusiva para usuarios proveedor. Tu perfil no tiene acceso a este portal.
          </p>
        </div>
        <Button variant="outline" onClick={() => window.location.href = '/'}>
          Volver al inicio
        </Button>
      </div>
    );
  }

  // Guard: system_specialist sin proveedor seleccionado → mostrar selector
  if (!loading && user && isSystemSpecialist && !selectedSupplierId) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header mínimo */}
        <header className="border-b border-border bg-card">
          <div className="container flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <img src="/Logonegro.svg" alt="Flora & Fauna" className="h-6 block dark:hidden" />
              <img src="/Logoclarochico.svg" alt="Flora & Fauna" className="h-6 hidden dark:block" />
              <span className="text-xs text-muted-foreground border-l border-border pl-3">
                Portal de Proveedores
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:block" style={{ fontFamily: "'Sailec', sans-serif" }}>
                {user?.name?.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
              </span>
              <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>
        {/* Selector de proveedor */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
          <div className="text-center space-y-1 mb-2">
            <h2 className="text-lg font-bold tracking-widest uppercase text-foreground"
              style={{ fontFamily: "'Italian Plate No 1', serif" }}>
              Selecciona un Proveedor
            </h2>
            <p className="text-sm text-muted-foreground">
              Como especialista de sistemas, elige el proveedor cuyo portal deseas consultar.
            </p>
          </div>
          <div className="w-full max-w-md space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por nombre o RUC..."
                value={supplierSearch}
                onChange={e => setSupplierSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {allSuppliersLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="border border-border rounded-md divide-y divide-border max-h-80 overflow-y-auto">
                {filteredSuppliers.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-6">No se encontraron proveedores.</p>
                ) : filteredSuppliers.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSupplierId(s.id)}
                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground" style={{ fontFamily: "'Sailec', sans-serif" }}>
                      {s.name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                    </p>
                    <p className="text-xs text-muted-foreground" style={{ fontFamily: "'Italian Plate No 1', serif" }}>
                      RUC: {s.ruc}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => window.location.href = '/'}>
            Volver al inicio
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header className="border-b border-border sticky top-0 z-40 bg-background">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            {/* Logo modo claro */}
            <img
              src="/Logonegro.svg"
              alt="Flora & Fauna"
              className="h-6 block dark:hidden"
            />
            {/* Logo modo oscuro */}
            <img
              src="/Logoclarochico.svg"
              alt="Flora & Fauna"
              className="h-6 hidden dark:block"
            />
            <span className="text-xs text-muted-foreground border-l border-border pl-3 hidden sm:block">
              Portal de Proveedores
            </span>
          </div>
          <div className="flex items-center gap-3">
            {supplierLoading ? (
              <Skeleton className="h-10 w-40" />
            ) : (
              <div className="text-right hidden sm:block space-y-0.5">
                {/* Nombre del proveedor: Italian Plate No 1, mayúsculas */}
                <p
                  className="text-xs text-muted-foreground leading-none tracking-wide"
                  style={{ fontFamily: "'Italian Plate No 1', serif", textTransform: "uppercase" }}
                >
                  {supplier?.name}
                </p>
                {/* Nombre del usuario: Sailec, negrita, capitalize */}
                <p
                  className="text-sm font-bold text-foreground leading-none"
                  style={{ fontFamily: "'Sailec', sans-serif", textTransform: "capitalize" }}
                >
                  {user?.name?.toLowerCase()}
                </p>
              </div>
            )}
            {isSystemSpecialist && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedSupplierId(undefined); setSupplierSearch(""); }}
                className="gap-1.5 text-muted-foreground text-xs"
                title="Cambiar proveedor"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cambiar</span>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={logout} className="gap-1.5">
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Tabs de navegación ── */}
      <div className="border-b border-border bg-background">
        <div className="container">
          <nav className="flex gap-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="container py-6 space-y-6">
        {/* ══════════════════════════════════════════════
            TAB: DASHBOARD
        ══════════════════════════════════════════════ */}
        {activeTab === "dashboard" && (
          <>
            {/* Filtro de fechas */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">Desde</label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-36 text-sm h-8"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">Hasta</label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-36 text-sm h-8"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFrom(defaultFrom());
                  setTo(defaultTo());
                }}
              >
                Este mes
              </Button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <KpiCard
                title="Ventas Totales"
                value={fmtCurrency(summary?.total_ventas)}
                icon={TrendingUp}
                color="bg-[var(--ff-esmeralda)]"
                loading={summaryLoading}
              />
              <KpiCard
                title="Tickets"
                value={fmt(summary?.total_tickets)}
                icon={ShoppingCart}
                color="bg-[var(--ff-cobalto)]"
                loading={summaryLoading}
              />
              <KpiCard
                title="Unidades"
                value={fmt(summary?.total_unidades)}
                icon={Package}
                color="bg-[var(--ff-celeste)]"
                loading={summaryLoading}
              />
              <KpiCard
                title="Productos Vendidos"
                value={fmt(summary?.productos_vendidos)}
                icon={Layers}
                color="bg-[var(--ff-mostaza)]"
                loading={summaryLoading}
              />
              <KpiCard
                title="Tiendas Activas"
                value={fmt(summary?.tiendas_activas)}
                icon={Store}
                color="bg-[var(--ff-granate)]"
                loading={summaryLoading}
              />
            </div>

            {/* Gráficos: Tendencia diaria + Ventas por mes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Tendencia diaria */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">
                    Tendencia de Ventas Diarias
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dailyLoading ? (
                    <Skeleton className="h-52 w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={210}>
                      <LineChart data={dailyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="fecha"
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          tickFormatter={(v) => `S/ ${fmt(v)}`}
                          width={70}
                        />
                        <Tooltip
                          formatter={(v: number) => [fmtCurrency(v), "Ventas"]}
                          labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                          contentStyle={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: "0.5rem",
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="ventas"
                          stroke="var(--ff-esmeralda)"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Ventas por mes */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">
                    Ventas por Mes (últimos 6 meses)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {monthlyLoading ? (
                    <Skeleton className="h-52 w-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height={210}>
                      <BarChart data={monthlyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="mes"
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          tickFormatter={(v) => `S/ ${fmt(v)}`}
                          width={70}
                        />
                        <Tooltip
                          formatter={(v: number) => [fmtCurrency(v), "Ventas"]}
                          contentStyle={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: "0.5rem",
                          }}
                        />
                        <Bar dataKey="ventas" fill="var(--ff-cobalto)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top productos + Ventas por tienda */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top 10 productos */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">
                    Top 10 Productos por Ventas
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {topLoading ? (
                    <div className="p-4 space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">#</TableHead>
                            <TableHead className="text-xs">Producto</TableHead>
                            <TableHead className="text-xs text-right">Ventas</TableHead>
                            <TableHead className="text-xs text-right">Uds.</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {topProducts?.map((p, i) => (
                            <TableRow key={p.int_sku}>
                              <TableCell className="text-xs text-muted-foreground w-8">
                                {i + 1}
                              </TableCell>
                              <TableCell className="text-xs max-w-[180px]">
                                <p className="truncate font-medium">{p.producto}</p>
                                <p className="text-muted-foreground">{p.int_sku}</p>
                              </TableCell>
                              <TableCell className="text-xs text-right font-medium">
                                {fmtCurrency(p.total_ventas)}
                              </TableCell>
                              <TableCell className="text-xs text-right">
                                {fmt(p.unidades_vendidas)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {!topProducts?.length && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                                Sin ventas en el período seleccionado
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Ventas por tienda */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">
                    Ventas por Tienda
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {branchLoading ? (
                    <Skeleton className="h-52 w-full" />
                  ) : salesByBranch && salesByBranch.length > 0 ? (
                    <ResponsiveContainer width="100%" height={520}>
                      <BarChart
                        data={salesByBranch.slice(0, 20).map((b) => ({
                          tienda: b.sap_id ? `${b.tienda} (${b.sap_id})` : b.tienda,
                          ventas: parseFloat(b.total_ventas),
                        }))}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickFormatter={(v) => `S/ ${fmt(v)}`}
                        />
                        <YAxis
                          type="category"
                          dataKey="tienda"
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          width={80}
                        />
                        <Tooltip
                          formatter={(v: number) => [fmtCurrency(v), "Ventas"]}
                          contentStyle={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: "0.5rem",
                          }}
                        />
                        <Bar dataKey="ventas" radius={[0, 4, 4, 0]} maxBarSize={22}>
                          {salesByBranch.slice(0, 20).map((_, i) => (
                            <Cell
                              key={i}
                              fill={CHART_COLORS[i % CHART_COLORS.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-52 text-muted-foreground text-sm">
                      Sin ventas en el período seleccionado
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════
            TAB: CATÁLOGO
        ══════════════════════════════════════════════ */}
        {activeTab === "productos" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Filtro por producto - Select desplegable */}
              <div className="flex-1 min-w-[240px] max-w-sm">
                <Select
                  value={catalogProductId ?? "all"}
                  onValueChange={(v) => { setCatalogProductId(v === "all" ? undefined : v); setCatalogPage(0); }}
                >
                  <SelectTrigger className="h-9 text-sm w-full">
                    <SelectValue placeholder={supplierProductsLoading ? "Cargando productos..." : "Todos los productos"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <div className="px-2 py-1.5 sticky top-0 bg-popover z-10">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Buscar producto o SKU..."
                          value={catalogProductSearch}
                          onChange={(e) => setCatalogProductSearch(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="w-full pl-7 pr-2 py-1 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                    </div>
                    <SelectItem value="all">Todos los productos</SelectItem>
                    {(supplierProducts ?? []).filter((p) => {
                      if (!catalogProductSearch.trim()) return true;
                      const q = catalogProductSearch.toLowerCase();
                      return p.name.toLowerCase().includes(q) || p.sku.includes(q);
                    }).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="truncate">
                          <span className="font-mono text-xs text-muted-foreground mr-1.5">{p.sku}</span>
                          {p.name}
                        </span>
                      </SelectItem>
                    ))}
                    {!supplierProductsLoading && supplierProducts?.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground text-center">Sin resultados</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {catalogData && (
                <span className="text-sm text-muted-foreground">
                  {catalogData.total} productos
                </span>
              )}
            </div>

            <Card className="border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Stock Total</TableHead>
                        <TableHead className="text-right">Tiendas c/ Stock</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catalogLoading
                        ? Array.from({ length: 8 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell colSpan={5}>
                                <Skeleton className="h-5 w-full" />
                              </TableCell>
                            </TableRow>
                          ))
                        : catalogData?.rows.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium text-sm max-w-[240px]">
                                <p className="truncate">{p.name}</p>
                                {p.description && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {p.description}
                                  </p>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {p.int_sku}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {fmt(p.stock_total)}
                              </TableCell>
                              <TableCell className="text-right">
                                {p.tiendas_con_stock}
                              </TableCell>
                              <TableCell>
                                {p.stock_total === 0 ? (
                                  <Badge variant="destructive" className="text-xs">
                                    Sin stock
                                  </Badge>
                                ) : p.stock_total < 5 ? (
                                  <Badge className="text-xs bg-[var(--ff-mostaza)] text-white">
                                    Stock bajo
                                  </Badge>
                                ) : (
                                  <Badge className="text-xs bg-[var(--ff-esmeralda)] text-white">
                                    En stock
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Paginación catálogo */}
            {catalogData && catalogData.total > PAGE_SIZE && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Mostrando {catalogPage * PAGE_SIZE + 1}–
                  {Math.min((catalogPage + 1) * PAGE_SIZE, catalogData.total)} de{" "}
                  {catalogData.total}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={catalogPage === 0}
                    onClick={() => setCatalogPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(catalogPage + 1) * PAGE_SIZE >= catalogData.total}
                    onClick={() => setCatalogPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            TAB: STOCK
        ══════════════════════════════════════════════ */}
        {activeTab === "stock" && (
          <div className="space-y-4">
            {/* Barra de filtros */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Filtro por producto - Select desplegable */}
              <div className="flex-1 min-w-[240px] max-w-sm">
                <Select
                  value={stockProductId ?? "all"}
                  onValueChange={(v) => { setStockProductId(v === "all" ? undefined : v); setStockPage(0); }}
                >
                  <SelectTrigger className="h-9 text-sm w-full">
                    <SelectValue placeholder={supplierProductsLoading ? "Cargando productos..." : "Todos los productos"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <div className="px-2 py-1.5 sticky top-0 bg-popover z-10">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Buscar producto o SKU..."
                          value={stockProductSearch}
                          onChange={(e) => setStockProductSearch(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="w-full pl-7 pr-2 py-1 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                    </div>
                    <SelectItem value="all">Todos los productos</SelectItem>
                    {(supplierProducts ?? []).filter((p) => {
                      if (!stockProductSearch.trim()) return true;
                      const q = stockProductSearch.toLowerCase();
                      return p.name.toLowerCase().includes(q) || p.sku.includes(q);
                    }).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="truncate">
                          <span className="font-mono text-xs text-muted-foreground mr-1.5">{p.sku}</span>
                          {p.name}
                        </span>
                      </SelectItem>
                    ))}
                    {!supplierProductsLoading && supplierProducts?.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground text-center">Sin resultados</div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro por tienda */}
              <Select
                value={stockBranchId ?? "all"}
                onValueChange={(val) => {
                  setStockBranchId(val === "all" ? undefined : val);
                  setStockPage(0);
                }}
              >
                <SelectTrigger className="h-9 w-[220px]">
                  <Store className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Todas las tiendas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las tiendas</SelectItem>
                  {branchesForStock?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}{b.sap_id ? ` (${b.sap_id})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Botón limpiar filtros (visible solo si hay algún filtro activo) */}
              {(stockProductId || stockBranchId) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-muted-foreground"
                  onClick={() => {
                    setStockProductId(undefined);
                    setStockProductSearch("");
                    setStockBranchId(undefined);
                    setStockPage(0);
                  }}
                >
                  Limpiar filtros
                </Button>
              )}

              <div className="ml-auto flex items-center gap-3">
                {stockData && (
                  <span className="text-sm text-muted-foreground">
                    {stockData.total} registros
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5"
                  onClick={handleDownloadStockCSV}
                  disabled={isExportingStock || !queriesEnabled}
                >
                  {isExportingStock ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" />
                  )}
                  {isExportingStock ? "Exportando..." : "Descargar Excel"}
                </Button>
              </div>
            </div>

            <Card className="border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Tienda</TableHead>
                        <TableHead>Cód. SAP</TableHead>
                        <TableHead className="text-right">Stock Actual</TableHead>
                        <TableHead className="text-right">Stock Mín.</TableHead>
                        <TableHead>Alerta</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockLoading
                        ? Array.from({ length: 8 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell colSpan={7}>
                                <Skeleton className="h-5 w-full" />
                              </TableCell>
                            </TableRow>
                          ))
                        : stockData?.rows.map((s, i) => (
                            <TableRow key={i} className={s.stock_actual === 0 ? "opacity-60" : ""}>
                              <TableCell className="font-medium text-sm max-w-[200px]">
                                <p className="truncate">{s.producto}</p>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {s.int_sku}
                              </TableCell>
                              <TableCell className="text-sm">{s.tienda}</TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground">{s.sap_id ?? "—"}</TableCell>
                              <TableCell className="text-right font-medium">
                                {s.stock_actual === 0
                                  ? <span className="text-muted-foreground">0</span>
                                  : fmt(s.stock_actual)
                                }
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {s.min_stock != null ? fmt(s.min_stock) : "—"}
                              </TableCell>
                              <TableCell>
                                {s.stock_actual === 0 ? (
                                  <Badge variant="destructive" className="text-xs">Sin stock</Badge>
                                ) : s.min_stock != null && s.stock_actual <= s.min_stock ? (
                                  <div className="flex items-center gap-1 text-[var(--ff-mostaza)]">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    <span className="text-xs">Bajo mínimo</span>
                                  </div>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Paginación stock */}
            {stockData && stockData.total > PAGE_SIZE && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Mostrando {stockPage * PAGE_SIZE + 1}–
                  {Math.min((stockPage + 1) * PAGE_SIZE, stockData.total)} de{" "}
                  {stockData.total}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={stockPage === 0}
                    onClick={() => setStockPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(stockPage + 1) * PAGE_SIZE >= stockData.total}
                    onClick={() => setStockPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            TAB: RECEPCIONES
        ══════════════════════════════════════════════ */}
        {activeTab === "recepciones" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Entregas de Mercadería
              </h2>
              {receptionsData && (
                <span className="text-sm text-muted-foreground">
                  {receptionsData.total} registros
                </span>
              )}
            </div>

            <Card className="border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>N° OC</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tienda</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Cant. Ordenada</TableHead>
                        <TableHead className="text-right">Cant. Recibida</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recLoading
                        ? Array.from({ length: 8 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell colSpan={7}>
                                <Skeleton className="h-5 w-full" />
                              </TableCell>
                            </TableRow>
                          ))
                        : receptionsData?.rows.map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs font-mono font-medium">
                                {r.oc}
                              </TableCell>
                              <TableCell className="text-sm">
                                {r.fecha
                                  ? format(new Date(r.fecha), "dd/MM/yyyy")
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-sm">{r.tienda}</TableCell>
                              <TableCell className="text-sm max-w-[180px]">
                                <p className="truncate">{r.producto}</p>
                                <p className="text-xs text-muted-foreground">{r.int_sku}</p>
                              </TableCell>
                              <TableCell className="text-right">
                                {fmt(r.ordered_quantity)}
                              </TableCell>
                              <TableCell className="text-right">
                                {r.received_quantity != null
                                  ? fmt(r.received_quantity)
                                  : "—"}
                              </TableCell>
                              <TableCell>
                                {r.status ? (
                                  <Badge className="text-xs bg-[var(--ff-esmeralda)] text-white">
                                    {r.status}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs">
                                    Pendiente
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                      {!recLoading && !receptionsData?.rows.length && (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center text-sm text-muted-foreground py-10"
                          >
                            No hay entregas de mercadería registradas en el período
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Paginación entregas de mercadería */}
            {receptionsData && receptionsData.total > PAGE_SIZE && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Mostrando {recPage * PAGE_SIZE + 1}–
                  {Math.min((recPage + 1) * PAGE_SIZE, receptionsData.total)} de{" "}
                  {receptionsData.total}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={recPage === 0}
                    onClick={() => setRecPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(recPage + 1) * PAGE_SIZE >= receptionsData.total}
                    onClick={() => setRecPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════
            TAB: VENTAS (Artículo × Tienda)
        ════════════════════════════════════════════ */}
        {activeTab === "ventas" && (
          <div className="space-y-4">
            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">Desde</label>
                <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setSalesPage(0); }} className="w-36 text-sm h-8" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">Hasta</label>
                <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setSalesPage(0); }} className="w-36 text-sm h-8" />
              </div>
              {/* Selector múltiple de productos del proveedor */}
              <div className="flex-1 min-w-[240px] max-w-sm">
                <MultiProductSelect
                  products={supplierProducts ?? []}
                  selectedIds={salesProductIds}
                  onChange={(ids) => { setSalesProductIds(ids); setSalesPage(0); }}
                  loading={supplierProductsLoading}
                  placeholder="Todos los productos"
                  className="w-full"
                />
              </div>
              {branchesForSales && branchesForSales.length > 0 && (
                <Select
                  value={salesBranchId ?? "all"}
                  onValueChange={(v) => { setSalesBranchId(v === "all" ? undefined : v); setSalesPage(0); }}
                >
                  <SelectTrigger className="w-52 h-8 text-sm">
                    <SelectValue placeholder="Todas las tiendas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las tiendas</SelectItem>
                    {branchesForSales.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}{b.sap_id ? ` (${b.sap_id})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {/* Toggles de dimensiones */}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-muted-foreground mr-1">Mostrar:</span>
                <button
                  type="button"
                  onClick={handleToggleProduct}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                    showProduct
                      ? "bg-[#232523] text-white border-[#232523]"
                      : "bg-background text-muted-foreground border-border hover:border-[#232523] hover:text-foreground"
                  }`}
                  title={showProduct ? "Ocultar dimensión Producto" : "Mostrar dimensión Producto"}
                >
                  {showProduct ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  Producto
                </button>
                <button
                  type="button"
                  onClick={handleToggleStore}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                    showStore
                      ? "bg-[#232523] text-white border-[#232523]"
                      : "bg-background text-muted-foreground border-border hover:border-[#232523] hover:text-foreground"
                  }`}
                  title={showStore ? "Ocultar dimensión Tienda" : "Mostrar dimensión Tienda"}
                >
                  {showStore ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  Tienda
                </button>
              </div>

              {/* Botón de descarga Excel */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={handleDownloadCSV}
                disabled={isExporting || !queriesEnabled}
              >
                {isExporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileDown className="h-3.5 w-3.5" />
                )}
                {isExporting ? "Exportando..." : "Descargar Excel"}
              </Button>
            </div>

            {/* Tabla */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" style={{ color: "#1A6894" }} />
                  Ventas por Artículo y Tienda
                  {salesByPB && (
                    <span className="text-xs font-normal text-muted-foreground ml-1">
                      ({salesByPB.total.toLocaleString("es-PE")} combinaciones)
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/50">
                        {showProduct && <SortableTableHead label="Producto" col="producto" sortCol={sortCol} sortDir={sortDir} onSort={handleSortCol} className="pl-4" />}
                        {showProduct && <SortableTableHead label="SKU" col="sku" sortCol={sortCol} sortDir={sortDir} onSort={handleSortCol} />}
                        {showStore && <SortableTableHead label="Tienda" col="tienda" sortCol={sortCol} sortDir={sortDir} onSort={handleSortCol} />}
                        {showStore && <SortableTableHead label="Cód. SAP" col="sap_id" sortCol={sortCol} sortDir={sortDir} onSort={handleSortCol} />}
                        <SortableTableHead label="Cantidad" col="cantidad" sortCol={sortCol} sortDir={sortDir} onSort={handleSortCol} align="right" />
                        <SortableTableHead label="Monto (S/)" col="monto" sortCol={sortCol} sortDir={sortDir} onSort={handleSortCol} align="right" />
                        <SortableTableHead label="Tickets" col="tickets" sortCol={sortCol} sortDir={sortDir} onSort={handleSortCol} align="right" />
                        {showProduct && showStore && <TableHead className="w-8"></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesPBLoading && (
                        [...Array(8)].map((_, i) => (
                          <TableRow key={i}>
                            {[...Array((showProduct ? 2 : 0) + (showStore ? 2 : 0) + 3 + (showProduct && showStore ? 1 : 0) || 3)].map((_, j) => (
                              <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      )}
                      <TooltipProvider delayDuration={300}>
                        {!salesPBLoading && sortedSalesRows.map((row, idx) => {
                        const canDrill = showProduct && showStore && row.product_id && row.branch_id;
                        return (
                          <TableRow
                            key={`${row.product_id || "all"}-${row.branch_id || "all"}-${idx}`}
                            className={`transition-colors border-border/50 ${canDrill ? "cursor-pointer hover:bg-muted/40" : ""}`}
                            onClick={() => {
                              if (!canDrill) return;
                              setDetailModal({
                                open: true,
                                productId: row.product_id,
                                branchId: row.branch_id,
                                producto: row.producto,
                                tienda: row.tienda,
                              });
                            }}
                          >
                            {showProduct && (
                              <TableCell className="pl-4 text-sm max-w-[220px]">
                                {canDrill ? (
                                  <UITooltip>
                                    <TooltipTrigger asChild>
                                      <span className="line-clamp-2 leading-tight cursor-pointer">{row.producto}</span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      Haz clic para ver el detalle de ventas por día
                                    </TooltipContent>
                                  </UITooltip>
                                ) : (
                                  <span className="line-clamp-2 leading-tight">{row.producto}</span>
                                )}
                              </TableCell>
                            )}
                            {showProduct && (
                              <TableCell className="text-xs text-muted-foreground font-mono">{row.sku}</TableCell>
                            )}
                            {showStore && (
                              <TableCell className="text-sm">
                                <div className="flex items-center gap-1.5">
                                  <Store className="h-3 w-3 shrink-0" style={{ color: "#919291" }} />
                                  <span className="truncate max-w-[140px]">{row.tienda}</span>
                                </div>
                              </TableCell>
                            )}
                            {showStore && (
                              <TableCell className="text-xs font-mono text-muted-foreground">{row.sap_id ?? "—"}</TableCell>
                            )}
                            <TableCell className="text-right tabular-nums">{fmt(row.cantidad)}</TableCell>
                            <TableCell className="text-right tabular-nums" style={{ color: "#008064" }}>
                              {fmtCurrency(row.monto)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground text-sm">{row.tickets}</TableCell>
                            {showProduct && showStore && (
                              <TableCell className="text-center">
                                {canDrill && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                      </TooltipProvider>
                      {!salesPBLoading && !salesByPB?.rows.length && (
                        <TableRow>
                          <TableCell
                            colSpan={(showProduct ? 2 : 0) + (showStore ? 2 : 0) + 3 + (showProduct && showStore ? 1 : 0) || 3}
                            className="text-center text-sm text-muted-foreground py-12"
                          >
                            No hay ventas en el período y filtros seleccionados
                          </TableCell>
                        </TableRow>
                      )}
                      {/* Fila de totales globales */}
                      {!salesPBLoading && salesByPB?.totals && salesByPB.rows.length > 0 && (() => {
                        const labelColSpan = (showProduct ? 2 : 0) + (showStore ? 2 : 0) || 1;
                        return (
                          <TableRow className="border-t-2 border-border font-semibold bg-muted/30">
                            <TableCell className="pl-4 text-sm" colSpan={labelColSpan}>Total General</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{fmt(salesByPB.totals.cantidad)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm" style={{ color: "#008064" }}>
                              {fmtCurrency(salesByPB.totals.monto)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{salesByPB.totals.tickets}</TableCell>
                            {showProduct && showStore && <TableCell />}
                          </TableRow>
                        );
                      })()}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Paginación */}
            {salesByPB && salesByPB.total > PAGE_SIZE && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Mostrando {salesPage * PAGE_SIZE + 1}–
                  {Math.min((salesPage + 1) * PAGE_SIZE, salesByPB.total)} de {salesByPB.total.toLocaleString("es-PE")}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={salesPage === 0} onClick={() => setSalesPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={(salesPage + 1) * PAGE_SIZE >= salesByPB.total} onClick={() => setSalesPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════
          MODAL: Detalle de ventas diarias
      ════════════════════════════════════════════ */}
      <Dialog
        open={!!detailModal?.open}
        onOpenChange={(open) => !open && setDetailModal(null)}
      >
        <DialogContent
          className="max-h-[85vh] overflow-y-auto"
          style={{ width: "min(70vw, calc(100vw - 2rem))", maxWidth: "none" }}
        >
          <DialogHeader>
            <DialogTitle
              className="text-base font-bold uppercase tracking-wide leading-tight"
              style={{ fontFamily: "'Italian Plate No 1', sans-serif" }}
            >
              Detalle de Ventas por Día
            </DialogTitle>
            <DialogDescription className="space-y-0.5">
              <span className="block font-medium text-foreground text-sm">{detailModal?.producto}</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Store className="h-3 w-3" />
                {detailModal?.tienda} &middot; {from} – {to}
              </span>
            </DialogDescription>
          </DialogHeader>

          {dailyDetailLoading ? (
            <div className="space-y-2 py-4">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !dailyDetail?.length ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No hay ventas registradas para este producto y tienda en el período.
            </p>
          ) : (
            <>
              {/* KPIs del modal */}
              <div className="grid grid-cols-3 gap-3 my-2">
                <div className="rounded-lg p-3 text-center" style={{ background: "#0D344A1A" }}>
                  <p className="text-xs text-muted-foreground mb-0.5">Días con venta</p>
                  <p className="text-xl font-bold" style={{ fontFamily: "'Italian Plate No 1', sans-serif", color: "#0D344A" }}>
                    {dailyDetail.length}
                  </p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: "#0040321A" }}>
                  <p className="text-xs text-muted-foreground mb-0.5">Total unidades</p>
                  <p className="text-xl font-bold" style={{ fontFamily: "'Italian Plate No 1', sans-serif", color: "#004032" }}>
                    {fmt(dailyDetail.reduce((s, r) => s + parseFloat(r.cantidad), 0))}
                  </p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ background: "#6240021A" }}>
                  <p className="text-xs text-muted-foreground mb-0.5">Total monto</p>
                  <p className="text-xl font-bold" style={{ fontFamily: "'Italian Plate No 1', sans-serif", color: "#624C02" }}>
                    {fmtCurrency(dailyDetail.reduce((s, r) => s + parseFloat(r.monto), 0))}
                  </p>
                </div>
              </div>

              {/* Gráfico de líneas diario */}
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={dailyDetail.map((r) => ({
                      fecha: format(new Date(r.fecha), "dd/MM", { locale: es }),
                      cantidad: parseFloat(r.cantidad),
                      monto: parseFloat(r.monto),
                    }))}
                    margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#EAE8E2" vertical={false} />
                    <XAxis
                      dataKey="fecha"
                      tick={{ fontSize: 10, fill: "#757471", fontFamily: "'Sailec', sans-serif" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="monto"
                      orientation="left"
                      tick={{ fontSize: 10, fill: "#757471", fontFamily: "'Sailec', sans-serif" }}
                      tickFormatter={(v) => `S/${(v / 1000).toFixed(1)}K`}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                    />
                    <YAxis
                      yAxisId="qty"
                      orientation="right"
                      tick={{ fontSize: 10, fill: "#757471", fontFamily: "'Sailec', sans-serif" }}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) =>
                        name === "monto" ? [fmtCurrency(value), "Monto"] : [fmt(value), "Cantidad"]
                      }
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.5rem",
                        fontFamily: "'Sailec', sans-serif",
                        fontSize: 12,
                      }}
                    />
                    <Legend
                      formatter={(value: string) => value === "monto" ? "Monto" : "Cantidad"}
                      wrapperStyle={{ fontSize: 11, fontFamily: "'Sailec', sans-serif" }}
                    />
                    <Line
                      yAxisId="monto"
                      type="monotone"
                      dataKey="monto"
                      stroke="#1A6894"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#1A6894", strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      name="monto"
                    />
                    <Line
                      yAxisId="qty"
                      type="monotone"
                      dataKey="cantidad"
                      stroke="#008064"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#008064", strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      name="cantidad"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Tabla detallada */}
              <div className="overflow-x-auto rounded-md border border-border/50">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50">
                      <TableHead className="text-xs font-semibold uppercase tracking-wide pl-4">Fecha</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">Cantidad</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">Monto (S/)</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">Tickets</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyDetail.map((r) => (
                      <TableRow key={r.fecha} className="border-border/50">
                        <TableCell className="pl-4 text-sm font-medium">
                          {format(new Date(r.fecha), "dd MMM yyyy", { locale: es })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.cantidad)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium" style={{ color: "#008064" }}>
                          {fmtCurrency(r.monto)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{r.tickets}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
