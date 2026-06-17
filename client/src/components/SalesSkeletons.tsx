/**
 * SalesSkeletons.tsx
 * Componentes skeleton reutilizables para el dashboard de ventas.
 * Reemplazan los spinners genéricos con animaciones que reflejan
 * la forma real de cada sección mientras se cargan los datos.
 */
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ─── KPI Card Skeleton ────────────────────────────────────────────────────────
/** Simula la forma de un KPICard con valor, comparación y tendencia */
export function KPICardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-4 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Valor principal */}
        <Skeleton className="h-8 w-36" />
        {/* Badge de comparación */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

/** Grilla de 5 KPI cards skeleton */
export function KPIGridSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <KPICardSkeleton key={i} />
      ))}
    </div>
  );
}

// ─── Heatmap Skeleton ─────────────────────────────────────────────────────────
/** Simula la grilla 24 horas × 7 días del mapa de calor */
export function HeatmapSkeleton() {
  const HOURS = 24;
  const DAYS = 7;

  return (
    <div className="space-y-2">
      {/* Encabezado de días */}
      <div className="flex gap-1 pl-10">
        {Array.from({ length: DAYS }).map((_, d) => (
          <Skeleton key={d} className="h-4 flex-1 rounded-sm" />
        ))}
      </div>
      {/* Filas de horas */}
      {Array.from({ length: HOURS }).map((_, h) => (
        <div key={h} className="flex items-center gap-1">
          {/* Etiqueta de hora */}
          <Skeleton className="h-5 w-8 rounded-sm shrink-0" />
          {/* Celdas */}
          {Array.from({ length: DAYS }).map((_, d) => (
            <Skeleton
              key={d}
              className="h-5 flex-1 rounded-sm"
              style={{
                opacity: 0.3 + Math.random() * 0.5, // variación visual para simular datos reales
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Card completa del mapa de calor con skeleton */
export function HeatmapCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="space-y-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          {/* Controles de modo */}
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>
        {/* Filtros de sucursal y métrica */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Skeleton className="h-8 w-36 rounded-md" />
          <Skeleton className="h-8 w-36 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </CardHeader>
      <CardContent>
        <HeatmapSkeleton />
      </CardContent>
    </Card>
  );
}

// ─── Bar Chart Skeleton ───────────────────────────────────────────────────────
/** Simula el gráfico de barras de comparación por sucursal */
export function BranchBarChartSkeleton() {
  const BARS = 8;
  const heights = [70, 90, 55, 80, 65, 95, 45, 75]; // alturas variadas para simular datos

  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: BARS }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              {/* Nombre de sucursal */}
              <Skeleton className="h-4 w-24 shrink-0" />
              {/* Barra principal */}
              <div className="flex-1 flex flex-col gap-1">
                <Skeleton
                  className="h-5 rounded-sm"
                  style={{ width: `${heights[i % heights.length]}%` }}
                />
                {/* Barra de comparación (período anterior) */}
                <Skeleton
                  className="h-3 rounded-sm opacity-50"
                  style={{ width: `${heights[(i + 2) % heights.length]}%` }}
                />
              </div>
              {/* Valor */}
              <Skeleton className="h-4 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Pie Chart Skeleton ───────────────────────────────────────────────────────
/** Simula el gráfico de torta de distribución por categoría */
export function CategoryPieChartSkeleton() {
  const SLICES = 6;

  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-6 items-center">
          {/* Círculo del pie */}
          <div className="relative shrink-0">
            <Skeleton className="h-48 w-48 rounded-full" />
            {/* Agujero central (donut) */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-24 rounded-full bg-background" />
            </div>
          </div>
          {/* Leyenda */}
          <div className="flex-1 space-y-2">
            {Array.from({ length: SLICES }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-3 w-3 rounded-full shrink-0" />
                <Skeleton className="h-4 flex-1" style={{ maxWidth: `${60 + (i * 7) % 30}%` }} />
                <Skeleton className="h-4 w-16 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Comparison Period Skeleton ───────────────────────────────────────────────
/** Simula la sección de comparación de períodos (KPIs con tendencia) */
export function ComparisonPeriodSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Valor actual */}
            <Skeleton className="h-8 w-32" />
            {/* Comparación */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
            {/* Valor anterior */}
            <Skeleton className="h-3 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Sales Line Chart Skeleton ────────────────────────────────────────────────
/** Simula el gráfico de línea de evolución de ventas */
export function SalesLineChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-60" />
          </div>
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </CardHeader>
      <CardContent>
        {/* Área del gráfico */}
        <div className="relative h-64">
          {/* Líneas de referencia horizontales */}
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="absolute w-full border-t border-muted"
              style={{ top: `${i * 25}%` }}
            />
          ))}
          {/* Línea del gráfico simulada con SVG */}
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.3" />
                <stop offset="50%" stopColor="hsl(var(--accent))" stopOpacity="0.6" />
                <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.3" />
              </linearGradient>
            </defs>
            <polyline
              points="0,200 60,160 120,140 180,170 240,120 300,100 360,130 420,90 480,110 540,80 600,95 660,70 720,85 780,60 840,75 900,50"
              fill="none"
              stroke="url(#shimmer)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {/* Etiquetas del eje X */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-10" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
