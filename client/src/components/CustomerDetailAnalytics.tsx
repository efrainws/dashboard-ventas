import { useMemo } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { BarChart3, Building2, Package, Tags } from "lucide-react";
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

const PIE_COLORS = [
  "var(--ff-esmeralda)",
  "var(--ff-cobalto)",
  "var(--ff-mostaza)",
  "var(--ff-granate)",
  "var(--ff-celeste)",
  "var(--ff-rosado)",
  "var(--ff-esmeralda-light)",
  "var(--ff-cobalto-light)",
  "var(--ff-mostaza-light)",
  "var(--ff-granate-light)",
  "var(--ff-celeste-light)",
  "var(--ff-rosado-light)",
];

type Metric = "salesAmount" | "transactions";

export type CustomerDistributionRow = {
  id: string;
  name: string;
  salesAmount: number;
  transactions: number;
};

export type CustomerProductRow = {
  productId: string | null;
  productName: string;
  sku: string;
  quantity: number;
  salesAmount: number;
  transactions: number;
};

interface CustomerDetailAnalyticsProps {
  stores: CustomerDistributionRow[];
  departments: CustomerDistributionRow[];
  products: CustomerProductRow[];
  storeMetric: Metric;
  departmentMetric: Metric;
  productLimit: 10 | 20 | 50 | 100;
  isLoadingAnalytics?: boolean;
  isLoadingProducts?: boolean;
  onStoreMetricChange: (metric: Metric) => void;
  onDepartmentMetricChange: (metric: Metric) => void;
  onProductLimitChange: (limit: 10 | 20 | 50 | 100) => void;
}

