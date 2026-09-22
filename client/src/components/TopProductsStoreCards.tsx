import { useMemo } from "react";
import { Package, Store } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type TopProductByStoreRow = {
  branchSapId: string;
  branchName: string;
  rank: number;
  productId: string;
  productName: string;
  sku: string;
  categoryName: string;
  totalQty: number;
  totalAmount: number;
  totalStock: number;
  avgDailyQty: number;
  coverageDays: number | null;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const formatNumber = (value: number) => new Intl.NumberFormat("es-PE").format(value);

function ProductMetricsTooltip({ product }: { product: TopProductByStoreRow }) {
  const coverage = product.coverageDays === null ? "Sin cálculo" : `${product.coverageDays.toFixed(1)} días`;
  const coverageStatus = product.coverageDays !== null && product.coverageDays < 5
    ? "Cobertura crítica"
    : "Cobertura";

  return (
    <TooltipContent side="top" align="start" className="max-w-xs p-0" sideOffset={8}>
      <div className="ff-chart-tooltip space-y-2">
        <div>
          <p className="font-semibold text-foreground leading-tight">{product.productName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">SKU: {product.sku} · {product.categoryName}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-1 border-t border-border pt-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Posición</dt>
            <dd className="font-medium tabular-nums text-foreground">#{product.rank}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Unidades</dt>
            <dd className="font-medium tabular-nums text-foreground">{formatNumber(product.totalQty)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Stock</dt>
            <dd className="font-medium tabular-nums text-foreground">{formatNumber(Math.round(product.totalStock))}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Venta diaria</dt>
            <dd className="font-medium tabular-nums text-foreground">{formatNumber(product.avgDailyQty)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{coverageStatus}</dt>
            <dd className={product.coverageDays !== null && product.coverageDays < 5 ? "font-medium tabular-nums text-destructive" : "font-medium tabular-nums text-foreground"}>
              {coverage}
            </dd>
          </div>
        </dl>
      </div>
    </TooltipContent>
  );
}

export function TopProductsStoreCards({
  rows,
  limit,
  isLoading,
}: {
  rows: TopProductByStoreRow[];
  limit: 20 | 50;
  isLoading?: boolean;
}) {
  const stores = useMemo(() => {
    const grouped = new Map<string, { sapId: string; name: string; products: TopProductByStoreRow[] }>();
    for (const product of rows) {
      if (!grouped.has(product.branchSapId)) {
        grouped.set(product.branchSapId, {
          sapId: product.branchSapId,
          name: product.branchName,
          products: [],
        });
      }
      grouped.get(product.branchSapId)!.products.push(product);
    }
    return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name, "es-PE"));
  }, [rows]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Cargando productos por tienda">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="border-border/60">
            <CardHeader className="pb-3"><Skeleton className="h-4 w-2/3" /></CardHeader>
            <CardContent className="space-y-2"><Skeleton className="h-7 w-full" /><Skeleton className="h-7 w-full" /><Skeleton className="h-7 w-full" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (stores.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          No hay productos para el período y filtros seleccionados.
        </CardContent>
      </Card>
    );
  }

  return (
    <section aria-labelledby="top-products-store-cards-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="ff-eyebrow">Ranking por tienda</p>
          <h2 id="top-products-store-cards-title" className="mt-1 font-heading text-xl font-bold uppercase tracking-wide text-foreground">
            Top {limit} productos por tienda
          </h2>
        </div>
        <p className="max-w-sm text-xs text-muted-foreground">
          Pasa el cursor o enfoca un producto para ver sus métricas, categoría y cobertura.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stores.map((store) => (
          <Card key={store.sapId} className="border-border/60 transition-shadow hover:shadow-[var(--shadow-warm-sm)]">
            <CardHeader className="border-b border-border/50 px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
                <Store className="h-4 w-4 shrink-0 text-[var(--ff-canal-presencial)]" aria-hidden="true" />
                <span className="truncate">{store.name}</span>
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Cód. {store.sapId}</p>
            </CardHeader>
            <CardContent className="p-0">
              <ol aria-label={`Productos principales de ${store.name}`}>
                {store.products.map((product) => (
                  <li key={product.productId} className="border-b border-border/40 last:border-b-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]"
                          aria-label={`${product.productName}, ${formatCurrency(product.totalAmount)}. Ver detalle de métricas.`}
                        >
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{product.productName}</span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--ff-esmeralda)]">{formatCurrency(product.totalAmount)}</span>
                        </button>
                      </TooltipTrigger>
                      <ProductMetricsTooltip product={product} />
                    </Tooltip>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
