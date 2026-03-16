import { Card, CardContent } from "@/components/ui/card";
import { Pencil } from "lucide-react";
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

/** Devuelve el color de cumplimiento según el porcentaje */
function getComplianceColor(pct: number | null): string {
  if (pct === null) return "#919291"; // Humo – sin meta
  if (pct >= 100) return "#008064";  // Esmeralda
  if (pct >= 90)  return "#1A6894";  // Cobalto
  if (pct >= 75)  return "#C49705";  // Mostaza
  return "#BC2C46";                   // Granate
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
  // ── Cálculos derivados ───────────────────────────────────────────────────
  const dailyAverage = daysElapsed > 0 ? totalSales / daysElapsed : 0;
  const projection   = dailyAverage * daysInMonth;

  // Meta diaria promedio = meta mensual / días del mes
  const dailyTarget =
    monthlyTarget && monthlyTarget > 0 ? monthlyTarget / daysInMonth : null;

  // % proyección vs meta mensual
  const projectionVsTarget =
    monthlyTarget && monthlyTarget > 0
      ? (projection / monthlyTarget) * 100
      : null;

  // % promedio diario vs meta diaria
  const dailyVsTarget =
    dailyTarget && dailyTarget > 0
      ? (dailyAverage / dailyTarget) * 100
      : null;

  // ── Colores ──────────────────────────────────────────────────────────────
  const periodColor     = getComplianceColor(hasTarget ? completionPercentage : null);
  const projectionColor = getComplianceColor(projectionVsTarget);
  const dailyColor      = getComplianceColor(dailyVsTarget);

  // ── Formateo ─────────────────────────────────────────────────────────────
  const fmt = (n: number) =>
    n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const fmtShort = (n: number) => {
    if (n >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `S/ ${(n / 1_000).toFixed(0)}K`;
    return `S/ ${fmt(n)}`;
  };

  const pctStr = (p: number | null) =>
    p !== null ? `${p.toFixed(1)}%` : "—";

  return (
    <Card className="relative hover:shadow-lg transition-shadow overflow-hidden">
      {/* Botón de edición – posición absoluta para no ocupar espacio */}
      {canEdit && onEditClick && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 h-7 w-7 z-10 opacity-60 hover:opacity-100"
          onClick={onEditClick}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}

      <CardContent className="pt-5 pb-5 px-5 space-y-3.5">

        {/* ── Línea 1: Nombre de tienda ────────────────────────────────── */}
        <p
          className="text-sm font-bold uppercase leading-tight tracking-wide pr-8 font-heading"
          style={{ color: "#232523" }}
        >
          {storeName}
        </p>

        {/* ── Línea 2: Barra de cumplimiento ───────────────────────────── */}
        {hasTarget ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span
                className="text-xs text-muted-foreground"
                style={{ fontFamily: "Sailec, sans-serif" }}
              >
                Cumplimiento del período
              </span>
              <span
                className="text-sm font-semibold tabular-nums"
                style={{ fontFamily: "Sailec, sans-serif", color: periodColor }}
              >
                {completionPercentage.toFixed(1)}%
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${Math.min(completionPercentage, 100)}%`,
                  backgroundColor: periodColor,
                }}
              />
            </div>
          </div>
        ) : (
          <p
            className="text-xs text-muted-foreground italic"
            style={{ fontFamily: "Sailec, sans-serif" }}
          >
            Meta no configurada
          </p>
        )}

        {/* Divisor */}
        <div className="border-t border-border/40" />

        {/* ── Línea 3: Venta del período vs Meta del período ────────────── */}
        <div className="space-y-0.5">
          <p
            className="text-[10px] uppercase tracking-wider text-muted-foreground"
            style={{ fontFamily: "Sailec, sans-serif" }}
          >
            Período
          </p>
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span
                className="text-lg font-semibold tabular-nums leading-none"
                style={{ fontFamily: "Sailec, sans-serif", color: periodColor }}
              >
                {fmtShort(totalSales)}
              </span>
              {hasTarget && (
                <span
                  className="text-xs font-medium tabular-nums"
                  style={{ fontFamily: "Sailec, sans-serif", color: periodColor }}
                >
                  ({pctStr(completionPercentage)})
                </span>
              )}
            </div>
            {hasTarget && (
              <span
                className="text-xs text-muted-foreground tabular-nums shrink-0"
                style={{ fontFamily: "Sailec, sans-serif" }}
              >
                {fmtShort(proratedTarget)}
              </span>
            )}
          </div>
        </div>

        {/* ── Línea 4: Proyección mensual vs Meta mensual ───────────────── */}
        <div className="space-y-0.5">
          <p
            className="text-[10px] uppercase tracking-wider text-muted-foreground"
            style={{ fontFamily: "Sailec, sans-serif" }}
          >
            Proyección mensual
          </p>
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span
                className="text-base font-semibold tabular-nums leading-none"
                style={{ fontFamily: "Sailec, sans-serif", color: projectionColor }}
              >
                {fmtShort(projection)}
              </span>
              {projectionVsTarget !== null && (
                <span
                  className="text-xs font-medium tabular-nums"
                  style={{ fontFamily: "Sailec, sans-serif", color: projectionColor }}
                >
                  ({pctStr(projectionVsTarget)})
                </span>
              )}
            </div>
            {monthlyTarget && monthlyTarget > 0 ? (
              <span
                className="text-xs text-muted-foreground tabular-nums shrink-0"
                style={{ fontFamily: "Sailec, sans-serif" }}
              >
                {fmtShort(monthlyTarget)}
              </span>
            ) : (
              <span
                className="text-xs text-muted-foreground italic shrink-0"
                style={{ fontFamily: "Sailec, sans-serif" }}
              >
                sin meta
              </span>
            )}
          </div>
        </div>

        {/* ── Línea 5: Promedio diario vs Meta diaria ───────────────────── */}
        <div className="space-y-0.5">
          <p
            className="text-[10px] uppercase tracking-wider text-muted-foreground"
            style={{ fontFamily: "Sailec, sans-serif" }}
          >
            Promedio diario
          </p>
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span
                className="text-base font-semibold tabular-nums leading-none"
                style={{ fontFamily: "Sailec, sans-serif", color: dailyColor }}
              >
                {fmtShort(dailyAverage)}
              </span>
              {dailyVsTarget !== null && (
                <span
                  className="text-xs font-medium tabular-nums"
                  style={{ fontFamily: "Sailec, sans-serif", color: dailyColor }}
                >
                  ({pctStr(dailyVsTarget)})
                </span>
              )}
            </div>
            {dailyTarget !== null ? (
              <span
                className="text-xs text-muted-foreground tabular-nums shrink-0"
                style={{ fontFamily: "Sailec, sans-serif" }}
              >
                {fmtShort(dailyTarget)}
              </span>
            ) : (
              <span
                className="text-xs text-muted-foreground italic shrink-0"
                style={{ fontFamily: "Sailec, sans-serif" }}
              >
                sin meta
              </span>
            )}
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