const formatCurrency = (value: number) =>
  `S/ ${new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;

const formatNumber = (value: number) => new Intl.NumberFormat("es-PE").format(value);

function MetricSwitch({
  metric,
  onChange,
  label,
}: {
  metric: Metric;
  onChange: (metric: Metric) => void;
  label: string;
}) {
  return (
    <div className="inline-flex h-8 border border-border bg-background" role="group" aria-label={label}>
      <button
        type="button"
        aria-pressed={metric === "salesAmount"}
        onClick={() => onChange("salesAmount")}
        className={`px-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] ${
          metric === "salesAmount"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted"
        }`}
      >
        Monto
      </button>
      <button
        type="button"
        aria-pressed={metric === "transactions"}
        onClick={() => onChange("transactions")}
        className={`border-l border-border px-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] ${
          metric === "transactions"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted"
        }`}
      >
        Transacciones
      </button>
    </div>
  );
}

function DistributionPie({
  title,
  description,
  icon: Icon,
  rows,
  metric,
  onMetricChange,
  isLoading,
}: {
  title: string;
  description: string;
  icon: typeof Building2;
  rows: CustomerDistributionRow[];
  metric: Metric;
  onMetricChange: (metric: Metric) => void;
  isLoading?: boolean;
}) {
  const chartRows = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + row[metric], 0);
    return rows.map((row, index) => ({
      ...row,
      value: row[metric],
      pct: total > 0 ? (row[metric] / total) * 100 : 0,
      color: PIE_COLORS[index % PIE_COLORS.length],
    }));
  }, [metric, rows]);

  const valueLabel = metric === "salesAmount" ? "Monto de venta" : "N.° de transacciones";
  const formatValue = (value: number) =>
    metric === "salesAmount" ? formatCurrency(value) : formatNumber(value);

  return (
    <section className="border border-border/60 bg-card p-4" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-[var(--ff-cobalto)]" aria-hidden="true" />
            <h3 className="font-heading text-sm font-bold tracking-wide uppercase">{title}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <MetricSwitch metric={metric} onChange={onMetricChange} label={`Métrica de ${title}`} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <Skeleton className="h-52 w-full" />
          <div className="space-y-2 pt-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </div>
      ) : chartRows.length === 0 ? (
        <div className="flex h-52 items-center justify-center text-center text-sm text-muted-foreground">
          Todavía no hay datos para estos filtros.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={chartRows}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={82}
                paddingAngle={1}
                stroke="var(--surface-card)"
                strokeWidth={2}
              >
                {chartRows.map((entry) => (
                  <Cell key={entry.id} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as (typeof chartRows)[number];
                  return (
                    <div className="ff-chart-tooltip">
                      <p className="font-semibold text-foreground">{row.name}</p>
                      <p>{formatValue(row.value)}</p>
                      <p className="text-muted-foreground">{row.pct.toFixed(1)}% del total</p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="max-h-52 overflow-y-auto pr-1">
            <p className="ff-section-label mb-2">{valueLabel}</p>
            <ul className="space-y-2" aria-label={`Detalle de ${title}`}>
              {chartRows.map((row) => (
                <li key={row.id} className="flex items-start gap-2 text-xs">
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate" title={row.name}>{row.name}</span>
                  <span className="shrink-0 tabular-nums font-medium">{formatValue(row.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

export function CustomerDetailAnalytics({
  stores,
  departments,
  products,
  storeMetric,
  departmentMetric,
  productLimit,
  isLoadingAnalytics,
  isLoadingProducts,
  onStoreMetricChange,
  onDepartmentMetricChange,
  onProductLimitChange,
}: CustomerDetailAnalyticsProps) {
  return (
    <section className="space-y-4 border-b border-border/50 pb-5" aria-labelledby="customer-analytics-title">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-[var(--ff-cobalto)]" aria-hidden="true" />
        <div>
          <p className="ff-section-label">Perfil de compra</p>
          <h2 id="customer-analytics-title" className="font-heading text-base font-bold tracking-wide uppercase">
            Distribución y productos más comprados
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DistributionPie
          title="Distribución por tienda"
          description="Participación de las compras del cliente por tienda."
          icon={Building2}
          rows={stores}
          metric={storeMetric}
          onMetricChange={onStoreMetricChange}
          isLoading={isLoadingAnalytics}
        />
        <DistributionPie
          title="Distribución por departamento"
          description="Participación de las compras del cliente por departamento."
          icon={Tags}
          rows={departments}
          metric={departmentMetric}
          onMetricChange={onDepartmentMetricChange}
          isLoading={isLoadingAnalytics}
        />
      </div>

      <section className="border border-border/60 bg-card p-4" aria-labelledby="customer-top-products-title">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-[var(--ff-esmeralda)]" aria-hidden="true" />
              <h3 id="customer-top-products-title" className="font-heading text-sm font-bold tracking-wide uppercase">
                Productos más comprados
              </h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Ranking por unidades compradas; el monto y las transacciones complementan el resultado.
            </p>
          </div>
          <div className="w-32">
            <label htmlFor="customer-product-limit" className="mb-1 block text-[11px] font-medium text-muted-foreground">
              Mostrar
            </label>
            <Select value={String(productLimit)} onValueChange={(value) => onProductLimitChange(Number(value) as 10 | 20 | 50 | 100)}>
              <SelectTrigger id="customer-product-limit" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="20">Top 20</SelectItem>
                <SelectItem value="50">Top 50</SelectItem>
                <SelectItem value="100">Top 100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoadingProducts ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-8 w-full" />)}
          </div>
        ) : products.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Todavía no hay productos comprados para estos filtros.
          </p>
        ) : (
          <div className="max-h-80 overflow-auto border border-border/50">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                <TableRow className="border-border/50">
                  <TableHead className="w-10 text-xs">#</TableHead>
                  <TableHead className="text-xs">Producto</TableHead>
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-right text-xs">Unidades</TableHead>
                  <TableHead className="text-right text-xs">Monto</TableHead>
                  <TableHead className="text-right text-xs">Txn.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product, index) => (
                  <TableRow key={product.productId ?? `${product.sku}-${index}`} className="border-border/30">
                    <TableCell className="text-xs tabular-nums text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="max-w-64 text-sm font-medium">
                      <span className="block truncate" title={product.productName}>{product.productName}</span>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{product.sku}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatNumber(product.quantity)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-semibold text-[var(--ff-esmeralda)]">
                      {formatCurrency(product.salesAmount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {formatNumber(product.transactions)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </section>
  );
}
