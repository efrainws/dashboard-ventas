import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StoreTargetCardProps {
  storeName: string;
  totalSales: number;
  proratedTarget: number;
  completionPercentage: number;
  hasTarget: boolean;
  onEditClick?: () => void;
  canEdit: boolean;
  /** Número de días transcurridos en el período filtrado (para calcular promedio diario) */
  daysElapsed: number;
  /** Número total de días del mes (para calcular la proyección) */
  daysInMonth: number;
  /** Meta mensual completa (sin prorratear), para comparar con la proyección */
  monthlyTarget?: number;
}

export function StoreTargetCard({
  storeName,
  totalSales,
  proratedTarget,
  completionPercentage,
  hasTarget,
  onEditClick,
  canEdit,
  daysElapsed,
  daysInMonth,
  monthlyTarget,
}: StoreTargetCardProps) {
  // Venta promedio diaria
  const dailyAverage = daysElapsed > 0 ? totalSales / daysElapsed : 0;

  // Proyección al cierre del mes
  const projection = dailyAverage * daysInMonth;

  // Porcentaje de proyección vs meta mensual completa
  const projectionVsTarget =
    monthlyTarget && monthlyTarget > 0
      ? (projection / monthlyTarget) * 100
      : null;

  const fmt = (n: number) =>
    n.toLocaleString("es-PE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  const fmtShort = (n: number) => {
    if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `S/ ${(n / 1_000).toFixed(0)}K`;
    return `S/ ${fmt(n)}`;
  };

  const completionColor =
    completionPercentage >= 100
      ? "#008064"
      : completionPercentage >= 90
      ? "#1A6894"
      : completionPercentage >= 75
      ? "#C49705"
      : "#BC2C46";

  const projectionColor =
    projectionVsTarget === null
      ? "#919291"
      : projectionVsTarget >= 100
      ? "#008064"
      : projectionVsTarget >= 90
      ? "#1A6894"
      : projectionVsTarget >= 75
      ? "#C49705"
      : "#BC2C46";

  return (
    <Card className="relative hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle
            className="text-base font-semibold leading-tight"
            style={{ fontFamily: "Sailec, sans-serif" }}
          >
            {storeName}
          </CardTitle>
          {canEdit && onEditClick && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onEditClick}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Barra de Progreso */}
        {hasTarget && (
          <div className="space-y-1.5">
            <div
              className="flex justify-between text-sm"
              style={{ fontFamily: "Sailec, sans-serif" }}
            >
              <span className="text-muted-foreground">Cumplimiento</span>
              <span className="font-semibold" style={{ color: completionColor }}>
                {completionPercentage.toFixed(1)}%
              </span>
            </div>
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.min(completionPercentage, 100)}%`,
                  backgroundColor: completionColor,
                }}
              />
            </div>
          </div>
        )}

        {/* Métricas principales */}
        <div className="space-y-3">
          {/* Venta del período */}
          <div>
            <p
              className="text-xs text-muted-foreground uppercase tracking-wide"
              style={{ fontFamily: "Sailec, sans-serif" }}
            >
              Venta del período
            </p>
            <p
              className="text-2xl font-bold"
              style={{ fontFamily: "Sailec, sans-serif" }}
            >
              S/ {fmt(totalSales)}
            </p>
          </div>

          {/* Meta del período */}
          <div>
            <p
              className="text-xs text-muted-foreground uppercase tracking-wide"
              style={{ fontFamily: "Sailec, sans-serif" }}
            >
              Meta del período
            </p>
            {hasTarget ? (
              <p
                className="text-base font-semibold"
                style={{ fontFamily: "Sailec, sans-serif" }}
              >
                S/ {fmt(proratedTarget)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Meta no configurada
              </p>
            )}
          </div>

          {/* Separador */}
          <div className="border-t border-border/50" />

          {/* Venta Promedio Diaria */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p
                className="text-xs text-muted-foreground uppercase tracking-wide"
                style={{ fontFamily: "Sailec, sans-serif" }}
              >
                Prom. diario
              </p>
              <p
                className="text-sm font-semibold"
                style={{ fontFamily: "Sailec, sans-serif" }}
              >
                {fmtShort(dailyAverage)}
              </p>
              <p className="text-xs text-muted-foreground">
                {daysElapsed} día{daysElapsed !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Proyección al cierre del mes */}
            <div>
              <div className="flex items-center gap-1">
                <p
                  className="text-xs text-muted-foreground uppercase tracking-wide"
                  style={{ fontFamily: "Sailec, sans-serif" }}
                >
                  Proyección
                </p>
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
              </div>
              <p
                className="text-sm font-semibold"
                style={{
                  fontFamily: "Sailec, sans-serif",
                  color: projectionColor,
                }}
              >
                {fmtShort(projection)}
              </p>
              {projectionVsTarget !== null && (
                <p
                  className="text-xs font-medium"
                  style={{ color: projectionColor }}
                >
                  {projectionVsTarget.toFixed(0)}% de meta
                </p>
              )}
              {projectionVsTarget === null && (
                <p className="text-xs text-muted-foreground">sin meta</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
